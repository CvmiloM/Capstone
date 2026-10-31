import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import {
  configuracionEmbeddings,
  generarEmbeddings,
  validarEmbeddings,
} from './embeddings.js';
import { extraerEnHilo, extraerDirecto } from './extractor.js';
import {
  ErrorPreparacion,
  fragmentar,
  MODELO_EMBEDDING,
} from './preparacion.js';
import { PreparacionDocumentos } from './preparacion.service.js';
import { DocumentosService } from './documentos.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./extractor.js', async (importar) => ({
  ...(await importar<typeof import('./extractor.js')>()),
  extraerEnHilo: vi.fn(),
}));

const vector = () => [1, ...Array<number>(1023).fill(0)];
const fragmentos = fragmentar([
  { texto: 'Artículo primero del reglamento de prueba', pagina: 1 },
]);
const sesion: Sesion = {
  authUsuarioId: '11111111-1111-4111-8111-111111111111',
  membresia_id: '22222222-2222-4222-8222-222222222222',
  establecimiento_id: '33333333-3333-4333-8333-333333333333',
  codigo_perfil: 'ADMIN',
  requiere_segundo_factor: true,
  aal: 'aal2',
};

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('IA_EMBEDDINGS_URL', 'http://127.0.0.1:11434/api/embed');
  vi.stubEnv('IA_EMBEDDINGS_TOKEN', '');
  vi.mocked(extraerEnHilo).mockResolvedValue(fragmentos);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('PB-079: fragmentos y páginas', () => {
  it('conserva páginas, orden y texto sin mezclar documentos', () => {
    expect(
      fragmentar([
        { texto: '  Artículo uno\n\ncon texto ', pagina: 3 },
        { texto: 'Otro artículo', pagina: 7 },
      ]),
    ).toEqual([
      {
        indice: 0,
        contenido: 'Artículo uno con texto',
        pagina_desde: 3,
        pagina_hasta: 3,
      },
      {
        indice: 1,
        contenido: 'Otro artículo',
        pagina_desde: 7,
        pagina_hasta: 7,
      },
    ]);
  });
  it('divide el texto sin superar el límite y conserva contexto compartido', () => {
    const f = fragmentar([{ texto: 'reglamento '.repeat(700), pagina: 2 }]);
    expect(f.length).toBeGreaterThan(1);
    expect(
      f.every((p) => p.contenido.length <= 1800 && p.pagina_desde === 2),
    ).toBe(true);
    expect(f[0].contenido.slice(-80)).toContain('reglamento');
  });
  it('no inventa páginas para un Word', () =>
    expect(
      fragmentar([{ texto: 'Contenido de Word', pagina: null }])[0]
        .pagina_desde,
    ).toBeNull());
  it('un escaneo sin texto informa el problema', () =>
    expect(() => fragmentar([{ texto: '  ', pagina: 1 }])).toThrow(
      /texto seleccionable/,
    ));
  it('limita el texto antes de generar embeddings', () =>
    expect(() =>
      fragmentar([{ texto: 'a'.repeat(1_000_001), pagina: 1 }]),
    ).toThrow(/demasiado texto/));
  it('rechaza un PDF ilegible sin generar fragmentos', async () => {
    await expect(
      extraerDirecto(new Uint8Array(Buffer.from('no es un PDF')), 'pdf'),
    ).rejects.toThrow();
  });
});

describe('PB-079: contrato del servicio de embeddings', () => {
  it('valida modelo, dimensión y un vector no vacío', () => {
    expect(
      validarEmbeddings({ model: MODELO_EMBEDDING, embeddings: [vector()] }, 1),
    ).toHaveLength(1);
  });
  it.each([
    null,
    { model: 'otro', embeddings: [vector()] },
    { model: MODELO_EMBEDDING, embeddings: [] },
    { model: MODELO_EMBEDDING, embeddings: [[1, 2]] },
    { model: MODELO_EMBEDDING, embeddings: [Array(1024).fill(0)] },
    { model: MODELO_EMBEDDING, embeddings: [[NaN, ...vector().slice(1)]] },
    { model: MODELO_EMBEDDING, embeddings: [[Infinity, ...vector().slice(1)]] },
  ])('rechaza una respuesta incompatible %#', (valor) =>
    expect(() => validarEmbeddings(valor, 1)).toThrow(ErrorPreparacion),
  );
  it('no inventa un destino si falta configurar el servicio', () => {
    vi.stubEnv('IA_EMBEDDINGS_URL', '');
    expect(() => configuracionEmbeddings()).toThrow(/pendiente de configurar/);
  });
  it('no permite credenciales dentro de la URL', () => {
    vi.stubEnv(
      'IA_EMBEDDINGS_URL',
      'https://usuario:clave@ejemplo.invalid/api/embed',
    );
    expect(() => configuracionEmbeddings()).toThrow(ErrorPreparacion);
  });
  it('producción exige TLS y token privado', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => configuracionEmbeddings()).toThrow(/HTTPS/);
    vi.stubEnv('IA_EMBEDDINGS_URL', 'https://ejemplo.invalid/api/embed');
    vi.stubEnv('IA_EMBEDDINGS_TOKEN', 'token-solo-de-prueba');
    expect(configuracionEmbeddings().token).toBe('token-solo-de-prueba');
  });
  it('envía lotes de ocho, sin tokens de la sesión y sin truncar el texto', async () => {
    const fetch = vi.fn((_url, opciones: RequestInit) => {
      if (typeof opciones.body !== 'string')
        throw new Error('Se esperaba JSON');
      const cuerpo = JSON.parse(opciones.body) as {
        input: string[];
        truncate: boolean;
      };
      expect(cuerpo.truncate).toBe(false);
      expect(opciones.body).not.toContain(sesion.authUsuarioId);
      return Promise.resolve(
        Response.json({
          model: MODELO_EMBEDDING,
          embeddings: cuerpo.input.map(vector),
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);
    expect(
      await generarEmbeddings(
        Array.from({ length: 9 }, (_, indice) => ({
          ...fragmentos[0],
          indice,
        })),
      ),
    ).toHaveLength(9);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('los fallos transitorios se pueden reintentar sin filtrar la respuesta remota', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('secreto remoto', { status: 503 })),
    );
    await expect(generarEmbeddings(fragmentos)).rejects.toMatchObject({
      recuperable: true,
    });
    await expect(generarEmbeddings(fragmentos)).rejects.not.toThrow(
      /secreto remoto/,
    );
  });
  it('no sigue redirecciones que podrían recibir el token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ model: MODELO_EMBEDDING, embeddings: [vector()] }),
      );
    vi.stubGlobal('fetch', fetch);
    await generarEmbeddings(fragmentos);
    expect(fetch.mock.calls[0][1].redirect).toBe('error');
  });
  it('limita las respuestas antes de convertirlas en JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('x'.repeat(1024 * 1024 + 1))),
    );
    await expect(generarEmbeddings(fragmentos)).rejects.toThrow(
      /tamaño permitido/,
    );
  });
});

function entorno() {
  const contenido = Buffer.from('%PDF-1.7\nDocumento ficticio\n%%EOF');
  const version = {
    estado_procesamiento: 'PENDIENTE',
    incluir_en_busqueda_ia: true,
    tipo_documento: 'RICE',
    estado_documento: 'ACTIVO',
    sha256: createHash('sha256').update(contenido).digest('hex'),
    intentos_procesamiento: 0,
    detalle_error_procesamiento: null as string | null,
  };
  let anteriores: {
    indice_fragmento: number;
    contenido: string;
    pagina_desde: number | null;
    pagina_hasta: number | null;
  }[] = [];
  const insertados: unknown[] = [];
  // PB-094: avisos a quien subió la versión, con true si quedó lista.
  const avisos: unknown[] = [];
  const query = vi.fn(async (sql: string, valores: unknown[] = []) => {
    if (
      sql.includes('SELECT v.estado_procesamiento') ||
      sql.startsWith('SELECT intentos_procesamiento')
    )
      return { rows: [{ ...version }] };
    if (sql.includes("SET estado_procesamiento = 'PROCESANDO'")) {
      version.estado_procesamiento = 'PROCESANDO';
      version.intentos_procesamiento++;
      return {
        rows: [{ intentos_procesamiento: version.intentos_procesamiento }],
      };
    }
    if (sql.includes('SELECT indice_fragmento')) return { rows: anteriores };
    if (sql.includes('INSERT INTO convi.fragmentos_rag')) {
      insertados.push(JSON.parse(String(valores[1])));
      return { rows: [] };
    }
    if (sql.includes("SET estado_procesamiento = 'LISTO'")) {
      version.estado_procesamiento = 'LISTO';
      return { rows: [] };
    }
    if (sql.includes("SET estado_procesamiento = 'FALLIDO'")) {
      version.estado_procesamiento = 'FALLIDO';
      version.detalle_error_procesamiento = String(valores[2]);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO convi.notificaciones')) {
      avisos.push(valores[1]);
      return { rows: [], rowCount: 1 };
    }
    throw new Error('Consulta no prevista en la prueba');
  });
  const operar = vi.fn(
    async (_sesion, _acceso, trabajo: (db: PoolClient) => unknown) =>
      trabajo({ query } as unknown as PoolClient),
  );
  const cuentas = { operar } as unknown as CuentaService;
  const descargar = vi.fn().mockResolvedValue({
    nombre: 'reglamento.pdf',
    mime: 'application/pdf',
    contenido,
  });
  const documentos = { descargar } as unknown as DocumentosService;
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ model: MODELO_EMBEDDING, embeddings: [vector()] }),
      ),
  );
  return {
    version,
    insertados,
    avisos,
    operar,
    query,
    descargar,
    cuentas,
    motor: new PreparacionDocumentos(cuentas, documentos),
    anteriores: (valor: typeof anteriores) => {
      anteriores = valor;
    },
  };
}

describe('PB-079: preparación autorizada y recuperación', () => {
  it('guarda los fragmentos y solo entonces marca Listo', async () => {
    const e = entorno();
    await e.motor.procesar({ sesion, version_id: 'version' });
    expect(e.version.estado_procesamiento).toBe('LISTO');
    expect(e.insertados).toHaveLength(1);
    expect(e.version.intentos_procesamiento).toBe(1);
    expect(e.avisos).toEqual([true]);
    expect(
      e.operar.mock.calls.every(
        ([s, a]) => s === sesion && a.perfiles.includes('ADMIN'),
      ),
    ).toBe(true);
  });
  it('un trabajo repetido no vuelve a procesar una versión lista', async () => {
    const e = entorno();
    e.version.estado_procesamiento = 'LISTO';
    await e.motor.procesar({ sesion, version_id: 'version' });
    expect(e.descargar).not.toHaveBeenCalled();
    expect(e.version.intentos_procesamiento).toBe(0);
  });
  it('una plantilla no se procesa aunque llegue un trabajo a la cola', async () => {
    const e = entorno();
    e.version.tipo_documento = 'PLANTILLA';
    await e.motor.procesar({ sesion, version_id: 'version' });
    expect(e.insertados).toHaveLength(0);
    expect(e.descargar).not.toHaveBeenCalled();
  });
  it('sin autorización no descarga ni llama a la IA', async () => {
    const e = entorno();
    e.operar.mockRejectedValue(new ForbiddenException());
    await expect(
      e.motor.procesar({ sesion, version_id: 'version' }),
    ).rejects.toThrow(ForbiddenException);
    expect(e.descargar).not.toHaveBeenCalled();
    expect(e.query).not.toHaveBeenCalled();
  });
  it('un servicio ausente informa Fallido y conserva el original', async () => {
    const e = entorno();
    vi.stubEnv('IA_EMBEDDINGS_URL', '');
    await expect(
      e.motor.procesar({ sesion, version_id: 'version' }),
    ).rejects.toThrow(/configurar/);
    expect(e.version.estado_procesamiento).toBe('FALLIDO');
    expect(e.avisos).toEqual([false]);
    expect(e.insertados).toHaveLength(0);
    expect(e.descargar).not.toHaveBeenCalled();
  });
  it('no guarda vectores de una respuesta inválida', async () => {
    const e = entorno();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ model: MODELO_EMBEDDING, embeddings: [[1, 2]] }),
        ),
    );
    await expect(
      e.motor.procesar({ sesion, version_id: 'version' }),
    ).rejects.toThrow(/1024/);
    expect(e.version.estado_procesamiento).toBe('FALLIDO');
    expect(e.insertados).toHaveLength(0);
  });
  it('no cambia texto y páginas de fragmentos conservados', async () => {
    // Un fallo no debe reemplazar fragmentos históricos para poder reintentarlo.
    const e = entorno();
    e.anteriores([
      {
        indice_fragmento: 0,
        contenido: 'Texto anterior distinto',
        pagina_desde: 1,
        pagina_hasta: 1,
      },
    ]);
    await expect(
      e.motor.procesar({ sesion, version_id: 'version' }),
    ).rejects.toThrow(/fragmentos conservados/);
    expect(e.insertados).toHaveLength(0);
  });
  it('si pierde autorización después de leer, detiene el trabajo sin convertirlo en un fallo transitorio', async () => {
    const e = entorno();
    const inicial = e.operar.getMockImplementation()!;
    e.operar
      .mockImplementationOnce(inicial)
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(
      e.motor.procesar({ sesion, version_id: 'version' }),
    ).rejects.toThrow(ForbiddenException);
    expect(e.insertados).toHaveLength(0);
    expect(e.operar).toHaveBeenCalledTimes(2);
  });
  it('una interrupción permite otro intento sin reducir su contador', async () => {
    const e = entorno();
    e.version.estado_procesamiento = 'PROCESANDO';
    e.version.intentos_procesamiento = 2;
    await e.motor.procesar({ sesion, version_id: 'version' });
    expect(e.version.intentos_procesamiento).toBe(3);
    expect(e.version.estado_procesamiento).toBe('LISTO');
  });
  it('si no se registra la solicitud, informa el fallo sin borrar archivos', async () => {
    const e = entorno();
    const servicio = new DocumentosService(e.cuentas, {} as SupabaseClient);
    vi.spyOn(servicio, 'version').mockResolvedValue({
      incluir_en_busqueda_ia: true,
      estado_procesamiento: 'PENDIENTE',
    });
    expect(await servicio.programarPreparacion(sesion, 'version')).toBe(false);
    expect(
      e.query.mock.calls.some(([sql]) =>
        sql.includes("estado_procesamiento = 'FALLIDO'"),
      ),
    ).toBe(true);
    expect(e.query.mock.calls.some(([sql]) => /DELETE/.test(sql))).toBe(false);
  });
});

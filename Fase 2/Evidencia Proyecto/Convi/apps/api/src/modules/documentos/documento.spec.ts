import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Pool, PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { validarCarga, validarVigencia, TIPOS_DOCUMENTO } from './documento.js';
import { DocumentosService } from './documentos.service.js';

const pdf = Buffer.from('%PDF-1.7\nDocumento ficticio\n%%EOF');
const archivo = {
  originalname: 'reglamento.pdf',
  size: pdf.length,
  buffer: pdf,
};
const datos = {
  titulo: 'Reglamento',
  tipo_documento: 'RICE',
  etiqueta_version: '2026',
};
const sesion: Sesion = {
  authUsuarioId: '11111111-1111-4111-8111-111111111111',
  membresia_id: '22222222-2222-4222-8222-222222222222',
  establecimiento_id: '33333333-3333-4333-8333-333333333333',
  codigo_perfil: 'ADMIN',
  requiere_segundo_factor: true,
  aal: 'aal2',
};

describe('PB-078 y PB-080: datos de documentos', () => {
  it('normaliza los espacios del título y la etiqueta sin cambiar lo escrito', () => {
    const validado = validarCarga(
      {
        ...datos,
        titulo: '  Reglamento   interno ',
        etiqueta_version: '  Versión   2 ',
      },
      archivo,
      true,
    );
    expect(validado.titulo).toBe('Reglamento interno');
    expect(validado.etiqueta).toBe('Versión 2');
  });
  it.each(TIPOS_DOCUMENTO)(
    'acepta el tipo institucional %s',
    (tipo_documento) => {
      expect(
        validarCarga({ ...datos, tipo_documento }, archivo, true).tipo,
      ).toBe(tipo_documento);
    },
  );
  it('una versión nueva no redefine el tipo ni el título del documento', () => {
    expect(
      validarCarga({ etiqueta_version: '2027' }, archivo, false).etiqueta,
    ).toBe('2027');
  });
  it.each([
    { titulo: '' },
    { titulo: 'x'.repeat(221) },
    { tipo_documento: 'INVALIDO' },
    { etiqueta_version: '' },
    { etiqueta_version: 'x'.repeat(61) },
  ])('rechaza datos incompletos %j', (cambio) => {
    expect(() => validarCarga({ ...datos, ...cambio }, archivo, true)).toThrow(
      BadRequestException,
    );
  });
  it('exige original', () =>
    expect(() => validarCarga(datos, undefined, true)).toThrow(
      BadRequestException,
    ));
  it('rechaza archivos falsamente nombrados PDF', () =>
    expect(() =>
      validarCarga(
        datos,
        { ...archivo, buffer: Buffer.from('no es pdf') },
        true,
      ),
    ).toThrow(BadRequestException));
  it('rechaza contenido activo en PDF', () =>
    expect(() =>
      validarCarga(
        datos,
        { ...archivo, buffer: Buffer.from('%PDF-1.7 /JavaScript') },
        true,
      ),
    ).toThrow(BadRequestException));
  it('valida tamaño antes de subir', () =>
    expect(() =>
      validarCarga(datos, { ...archivo, size: 26 * 1024 * 1024 }, true),
    ).toThrow(BadRequestException));
  it('acepta una publicación sin fecha de término', () =>
    expect(validarVigencia({ vigente_desde: '2026-10-25' })).toEqual({
      desde: '2026-10-25',
      hasta: null,
    }));
  it.each([
    { vigente_desde: '2026-02-30' },
    { vigente_desde: '' },
    { vigente_desde: '2026-10-25', vigente_hasta: '2026-10-24' },
    { vigente_desde: '2026-1-2' },
    { vigente_desde: '2026-10-25', vigente_hasta: 'mañana' },
  ])('rechaza vigencia inválida %j', (valor) =>
    expect(() => validarVigencia(valor)).toThrow(BadRequestException),
  );
  it('cerrar exige una fecha de término', () =>
    expect(() => validarVigencia({}, true)).toThrow(BadRequestException));
});

function preparar() {
  const query = vi.fn();
  const operar = vi.fn(
    async (_s: Sesion, _a: unknown, f: (db: PoolClient) => Promise<unknown>) =>
      f({ query } as unknown as PoolClient),
  );
  const download = vi
    .fn()
    .mockResolvedValue({ data: new Blob([pdf]), error: null });
  const from = vi.fn().mockReturnValue({ download });
  const servicio = new DocumentosService(
    { operar } as unknown as CuentaService,
    { storage: { from } } as unknown as SupabaseClient,
  );
  return { query, operar, download, from, servicio };
}
const version = {
  id: 'v1',
  documento_id: 'd1',
  estado: 'BORRADOR',
  vigente_desde: null,
  vigente_hasta: null,
};
function bloquear(query: ReturnType<typeof vi.fn>, cambio = {}) {
  query
    .mockResolvedValueOnce({ rows: [{ documento_id: 'd1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'd1', estado: 'ACTIVO' }] })
    .mockResolvedValueOnce({ rows: [{ ...version, ...cambio }] });
}

describe('PB-080 y PB-084: conservación y descarga privada', () => {
  it.each(['40001', '40P01'])(
    'un conflicto %s al autorizar revierte y pide recargar',
    async (code) => {
      const query = vi.fn(async (sql: string) => {
        if (sql.includes('resolver_membresia'))
          return { rows: [{ ...sesion, requiere_segundo_factor: true }] };
        if (sql.includes('FOR SHARE OF m, e')) throw { code };
        return { rows: [] };
      });
      const release = vi.fn(),
        trabajo = vi.fn();
      const cuenta = new CuentaService({
        connect: async () => ({ query, release }),
      } as unknown as Pool);
      await expect(
        cuenta.operar(
          sesion,
          { tipo: 'establecimiento', perfiles: ['ADMIN'] },
          trabajo,
        ),
      ).rejects.toThrow(ConflictException);
      expect(query).toHaveBeenCalledWith('ROLLBACK');
      expect(release).toHaveBeenCalled();
      expect(trabajo).not.toHaveBeenCalled();
    },
  );
  it('no republica un borrador como si fuera un documento archivado', async () => {
    const { query, servicio } = preparar();
    query.mockResolvedValueOnce({ rows: [] });
    bloquear(query);
    await expect(
      servicio.republicar(sesion, 'v1', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(ConflictException);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it('no reactiva un documento de otra escuela', async () => {
    const { query, servicio } = preparar();
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      servicio.republicar(sesion, 'ajeno', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(NotFoundException);
  });
  it('un interbloqueo concurrente devuelve un conflicto para recargar', async () => {
    const { query, servicio } = preparar();
    query.mockRejectedValueOnce({ code: '40P01' });
    await expect(
      servicio.republicar(sesion, 'v1', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(ConflictException);
  });
  it('un conflicto de escritura simultánea pide recargar sin publicar', async () => {
    const { query, servicio } = preparar();
    query
      .mockResolvedValueOnce({ rows: [{ documento_id: 'd1' }] })
      .mockRejectedValueOnce({ code: '40001' });
    await expect(
      servicio.publicar(sesion, 'v1', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('rechaza publicar dos veces sin modificar el original', async () => {
    const { query, servicio } = preparar();
    bloquear(query, { estado: 'PUBLICADO' });
    await expect(
      servicio.publicar(sesion, 'v1', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(ConflictException);
    expect(query).toHaveBeenCalledTimes(3);
  });
  it('rechaza fechas superpuestas sin archivar automáticamente', async () => {
    const { query, servicio } = preparar();
    bloquear(query);
    query.mockResolvedValueOnce({ rows: [{ existe: 1 }] });
    await expect(
      servicio.publicar(sesion, 'v1', { vigente_desde: '2026-10-25' }),
    ).rejects.toThrow(ConflictException);
    expect(query).toHaveBeenCalledTimes(4);
  });
  it('no permite volver a cerrar un período que ya tiene término', async () => {
    const { query, servicio } = preparar();
    bloquear(query, {
      estado: 'PUBLICADO',
      vigente_desde: '2026-01-01',
      vigente_hasta: '2026-10-25',
    });
    await expect(
      servicio.cerrarVigencia(sesion, 'v1', { vigente_hasta: '2026-12-31' }),
    ).rejects.toThrow(ConflictException);
  });
  it('una descarga autorizada devuelve los bytes, no una URL', async () => {
    const { query, servicio, operar } = preparar();
    query.mockResolvedValueOnce({
      rows: [
        {
          nombre_original: 'rice.pdf',
          tipo_mime: 'application/pdf',
          bucket_id: 'convi-privado',
          clave_almacenamiento: `${sesion.establecimiento_id}/documentos/uno.pdf`,
        },
      ],
    });
    expect((await servicio.descargar(sesion, 'v1')).contenido).toEqual(pdf);
    expect(operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN', 'CONVIVENCIA'] },
      expect.any(Function),
    );
  });
  it.each([
    'otra-escuela/documentos/uno.pdf',
    `${sesion.establecimiento_id}/../uno.pdf`,
    `${sesion.establecimiento_id}/%2e%2e/uno.pdf`,
    `${sesion.establecimiento_id}//uno.pdf`,
  ])('rechaza destino fuera de la carpeta autorizada %s', async (clave) => {
    const { query, servicio, from } = preparar();
    query.mockResolvedValueOnce({
      rows: [{ bucket_id: 'convi-privado', clave_almacenamiento: clave }],
    });
    await expect(servicio.descargar(sesion, 'v1')).rejects.toThrow(
      NotFoundException,
    );
    expect(from).not.toHaveBeenCalled();
  });
  it('un fallo de Storage no se presenta como descarga exitosa', async () => {
    const { query, servicio, download } = preparar();
    query.mockResolvedValueOnce({
      rows: [
        {
          bucket_id: 'convi-privado',
          clave_almacenamiento: `${sesion.establecimiento_id}/documentos/uno.pdf`,
        },
      ],
    });
    download.mockResolvedValueOnce({ data: null, error: {} });
    await expect(servicio.descargar(sesion, 'v1')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

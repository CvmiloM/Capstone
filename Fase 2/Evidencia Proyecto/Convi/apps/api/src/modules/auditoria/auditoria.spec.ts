import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import {
  leerCursor,
  validarFiltros,
  normalizarBusqueda,
  paginaAuditoria,
  type FilaAuditoria,
} from './auditoria.js';
import { AuditoriaService } from './auditoria.service.js';

const id = '11111111-1111-4111-8111-111111111111';
const fecha = '2026-10-28T12:30:00.123456Z';
const codificar = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString('base64url');
const fila = (n = 1): FilaAuditoria => ({
  id: `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`,
  tipo: 'MODIFICACION',
  recurso: 'casos',
  referencia: id,
  fecha,
  autor: 'Persona de prueba',
  resultado: 'OK',
});

describe('PB-116: paginación e información por perfil', () => {
  it('admite la primera página y conserva los microsegundos del cursor', () => {
    expect(leerCursor(undefined)).toBeNull();
    expect(leerCursor('')).toBeNull();
    expect(leerCursor(codificar([fecha, id, 'MODIFICACION']))).toEqual({
      fecha,
      id,
      tipo: 'MODIFICACION',
    });
  });

  it.each([
    null,
    [],
    {},
    'no es un cursor',
    'a'.repeat(401),
    codificar(null),
    codificar([fecha, id]),
    codificar([fecha, id, 'MODIFICACION', 'extra']),
    codificar(['2026-02-30T12:30:00.000000Z', id, 'MODIFICACION']),
    codificar(['0000-01-01T00:00:00.000000Z', id, 'MODIFICACION']),
    codificar([fecha, 'no-es-uuid', 'MODIFICACION']),
    codificar([fecha, id, "x'; DELETE FROM casos"]),
  ])('rechaza un cursor inválido %j', (entrada) => {
    expect(() => leerCursor(entrada)).toThrow(BadRequestException);
  });

  it('no inventa otra página cuando no hay más registros', () => {
    expect(paginaAuditoria([], false)).toEqual(
      expect.objectContaining({
        eventos: [],
        siguiente: null,
      }),
    );
    expect(
      paginaAuditoria(
        Array.from({ length: 50 }, (_, i) => fila(i + 1)),
        false,
      ).siguiente,
    ).toBeNull();
  });

  it('entrega 50 registros y el cursor de la última fila visible, sin perder precisión', () => {
    const filas = Array.from({ length: 51 }, (_, i) => fila(i + 1));
    const pagina = paginaAuditoria(filas, false);
    expect(pagina.eventos).toHaveLength(50);
    expect(leerCursor(pagina.siguiente)).toEqual({
      fecha,
      id: filas[49].id,
      tipo: 'MODIFICACION',
    });
  });

  it('CA1: Administración no recibe contenido, fechas del hecho ni metadatos aunque vengan de la base', () => {
    const sensible = {
      ...fila(),
      descripcion: 'EXPEDIENTE PRIVADO',
      fecha_evento: fecha,
      metadatos: { antes: { descripcion: 'DATOS PRIVADOS' } },
      rut: 'NO DEBE SALIR',
    };
    const pagina = paginaAuditoria([sensible], false);
    expect(pagina.eventos[0]).toEqual({
      ...fila(),
      referencia_nombre: null,
      resumen:
        'El detalle de este registro no se muestra en la auditoría administrativa',
    });
    expect(JSON.stringify(pagina)).not.toMatch(
      /EXPEDIENTE|PRIVADOS|metadatos|fecha_evento|NO DEBE/,
    );
  });

  it('Convivencia recibe el detalle autorizado, sin exponer las filas originales del modelo', () => {
    const e = {
      ...fila(),
      descripcion: 'Responsable anterior y nuevo',
      fecha_evento: fecha,
      metadatos: { secreto: true },
    };
    const pagina = paginaAuditoria([e], true);
    expect(pagina.eventos[0].descripcion).toBe(e.descripcion);
    expect(JSON.stringify(pagina)).not.toContain('metadatos');
  });
});

describe('PB-116: autorización de las consultas', () => {
  const sesion: Sesion = {
    authUsuarioId: id,
    membresia_id: id,
    establecimiento_id: id,
    codigo_perfil: 'ADMIN',
    requiere_segundo_factor: true,
    aal: 'aal2',
  };
  const query = vi.fn();
  const operar = vi.fn(
    async (_sesion, _acceso, trabajo: (db: PoolClient) => unknown) =>
      trabajo({ query } as unknown as PoolClient),
  );
  const servicio = new AuditoriaService({ operar } as unknown as CuentaService);

  beforeEach(() => {
    vi.clearAllMocks();
    query.mockResolvedValue({ rows: [fila()] });
  });

  it('revalida ADMIN y escuela en CuentaService, con una selección explícita sin contenido', async () => {
    await servicio.administrativa(sesion, undefined);
    expect(operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      expect.any(Function),
    );
    const [sql, parametros] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain(
      'e.establecimiento_id = convi.establecimiento_actual()',
    );
    expect(sql).not.toMatch(/e\.metadatos\s+(?:AS|as)\s/);
    expect(sql).not.toContain("->>'resumen'");
    expect(sql).not.toContain("->>'descripcion'");
    expect(sql).not.toContain('SELECT *');
    expect(parametros.slice(0, 11)).toEqual([
      null,
      null,
      null,
      51,
      '',
      null,
      null,
      [],
      null,
      null,
      null,
    ]);
  });

  it('comprueba el permiso específico del caso antes de leer la cronología', async () => {
    await servicio.cronologia(sesion, id, undefined);
    expect(operar).toHaveBeenCalledWith(
      sesion,
      { tipo: 'caso', id, perfiles: ['CONVIVENCIA'] },
      expect.any(Function),
    );
    const [sql, parametros] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('convi.vw_cronologia_caso WHERE caso_id = $1');
    expect(sql).toContain("'RESPONSABLE_SITUACION'");
    expect(sql).toContain('responsable anterior:');
    expect(parametros[0]).toBe(id);
  });

  it('envía el cursor como parámetros, sin interpolarlo en SQL', async () => {
    await servicio.administrativa(sesion, {
      antes: codificar([fecha, id, 'MODIFICACION']),
    });
    expect(query.mock.calls[0][1].slice(0, 4)).toEqual([
      fecha,
      id,
      'MODIFICACION',
      51,
    ]);
    expect(query.mock.calls[0][0]).not.toContain(fecha);
  });

  it('rechaza la paginación inválida antes de consultar la base', () => {
    expect(() => servicio.administrativa(sesion, ['cursor'])).toThrow(
      BadRequestException,
    );
    expect(operar).not.toHaveBeenCalled();
  });

  it('combina filtros como parámetros y conserva el límite de 51 filas consultadas', async () => {
    await servicio.administrativa(sesion, {
      colaborador: "José O'Hara%",
      fecha: '2026-05-31',
      palabras: 'Documento actualizado',
      recurso: 'versiones_documento',
      accion: 'MODIFICACION',
      resultado: 'OK',
    });
    const [sql, valores] = query.mock.calls[0];
    expect(valores.slice(3, 11)).toEqual([
      51,
      "jose o'hara%",
      '2026-05-31',
      '2026-05-31',
      ['documento', 'actualizado'],
      'versiones_documento',
      'MODIFICACION',
      'OK',
    ]);
    expect(sql).not.toContain("O'Hara");
    expect(sql).not.toMatch(/e\.metadatos\s+(?:AS|as)\s/);
    expect(sql).toContain('e.ocurrido_en >= $6::date::timestamptz');
    expect(sql).toContain('($7::date + 1)::timestamptz');
  });
});

describe('PB-116: referencias y cambios comprensibles sin contenido privado', () => {
  it('explica campos administrativos aprobados y conserva la referencia técnica', () => {
    const e = {
      ...fila(),
      recurso: 'establecimientos',
      referencia_nombre: 'Escuela de prueba',
      campos_modificados: [
        'plazo de cierre',
        'zona horaria',
        'resumen privado',
      ],
      metadatos: { antes: { token: 'NO MOSTRAR' } },
    };
    const evento = paginaAuditoria([e], false).eventos[0];
    expect(evento.referencia).toBe(id);
    expect(evento.referencia_nombre).toBe('Escuela de prueba');
    expect(evento.resumen).toBe(
      'Se actualizaron estos datos: plazo de cierre, zona horaria',
    );
    expect(JSON.stringify(evento)).not.toMatch(
      /privado|token|NO MOSTRAR|metadatos/,
    );
  });

  it('no utiliza referencias ni nombres de campos sensibles de un expediente', () => {
    const e = {
      ...fila(),
      referencia_nombre: 'EXPEDIENTE PRIVADO',
      campos_modificados: ['resumen', 'diagnóstico'],
      descripcion: 'DATOS PRIVADOS',
    };
    const evento = paginaAuditoria([e], false).eventos[0];
    expect(evento.referencia_nombre).toBeNull();
    expect(JSON.stringify(evento)).not.toMatch(
      /EXPEDIENTE|diagnóstico|DATOS PRIVADOS/,
    );
  });

  it('distingue los eventos sin desglose y conserva los nombres de versiones', () => {
    const evento = paginaAuditoria(
      [
        {
          ...fila(),
          recurso: 'versiones_documento',
          referencia_nombre: 'Reglamento Interno — 2026',
          campos_modificados: null,
        },
      ],
      false,
    ).eventos[0];
    expect(evento.referencia_nombre).toBe('Reglamento Interno — 2026');
    expect(evento.resumen).toContain('no conserva un desglose');
  });
});

describe('PB-116: validación de filtros', () => {
  it('acepta filtros vacíos, rangos abiertos y fechas bisiestas reales', () => {
    expect(validarFiltros(undefined).colaborador).toBe('');
    expect(validarFiltros({ desde: '2024-02-29' }).hasta).toBe('');
    expect(validarFiltros({ hasta: '2026-10-28' }).desde).toBe('');
    expect(
      validarFiltros({ desde: '2026-10-28', hasta: '2026-10-28' }).hasta,
    ).toBe('2026-10-28');
    expect(normalizarBusqueda('José Muñoz')).toBe('jose munoz');
  });
  it.each([
    'texto',
    [],
    { fecha: ['2026-10-28'] },
    { colaborador: {} },
    { palabras: 'x'.repeat(161) },
    { desde: '2026-02-29' },
    { fecha: '2026-02-30' },
    { hasta: '0000-01-01' },
    { desde: '2026-10-29', hasta: '2026-10-28' },
    { fecha: '2026-10-28', desde: '2026-10-27' },
    { recurso: "casos'; DROP TABLE casos" },
    { accion: ['MODIFICACION'] },
    { establecimiento_id: id },
    { palabras: Array(11).fill('hola').join(' ') },
  ])('rechaza valores ambiguos o inválidos %j', (entrada) => {
    expect(() => validarFiltros(entrada)).toThrow(BadRequestException);
  });
});

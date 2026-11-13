import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PoolClient } from 'pg';
import type { CuentaService } from '../../database/cuenta.service.js';
import type { Sesion } from '../../common/sesion.js';
import { respuestaArchivo } from './apoderado.controller.js';
import { ApoderadoService } from './apoderado.service.js';
import { EvidenciasService } from './evidencias.service.js';
import { REGISTROS_PORTAL } from './portal-apoderado.js';
import {
  ARCHIVO_SITUACION_PUPILO,
  DETALLE_SITUACION_PUPILO,
  HISTORIAL_PUPILO,
  PAGINA_COMUNICACIONES,
  PAGINA_DOCUMENTOS,
  PAGINA_HISTORIAL,
  PAGINA_REUNIONES,
  PAGINA_SITUACIONES,
  RESUMEN_PUPILO,
} from './pupilo-apoderado.js';

const id = '11111111-1111-4111-8111-111111111111';
const sesion = { codigo_perfil: 'APODERADO' } as Sesion;
const listas = [
  'historial',
  'situaciones',
  'documentos',
  'reuniones',
  'comunicaciones',
] as const;

// Simula CuentaService.operar: entrega una conexión falsa con las filas dadas.
function servicioCon(filas: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows: filas });
  const operar = vi.fn(
    (_s: Sesion, _a: unknown, trabajo: (db: unknown) => unknown) =>
      trabajo({ query }),
  );
  return {
    query,
    operar,
    servicio: new ApoderadoService({ operar } as unknown as CuentaService),
  };
}

describe('Portal del apoderado: ficha y listas del pupilo', () => {
  it.each(['resumen', ...listas] as const)(
    'no consulta datos si CuentaService rechaza %s',
    async (metodo) => {
      const operar = vi.fn().mockRejectedValue(new ForbiddenException());
      const servicio = new ApoderadoService({
        operar,
      } as unknown as CuentaService);
      const promesa =
        metodo === 'resumen'
          ? servicio.resumen(sesion, id)
          : servicio[metodo](sesion, id, {});
      await expect(promesa).rejects.toThrow(ForbiddenException);
      expect(operar.mock.calls[0][1]).toEqual({
        tipo: 'estudiante',
        id,
        perfiles: ['APODERADO'],
      });
    },
  );

  it.each(listas)('%s rechaza filtros o páginas no válidos', (metodo) => {
    const { servicio, operar } = servicioCon([]);
    expect(() => servicio[metodo](sesion, id, { pagina: '0' })).toThrow(
      BadRequestException,
    );
    expect(() => servicio[metodo](sesion, id, { escuela: id })).toThrow(
      BadRequestException,
    );
    expect(operar).not.toHaveBeenCalled();
  });

  it.each([
    ['historial', PAGINA_HISTORIAL],
    ['situaciones', PAGINA_SITUACIONES],
    ['documentos', PAGINA_DOCUMENTOS],
    ['reuniones', PAGINA_REUNIONES],
    ['comunicaciones', PAGINA_COMUNICACIONES],
  ] as const)(
    '%s pide 50 filas desde la página elegida',
    async (metodo, sql) => {
      const fila = {
        total: 51,
        elementos: [],
        estudiante: 'Martina Soto',
        zona_horaria: 'America/Santiago',
      };
      const { servicio, query } = servicioCon([fila]);
      await expect(
        servicio[metodo](sesion, id, { pagina: '2' }),
      ).resolves.toEqual({ ...fila, pagina: 2, por_pagina: 50 });
      expect(query).toHaveBeenCalledWith(sql, [id, 50]);
    },
  );

  it('responde 404 si el estudiante no aparece', async () => {
    const { servicio } = servicioCon([{ estudiante: null }]);
    await expect(servicio.resumen(sesion, id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(servicio.historial(sesion, id, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('el resumen usa solo el estudiante como parámetro', async () => {
    const { servicio, query } = servicioCon([{ estudiante: { id } }]);
    await servicio.resumen(sesion, id);
    expect(query).toHaveBeenCalledWith(RESUMEN_PUPILO, [id]);
  });
});

describe('Portal del apoderado: qué muestran las consultas', () => {
  it('las situaciones excluyen las descartadas y las participaciones terminadas', () => {
    expect(HISTORIAL_PUPILO).toContain('situaciones_hijo');
    expect(PAGINA_HISTORIAL).toContain("s.estado<>'DESCARTADA'");
    expect(PAGINA_HISTORIAL).toContain('pa.activo_hasta IS NULL');
  });

  it('de las situaciones sin caso no entrega el relato', () => {
    expect(HISTORIAL_PUPILO).not.toMatch(/s\.descripcion/);
  });

  it.each([
    ['historial', PAGINA_HISTORIAL],
    ['comunicaciones', PAGINA_COMUNICACIONES],
    ['resumen', RESUMEN_PUPILO],
    ['detalle del caso', REGISTROS_PORTAL],
  ])('%s nunca muestra borradores de comunicaciones', (_nombre, sql) => {
    expect(sql).toContain(
      "estado_entrega IN ('NO_APLICA','ENVIADO','ENTREGADO')",
    );
    expect(sql).not.toContain('BORRADOR');
  });

  it('el detalle del caso filtra las comunicaciones por su estado', () => {
    expect(REGISTROS_PORTAL).toContain(
      "(v.tipo<>'COMUNICACION' OR cm.estado_entrega IN ('NO_APLICA','ENVIADO','ENTREGADO'))",
    );
  });

  it.each([
    PAGINA_HISTORIAL,
    PAGINA_SITUACIONES,
    PAGINA_DOCUMENTOS,
    PAGINA_REUNIONES,
    PAGINA_COMUNICACIONES,
  ])('cada lista se limita a los casos del pupilo y a 50 filas', (sql) => {
    expect(sql).toContain('casos_hijo');
    expect(sql).toContain('LIMIT 50 OFFSET $2');
  });
});

const situacion = '33333333-3333-4333-8333-333333333333';
const evidencia = '44444444-4444-4444-8444-444444444444';

describe('Portal del apoderado: situaciones y sus imágenes', () => {
  it('el detalle de una situación pasa por CuentaService con el estudiante', async () => {
    const { servicio, operar, query } = servicioCon([{ id: situacion }]);
    await servicio.situacion(sesion, id, situacion);
    expect(operar.mock.calls[0][1]).toEqual({
      tipo: 'estudiante',
      id,
      perfiles: ['APODERADO'],
    });
    expect(query).toHaveBeenCalledWith(DETALLE_SITUACION_PUPILO, [
      id,
      situacion,
    ]);
  });

  it('responde 404 si la situación no es del pupilo o está descartada', async () => {
    const { servicio } = servicioCon([]);
    await expect(servicio.situacion(sesion, id, situacion)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('por decisión del PO muestra el relato, pero nunca las descartadas', () => {
    expect(PAGINA_SITUACIONES).toContain('s.descripcion AS relato');
    expect(DETALLE_SITUACION_PUPILO).toContain('s.descripcion AS relato');
    expect(PAGINA_SITUACIONES).toContain("s.estado<>'DESCARTADA'");
    expect(DETALLE_SITUACION_PUPILO).toContain('pa.activo_hasta IS NULL');
  });

  it('un archivo solo se entrega si pertenece a esa situación del pupilo', () => {
    expect(ARCHIVO_SITUACION_PUPILO).toContain(
      'WHERE a.id=$3 AND a.situacion_id=$2',
    );
    expect(ARCHIVO_SITUACION_PUPILO).toContain(
      'IN (SELECT id FROM situaciones_hijo)',
    );
  });

  it('no lee Storage si el archivo no corresponde', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const operar = vi.fn(
      async (
        _s: Sesion,
        _a: unknown,
        trabajo: (db: PoolClient) => Promise<unknown>,
      ) => trabajo({ query } as unknown as PoolClient),
    );
    const from = vi.fn();
    const evidencias = new EvidenciasService(
      { operar } as unknown as CuentaService,
      { storage: { from } } as unknown as SupabaseClient,
    );
    await expect(
      evidencias.descargarSituacionApoderado(sesion, id, situacion, evidencia),
    ).rejects.toThrow(NotFoundException);
    expect(operar.mock.calls[0][1]).toEqual({
      tipo: 'estudiante',
      id,
      perfiles: ['APODERADO'],
    });
    expect(query).toHaveBeenCalledWith(ARCHIVO_SITUACION_PUPILO, [
      id,
      situacion,
      evidencia,
    ]);
    expect(from).not.toHaveBeenCalled();
  });

  const archivo = (mime: string) => ({
    nombre: 'foto del patio.jpg',
    mime,
    contenido: Buffer.from('imagen'),
  });

  it.each(['image/jpeg', 'image/png', 'image/webp'])(
    'muestra %s en el navegador como vista previa',
    (mime) => {
      const respuesta = respuestaArchivo(archivo(mime), true);
      expect(respuesta.getHeaders().disposition).toMatch(/^inline; /);
      expect(respuesta.getHeaders().type).toBe(mime);
    },
  );

  it.each(['application/pdf', 'text/html', 'image/svg+xml'])(
    'no abre %s en el navegador, solo se descarga',
    (mime) => {
      expect(() => respuestaArchivo(archivo(mime), true)).toThrow(
        NotFoundException,
      );
      expect(
        respuestaArchivo(archivo(mime), false).getHeaders().disposition,
      ).toMatch(/^attachment; /);
    },
  );
});

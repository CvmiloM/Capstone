import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  armarIcs,
  codigoValido,
  type EventoSuscrito,
  huellaCodigo,
  leerOrigen,
  nuevoCodigo,
} from './suscripcion.js';

export type EstadoSuscripcion = {
  activa: boolean;
  creada_en: string | null;
  consultada_en: string | null;
};

const ACCESO = { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] } as const;

/**
 * Refinamientos de Convivencia, sección 5: enlace privado para suscribir el
 * calendario de Convivencia desde Google Calendar. Cada cuenta maneja solo su
 * propio enlace, el código se muestra una sola vez al crearlo y la base guarda
 * su huella. Crear y revocar quedan en la auditoría.
 */
@Injectable()
export class SuscripcionCalendarioService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  estado(sesion: Sesion): Promise<EstadoSuscripcion> {
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const { rows } = await db.query<{
        creada_en: string;
        consultada_en: string | null;
      }>(
        `SELECT to_char(creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS creada_en,
                to_char(consultada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS consultada_en
         FROM convi.suscripciones_calendario
         WHERE membresia_id = $1 AND revocada_en IS NULL`,
        [sesion.membresia_id],
      );
      return {
        activa: rows.length === 1,
        creada_en: rows[0]?.creada_en ?? null,
        consultada_en: rows[0]?.consultada_en ?? null,
      };
    });
  }

  /** Revoca el enlace anterior, si había, y crea otro. */
  crear(sesion: Sesion): Promise<{ codigo: string }> {
    const codigo = nuevoCodigo();
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      await this.revocarActivo(db, sesion);
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO convi.suscripciones_calendario(establecimiento_id, membresia_id, huella_token)
         VALUES ($1, $2, $3) RETURNING id`,
        [sesion.establecimiento_id, sesion.membresia_id, huellaCodigo(codigo)],
      );
      await this.auditar(
        db,
        sesion,
        'SUSCRIPCION_CALENDARIO_CREADA',
        rows[0].id,
      );
      return { codigo };
    });
  }

  revocar(sesion: Sesion): Promise<{ revocada: boolean }> {
    return this.cuentas.operar(sesion, ACCESO, async (db) => ({
      revocada: await this.revocarActivo(db, sesion),
    }));
  }

  /** Lo que pide Google: el archivo .ics del enlace, o 404 si no sirve. */
  async archivo(codigo: unknown, origen: unknown): Promise<string> {
    if (!codigoValido(codigo))
      throw new NotFoundException('El enlace del calendario no existe.');
    const datos = (await this.cuentas.calendarioSuscrito(
      huellaCodigo(codigo),
    )) as {
      zona_horaria: string;
      eventos: EventoSuscrito[];
    } | null;
    if (!datos)
      throw new NotFoundException('El enlace del calendario no existe.');
    return armarIcs({
      eventos: datos.eventos,
      zonaHoraria: datos.zona_horaria,
      origen: leerOrigen(origen),
    });
  }

  private async revocarActivo(
    db: PoolClient,
    sesion: Sesion,
  ): Promise<boolean> {
    const { rows } = await db.query<{ id: string }>(
      `UPDATE convi.suscripciones_calendario SET revocada_en = now()
       WHERE membresia_id = $1 AND revocada_en IS NULL RETURNING id`,
      [sesion.membresia_id],
    );
    for (const fila of rows)
      await this.auditar(
        db,
        sesion,
        'SUSCRIPCION_CALENDARIO_REVOCADA',
        fila.id,
      );
    return rows.length > 0;
  }

  private async auditar(
    db: PoolClient,
    sesion: Sesion,
    accion: string,
    id: string,
  ) {
    await db.query(
      `INSERT INTO convi.eventos_auditoria(establecimiento_id, membresia_actor_id,
         codigo_accion, tipo_recurso, recurso_id, codigo_resultado)
       VALUES ($1, $2, $3, 'suscripciones_calendario', $4, 'OK')`,
      [sesion.establecimiento_id, sesion.membresia_id, accion, id],
    );
  }
}

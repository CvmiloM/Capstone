import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos } from './curso.js';
import {
  CAMPOS_ACCESO_APODERADO,
  UNIONES_ACCESO_APODERADO,
  validarVencimientoAcceso,
  type ResumenAccesoApoderado,
} from './acceso-apoderado.js';

type Permiso = { id: string; estado: string; expira_en: string | null };
type Fila = ResumenAccesoApoderado & {
  id: string;
  estudiante_id: string;
  estudiante_nombre: string;
  codigo_estudiante: string;
  apoderado_nombre: string;
  correo: string | null;
  tipo_relacion: string | null;
  total: string;
};

@Injectable()
export class AccesosApoderadoService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  listar(sesion: Sesion, consulta: Record<string, unknown>) {
    const buscar =
      typeof consulta.buscar === 'string' ? consulta.buscar.trim() : '';
    const pagina = consulta.pagina === undefined ? 1 : Number(consulta.pagina);
    if (
      Object.keys(consulta).some((k) => !['buscar', 'pagina'].includes(k)) ||
      (consulta.buscar !== undefined && typeof consulta.buscar !== 'string') ||
      buscar.length > 100 ||
      (buscar.length > 0 && buscar.length < 2) ||
      (consulta.pagina !== undefined &&
        (typeof consulta.pagina !== 'string' ||
          !/^\d{1,5}$/.test(consulta.pagina))) ||
      !Number.isSafeInteger(pagina) ||
      pagina < 1 ||
      pagina > 10000
    )
      throw new BadRequestException(
        'Busca con al menos dos caracteres y una página válida',
      );
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      async (db) => {
        const patron = `%${buscar.replace(/[\\%_]/g, '\\$&')}%`;
        const origen = `FROM convi.apoderados_estudiante a
        JOIN convi.personas p ON p.id = a.persona_apoderado_id AND p.establecimiento_id = a.establecimiento_id
        JOIN convi.estudiantes e ON e.id = a.estudiante_id AND e.establecimiento_id = a.establecimiento_id
        JOIN convi.personas alumno ON alumno.id = e.persona_id AND alumno.establecimiento_id = e.establecimiento_id`;
        const filtro = `WHERE p.nombres || ' ' || p.apellidos ILIKE $1 OR alumno.nombres || ' ' || alumno.apellidos ILIKE $1
          OR p.correo ILIKE $1 OR e.codigo_estudiante ILIKE $1`;
        const total = Number(
          (
            await db.query<{ total: string }>(
              `SELECT count(*) AS total ${origen} ${filtro}`,
              [patron],
            )
          ).rows[0].total,
        );
        const resultado = await db.query<Fila>(
          `SELECT a.id, a.estudiante_id, alumno.nombres || ' ' || alumno.apellidos AS estudiante_nombre,
          e.codigo_estudiante, p.nombres || ' ' || p.apellidos AS apoderado_nombre, p.correo, a.tipo_relacion,
          ${CAMPOS_ACCESO_APODERADO}
         ${origen} ${UNIONES_ACCESO_APODERADO} ${filtro}
         ORDER BY p.apellidos, p.nombres, alumno.apellidos, alumno.nombres, a.id LIMIT 50 OFFSET $2`,
          [patron, (pagina - 1) * 50],
        );
        return { apoderados: resultado.rows, total, pagina, por_pagina: 50 };
      },
    );
  }

  otorgar(sesion: Sesion, vinculoId: string, cuerpo: unknown) {
    const vence = validarVencimientoAcceso(cuerpo);
    return this.operar(sesion, vinculoId, async (db, cuentaId) => {
      await this.comprobarVencimiento(db, vence);
      const vigente = await db.query(
        `SELECT id FROM convi.accesos_apoderado WHERE apoderado_estudiante_id = $1 AND estado = 'ACTIVO' AND expira_en > now()`,
        [vinculoId],
      );
      if (vigente.rowCount)
        throw new ConflictException(
          'Este apoderado ya tiene un acceso vigente para el estudiante, puedes renovar su vencimiento',
        );
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO convi.accesos_apoderado(establecimiento_id,apoderado_estudiante_id,membresia_apoderado_id,estado,expira_en,otorgado_por)
         VALUES(convi.establecimiento_actual(),$1,$2,'ACTIVO',($3::date + 1)::timestamptz,convi.membresia_actual()) RETURNING id`,
        [vinculoId, cuentaId, vence],
      );
      return rows[0];
    });
  }

  renovar(
    sesion: Sesion,
    vinculoId: string,
    accesoId: string,
    cuerpo: unknown,
  ) {
    const vence = validarVencimientoAcceso(cuerpo);
    return this.operar(sesion, vinculoId, async (db) => {
      const actual = await this.permiso(db, vinculoId, accesoId);
      if (!['ACTIVO', 'EXPIRADO'].includes(actual.estado))
        throw new ConflictException(
          'Un acceso revocado conserva su historia, otorga un acceso nuevo',
        );
      await this.comprobarVencimiento(db, vence, actual.expira_en);
      await db.query(
        `UPDATE convi.accesos_apoderado SET estado='ACTIVO',expira_en=($2::date+1)::timestamptz WHERE id=$1`,
        [accesoId, vence],
      );
      return { id: accesoId };
    });
  }

  revocar(
    sesion: Sesion,
    vinculoId: string,
    accesoId: string,
    cuerpo: unknown,
  ) {
    if ((cuerpo as { confirmado?: unknown } | null)?.confirmado !== true)
      throw new BadRequestException(
        'Confirma que quieres revocar el acceso de esta cuenta a este estudiante',
      );
    // Revocar sigue disponible aunque el vínculo haya terminado o la cuenta esté suspendida.
    return this.operar(
      sesion,
      vinculoId,
      async (db) => {
        const actual = await this.permiso(db, vinculoId, accesoId);
        // Si había permisos antiguos solapados, ninguno debe mantener el acceso tras revocar.
        await db.query(
          `UPDATE convi.accesos_apoderado SET estado='REVOCADO',revocado_por=convi.membresia_actual(),revocado_en=clock_timestamp()
        WHERE apoderado_estudiante_id=$1 AND ((id=$2 AND estado<>'REVOCADO') OR estado IN ('ACTIVO','PENDIENTE'))`,
          [vinculoId, actual.id],
        );
        return { id: accesoId };
      },
      true,
    );
  }

  private async permiso(db: PoolClient, vinculoId: string, accesoId: string) {
    const { rows } = await db.query<Permiso>(
      `SELECT id,estado,to_char(expira_en AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS expira_en
      FROM convi.accesos_apoderado WHERE apoderado_estudiante_id=$1
      ORDER BY (estado='ACTIVO' AND expira_en>now()) DESC,otorgado_en DESC,id DESC LIMIT 1 FOR UPDATE`,
      [vinculoId],
    );
    if (!rows[0] || rows[0].id !== accesoId)
      throw new ConflictException(
        'El permiso cambió, actualiza la ficha antes de continuar',
      );
    return rows[0];
  }

  private async comprobarVencimiento(
    db: PoolClient,
    vence: string,
    anterior: string | null = null,
  ) {
    const { rows } = await db.query<{ valido: boolean }>(
      `SELECT ($1::date+1)::timestamptz > clock_timestamp()
      AND ($2::timestamptz IS NULL OR ($1::date+1)::timestamptz > $2::timestamptz) AS valido`,
      [vence, anterior],
    );
    if (!rows[0].valido)
      throw errorDeCampos(
        {
          vence_el: anterior
            ? 'La renovación debe vencer después del permiso anterior y del momento actual'
            : 'El vencimiento debe ser posterior al otorgamiento',
        },
        'Revisa el vencimiento del acceso',
      );
  }

  private operar<T>(
    sesion: Sesion,
    vinculoId: string,
    trabajo: (db: PoolClient, cuentaId: string) => Promise<T>,
    soloRevocar = false,
  ) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      async (db) => {
        const { rows } = await db.query<{
          persona_apoderado_id: string;
          vigente: boolean;
        }>(
          `SELECT persona_apoderado_id, (activo_desde IS NULL OR activo_desde<=current_date)
           AND (activo_hasta IS NULL OR activo_hasta>=current_date) AS vigente
         FROM convi.apoderados_estudiante WHERE id=$1 FOR UPDATE`,
          [vinculoId],
        );
        if (!rows[0])
          throw new NotFoundException(
            'No encontramos ese vínculo en tu escuela',
          );
        const cuenta = (
          await db.query<{ id: string; codigo_perfil: string; estado: string }>(
            'SELECT id,codigo_perfil,estado FROM convi.membresias_establecimiento WHERE persona_id=$1 FOR SHARE',
            [rows[0].persona_apoderado_id],
          )
        ).rows[0];
        if (
          !soloRevocar &&
          (!cuenta ||
            cuenta.codigo_perfil !== 'APODERADO' ||
            cuenta.estado !== 'ACTIVO')
        )
          throw new ConflictException(
            'Primero debe existir una cuenta activa de Apoderado para esta misma persona',
          );
        if (!soloRevocar && !rows[0].vigente)
          throw new ConflictException(
            'El vínculo debe estar vigente para otorgar o renovar el acceso',
          );
        return trabajo(db, cuenta?.id ?? '');
      },
      'READ COMMITTED',
    );
  }
}

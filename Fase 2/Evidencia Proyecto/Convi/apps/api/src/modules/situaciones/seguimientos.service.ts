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
import {
  asistentesPosibles,
  EN_LA_ESCUELA,
  responsablesDeEncuentro,
  validarReprogramacion,
} from './encuentros.js';
import { ZONA_ESCUELA } from './plan-intervencion.js';
import {
  validarCompromiso,
  validarSeguimiento,
  validarResultadoSeguimiento,
  validarRevision,
} from './seguimientos.js';

const ACCESO = {
  tipo: 'establecimiento' as const,
  perfiles: ['CONVIVENCIA'] as 'CONVIVENCIA'[],
};
const DESACTUALIZADO =
  'La información cambió mientras la mirabas, recarga la página antes de continuar';

@Injectable()
export class SeguimientosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  crearCompromiso(sesion: Sesion, casoId: string, cuerpo: unknown) {
    const datos = validarCompromiso(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        await bloquearCaso(db, casoId);
        if (
          !(await asistentesPosibles(db, casoId)).some(
            (p) => p.persona_id === datos.persona_responsable_id,
          )
        )
          throw new BadRequestException({
            mensaje: 'Revisa la persona responsable',
            errores: {
              persona_responsable_id:
                'Elige una persona vinculada al caso o del equipo activo',
            },
          });
        if (
          datos.actuacion_origen_id &&
          !(
            await db.query(
              'SELECT 1 FROM convi.actuaciones WHERE id=$1 AND caso_id=$2',
              [datos.actuacion_origen_id, casoId],
            )
          ).rowCount
        )
          throw new BadRequestException(
            'La actuación de origen debe pertenecer a este caso',
          );
        return (
          await db.query(
            `INSERT INTO convi.compromisos(establecimiento_id,caso_id,descripcion,persona_responsable_id,vence_en,actuacion_origen_id,creado_por)
        VALUES(convi.establecimiento_actual(),$1,$2,$3,${EN_LA_ESCUELA('$4')},$5,convi.membresia_actual()) RETURNING id`,
            [
              casoId,
              datos.descripcion,
              datos.persona_responsable_id,
              datos.vence_en,
              datos.actuacion_origen_id,
            ],
          )
        ).rows[0];
      },
      'READ COMMITTED',
    );
  }
  programar(sesion: Sesion, casoId: string, cuerpo: unknown) {
    const datos = validarSeguimiento(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        await bloquearCaso(db, casoId);
        return insertarSeguimiento(db, casoId, datos);
      },
      'READ COMMITTED',
    );
  }
  reprogramar(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarReprogramacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        const actual = await bloquearSeguimiento(db, id);
        comprobarAbierto(actual, datos.version);
        const igual = await db.query(
          `SELECT programado_en=${EN_LA_ESCUELA('$2')} AS igual FROM convi.actuaciones WHERE id=$1`,
          [id, datos.programado_en],
        );
        if (igual.rows[0].igual)
          throw new BadRequestException('Elige una fecha diferente');
        await db.query("SELECT set_config('app.motivo_cambio',$1,true)", [
          datos.motivo,
        ]);
        await db.query(
          `UPDATE convi.actuaciones SET programado_en=${EN_LA_ESCUELA('$2')}, fin_programado_en=${EN_LA_ESCUELA('$3')},estado='POSPUESTA' WHERE id=$1`,
          [id, datos.programado_en, datos.fin_programado_en],
        );
        // La fecha orientativa del anterior apunta al mismo registro de la agenda.
        if (actual.seguimiento_anterior_id)
          await db.query(
            `UPDATE convi.actuaciones SET proximo_seguimiento_en=${EN_LA_ESCUELA('$2')} WHERE id=$1`,
            [actual.seguimiento_anterior_id, datos.programado_en],
          );
        return { id };
      },
      'READ COMMITTED',
    );
  }
  registrarResultado(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarResultadoSeguimiento(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        const actual = await bloquearSeguimiento(db, id);
        comprobarAbierto(actual, datos.version);
        if (
          (
            await db.query(`SELECT ${EN_LA_ESCUELA('$1')} > now() AS futura`, [
              datos.realizado_en,
            ])
          ).rows[0].futura
        )
          throw new BadRequestException({
            mensaje: 'Revisa la fecha real',
            errores: { realizado_en: 'La fecha real no puede ser futura' },
          });
        await db.query(
          `UPDATE convi.actuaciones SET estado='REALIZADA',realizado_en=${EN_LA_ESCUELA('$2')},resultado=$3,proxima_accion=$4 WHERE id=$1`,
          [id, datos.realizado_en, datos.resultado, datos.proxima_accion],
        );
        // El trigger exige un seguimiento realizado, todo se revierte si alguna revisión falla.
        for (const revision of [...datos.revisiones].sort((a, b) =>
          a.compromiso_id.localeCompare(b.compromiso_id),
        ))
          await guardarRevision(db, actual.caso_id, id, revision);
        const siguiente = datos.siguiente
          ? await insertarSeguimiento(db, actual.caso_id, datos.siguiente, id)
          : null;
        if (datos.siguiente)
          await db.query(
            `UPDATE convi.actuaciones SET proximo_seguimiento_en=${EN_LA_ESCUELA('$2')} WHERE id=$1`,
            [id, datos.siguiente.programado_en],
          );
        return { id, siguiente_id: siguiente?.id ?? null };
      },
      'READ COMMITTED',
    );
  }
  revisar(sesion: Sesion, id: string, cuerpo: unknown) {
    const datos = validarRevision(cuerpo);
    return this.cuentas.operar(
      sesion,
      ACCESO,
      async (db) => {
        const actual = await bloquearSeguimiento(db, id);
        if (actual.estado !== 'REALIZADA')
          throw new ConflictException(
            'Registra primero el resultado del seguimiento',
          );
        await guardarRevision(db, actual.caso_id, id, datos);
        return { id };
      },
      'READ COMMITTED',
    );
  }
  agenda(sesion: Sesion, mes: string, pagina: string) {
    if (mes && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(mes))
      throw new BadRequestException('Elige un mes válido');
    const numero = Number(pagina || '1');
    if (!Number.isSafeInteger(numero) || numero < 1 || numero > 100000)
      throw new BadRequestException('Página no válida');
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const actual =
        mes ||
        ((
          await db.query(
            `SELECT to_char(now() AT TIME ZONE ${ZONA_ESCUELA},'YYYY-MM') AS mes`,
          )
        ).rows[0].mes as string);
      const filtro = `a.tipo_actuacion='SEGUIMIENTO' AND a.programado_en >= ($1::date::timestamp AT TIME ZONE ${ZONA_ESCUELA}) AND a.programado_en < (($1::date+interval '1 month') AT TIME ZONE ${ZONA_ESCUELA})`;
      const total = Number(
        (
          await db.query(
            `SELECT count(*) FROM convi.actuaciones a WHERE ${filtro}`,
            [actual + '-01'],
          )
        ).rows[0].count,
      );
      const filas = (
        await db.query(
          `SELECT a.id,a.caso_id,c.codigo,c.titulo,a.objetivo,a.estado,a.programado_en,
        to_char(a.programado_en AT TIME ZONE ${ZONA_ESCUELA},'DD-MM-YYYY HH24:MI') AS fecha,
        p.nombres || ' ' || p.apellidos AS responsable FROM convi.actuaciones a JOIN convi.casos c ON c.id=a.caso_id
        JOIN convi.membresias_establecimiento m ON m.id=a.membresia_responsable_id JOIN convi.personas p ON p.id=m.persona_id
        WHERE ${filtro} ORDER BY a.programado_en,a.id LIMIT 50 OFFSET $2`,
          [actual + '-01', (numero - 1) * 50],
        )
      ).rows;
      return { mes: actual, pagina: numero, total, filas };
    });
  }
}
async function bloquearCaso(db: PoolClient, id: string) {
  const r = await db.query(
    'SELECT estado_actual FROM convi.casos WHERE id=$1 FOR UPDATE',
    [id],
  );
  if (!r.rows[0]) throw new NotFoundException('El caso no existe');
  if (r.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(
      'El caso está cerrado, sus registros se conservan',
    );
}
type SeguimientoActual = {
  caso_id: string;
  estado: string;
  version: string;
  seguimiento_anterior_id: string | null;
};
async function bloquearSeguimiento(
  db: PoolClient,
  id: string,
): Promise<SeguimientoActual> {
  const r = await db.query(
    "SELECT caso_id FROM convi.actuaciones WHERE id=$1 AND tipo_actuacion='SEGUIMIENTO'",
    [id],
  );
  if (!r.rows[0]) throw new NotFoundException('El seguimiento no existe');
  await bloquearCaso(db, r.rows[0].caso_id);
  return (
    await db.query<SeguimientoActual>(
      'SELECT a.caso_id,a.estado,a.seguimiento_anterior_id,md5(to_jsonb(a)::text) AS version FROM convi.actuaciones a WHERE id=$1 FOR UPDATE',
      [id],
    )
  ).rows[0];
}
function comprobarAbierto(actual: SeguimientoActual, version: string) {
  if (actual.version !== version) throw new ConflictException(DESACTUALIZADO);
  if (!['PLANIFICADA', 'POSPUESTA'].includes(actual.estado))
    throw new ConflictException(
      'El seguimiento ya terminó y su resultado se conserva',
    );
}
async function insertarSeguimiento(
  db: PoolClient,
  casoId: string,
  datos: ReturnType<typeof validarSeguimiento>,
  anterior: string | null = null,
) {
  if (
    !(await responsablesDeEncuentro(db)).some(
      (p) => p.id === datos.responsable_id,
    )
  )
    throw new BadRequestException({
      mensaje: 'Revisa el responsable',
      errores: { responsable_id: 'Elige una cuenta activa de Convivencia' },
    });
  return (
    await db.query(
      `INSERT INTO convi.actuaciones(establecimiento_id,caso_id,tipo_actuacion,membresia_responsable_id,objetivo,programado_en,creado_por,seguimiento_anterior_id)
    VALUES(convi.establecimiento_actual(),$1,'SEGUIMIENTO',$2,$3,${EN_LA_ESCUELA('$4')},convi.membresia_actual(),$5) RETURNING id`,
      [
        casoId,
        datos.responsable_id,
        datos.objetivo,
        datos.programado_en,
        anterior,
      ],
    )
  ).rows[0] as { id: string };
}
async function guardarRevision(
  db: PoolClient,
  casoId: string,
  seguimientoId: string,
  datos: ReturnType<typeof validarRevision>,
) {
  const c = await db.query(
    'SELECT md5(to_jsonb(c)::text) AS version FROM convi.compromisos c WHERE id=$1 AND caso_id=$2 FOR UPDATE',
    [datos.compromiso_id, casoId],
  );
  if (!c.rows[0])
    throw new NotFoundException('El compromiso no pertenece a este caso');
  if (c.rows[0].version !== datos.version)
    throw new ConflictException(DESACTUALIZADO);
  if (
    (
      await db.query(
        'SELECT 1 FROM convi.revisiones_compromisos WHERE actuacion_id=$1 AND compromiso_id=$2',
        [seguimientoId, datos.compromiso_id],
      )
    ).rowCount
  )
    throw new ConflictException(
      'Este compromiso ya fue revisado en este seguimiento',
    );
  await db.query(
    `INSERT INTO convi.revisiones_compromisos(establecimiento_id,caso_id,compromiso_id,actuacion_id,estado_observado,observacion,creado_por)
    VALUES(convi.establecimiento_actual(),$1,$2,$3,$4,$5,convi.membresia_actual())`,
    [
      casoId,
      datos.compromiso_id,
      seguimientoId,
      datos.estado_observado,
      datos.observacion,
    ],
  );
}

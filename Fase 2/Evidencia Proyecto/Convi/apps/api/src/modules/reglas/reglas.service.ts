import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos, validarRegla, type DatosRegla } from './regla.js';

// PB-089 (HU-078): reglas de aviso de la escuela de la sesión. Las manejan el
// administrador y Convivencia (CA8: profesores y apoderados no entran). Cada
// regla tiene un código (REGLA-001, lo pone la base) y versiones: una regla
// nueva queda en Borrador y, una vez activada, no se edita ni vuelve a
// Borrador, los cambios crean otra versión (CA6). Decisiones del PO: al
// activar una versión la anterior activa se archiva sola, una regla archivada
// no se reactiva (se crea otra versión) y la vigencia empieza el día en que se
// activa si no se indicó otra.
const PERFILES: Perfil[] = ['ADMIN', 'CONVIVENCIA'];

export type Regla = DatosRegla & {
  id: string;
  codigo_regla: string;
  numero_version: number;
  estado: 'BORRADOR' | 'ACTIVO' | 'ARCHIVADO';
  /** Nombre de la categoría, o null si cuenta todas. */
  categoria: string | null;
  categoria_activa: boolean | null;
};

export type DetalleRegla = {
  regla: Regla;
  /** Todas las versiones del mismo código, de la más nueva a la más antigua. */
  versiones: Regla[];
};

const COLUMNAS = `
  r.id, r.codigo_regla, r.numero_version, r.nombre, r.tipo_regla,
  r.codigo_metrica, r.codigo_operador, r.valor_umbral::float8 AS valor_umbral,
  r.ventana_dias, r.ventana_comparacion_dias, r.categoria_id,
  c.nombre AS categoria, c.estado = 'ACTIVO' AS categoria_activa,
  r.codigo_ambito, r.codigo_accion, r.codigo_prioridad,
  r.vigente_desde::text AS vigente_desde, r.vigente_hasta::text AS vigente_hasta,
  r.estado`;

const DESDE = `
  FROM convi.reglas r
  LEFT JOIN convi.categorias_convivencia c ON c.id = r.categoria_id`;

// current_date usa la zona horaria de la escuela, que fija CuentaService.operar.
// La versión que se archiva termina hoy, o el día en que empezó si todavía
// no empezaba.
const TERMINO_AL_ARCHIVAR = `CASE WHEN vigente_hasta IS NULL OR vigente_hasta > current_date
  THEN greatest(current_date, coalesce(vigente_desde, current_date))
  ELSE vigente_hasta END`;

const NO_EXISTE = 'No encontramos esa regla.';
const CAMBIO_SIMULTANEO =
  'La regla cambió mientras guardabas, recarga la página e inténtalo de nuevo.';

@Injectable()
export class ReglasService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  // Todas las versiones, agrupadas por código y la más nueva primero.
  listar(sesion: Sesion): Promise<Regla[]> {
    return this.operar(sesion, async (db) => {
      const resultado = await db.query<Regla>(
        `SELECT ${COLUMNAS} ${DESDE}
         ORDER BY r.codigo_regla, r.numero_version DESC`,
      );
      return resultado.rows;
    });
  }

  detalle(sesion: Sesion, id: string): Promise<DetalleRegla> {
    return this.operar(sesion, async (db) => {
      const regla = await leer(db, id);
      const versiones = await db.query<Regla>(
        `SELECT ${COLUMNAS} ${DESDE}
         WHERE r.codigo_regla = $1
         ORDER BY r.numero_version DESC`,
        [regla.codigo_regla],
      );
      return { regla, versiones: versiones.rows };
    });
  }

  // CA6: la regla nueva queda en Borrador, versión 1. La base le pone el
  // código correlativo de la escuela (REGLA-001).
  crear(
    sesion: Sesion,
    cuerpo: unknown,
  ): Promise<{ id: string; codigo_regla: string }> {
    const datos = validarRegla(cuerpo);
    return this.operar(sesion, async (db) => {
      await revisarCategoria(db, datos.categoria_id);
      const creada = await db.query<{ id: string; codigo_regla: string }>(
        `INSERT INTO convi.reglas
           (establecimiento_id, codigo_regla, numero_version, nombre, tipo_regla,
            codigo_metrica, codigo_operador, valor_umbral, ventana_dias,
            ventana_comparacion_dias, categoria_id, codigo_ambito, codigo_accion,
            codigo_prioridad, vigente_desde, vigente_hasta)
         VALUES (convi.establecimiento_actual(), '', 1, $1, $2, $3, $4, $5, $6,
                 $7, $8, $9, $10, $11, $12, $13)
         RETURNING id, codigo_regla`,
        valores(datos),
      );
      return creada.rows[0];
    });
  }

  // CA6: solo un borrador se edita.
  editar(sesion: Sesion, id: string, cuerpo: unknown): Promise<{ id: string }> {
    const datos = validarRegla(cuerpo);
    return this.operar(sesion, async (db) => {
      const actual = await leer(db, id, true);
      if (actual.estado !== 'BORRADOR')
        throw new ConflictException(
          'Una regla activada o archivada no se edita, crea una versión nueva para cambiarla.',
        );
      if (datos.categoria_id !== actual.categoria_id)
        await revisarCategoria(db, datos.categoria_id);
      await db.query(
        `UPDATE convi.reglas
         SET nombre = $1, tipo_regla = $2, codigo_metrica = $3,
             codigo_operador = $4, valor_umbral = $5, ventana_dias = $6,
             ventana_comparacion_dias = $7, categoria_id = $8, codigo_ambito = $9,
             codigo_accion = $10, codigo_prioridad = $11, vigente_desde = $12,
             vigente_hasta = $13
         WHERE id = $14`,
        [...valores(datos), id],
      );
      return { id };
    });
  }

  /**
   * CA6: los cambios a una regla activa o archivada se hacen en una versión
   * nueva, que parte como borrador con los mismos datos. Si ya hay un
   * borrador de esa regla, se usa ese en vez de crear otro.
   */
  nuevaVersion(
    sesion: Sesion,
    id: string,
  ): Promise<{ id: string; existente: boolean }> {
    return this.operar(sesion, async (db) => {
      const origen = await leer(db, id, true);
      const borrador = await db.query<{ id: string }>(
        `SELECT id FROM convi.reglas
         WHERE codigo_regla = $1 AND estado = 'BORRADOR'
         ORDER BY numero_version DESC LIMIT 1`,
        [origen.codigo_regla],
      );
      if (borrador.rows[0]) return { id: borrador.rows[0].id, existente: true };
      // CA5: una categoría que ya no está activa no pasa a la versión nueva.
      const nueva = await db.query<{ id: string }>(
        `INSERT INTO convi.reglas
           (establecimiento_id, codigo_regla, numero_version, nombre, tipo_regla,
            codigo_metrica, codigo_operador, valor_umbral, ventana_dias,
            ventana_comparacion_dias, categoria_id, codigo_ambito, codigo_accion,
            codigo_prioridad)
         SELECT r.establecimiento_id, r.codigo_regla,
                (SELECT max(v.numero_version) + 1 FROM convi.reglas v
                 WHERE v.codigo_regla = r.codigo_regla),
                r.nombre, r.tipo_regla, r.codigo_metrica, r.codigo_operador,
                r.valor_umbral, r.ventana_dias, r.ventana_comparacion_dias,
                CASE WHEN c.estado = 'ACTIVO' THEN r.categoria_id END,
                r.codigo_ambito, r.codigo_accion, r.codigo_prioridad
         FROM convi.reglas r
         LEFT JOIN convi.categorias_convivencia c ON c.id = r.categoria_id
         WHERE r.id = $1
         RETURNING id`,
        [id],
      );
      return { id: nueva.rows[0].id, existente: false };
    });
  }

  /**
   * CA6 y CA7: activa un borrador. Una regla de tipo Otro no se activa porque
   * no tiene cálculo. La versión activa anterior de la misma regla se archiva
   * en la misma transacción, así hay una sola versión activa por regla.
   */
  activar(sesion: Sesion, id: string): Promise<{ id: string }> {
    return this.operar(sesion, async (db) => {
      const regla = await leer(db, id, true);
      if (regla.estado === 'ACTIVO')
        throw new ConflictException('Esta versión de la regla ya está activa.');
      if (regla.estado === 'ARCHIVADO')
        throw new ConflictException(
          'Una regla archivada no se vuelve a activar, crea una versión nueva a partir de ella.',
        );
      if (regla.tipo_regla === 'OTRO')
        throw new ConflictException(
          'Una regla de tipo Otro se guarda como borrador pero no se activa, porque no tiene un cálculo definido.',
        );
      if (regla.categoria_id && !regla.categoria_activa)
        throw new ConflictException(
          `La categoría ${regla.categoria ?? ''} ya no está activa, elige otra antes de activar la regla.`,
        );
      const vencida = await db.query<{ vencida: boolean }>(
        `SELECT $1::date < current_date AS vencida`,
        [regla.vigente_hasta],
      );
      if (vencida.rows[0]?.vencida)
        throw new ConflictException(
          'La vigencia de este borrador ya terminó, cambia la fecha de término antes de activarlo.',
        );
      await db.query(
        `UPDATE convi.reglas
         SET estado = 'ARCHIVADO', vigente_hasta = ${TERMINO_AL_ARCHIVAR}
         WHERE codigo_regla = $1 AND estado = 'ACTIVO' AND id <> $2`,
        [regla.codigo_regla, id],
      );
      await db.query(
        `UPDATE convi.reglas
         SET estado = 'ACTIVO', vigente_desde = coalesce(vigente_desde, current_date)
         WHERE id = $1`,
        [id],
      );
      return { id };
    });
  }

  /**
   * Archiva una regla activa (deja de generar alertas y su vigencia termina
   * hoy) o descarta un borrador. Una regla archivada se conserva.
   */
  archivar(sesion: Sesion, id: string): Promise<{ id: string }> {
    return this.operar(sesion, async (db) => {
      const regla = await leer(db, id, true);
      if (regla.estado === 'ARCHIVADO')
        throw new ConflictException(
          'Esta versión de la regla ya está archivada.',
        );
      await db.query(
        regla.estado === 'ACTIVO'
          ? `UPDATE convi.reglas SET estado = 'ARCHIVADO', vigente_hasta = ${TERMINO_AL_ARCHIVAR} WHERE id = $1`
          : `UPDATE convi.reglas SET estado = 'ARCHIVADO' WHERE id = $1`,
        [id],
      );
      return { id };
    });
  }

  // Todas las rutas traducen igual los errores del modelo.
  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          throw traducirError(error);
        }
      },
    );
  }
}

function valores(datos: DatosRegla) {
  return [
    datos.nombre,
    datos.tipo_regla,
    datos.codigo_metrica,
    datos.codigo_operador,
    datos.valor_umbral,
    datos.ventana_dias,
    datos.ventana_comparacion_dias,
    datos.categoria_id,
    datos.codigo_ambito,
    datos.codigo_accion,
    datos.codigo_prioridad,
    datos.vigente_desde,
    datos.vigente_hasta,
  ];
}

async function leer(
  db: PoolClient,
  id: string,
  bloquear = false,
): Promise<Regla> {
  const resultado = await db.query<Regla>(
    `SELECT ${COLUMNAS} ${DESDE} WHERE r.id = $1
     ${bloquear ? 'FOR UPDATE OF r' : ''}`,
    [id],
  );
  if (!resultado.rows[0]) throw new NotFoundException(NO_EXISTE);
  return resultado.rows[0];
}

// CA5: solo una categoría activa de la escuela. La seguridad por fila oculta
// las de otras escuelas, así que una ajena tampoco aparece.
async function revisarCategoria(db: PoolClient, id: string | null) {
  if (!id) return;
  const categoria = await db.query(
    `SELECT 1 FROM convi.categorias_convivencia WHERE id = $1 AND estado = 'ACTIVO'`,
    [id],
  );
  if (categoria.rows.length === 0)
    throw errorDeCampos({
      categoria_id: 'Elige una categoría activa de la escuela.',
    });
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: CuentaService.operar revierte y responde 503.
function traducirError(error: unknown) {
  const { code } = (error ?? {}) as { code?: string };
  // 40001: otra persona cambió la regla al mismo tiempo. 23505: otra persona
  // creó la misma versión al mismo tiempo.
  if (code === '40001' || code === '23505')
    return new ConflictException(CAMBIO_SIMULTANEO);
  return error;
}

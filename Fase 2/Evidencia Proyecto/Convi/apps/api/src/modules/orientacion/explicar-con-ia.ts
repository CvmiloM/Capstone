import {
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import type { CuentaService } from '../../database/cuenta.service.js';
import { ErrorIA, MODELO_GENERACION } from '../normativa/consulta.js';
import { configuracionGeneracion, generar } from '../normativa/generacion.js';
import {
  ESQUEMA_EXPLICACION,
  ExplicacionRechazada,
  interpretarExplicacion,
  mensajesExplicacion,
  type ValorExplicado,
} from './explicacion-ia.js';

// PB-122 y PB-123 (HU-104): registra la solicitud con el contexto que recibe la
// IA, pide el texto a convi-ia y cierra el registro con el resultado, sin el
// texto (HU-128). La explicación no se guarda: cada pedido se vuelve a calcular
// desde los valores del servidor, y la alerta o los indicadores no cambian.

const logger = new Logger('ExplicacionIA');

export const NO_DISPONIBLE =
  'La IA no está disponible en este momento, los valores calculados por CONVI se pueden revisar igual y puedes intentarlo más tarde';

export type ExplicacionIA = {
  solicitud_id: string | null;
  generado_por_ia: boolean;
  parrafos: string[];
  /** Calculados por CONVI, se muestran junto al texto. */
  valores: ValorExplicado[];
};

export async function explicarConIA(
  cuentas: CuentaService,
  sesion: Sesion,
  pedido: {
    tipo: 'ALERTA' | 'COMPARACION';
    alertaId: string | null;
    /**
     * Lee los datos y devuelve lo que recibe la IA, en la misma transacción. Con
     * textoSinIA no se llama a la IA ni se registra una solicitud.
     */
    preparar: (db: PoolClient) => Promise<{
      contexto: Record<string, unknown>;
      valores: ValorExplicado[];
      textoSinIA?: string | null;
    }>;
  },
): Promise<ExplicacionIA> {
  const inicio = Date.now();
  const operar = <T>(trabajo: (db: PoolClient) => Promise<T>) =>
    cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      trabajo,
    );
  const proposito =
    pedido.tipo === 'ALERTA' ? 'EXPLICACION_ALERTA' : 'COMPARACION_PERIODOS';

  const { contexto, valores, textoSinIA, solicitudId } = await operar(
    async (db) => {
      const preparado = await pedido.preparar(db);
      if (preparado.textoSinIA) return { ...preparado, solicitudId: null };
      const registro = await db.query<{ id: string }>(
        `INSERT INTO convi.registros_solicitudes_ia
         (establecimiento_id, membresia_id, codigo_proposito, nombre_modelo,
          alerta_id, contexto_explicacion)
       VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1, $2, $3, $4)
       RETURNING id`,
        [
          proposito,
          MODELO_GENERACION,
          pedido.alertaId,
          JSON.stringify(preparado.contexto),
        ],
      );
      return { ...preparado, solicitudId: registro.rows[0].id };
    },
  );

  if (!solicitudId)
    return {
      solicitud_id: null,
      generado_por_ia: false,
      parrafos: [textoSinIA ?? ''],
      valores,
    };

  const cerrar = (estado: 'COMPLETADO' | 'FALLIDO', resumen: string) =>
    operar((db) =>
      db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = $2, completado_en = now(), latencia_ms = $3,
             resumen_sin_datos_sensibles = $4
         WHERE id = $1 AND estado = 'INICIADA'`,
        [solicitudId, estado, Date.now() - inicio, resumen.slice(0, 500)],
      ),
    );
  const que =
    pedido.tipo === 'ALERTA'
      ? 'Explicación de alerta'
      : 'Explicación de la comparación entre períodos';

  let parrafos: string[];
  try {
    configuracionGeneracion();
    parrafos = interpretarExplicacion(
      await generar(
        mensajesExplicacion(pedido.tipo, contexto),
        ESQUEMA_EXPLICACION,
      ),
      contexto,
    );
  } catch (error) {
    if (error instanceof ExplicacionRechazada) {
      await cerrar(
        'COMPLETADO',
        `${que} no mostrada: ${error.message.split(',')[0]}`,
      ).catch(() => {});
      throw new ConflictException(error.message);
    }
    if (!(error instanceof ErrorIA)) throw error;
    logger.warn(`Falló la solicitud ${solicitudId}`);
    await cerrar('FALLIDO', `${que} fallida: ${error.message}`).catch(() => {});
    throw new ServiceUnavailableException(NO_DISPONIBLE);
  }

  const largo = parrafos.join(' ').length;
  await cerrar('COMPLETADO', `${que} entregada, ${largo} caracteres`);
  return {
    solicitud_id: solicitudId,
    generado_por_ia: true,
    parrafos,
    valores,
  };
}

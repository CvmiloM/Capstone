import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { generarEmbeddings } from '../documentos/embeddings.js';
import { ErrorPreparacion } from '../documentos/preparacion.js';
import {
  construirMensajes,
  ErrorIA,
  esquemaRespuesta,
  interpretarRespuesta,
  MODELO_GENERACION,
  sinDisposicion,
  validarPregunta,
  type FragmentoEncontrado,
  type ResultadoConsulta,
} from './consulta.js';
import { buscarFragmentosNormativa } from './busqueda.js';
import { configuracionGeneracion, generar } from './generacion.js';

const NO_DISPONIBLE =
  'La consulta con IA no está disponible en este momento, puedes revisar el reglamento en Documentos institucionales y volver a intentarlo más tarde';

/**
 * PB-117 a PB-119 (HU-101 y HU-102): consulta del reglamento con IA. Busca con
 * bge-m3 en los fragmentos publicados, vigentes y preparados de la escuela (la
 * función del esquema buscar_fragmentos_normativa), redacta con qwen3.5:9b solo con
 * esos fragmentos y devuelve la respuesta con sus citas. Solo Convivencia (CA3).
 */
@Injectable()
export class NormativaService {
  private readonly logger = new Logger(NormativaService.name);
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      trabajo,
    );
  }

  async consultar(
    sesion: Sesion,
    cuerpo: unknown,
  ): Promise<ResultadoConsulta & { solicitud_id: string }> {
    const pregunta = validarPregunta(cuerpo);
    const inicio = Date.now();
    // CA4: la solicitud queda registrada antes de llamar a la IA, sin la pregunta.
    const solicitudId = await this.operar(
      sesion,
      async (db) =>
        (
          await db.query<{ id: string }>(
            `INSERT INTO convi.registros_solicitudes_ia
           (establecimiento_id, membresia_id, codigo_proposito, nombre_modelo)
         VALUES (convi.establecimiento_actual(), convi.membresia_actual(), 'CONSULTA_REGLAMENTO', $1)
         RETURNING id`,
            [MODELO_GENERACION],
          )
        ).rows[0].id,
    );
    let fragmentos: FragmentoEncontrado[] = [];
    try {
      configuracionGeneracion();
      const [vector] = await generarEmbeddings([
        {
          indice: 0,
          contenido: pregunta,
          pagina_desde: null,
          pagina_hasta: null,
        },
      ]);
      // Se buscan 12 y se descartan las páginas del índice antes de quedarse con 6.
      fragmentos = await this.operar(sesion, (db) =>
        buscarFragmentosNormativa(db, vector),
      );
      // HU-102: sin fragmentos no hay nada que citar y no se le pregunta al modelo.
      const resultado = fragmentos.length
        ? interpretarRespuesta(
            await generar(
              construirMensajes(fragmentos, pregunta),
              esquemaRespuesta(fragmentos.length),
            ),
            fragmentos,
          )
        : sinDisposicion();
      await this.cerrar(sesion, solicitudId, 'COMPLETADO', inicio, {
        fuentes: resultado.citas.length,
        resumen: `Consulta del reglamento con ${fragmentos.length} fragmentos encontrados y ${resultado.citas.length} citados${resultado.sin_disposicion ? ', sin disposición aplicable' : ''}`,
      });
      return { ...resultado, solicitud_id: solicitudId };
    } catch (error) {
      // Los errores de embeddings de PB-079 (ErrorPreparacion) también son del servicio de IA.
      if (!(error instanceof ErrorIA) && !(error instanceof ErrorPreparacion))
        throw error;
      // HU-128: el registro dice qué falló y cuándo, sin la pregunta ni el texto.
      const motivo =
        error instanceof Error ? error.message : 'Error del servicio de IA';
      this.logger.warn(`Falló la consulta del reglamento ${solicitudId}`);
      await this.cerrar(sesion, solicitudId, 'FALLIDO', inicio, {
        fuentes: 0,
        resumen: `Consulta del reglamento fallida con ${fragmentos.length} fragmentos encontrados: ${motivo}`,
      }).catch(() => {});
      throw new ServiceUnavailableException(NO_DISPONIBLE);
    }
  }

  private cerrar(
    sesion: Sesion,
    id: string,
    estado: 'COMPLETADO' | 'FALLIDO',
    inicio: number,
    datos: { fuentes: number; resumen: string },
  ) {
    return this.operar(sesion, (db) =>
      db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = $2, completado_en = now(), latencia_ms = $3,
             cantidad_fuentes = $4, resumen_sin_datos_sensibles = $5
         WHERE id = $1 AND estado = 'INICIADA'`,
        [
          id,
          estado,
          Date.now() - inicio,
          datos.fuentes,
          datos.resumen.slice(0, 500),
        ],
      ),
    );
  }
}

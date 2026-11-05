import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { generarEmbeddings } from '../documentos/embeddings.js';
import { ErrorPreparacion } from '../documentos/preparacion.js';
import { buscarFragmentosNormativa } from '../normativa/busqueda.js';
import { ErrorIA, MODELO_GENERACION } from '../normativa/consulta.js';
import { configuracionGeneracion, generar } from '../normativa/generacion.js';
import { LARGO_MAXIMO_NOTAS } from '../protocolos/protocolo.js';
import { crearOcultador, textoBusqueda } from './orientacion.js';
import { leerCaso } from './orientacion.service.js';
import {
  descripcionConFuentes,
  esquemaPropuesta,
  fuentesDe,
  interpretarPropuesta,
  mensajesPropuesta,
  notasPropuesta,
  PropuestaRechazada,
  TEXTO_SIN_FUENTES,
} from './propuesta-protocolo.js';

const FRAGMENTOS_PROPUESTA = 5;
const NO_DISPONIBLE =
  'La IA no está disponible en este momento, puedes preparar el protocolo a mano en Protocolos e intentarlo con IA más tarde';
const CON_PROTOCOLO =
  'El caso ya tiene un protocolo oficial aplicado y activo: la propuesta de la IA es solo para casos sin uno';
const CERRADO = 'El caso está cerrado: no recibe protocolos nuevos';

/**
 * PB-124 (HU-105): la IA propone un protocolo cuando el caso no tiene uno
 * oficial aplicado. Busca en el reglamento publicado, le pide a qwen3.5:9b pasos
 * citados y lo guarda como protocolo de naturaleza PROPUESTA_IA, con la versión
 * 1 en Borrador marcada como generada con IA y sus fuentes en las notas. Desde
 * ahí se revisa y publica en Protocolos como cualquier versión (CA3), sin
 * volverse oficial (CA2).
 */
@Injectable()
export class PropuestaProtocoloService {
  private readonly logger = new Logger(PropuestaProtocoloService.name);
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      trabajo,
    );
  }

  async proponer(
    sesion: Sesion,
    casoId: string,
  ): Promise<{ protocolo_id: string; version_id: string }> {
    const inicio = Date.now();
    const { contexto, personas, solicitudId } = await this.operar(
      sesion,
      async (db) => {
        await casoSinProtocolo(db, casoId);
        const leido = await leerCaso(db, casoId);
        const registro = await db.query<{ id: string }>(
          `INSERT INTO convi.registros_solicitudes_ia
             (establecimiento_id, membresia_id, caso_id, codigo_proposito, nombre_modelo)
           VALUES (convi.establecimiento_actual(), convi.membresia_actual(), $1,
                   'PROPUESTA_PROTOCOLO', $2)
           RETURNING id`,
          [casoId, MODELO_GENERACION],
        );
        return { ...leido, solicitudId: registro.rows[0].id };
      },
    );
    const { ocultar } = crearOcultador(personas);

    let resultado: { protocolo_id: string; version_id: string };
    let fragmentos = 0;
    try {
      configuracionGeneracion();
      const [vector] = await generarEmbeddings([
        {
          indice: 0,
          contenido: `Protocolo y pasos a seguir según el reglamento: ${textoBusqueda(contexto, null, ocultar)}`,
          pagina_desde: null,
          pagina_hasta: null,
        },
      ]);
      const encontrados = await this.operar(sesion, (db) =>
        buscarFragmentosNormativa(db, vector, FRAGMENTOS_PROPUESTA),
      );
      fragmentos = encontrados.length;
      if (encontrados.length === 0)
        throw new PropuestaRechazada(TEXTO_SIN_FUENTES);
      const fuentes = fuentesDe(encontrados);
      const propuesta = interpretarPropuesta(
        await generar(
          mensajesPropuesta(contexto, fuentes, ocultar),
          esquemaPropuesta(fuentes),
        ),
        fuentes,
      );

      resultado = await this.operar(sesion, async (db) => {
        await casoSinProtocolo(db, casoId);
        // El código vacío recibe PROT-001 y siguientes (asignar_codigo_legible).
        const protocolo = await db.query<{ id: string }>(
          `INSERT INTO convi.protocolos (establecimiento_id, codigo, nombre, naturaleza)
           VALUES (convi.establecimiento_actual(), '', $1, 'PROPUESTA_IA')
           RETURNING id`,
          [propuesta.nombre],
        );
        const version = await db.query<{ id: string }>(
          `INSERT INTO convi.versiones_protocolo
             (establecimiento_id, protocolo_id, numero_version, notas,
              generado_por_ia, creado_por)
           VALUES (convi.establecimiento_actual(), $1, 1, $2, true,
                   convi.membresia_actual())
           RETURNING id`,
          [
            protocolo.rows[0].id,
            notasPropuesta(propuesta, contexto.caso.codigo).slice(
              0,
              LARGO_MAXIMO_NOTAS,
            ),
          ],
        );
        for (const paso of propuesta.pasos)
          await db.query(
            `INSERT INTO convi.pasos_protocolo
               (establecimiento_id, version_protocolo_id, orden_paso, nombre,
                descripcion, codigo_rol_responsable, valor_plazo, unidad_plazo,
                requiere_evidencia, es_obligatorio)
             VALUES (convi.establecimiento_actual(), $1, $2, $3, $4,
                     'CONVIVENCIA', $5, $6, $7, true)`,
            [
              version.rows[0].id,
              paso.orden_paso,
              paso.nombre,
              descripcionConFuentes(paso),
              paso.valor_plazo,
              paso.unidad_plazo,
              paso.requiere_evidencia,
            ],
          );
        await db.query(
          `UPDATE convi.registros_solicitudes_ia
           SET estado = 'COMPLETADO', completado_en = now(), latencia_ms = $2,
               cantidad_fuentes = $3, resumen_sin_datos_sensibles = $4
           WHERE id = $1 AND estado = 'INICIADA'`,
          [
            solicitudId,
            Date.now() - inicio,
            propuesta.fuentes.length,
            `Propuesta de protocolo guardada en borrador con ${propuesta.pasos.length} pasos y ${propuesta.fuentes.length} fuentes de ${fragmentos} fragmentos${propuesta.descartados ? `, ${propuesta.descartados} pasos sin fuente descartados` : ''}`,
          ],
        );
        return {
          protocolo_id: protocolo.rows[0].id,
          version_id: version.rows[0].id,
        };
      });
    } catch (error) {
      if (error instanceof PropuestaRechazada) {
        await this.cerrar(
          sesion,
          solicitudId,
          'COMPLETADO',
          inicio,
          `Propuesta de protocolo no guardada con ${fragmentos} fragmentos: ${error.message.split(',')[0]}`,
        ).catch(() => {});
        throw new ConflictException(error.message);
      }
      if (!(error instanceof ErrorIA) && !(error instanceof ErrorPreparacion))
        throw error;
      this.logger.warn(`Falló la propuesta de protocolo ${solicitudId}`);
      await this.cerrar(
        sesion,
        solicitudId,
        'FALLIDO',
        inicio,
        `Propuesta de protocolo fallida: ${error instanceof Error ? error.message : 'error del servicio de IA'}`,
      ).catch(() => {});
      throw new ServiceUnavailableException(NO_DISPONIBLE);
    }
    return resultado;
  }

  private cerrar(
    sesion: Sesion,
    id: string,
    estado: 'COMPLETADO' | 'FALLIDO',
    inicio: number,
    resumen: string,
  ) {
    return this.operar(sesion, (db) =>
      db.query(
        `UPDATE convi.registros_solicitudes_ia
         SET estado = $2, completado_en = now(), latencia_ms = $3,
             resumen_sin_datos_sensibles = $4
         WHERE id = $1 AND estado = 'INICIADA'`,
        [id, estado, Date.now() - inicio, resumen.slice(0, 500)],
      ),
    );
  }
}

/** El caso existe, está abierto y no tiene un protocolo oficial activo. */
async function casoSinProtocolo(db: PoolClient, casoId: string) {
  const fila = (
    await db.query<{ estado_actual: string; con_oficial: boolean }>(
      `SELECT c.estado_actual, EXISTS (
         SELECT 1 FROM convi.protocolos_caso pc
         JOIN convi.versiones_protocolo vp ON vp.id = pc.version_protocolo_id
         JOIN convi.protocolos pr ON pr.id = vp.protocolo_id
         WHERE pc.caso_id = c.id AND pc.estado = 'ACTIVO'
           AND pr.naturaleza = 'OFICIAL') AS con_oficial
       FROM convi.casos c WHERE c.id = $1`,
      [casoId],
    )
  ).rows[0];
  if (!fila) throw new NotFoundException('El caso no existe.');
  if (fila.estado_actual === 'CERRADO') throw new ConflictException(CERRADO);
  if (fila.con_oficial) throw new ConflictException(CON_PROTOCOLO);
}

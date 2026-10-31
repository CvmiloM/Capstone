import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import type { ArchivoSubido } from './archivo-evidencia.js';
import {
  validarComunicacion,
  type NuevaComunicacion,
} from './comunicaciones.js';
import { asistentesPosibles, EN_LA_ESCUELA } from './encuentros.js';
import { EvidenciasService } from './evidencias.service.js';

// PB-067 (HU-058): comunicaciones del caso. Solo Convivencia activa con
// segundo factor (PB-009); la seguridad por fila separa por escuela. El
// respaldo se guarda en el mismo espacio privado que las evidencias.
const PERFILES: Perfil[] = ['CONVIVENCIA'];
const NO_CAMBIO = 'Revisa los datos marcados. No se registró la comunicación.';

@Injectable()
export class ComunicacionesService {
  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(EvidenciasService) private readonly evidencias: EvidenciasService,
  ) {}

  // CA1 y CA2: registra la comunicación con su respaldo opcional en una sola
  // transacción. CA5: si el destinatario es un apoderado que no puede ser
  // contactado, se guarda igual y la base deja la advertencia en la auditoría.
  registrar(
    sesion: Sesion,
    casoId: string,
    cuerpo: unknown,
    archivo: ArchivoSubido | undefined,
  ): Promise<{ id: string; advertencia: boolean }> {
    const datos = validarComunicacion(cuerpo, archivo);
    if (datos.respaldo)
      return this.evidencias.guardarConArchivo(
        sesion,
        PERFILES,
        datos.respaldo,
        archivo!,
        (db, insertarArchivo) => guardar(db, casoId, datos, insertarArchivo),
      );
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      (db) => guardar(db, casoId, datos),
    );
  }
}

async function guardar(
  db: PoolClient,
  casoId: string,
  datos: NuevaComunicacion,
  insertarArchivo?: () => Promise<string>,
): Promise<{ id: string; advertencia: boolean }> {
  // FOR SHARE: el caso no se cierra mientras se registra la comunicación.
  const caso = await db
    .query<{ estado_actual: string }>(
      'SELECT estado_actual FROM convi.casos WHERE id = $1 FOR SHARE',
      [casoId],
    )
    .catch((error: unknown) => {
      if ((error as { code?: string }).code === '40001')
        throw new ConflictException(
          'El caso cambió mientras registrabas. Recarga la página e inténtalo nuevamente.',
        );
      throw error;
    });
  if (!caso.rows[0]) throw new NotFoundException('El caso no existe.');
  // Decisión del PO (por defecto): un caso cerrado conserva sus
  // comunicaciones, pero no recibe nuevas.
  if (caso.rows[0].estado_actual === 'CERRADO')
    throw new ConflictException(
      'El caso está cerrado: conserva sus comunicaciones, pero no recibe nuevas.',
    );
  const errores: Record<string, string> = {};
  if (
    datos.persona_destinataria_id &&
    !(await asistentesPosibles(db, casoId)).some(
      (p) => p.persona_id === datos.persona_destinataria_id,
    )
  )
    errores.persona_destinataria_id =
      'Elige a una persona del caso, a uno de sus apoderados o a alguien del equipo.';
  const futura = await db.query<{ futura: boolean }>(
    `SELECT ${EN_LA_ESCUELA('$1')} > now() AS futura`,
    [datos.ocurrido_en],
  );
  if (futura.rows[0].futura)
    errores.ocurrido_en = 'La fecha en que ocurrió no puede ser futura.';
  if (Object.keys(errores).length > 0)
    throw new BadRequestException({ mensaje: NO_CAMBIO, errores });
  const archivoId = insertarArchivo ? await insertarArchivo() : null;
  const comunicacion = await db.query<{ id: string; advertencia: boolean }>(
    `INSERT INTO convi.comunicaciones
       (establecimiento_id, caso_id, tipo_comunicacion, persona_destinataria_id,
        referencia_externa, resumen, ocurrido_en, creado_por, archivo_respaldo_id)
     VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5,
             ${EN_LA_ESCUELA('$6')}, convi.membresia_actual(), $7)
     RETURNING id,
       coalesce(convi.apoderado_no_contactable(persona_destinataria_id, caso_id), false)
         AS advertencia`,
    [
      casoId,
      datos.tipo,
      datos.persona_destinataria_id,
      datos.destinatario_externo,
      datos.resumen,
      datos.ocurrido_en,
      archivoId,
    ],
  );
  return comunicacion.rows[0];
}

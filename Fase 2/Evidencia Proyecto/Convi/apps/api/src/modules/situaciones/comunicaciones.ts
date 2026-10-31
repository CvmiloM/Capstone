import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  validarArchivo,
  type ArchivoSubido,
  type ArchivoValido,
} from './archivo-evidencia.js';
import {
  asistentesPosibles,
  fechaHora,
  type AsistentePosible,
} from './encuentros.js';

// PB-067 (HU-058): comunicaciones del caso (llamadas, conversaciones
// presenciales, comunicaciones institucionales y otros contactos). Se valida
// aquí para responder con errores por campo; la base exige el resumen y la
// fecha en que ocurrió, impide trasladarla a otro caso (CA3) y deja en la
// auditoría la advertencia del apoderado que no puede ser contactado (CA5).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CA1. Decisión del PO (por defecto): el correo se prepara y envía con HU-076 (CA4). */
export const TIPOS_COMUNICACION = [
  'LLAMADA',
  'PRESENCIAL',
  'INSTITUCIONAL',
  'OTRO',
] as const;
// Decisión del PO (por defecto): mismo largo que el resultado de un encuentro;
// el destinatario externo cabe en comunicaciones.referencia_externa.
export const LARGO_MAXIMO_RESUMEN_COMUNICACION = 4000;
export const LARGO_MAXIMO_DESTINATARIO_EXTERNO = 220;

export type NuevaComunicacion = {
  tipo: (typeof TIPOS_COMUNICACION)[number];
  /** Persona del caso, o null si el destinatario es externo. */
  persona_destinataria_id: string | null;
  /** Institución o persona fuera del caso, o null. */
  destinatario_externo: string | null;
  resumen: string;
  /** AAAA-MM-DDTHH:MM en la hora de la escuela. */
  ocurrido_en: string;
  /** CA2: archivo de respaldo opcional. */
  respaldo: ArchivoValido | null;
};

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// CA1 y CA2: tipo, un destinatario (persona del caso o externo), resumen y
// fecha en que ocurrió obligatorios; respaldo opcional.
export function validarComunicacion(
  cuerpo: unknown,
  archivo: ArchivoSubido | undefined,
): NuevaComunicacion {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  const tipo = TIPOS_COMUNICACION.find((t) => t === datos.tipo);
  if (!tipo)
    errores.tipo =
      'Elige si fue una llamada, una conversación presencial, una comunicación institucional u otro contacto.';

  const persona = texto(datos.persona_destinataria_id);
  const externo = texto(datos.destinatario_externo);
  if (!persona && !externo)
    errores.persona_destinataria_id =
      'Elige a quién fue la comunicación o escribe un destinatario externo.';
  else if (persona && externo)
    errores.destinatario_externo =
      'Elige una persona del caso o escribe un destinatario externo, no ambos.';
  else if (persona && !UUID.test(persona))
    errores.persona_destinataria_id = 'Elige a la persona de la lista.';
  else if (externo.length > LARGO_MAXIMO_DESTINATARIO_EXTERNO)
    errores.destinatario_externo = `El destinatario admite hasta ${LARGO_MAXIMO_DESTINATARIO_EXTERNO} caracteres.`;

  const resumen = texto(datos.resumen);
  if (!resumen) errores.resumen = 'Resume lo que se conversó o comunicó.';
  else if (resumen.length > LARGO_MAXIMO_RESUMEN_COMUNICACION)
    errores.resumen = `El resumen admite hasta ${LARGO_MAXIMO_RESUMEN_COMUNICACION} caracteres.`;

  const ocurrido = fechaHora(datos.ocurrido_en);
  if (!ocurrido) errores.ocurrido_en = 'Indica la fecha y hora en que ocurrió.';

  let respaldo: ArchivoValido | null = null;
  if (archivo && archivo.size > 0) {
    const revisado = validarArchivo(archivo);
    if ('error' in revisado) errores.archivo = revisado.error;
    else respaldo = revisado;
  }

  if (!tipo || !ocurrido || Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se registró la comunicación.',
      errores,
    });
  return {
    tipo,
    persona_destinataria_id: persona ? persona.toLowerCase() : null,
    destinatario_externo: externo || null,
    resumen,
    ocurrido_en: ocurrido,
    respaldo,
  };
}

/** Comunicación registrada, como se muestra en el caso. */
export type Comunicacion = {
  id: string;
  tipo: string;
  destinatario: string;
  /** ESTUDIANTE, APODERADO o EQUIPO; null si el destinatario es externo. */
  rol: string | null;
  resumen: string;
  ocurrido_en: Date;
  creado_en: Date;
  creado_por: string;
  /** Nombre original del archivo de respaldo, si tiene. */
  respaldo: string | null;
  /** CA5: se registró a un apoderado que no puede ser contactado. */
  advertencia: boolean;
};

// Las más recientes primero. Decisión del PO (por defecto): los correos se
// muestran con HU-076, que los prepara como borrador y los envía.
export async function comunicacionesDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<Comunicacion[]> {
  const comunicaciones = await db.query<Comunicacion>(
    `SELECT co.id, co.tipo_comunicacion AS tipo,
            coalesce(p.nombres || ' ' || p.apellidos, co.referencia_externa) AS destinatario,
            CASE
              WHEN co.persona_destinataria_id IS NULL THEN NULL
              WHEN EXISTS (SELECT 1 FROM convi.estudiantes e
                           WHERE e.persona_id = co.persona_destinataria_id) THEN 'ESTUDIANTE'
              WHEN EXISTS (SELECT 1 FROM convi.apoderados_estudiante a
                           WHERE a.persona_apoderado_id = co.persona_destinataria_id) THEN 'APODERADO'
              ELSE 'EQUIPO'
            END AS rol,
            co.resumen, co.ocurrido_en, co.creado_en,
            pc.nombres || ' ' || pc.apellidos AS creado_por,
            ar.nombre_original AS respaldo,
            EXISTS (SELECT 1 FROM convi.eventos_auditoria e
                    WHERE e.tipo_recurso = 'comunicaciones' AND e.recurso_id = co.id
                      AND e.codigo_accion = 'CONTACTO_CON_ADVERTENCIA') AS advertencia
     FROM convi.comunicaciones co
     LEFT JOIN convi.personas p ON p.id = co.persona_destinataria_id
     JOIN convi.membresias_establecimiento m ON m.id = co.creado_por
     JOIN convi.personas pc ON pc.id = m.persona_id
     LEFT JOIN convi.archivos ar ON ar.id = co.archivo_respaldo_id
     WHERE co.caso_id = $1 AND co.tipo_comunicacion <> 'CORREO'
     ORDER BY co.ocurrido_en DESC, co.creado_en DESC, co.id`,
    [casoId],
  );
  return comunicaciones.rows;
}

/** Persona del caso que puede recibir una comunicación (CA5: si el vínculo lo impide). */
export type DestinatarioComunicacion = AsistentePosible & {
  no_contactable: boolean;
};

// Las mismas personas que pueden asistir a un encuentro: estudiantes del
// caso, sus apoderados con vínculo vigente y el equipo con cuenta activa.
export async function destinatariosDeComunicacion(
  db: PoolClient,
  casoId: string,
): Promise<DestinatarioComunicacion[]> {
  const personas = await asistentesPosibles(db, casoId);
  const apoderados = personas
    .filter((p) => p.rol === 'APODERADO')
    .map((p) => p.persona_id);
  const bloqueados = new Set(
    apoderados.length === 0
      ? []
      : (
          await db.query<{ id: string }>(
            `SELECT p AS id FROM unnest($1::uuid[]) p
             WHERE convi.apoderado_no_contactable(p, $2)`,
            [apoderados, casoId],
          )
        ).rows.map((fila) => fila.id),
  );
  return personas.map((persona) => ({
    ...persona,
    no_contactable:
      persona.rol === 'APODERADO' && bloqueados.has(persona.persona_id),
  }));
}

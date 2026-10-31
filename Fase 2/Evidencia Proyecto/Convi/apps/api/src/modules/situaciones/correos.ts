import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { destinatariosDeComunicacion } from './comunicaciones.js';

// PB-151 (HU-130) y PB-086 (HU-075): correos al apoderado desde el caso. Un
// correo es una comunicación de tipo CORREO que nace en estado BORRADOR, se
// redacta a mano o con IA y se edita mientras nadie lo confirme. El envío con
// confirmación es PB-087 (HU-076): aquí nada se envía ni se marca entregado.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Decisión del PO (por defecto): el asunto cabe en comunicaciones.asunto y el
// contenido tiene un tope razonable para un correo a una familia.
export const LARGO_MAXIMO_ASUNTO = 220;
export const LARGO_MAXIMO_CONTENIDO = 10000;
export const LARGO_MAXIMO_DIRECCION = 220;
export const LARGO_MAXIMO_INDICACION = 500;

export type BorradorCorreo = {
  /** Persona del caso, o null si solo se escribió la dirección. */
  persona_destinataria_id: string | null;
  /** Dirección escrita a mano; si falta, se usa el correo de la persona. */
  direccion: string | null;
  asunto: string;
  contenido: string;
};

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

function datosDe(cuerpo: unknown) {
  return (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
}

// HU-130 CA2: destinatario de la lista del caso o una dirección escrita, asunto
// y contenido. La dirección final se completa al guardar con el correo de la
// persona si no se escribió otra.
export function validarBorradorCorreo(cuerpo: unknown): BorradorCorreo {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};

  const persona = texto(datos.persona_destinataria_id);
  if (persona && !UUID.test(persona))
    errores.persona_destinataria_id = 'Elige a la persona de la lista.';

  const direccion = texto(datos.direccion);
  if (direccion.length > LARGO_MAXIMO_DIRECCION)
    errores.direccion = `El correo admite hasta ${LARGO_MAXIMO_DIRECCION} caracteres.`;
  else if (direccion && !CORREO.test(direccion))
    errores.direccion =
      'Escribe un correo válido, por ejemplo nombre@dominio.cl.';
  if (!persona && !direccion)
    errores.persona_destinataria_id =
      'Elige a quién va el correo o escribe su dirección.';

  const asunto = texto(datos.asunto);
  if (!asunto) errores.asunto = 'Escribe el asunto del correo.';
  else if (asunto.length > LARGO_MAXIMO_ASUNTO)
    errores.asunto = `El asunto admite hasta ${LARGO_MAXIMO_ASUNTO} caracteres.`;

  const contenido = texto(datos.contenido);
  if (!contenido) errores.contenido = 'Escribe el contenido del correo.';
  else if (contenido.length > LARGO_MAXIMO_CONTENIDO)
    errores.contenido = `El contenido admite hasta ${LARGO_MAXIMO_CONTENIDO} caracteres.`;

  if (Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se guardó el borrador.',
      errores,
    });
  return {
    persona_destinataria_id: persona ? persona.toLowerCase() : null,
    direccion: direccion || null,
    asunto,
    contenido,
  };
}

export type SolicitudCorreoIA = {
  persona_destinataria_id: string;
  indicacion: string;
};

// HU-075: la IA redacta para un apoderado del caso a partir de lo que el
// profesional quiere comunicar.
export function validarSolicitudCorreoIA(cuerpo: unknown): SolicitudCorreoIA {
  const datos = datosDe(cuerpo);
  const errores: Record<string, string> = {};
  const persona = texto(datos.persona_destinataria_id);
  if (!persona) errores.persona_destinataria_id = 'Elige al apoderado.';
  else if (!UUID.test(persona))
    errores.persona_destinataria_id = 'Elige al apoderado de la lista.';
  const indicacion = texto(datos.indicacion);
  if (!indicacion)
    errores.indicacion =
      'Escribe qué quieres comunicar, por ejemplo citar a una reunión con día y hora.';
  else if (indicacion.length > LARGO_MAXIMO_INDICACION)
    errores.indicacion = `La indicación admite hasta ${LARGO_MAXIMO_INDICACION} caracteres.`;
  if (Object.keys(errores).length > 0)
    throw new BadRequestException({
      mensaje: 'Revisa los datos marcados. No se preparó el borrador.',
      errores,
    });
  return { persona_destinataria_id: persona.toLowerCase(), indicacion };
}

/** Correo del caso, como se muestra en la pestaña Comunicaciones. */
export type CorreoCaso = {
  id: string;
  persona_destinataria_id: string | null;
  destinatario: string | null;
  direccion: string | null;
  asunto: string | null;
  contenido: string | null;
  /** BORRADOR mientras se edita; los demás estados los pone el envío (PB-087). */
  estado: string;
  generado_por_ia: boolean;
  creado_por: string;
  creado_en: Date;
  confirmado_en: Date | null;
  enviado_en: Date | null;
  /** Se puede editar o descartar: borrador que nadie confirmó. */
  editable: boolean;
};

export async function correosDelCaso(
  db: PoolClient,
  casoId: string,
): Promise<CorreoCaso[]> {
  const correos = await db.query<CorreoCaso>(
    `SELECT co.id, co.persona_destinataria_id,
            p.nombres || ' ' || p.apellidos AS destinatario,
            co.direccion_destinatario AS direccion, co.asunto,
            co.cuerpo_enviado AS contenido, co.estado_entrega AS estado,
            co.generado_por_ia, pc.nombres || ' ' || pc.apellidos AS creado_por,
            co.creado_en, co.confirmado_en, co.enviado_en,
            (co.estado_entrega = 'BORRADOR' AND co.confirmado_en IS NULL
             AND co.enviado_en IS NULL) AS editable
     FROM convi.comunicaciones co
     LEFT JOIN convi.personas p ON p.id = co.persona_destinataria_id
     JOIN convi.membresias_establecimiento m ON m.id = co.creado_por
     JOIN convi.personas pc ON pc.id = m.persona_id
     WHERE co.caso_id = $1 AND co.tipo_comunicacion = 'CORREO'
     ORDER BY co.creado_en DESC, co.id`,
    [casoId],
  );
  return correos.rows;
}

/** Persona del caso que puede recibir un correo, con su dirección guardada. */
export type DestinatarioCorreo = {
  persona_id: string;
  rol: string;
  nombre: string;
  detalle: string | null;
  correo: string | null;
  /** HU-076 CA5: el vínculo indica que el apoderado no puede ser contactado. */
  no_contactable: boolean;
};

// Las mismas personas que pueden recibir una comunicación (PB-067), con el
// correo de su ficha para completar la dirección.
export async function destinatariosDeCorreo(
  db: PoolClient,
  casoId: string,
): Promise<DestinatarioCorreo[]> {
  const personas = await destinatariosDeComunicacion(db, casoId);
  if (personas.length === 0) return [];
  const correos = new Map(
    (
      await db.query<{ id: string; correo: string | null }>(
        'SELECT id, correo FROM convi.personas WHERE id = ANY($1::uuid[])',
        [personas.map((p) => p.persona_id)],
      )
    ).rows.map((fila) => [fila.id, fila.correo]),
  );
  return personas.map((p) => ({
    persona_id: p.persona_id,
    rol: p.rol,
    nombre: p.nombre,
    detalle: p.detalle,
    correo: correos.get(p.persona_id) ?? null,
    no_contactable: p.no_contactable,
  }));
}

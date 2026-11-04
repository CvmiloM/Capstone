import { ConflictException } from '@nestjs/common';

// PB-150 (HU-129): la base rechaza cambiar lo publicado de documentos,
// protocolos e informes (proteger_version y validar_integracion). Si una
// operación llega a tocarlo, la API responde con un mensaje claro que pide
// crear una versión nueva, en vez del error general (503).
const RECHAZOS_DE_LA_BASE = new Set([
  'Contenido publicado inmutable',
  'Una versión publicada no vuelve a borrador',
  'Pasos publicados inmutables',
  'No agregar pasos a versión publicada',
  'El informe publicado se conserva, crear nueva edición',
]);

/** El conflicto con el mensaje dado si la base rechazó un cambio a lo publicado; si no, el mismo error. */
export function rechazoPublicado(error: unknown, mensaje: string): unknown {
  const { code, message } = (error ?? {}) as {
    code?: string;
    message?: string;
  };
  return code === 'P0001' && RECHAZOS_DE_LA_BASE.has(message ?? '')
    ? new ConflictException(mensaje)
    : error;
}

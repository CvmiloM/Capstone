import { BadRequestException } from '@nestjs/common';

// PB-010 (HU-009): datos que envía el administrador para invitar una cuenta.
// Se validan aquí aunque el formulario también lo haga (HU-119).

// Los apoderados (CA3) se invitarán desde su vínculo con el estudiante, cuando
// exista esa pantalla; por ahora solo se invita al equipo de la escuela.
export const PERFILES_INVITABLES = ['PROFESOR', 'CONVIVENCIA'] as const;

// Largos de personas y membresias_establecimiento en el modelo.
export const LARGO_MAXIMO = {
  nombres: 100,
  apellidos: 120,
  correo: 180,
} as const;

// Mismo patrón que convi.correo_valido.
const FORMATO_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type NuevaInvitacion = {
  nombres: string;
  apellidos: string;
  /** En minúsculas: la base compara los correos sin distinguir mayúsculas. */
  correo: string;
  perfil: (typeof PERFILES_INVITABLES)[number];
};

/** Error con el mensaje de cada campo, igual que en el registro de situaciones. */
export function errorDeCampos(errores: Record<string, string>) {
  return new BadRequestException({
    mensaje: 'Revisa los datos marcados. No se envió la invitación.',
    errores,
  });
}

function texto(valor: unknown) {
  return typeof valor === 'string' ? valor.trim() : '';
}

export function validarInvitacion(cuerpo: unknown): NuevaInvitacion {
  const datos = (
    typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  ) as Record<string, unknown>;
  const errores: Record<string, string> = {};

  // CA1: nombres y apellidos obligatorios.
  const nombres = texto(datos.nombres);
  if (!nombres) errores.nombres = 'Indica los nombres.';
  else if (nombres.length > LARGO_MAXIMO.nombres)
    errores.nombres = `Los nombres admiten hasta ${LARGO_MAXIMO.nombres} caracteres.`;

  const apellidos = texto(datos.apellidos);
  if (!apellidos) errores.apellidos = 'Indica los apellidos.';
  else if (apellidos.length > LARGO_MAXIMO.apellidos)
    errores.apellidos = `Los apellidos admiten hasta ${LARGO_MAXIMO.apellidos} caracteres.`;

  const correo = texto(datos.correo).toLowerCase();
  if (!FORMATO_CORREO.test(correo) || correo.length > LARGO_MAXIMO.correo)
    errores.correo = 'Ingresa un correo válido.';

  // CA4: el perfil se elige al invitar y después no cambia.
  const perfil = (PERFILES_INVITABLES as readonly string[]).includes(
    texto(datos.perfil),
  )
    ? (texto(datos.perfil) as NuevaInvitacion['perfil'])
    : null;
  if (!perfil) errores.perfil = 'Elige Profesor o Convivencia.';

  if (!perfil || Object.keys(errores).length > 0) throw errorDeCampos(errores);
  return { nombres, apellidos, correo, perfil };
}

export const PERFILES = [
  'ADMIN',
  'CONVIVENCIA',
  'PROFESOR',
  'APODERADO',
] as const;
export type Perfil = (typeof PERFILES)[number];
// Identidad comprobada por Supabase: aal1 es sesión inicial; aal2 incluye segundo factor.
export type Identidad = { authUsuarioId: string; aal: 'aal1' | 'aal2' };
// La escuela y el perfil se obtienen de una cuenta activa en la base de datos.
export type Cuenta = {
  membresia_id: string;
  establecimiento_id: string;
  codigo_perfil: Perfil;
  requiere_segundo_factor: boolean;
};
// Contexto interno creado por el servidor; no construirlo con datos del navegador.
export type Sesion = Identidad & Cuenta;

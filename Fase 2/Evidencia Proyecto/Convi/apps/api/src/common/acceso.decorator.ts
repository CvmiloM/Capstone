import { SetMetadata } from '@nestjs/common';
import type { Perfil } from './sesion.js';

export const ACCESO = Symbol('acceso');
export type ReglaAcceso =
  | { tipo: 'publico' }
  | { tipo: 'sesion' }
  | { tipo: 'operacion'; perfiles: Perfil[] };

// Omite la comprobación de sesión: reservar para rutas que no entregan datos privados.
export const Publica = () => SetMetadata(ACCESO, { tipo: 'publico' });
// Solo para consultar la cuenta antes de completar el segundo factor.
export const ConsultaSesion = () => SetMetadata(ACCESO, { tipo: 'sesion' });
// Autoriza la entrada por perfil; el permiso sobre cada registro se comprueba con CuentaService.operar.
export const PerfilesPermitidos = (...perfiles: Perfil[]) =>
  SetMetadata(ACCESO, { tipo: 'operacion', perfiles });

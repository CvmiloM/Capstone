import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CuentaService } from '../database/cuenta.service.js';
import { IdentidadService } from '../modules/auth/identidad.service.js';
import { ACCESO, type ReglaAcceso } from './acceso.decorator.js';
import type { Sesion } from './sesion.js';

export type PeticionConSesion = Request & { sesion: Sesion };

// AuthModule aplica este control a todas las rutas de la API.
// Aquí se autoriza la entrada; CuentaService.operar comprueba después el registro concreto.
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentidadService) private readonly identidad: IdentidadService,
    @Inject(CuentaService) private readonly cuentas: CuentaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const regla = this.reflector.getAllAndOverride<ReglaAcceso>(ACCESO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (regla?.tipo === 'publico') return true;

    const peticion = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const cabecera = peticion.headers.authorization;
    const token =
      typeof cabecera === 'string'
        ? /^Bearer ([^\s]+)$/i.exec(cabecera)?.[1]
        : undefined;
    if (!token)
      throw new UnauthorizedException('Inicia sesión para continuar.');

    const identidad = await this.identidad.verificar(token);
    // Consultamos cada vez para no conservar permisos de una cuenta suspendida.
    const cuenta = await this.cuentas.resolver(identidad);
    // Olvidar declarar permisos en una ruta nueva debe impedir el acceso.
    if (!regla)
      throw new ForbiddenException(
        'Esta operación no tiene permisos definidos.',
      );
    if (regla.tipo === 'operacion') {
      if (!regla.perfiles.includes(cuenta.codigo_perfil)) {
        throw new ForbiddenException('No tienes permiso para esta operación.');
      }
      if (cuenta.requiere_segundo_factor && identidad.aal !== 'aal2') {
        throw new ForbiddenException(
          'Completa el segundo factor para continuar.',
        );
      }
    }
    // La escuela y el perfil vienen de la base, no de lo que envía el usuario.
    peticion.sesion = { ...identidad, ...cuenta };
    return true;
  }
}

import { Controller, Get, Req } from '@nestjs/common';
import { ConsultaSesion } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';

@Controller('auth')
export class AuthController {
  @Get('sesion')
  @ConsultaSesion()
  consultar(@Req() peticion: PeticionConSesion) {
    const sesion = peticion.sesion;
    // PB-144: el login solo necesita perfil y segundo factor; los IDs de escuela
    // y membresía quedan en la sesión interna, no los elige ni necesita el cliente.
    return {
      codigo_perfil: sesion.codigo_perfil,
      requiere_segundo_factor: sesion.requiere_segundo_factor,
      segundo_factor_pendiente:
        sesion.requiere_segundo_factor && sesion.aal !== 'aal2',
    };
  }
}

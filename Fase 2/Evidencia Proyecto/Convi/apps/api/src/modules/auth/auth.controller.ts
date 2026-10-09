import { Controller, Get, Req } from '@nestjs/common';
import { ConsultaSesion } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';

@Controller('auth')
export class AuthController {
  @Get('sesion')
  @ConsultaSesion()
  consultar(@Req() peticion: PeticionConSesion) {
    const sesion = peticion.sesion;
    // Permite preparar el segundo factor sin entregar estudiantes ni expedientes.
    return {
      membresia_id: sesion.membresia_id,
      establecimiento_id: sesion.establecimiento_id,
      codigo_perfil: sesion.codigo_perfil,
      requiere_segundo_factor: sesion.requiere_segundo_factor,
      segundo_factor_pendiente:
        sesion.requiere_segundo_factor && sesion.aal !== 'aal2',
    };
  }
}

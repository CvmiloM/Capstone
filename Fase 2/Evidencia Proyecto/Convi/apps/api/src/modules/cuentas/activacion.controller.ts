import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { CorreoVerificado } from '../../common/acceso.decorator.js';
import type { PeticionConIdentidad } from '../../common/sesion.guard.js';
import { ActivacionService } from './activacion.service.js';

// PB-003: la persona invitada verificó su correo con el enlace, pero su cuenta
// sigue Pendiente. @CorreoVerificado exige identidad y correo confirmado sin
// pedir una cuenta activa, igual que el registro de la escuela (PB-002).
@Controller('cuentas')
export class ActivacionController {
  constructor(
    @Inject(ActivacionService) private readonly activacion: ActivacionService,
  ) {}

  // El cuerpo trae { membresia_id } del enlace; la identidad sale del token.
  @Post('activacion')
  @CorreoVerificado()
  @HttpCode(200)
  activar(@Req() peticion: PeticionConIdentidad, @Body() cuerpo: unknown) {
    return this.activacion.activar(peticion.identidad, cuerpo);
  }
}

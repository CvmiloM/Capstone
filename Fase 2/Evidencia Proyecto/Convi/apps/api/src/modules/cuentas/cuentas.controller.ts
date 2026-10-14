import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { CuentasService } from './cuentas.service.js';

// PB-010: cuentas de la escuela. Solo entra un ADMIN activo con segundo factor.
@Controller('admin/cuentas')
@PerfilesPermitidos('ADMIN')
export class CuentasController {
  constructor(
    @Inject(CuentasService) private readonly cuentas: CuentasService,
  ) {}

  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.cuentas.listar(peticion.sesion);
  }

  // El cuerpo trae { nombres, apellidos, correo, perfil }; responde 201.
  @Post('invitaciones')
  invitar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.cuentas.invitar(peticion.sesion, cuerpo);
  }
}

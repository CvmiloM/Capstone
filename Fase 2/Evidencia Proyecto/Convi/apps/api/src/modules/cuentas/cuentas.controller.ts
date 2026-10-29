import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
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

  @Post(':id/suspender')
  @HttpCode(200)
  suspender(
    @Req() peticion: PeticionConSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cuentas.suspender(peticion.sesion, id);
  }

  @Post(':id/restablecer-segundo-factor')
  @HttpCode(200)
  restablecerSegundoFactor(
    @Req() peticion: PeticionConSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.cuentas.restablecerSegundoFactor(peticion.sesion, id, cuerpo);
  }

  @Post(':id/reactivar')
  @HttpCode(200)
  reactivar(
    @Req() peticion: PeticionConSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.cuentas.reactivar(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { nombres, apellidos, correo, perfil }; responde 201.
  @Post('invitaciones')
  invitar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.cuentas.invitar(peticion.sesion, cuerpo);
  }

  @Post(':id/reenviar-invitacion')
  reenviar(
    @Req() peticion: PeticionConSesion,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cuentas.reenviar(peticion.sesion, id);
  }

  @Post('apoderados/:vinculoId/invitacion')
  invitarApoderado(
    @Req() peticion: PeticionConSesion,
    @Param('vinculoId', new ParseUUIDPipe()) vinculoId: string,
  ) {
    return this.cuentas.invitarApoderado(peticion.sesion, vinculoId);
  }
}

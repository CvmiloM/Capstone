import { Controller, Get, Inject, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ContextoAdminService } from './contexto.service.js';

// Datos del encabezado del portal de administración. Solo entra una cuenta
// ADMIN activa con el segundo factor completo.
@Controller('admin/contexto')
@PerfilesPermitidos('ADMIN')
export class ContextoAdminController {
  constructor(
    @Inject(ContextoAdminService)
    private readonly contexto: ContextoAdminService,
  ) {}

  @Get()
  consultar(@Req() peticion: PeticionConSesion) {
    return this.contexto.consultar(peticion.sesion);
  }
}

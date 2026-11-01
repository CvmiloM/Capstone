import { Controller, Get, Inject, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ResumenAdminService } from './resumen.service.js';

// PB-040 (HU-033): cifras del resumen de la escuela. Solo entra una cuenta
// ADMIN activa con el segundo factor completo.
@Controller('admin/resumen')
@PerfilesPermitidos('ADMIN')
export class ResumenAdminController {
  constructor(
    @Inject(ResumenAdminService)
    private readonly resumen: ResumenAdminService,
  ) {}

  @Get()
  consultar(@Req() peticion: PeticionConSesion) {
    return this.resumen.consultar(peticion.sesion);
  }
}

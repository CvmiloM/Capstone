import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { EstablecimientoService } from './establecimiento.service.js';

@Controller('admin/establecimiento')
@PerfilesPermitidos('ADMIN')
export class EstablecimientoController {
  constructor(
    @Inject(EstablecimientoService)
    private readonly escuela: EstablecimientoService,
  ) {}

  @Get()
  consultar(@Req() peticion: PeticionConSesion) {
    return this.escuela.consultar(peticion.sesion);
  }

  @Patch()
  editar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.escuela.editar(peticion.sesion, cuerpo);
  }
}

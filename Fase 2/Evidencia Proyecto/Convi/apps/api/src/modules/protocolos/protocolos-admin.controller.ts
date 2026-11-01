import { Controller, Get, Inject, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ProtocolosService } from './protocolos.service.js';

@Controller('admin/protocolos')
@PerfilesPermitidos('ADMIN')
export class ProtocolosAdminController {
  constructor(
    @Inject(ProtocolosService) private readonly protocolos: ProtocolosService,
  ) {}
  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.protocolos.catalogoAdministrativo(peticion.sesion);
  }
}

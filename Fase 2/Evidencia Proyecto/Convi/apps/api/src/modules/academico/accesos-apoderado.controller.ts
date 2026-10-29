import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { AccesosApoderadoService } from './accesos-apoderado.service.js';

@Controller('admin/apoderados')
@PerfilesPermitidos('ADMIN')
export class AccesosApoderadoController {
  constructor(
    @Inject(AccesosApoderadoService)
    private readonly accesos: AccesosApoderadoService,
  ) {}

  @Get()
  listar(
    @Req() p: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.accesos.listar(p.sesion, consulta);
  }

  @Post(':id/accesos')
  otorgar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.accesos.otorgar(p.sesion, id, cuerpo);
  }

  @Patch(':id/accesos/:accesoId/renovacion')
  renovar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accesoId', ParseUUIDPipe) accesoId: string,
    @Body() cuerpo: unknown,
  ) {
    return this.accesos.renovar(p.sesion, id, accesoId, cuerpo);
  }

  @Patch(':id/accesos/:accesoId/revocacion')
  revocar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('accesoId', ParseUUIDPipe) accesoId: string,
    @Body() cuerpo: unknown,
  ) {
    return this.accesos.revocar(p.sesion, id, accesoId, cuerpo);
  }
}

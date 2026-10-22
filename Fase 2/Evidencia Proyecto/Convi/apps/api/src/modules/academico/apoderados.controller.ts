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
import { ApoderadosService } from './apoderados.service.js';

@Controller('admin/estudiantes/:estudianteId/apoderados')
@PerfilesPermitidos('ADMIN')
export class ApoderadosController {
  constructor(
    @Inject(ApoderadosService) private readonly apoderados: ApoderadosService,
  ) {}

  @Get()
  listar(
    @Req() peticion: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Query('buscar') buscar: unknown,
  ) {
    return this.apoderados.listar(peticion.sesion, estudianteId, buscar);
  }

  @Post()
  crear(
    @Req() peticion: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Body() cuerpo: unknown,
  ) {
    return this.apoderados.crear(peticion.sesion, estudianteId, cuerpo);
  }

  @Patch(':id/termino')
  terminar(
    @Req() peticion: PeticionConSesion,
    @Param('estudianteId', ParseUUIDPipe) estudianteId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.apoderados.terminar(peticion.sesion, estudianteId, id, cuerpo);
  }
}

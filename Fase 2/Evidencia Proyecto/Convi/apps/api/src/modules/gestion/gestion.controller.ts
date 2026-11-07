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
import { GestionService } from './gestion.service.js';

@Controller('convivencia/gestion')
@PerfilesPermitidos('CONVIVENCIA')
export class GestionController {
  constructor(
    @Inject(GestionService) private readonly gestion: GestionService,
  ) {}
  @Get()
  listar(@Req() r: PeticionConSesion, @Query() q: Record<string, unknown>) {
    return this.gestion.listar(r.sesion, q);
  }
  @Get('opciones')
  opciones(@Req() r: PeticionConSesion, @Query() q: Record<string, unknown>) {
    return this.gestion.opciones(r.sesion, q);
  }
  @Post()
  crear(@Req() r: PeticionConSesion, @Body() d: unknown) {
    return this.gestion.crear(r.sesion, d);
  }
  @Get(':tipo/:id')
  detalle(
    @Req() r: PeticionConSesion,
    @Param('tipo') tipo: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: Record<string, unknown>,
  ) {
    return this.gestion.detalle(r.sesion, tipo, id, q);
  }
  @Post(':tipo/:id/hijos')
  agregar(
    @Req() r: PeticionConSesion,
    @Param('tipo') tipo: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: unknown,
  ) {
    return this.gestion.agregar(r.sesion, tipo, id, d);
  }
  @Patch(':tipo/:id')
  editar(
    @Req() r: PeticionConSesion,
    @Param('tipo') tipo: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: unknown,
  ) {
    return this.gestion.editar(r.sesion, tipo, id, d);
  }
  @Post(':tipo/:id/estado')
  estado(
    @Req() r: PeticionConSesion,
    @Param('tipo') tipo: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: unknown,
  ) {
    return this.gestion.estado(r.sesion, tipo, id, d);
  }
  @Post('actividades/:id/vinculos/:clase')
  vincular(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('clase') clase: string,
    @Body() d: unknown,
  ) {
    return this.gestion.vincular(r.sesion, id, clase, d);
  }
}

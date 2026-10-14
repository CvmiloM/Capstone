import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { AsignacionesService } from './asignaciones.service.js';

// PB-015 (HU-013): profesores que se pueden asignar y término de una
// asignación. Las asignaciones nuevas se crean desde su curso
// (POST /admin/cursos/:id/asignaciones). Solo entra una cuenta ADMIN activa
// con el segundo factor completo.
@Controller('admin/asignaciones')
@PerfilesPermitidos('ADMIN')
export class AsignacionesController {
  constructor(
    @Inject(AsignacionesService)
    private readonly asignaciones: AsignacionesService,
  ) {}

  @Get('profesores')
  profesores(@Req() peticion: PeticionConSesion) {
    return this.asignaciones.profesores(peticion.sesion);
  }

  // Cuerpo: { fecha_fin }, el último día de la asignación (CA4).
  @Patch(':id/termino')
  terminar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.asignaciones.terminar(peticion.sesion, id, cuerpo);
  }
}
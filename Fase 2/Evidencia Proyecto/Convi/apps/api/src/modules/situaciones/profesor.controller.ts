import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ProfesorService } from './profesor.service.js';

// PB-041: rutas de solo lectura del portal del profesor. El decorador de la
// clase aplica a todas las rutas: solo entra una cuenta PROFESOR activa.
@Controller('profesor')
@PerfilesPermitidos('PROFESOR')
export class ProfesorController {
  constructor(
    @Inject(ProfesorService) private readonly profesor: ProfesorService,
  ) {}

  @Get('cursos')
  cursos(@Req() peticion: PeticionConSesion) {
    return this.profesor.cursos(peticion.sesion);
  }

  @Get('cursos/:id/estudiantes')
  estudiantes(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) cursoId: string,
  ) {
    return this.profesor.estudiantes(peticion.sesion, cursoId);
  }

  @Get('situaciones')
  situaciones(@Req() peticion: PeticionConSesion) {
    return this.profesor.situaciones(peticion.sesion);
  }

  @Get('situaciones/:id')
  situacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) situacionId: string,
  ) {
    return this.profesor.situacion(peticion.sesion, situacionId);
  }
}

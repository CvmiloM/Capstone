import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ProfesorService } from './profesor.service.js';

// Rutas del portal del profesor: consulta (PB-041) y registro de situaciones
// (PB-042). El decorador de la clase aplica a todas las rutas: solo entra una
// cuenta PROFESOR activa.
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

  @Get('categorias')
  categorias(@Req() peticion: PeticionConSesion) {
    return this.profesor.categorias(peticion.sesion);
  }

  // El cuerpo se valida en el servicio; la respuesta 201 trae el código asignado.
  @Post('situaciones')
  registrar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.profesor.registrar(peticion.sesion, cuerpo);
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

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
import { AsignacionesService } from './asignaciones.service.js';
import { CursosService } from './cursos.service.js';

// PB-015 (HU-013): cursos y sus profesores en el portal de administración. El
// decorador de la clase aplica a todas las rutas: solo entra una cuenta ADMIN
// activa con el segundo factor completo.
@Controller('admin/cursos')
@PerfilesPermitidos('ADMIN')
export class CursosController {
  constructor(
    @Inject(CursosService) private readonly cursos: CursosService,
    @Inject(AsignacionesService)
    private readonly asignaciones: AsignacionesService,
  ) {}

  // GET /admin/cursos?anio=<id del año académico>
  @Get()
  listar(@Req() peticion: PeticionConSesion, @Query('anio') anio: unknown) {
    return this.cursos.listar(peticion.sesion, anio);
  }

  // El cuerpo se valida en el servicio; la respuesta 201 trae el curso creado.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.cursos.crear(peticion.sesion, cuerpo);
  }

  // El curso con sus asignaciones de profesores.
  @Get(':id')
  obtener(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cursos.obtener(peticion.sesion, id);
  }

  // Cuerpo: { codigo, nombre, seccion, nivel_id }.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.cursos.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: { membresia_id, rol, fecha_inicio, fecha_fin }.
  @Post(':id/asignaciones')
  asignar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.asignaciones.asignar(peticion.sesion, id, cuerpo);
  }
}
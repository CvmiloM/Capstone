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
import { EstudiantesService } from './estudiantes.service.js';
import { MatriculasService } from './matriculas.service.js';

// PB-017 y PB-018 (HU-014): estudiantes y matrículas en el portal de
// administración. El decorador de la clase aplica a todas las rutas: solo
// entra una cuenta ADMIN activa con el segundo factor completo.
@Controller('admin/estudiantes')
@PerfilesPermitidos('ADMIN')
export class EstudiantesController {
  constructor(
    @Inject(EstudiantesService)
    private readonly estudiantes: EstudiantesService,
    @Inject(MatriculasService)
    private readonly matriculas: MatriculasService,
  ) {}

  // GET /admin/estudiantes?buscar=<nombre, código o RUT>&curso=<id>&pagina=<n>
  @Get()
  listar(
    @Req() peticion: PeticionConSesion,
    @Query('buscar') buscar: unknown,
    @Query('curso') curso: unknown,
    @Query('pagina') pagina: unknown,
  ) {
    return this.estudiantes.listar(peticion.sesion, buscar, curso, pagina);
  }

  // Cuerpo: { codigo_estudiante, nombres, apellidos, rut, fecha_nacimiento,
  // correo, telefono, direccion }. La respuesta 201 trae la ficha creada.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.estudiantes.crear(peticion.sesion, cuerpo);
  }

  // La ficha con sus matrículas, sin datos de convivencia (CA4).
  @Get(':id')
  obtener(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.estudiantes.obtener(peticion.sesion, id);
  }

  // Mismo cuerpo que al crear: corrige la ficha.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.estudiantes.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: { curso_id, matriculado_en }. El año es el del curso.
  @Post(':id/matriculas')
  matricular(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.matriculas.matricular(peticion.sesion, id, cuerpo);
  }
}
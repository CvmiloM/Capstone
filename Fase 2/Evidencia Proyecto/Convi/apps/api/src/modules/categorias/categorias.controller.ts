import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { CategoriasService } from './categorias.service.js';

// PB-030 (HU-023): catálogo de categorías. Decisión del PO: lo usan los
// portales de administración y de Convivencia, con la cuenta activa y el
// segundo factor completo. No hay ruta para borrar (CA3).
@Controller('categorias')
@PerfilesPermitidos('ADMIN', 'CONVIVENCIA')
export class CategoriasController {
  constructor(
    @Inject(CategoriasService) private readonly categorias: CategoriasService,
  ) {}

  // Todas las categorías de la escuela, también las inactivas.
  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.categorias.listar(peticion.sesion);
  }

  // Cuerpo: { nombre, descripcion }. La respuesta 201 trae la categoría creada.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.categorias.crear(peticion.sesion, cuerpo);
  }

  // Cuerpo: { nombre, descripcion }.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.categorias.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: { estado: 'ACTIVO' | 'INACTIVO' }.
  @Patch(':id/estado')
  cambiarEstado(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.categorias.cambiarEstado(peticion.sesion, id, cuerpo);
  }
}
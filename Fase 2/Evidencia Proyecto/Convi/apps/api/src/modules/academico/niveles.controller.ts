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
import { NivelesService } from './niveles.service.js';

// PB-014 (HU-012): niveles educativos del portal de administración. El
// decorador de la clase aplica a todas las rutas: solo entra una cuenta ADMIN
// activa con el segundo factor completo.
@Controller('admin/niveles')
@PerfilesPermitidos('ADMIN')
export class NivelesController {
  constructor(
    @Inject(NivelesService) private readonly niveles: NivelesService,
  ) {}

  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.niveles.listar(peticion.sesion);
  }

  // El cuerpo se valida en el servicio; la respuesta 201 trae el nivel creado.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.niveles.crear(peticion.sesion, cuerpo);
  }

  // Cuerpo: { codigo, nombre, orden, ciclo, tramo }.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.niveles.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: { "activo": false } para desactivar o { "activo": true } para activar.
  @Patch(':id/activo')
  cambiarActivo(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.niveles.cambiarActivo(peticion.sesion, id, cuerpo);
  }
}
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
import { AniosService } from './anios.service.js';

// PB-013 (HU-011): años académicos del portal de administración. El decorador
// de la clase aplica a todas las rutas: solo entra una cuenta ADMIN activa con
// el segundo factor completo.
@Controller('admin/anios')
@PerfilesPermitidos('ADMIN')
export class AniosController {
  constructor(@Inject(AniosService) private readonly anios: AniosService) {}

  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.anios.listar(peticion.sesion);
  }

  // El cuerpo se valida en el servicio; la respuesta 201 trae el año creado.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.anios.crear(peticion.sesion, cuerpo);
  }

  // Cuerpo: { anio, fecha_inicio, fecha_fin }.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.anios.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: { "estado": "ACTIVO" } para activar o { "estado": "CERRADO" } para cerrar.
  @Patch(':id/estado')
  cambiarEstado(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.anios.cambiarEstado(peticion.sesion, id, cuerpo);
  }
}
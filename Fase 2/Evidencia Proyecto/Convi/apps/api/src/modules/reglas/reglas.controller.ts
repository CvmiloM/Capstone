import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ReglasService } from './reglas.service.js';

// PB-089 (HU-078): reglas de aviso de los portales de administración y de
// Convivencia, con la cuenta activa y el segundo factor completo. Profesores
// y apoderados no entran (CA8). No hay ruta para borrar: una regla se archiva.
@Controller('reglas')
@PerfilesPermitidos('ADMIN', 'CONVIVENCIA')
export class ReglasController {
  constructor(@Inject(ReglasService) private readonly reglas: ReglasService) {}

  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.reglas.listar(peticion.sesion);
  }

  // La versión pedida y todas las versiones de la misma regla.
  @Get(':id')
  detalle(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reglas.detalle(peticion.sesion, id);
  }

  // Cuerpo: { nombre, tipo_regla, codigo_ambito, codigo_operador, valor_umbral,
  // ventana_dias, categoria_id, codigo_accion, codigo_prioridad, vigente_desde,
  // vigente_hasta }. Responde 201 con el id y el código de la regla nueva.
  @Post()
  crear(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.reglas.crear(peticion.sesion, cuerpo);
  }

  // El mismo cuerpo que al crear. Solo para un borrador.
  @Patch(':id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.reglas.editar(peticion.sesion, id, cuerpo);
  }

  // Responde 201 con el id del borrador de la versión nueva.
  @Post(':id/versiones')
  nuevaVersion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reglas.nuevaVersion(peticion.sesion, id);
  }

  @Post(':id/activacion')
  @HttpCode(200)
  activar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reglas.activar(peticion.sesion, id);
  }

  @Post(':id/archivo')
  @HttpCode(200)
  archivar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reglas.archivar(peticion.sesion, id);
  }
}

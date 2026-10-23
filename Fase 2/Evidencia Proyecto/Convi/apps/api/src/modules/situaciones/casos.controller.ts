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
import { CasosService } from './casos.service.js';

// PB-053: casos del portal de Convivencia. El decorador de la clase aplica a
// todas las rutas: solo entra una cuenta CONVIVENCIA activa con segundo
// factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class CasosController {
  constructor(@Inject(CasosService) private readonly casos: CasosService) {}

  @Get('casos')
  listar(@Req() peticion: PeticionConSesion) {
    return this.casos.listar(peticion.sesion);
  }

  @Get('casos/:id')
  detalle(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.casos.detalle(peticion.sesion, id);
  }

  // El cuerpo trae { titulo, resumen, fecha_inicio, categoria_principal_id,
  // responsable_id, justificacion_independiente, revision_anterior_id };
  // responde 201 con el id y el código del caso.
  @Post('situaciones/:id/caso')
  crearDesdeSituacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.casos.crearDesdeSituacion(peticion.sesion, id, cuerpo);
  }
}

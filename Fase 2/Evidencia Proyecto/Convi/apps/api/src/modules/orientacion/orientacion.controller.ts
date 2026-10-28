import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { OrientacionService } from './orientacion.service.js';

// PB-120 y PB-121 (HU-103): orientación con IA dentro de un caso, solo para una
// cuenta CONVIVENCIA activa con segundo factor, como el resto del portal.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class OrientacionController {
  constructor(
    @Inject(OrientacionService)
    private readonly orientacion: OrientacionService,
  ) {}

  // El cuerpo trae { pregunta? } y responde 200 con hechos, pasos y sus referencias.
  @Post('casos/:id/orientacion')
  @HttpCode(200)
  orientar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.orientacion.orientar(peticion.sesion, id, cuerpo);
  }
}

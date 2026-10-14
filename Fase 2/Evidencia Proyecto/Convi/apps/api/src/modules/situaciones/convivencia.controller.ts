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
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { ConvivenciaService } from './convivencia.service.js';

// PB-044 y PB-045: rutas del portal de Convivencia. El decorador de la clase aplica a
// todas: solo entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class ConvivenciaController {
  constructor(
    @Inject(ConvivenciaService)
    private readonly convivencia: ConvivenciaService,
  ) {}

  // ?estado=NUEVA&urgencia=URGENTE; ambos opcionales.
  @Get('situaciones')
  bandeja(
    @Req() peticion: PeticionConSesion,
    @Query('estado') estado: unknown,
    @Query('urgencia') urgencia: unknown,
  ) {
    return this.convivencia.bandeja(peticion.sesion, estado, urgencia);
  }

  @Get('situaciones/:id')
  situacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.convivencia.situacion(peticion.sesion, id);
  }

  // Cambia el estado de una situación ya existente: responde 200, no 201.
  @Post('situaciones/:id/revision')
  @HttpCode(200)
  iniciarRevision(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.convivencia.iniciarRevision(peticion.sesion, id);
  }

  // El cuerpo trae { urgencia, urgencia_anterior, motivo }.
  @Patch('situaciones/:id/urgencia')
  cambiarUrgencia(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.cambiarUrgencia(peticion.sesion, id, cuerpo);
  }

  // PB-045: el cuerpo trae { pregunta }; responde 201 con la aclaración creada.
  @Post('situaciones/:id/aclaraciones')
  pedirAclaracion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.convivencia.pedirAclaracion(peticion.sesion, id, cuerpo);
  }
}

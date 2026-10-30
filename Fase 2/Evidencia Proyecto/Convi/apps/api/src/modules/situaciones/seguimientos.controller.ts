import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { SeguimientosService } from './seguimientos.service.js';

@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class SeguimientosController {
  constructor(
    @Inject(SeguimientosService)
    private readonly seguimientos: SeguimientosService,
  ) {}
  @Get('seguimientos')
  agenda(
    @Req() p: PeticionConSesion,
    @Query('mes') mes = '',
    @Query('pagina') pagina = '1',
  ) {
    return this.seguimientos.agenda(p.sesion, mes, pagina);
  }
  @Post('casos/:id/compromisos')
  compromiso(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.seguimientos.crearCompromiso(p.sesion, id, cuerpo);
  }
  @Post('casos/:id/seguimientos')
  programar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.seguimientos.programar(p.sesion, id, cuerpo);
  }
  @Post('seguimientos/:id/resultado')
  resultado(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.seguimientos.registrarResultado(p.sesion, id, cuerpo);
  }
  @Post('seguimientos/:id/reprogramacion')
  reprogramar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.seguimientos.reprogramar(p.sesion, id, cuerpo);
  }
  @Post('seguimientos/:id/revisiones')
  revisar(
    @Req() p: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.seguimientos.revisar(p.sesion, id, cuerpo);
  }
}

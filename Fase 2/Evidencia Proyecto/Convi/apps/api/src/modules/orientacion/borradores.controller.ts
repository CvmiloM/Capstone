import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { BorradoresService } from './borradores.service.js';

// PB-125 y PB-126 (HU-106 y HU-107): borradores de acta y de informe de caso
// con IA, solo para una cuenta CONVIVENCIA activa con segundo factor.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class BorradoresController {
  constructor(
    @Inject(BorradoresService) private readonly borradores: BorradoresService,
  ) {}

  @Get('casos/:id/borradores')
  listar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.borradores.listar(peticion.sesion, id);
  }

  // Cuerpo: tipo (ACTA o INFORME) y, para un acta, actuacion_id opcional.
  @Post('casos/:id/borradores')
  generar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.borradores.generar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: titulo, contenido y version. Crea otra edición.
  @Post('borradores/:id/edicion')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.borradores.editar(peticion.sesion, id, cuerpo);
  }

  // Cuerpo: estado_nuevo (REVISADO o DESCARTADO) y version.
  @Post('borradores/:id/revision')
  @HttpCode(200)
  revisar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.borradores.revisar(peticion.sesion, id, cuerpo);
  }
}

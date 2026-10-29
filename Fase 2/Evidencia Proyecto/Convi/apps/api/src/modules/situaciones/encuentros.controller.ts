import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { EncuentrosService } from './encuentros.service.js';

// PB-063 y PB-064 (HU-055): encuentros del caso. Como en los casos, solo entra
// una cuenta CONVIVENCIA activa con segundo factor (PB-009). Los encuentros se
// ven en GET /convivencia/casos/:id.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class EncuentrosController {
  constructor(
    @Inject(EncuentrosService) private readonly encuentros: EncuentrosService,
  ) {}

  // El cuerpo trae { tipo, objetivo, descripcion, responsable_id, lugar,
  // programado_en, fin_programado_en, accion_plan_id, asistentes: [{ persona_id,
  // rol }] }; responde 201 con el id.
  @Post('casos/:id/encuentros')
  programar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.encuentros.programar(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { asistentes: [{ persona_id, rol }] }.
  @Post('encuentros/:id/asistentes')
  agregarAsistentes(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.encuentros.agregarAsistentes(peticion.sesion, id, cuerpo);
  }

  // CA5: el cuerpo trae { programado_en, fin_programado_en, motivo, version }.
  @Post('encuentros/:id/reprogramacion')
  reprogramar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.encuentros.reprogramar(peticion.sesion, id, cuerpo);
  }

  // PB-064: el cuerpo trae { realizado_en, fin_real_en, resultado,
  // asistencia: [{ participacion_id, estado }], version }.
  @Post('encuentros/:id/realizacion')
  registrarRealizacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.encuentros.registrarRealizacion(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { motivo, version }.
  @Post('encuentros/:id/cancelacion')
  cancelar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.encuentros.cancelar(peticion.sesion, id, cuerpo);
  }
}

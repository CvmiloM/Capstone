import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { PasosProtocoloService } from './pasos-protocolo.service.js';

// PB-055 (HU-048) y PB-056 (HU-049): pasos del protocolo aplicado al caso y
// término del protocolo. Como en los casos, solo entra una cuenta CONVIVENCIA
// activa con segundo factor (PB-009). Se ven en GET /convivencia/casos/:id.
// Las rutas pasos-protocolo/:id son de la definición de los protocolos.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class PasosProtocoloController {
  constructor(
    @Inject(PasosProtocoloService)
    private readonly pasos: PasosProtocoloService,
  ) {}

  // El cuerpo trae { estado_nuevo, notas, version }.
  @Post('pasos-caso/:id/avance')
  avanzarPaso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.pasos.avanzarPaso(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { responsable_id, vence_dia, version }.
  @Patch('pasos-caso/:id')
  asignarPaso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.pasos.asignarPaso(peticion.sesion, id, cuerpo);
  }

  // El cuerpo trae { estado_nuevo, motivo, version }.
  @Post('protocolos-caso/:id/estado')
  cambiarEstadoProtocolo(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.pasos.cambiarEstadoProtocolo(peticion.sesion, id, cuerpo);
  }
}

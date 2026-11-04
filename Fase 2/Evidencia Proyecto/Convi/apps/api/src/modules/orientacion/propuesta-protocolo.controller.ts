import {
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { PropuestaProtocoloService } from './propuesta-protocolo.service.js';

// PB-124 (HU-105): propuesta de protocolo con IA para un caso sin protocolo
// oficial, solo para una cuenta CONVIVENCIA activa con segundo factor.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class PropuestaProtocoloController {
  constructor(
    @Inject(PropuestaProtocoloService)
    private readonly propuestas: PropuestaProtocoloService,
  ) {}

  // Sin cuerpo. Responde el protocolo y la versión en Borrador que se crearon.
  @Post('casos/:id/propuesta-protocolo')
  proponer(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.propuestas.proponer(peticion.sesion, id);
  }
}

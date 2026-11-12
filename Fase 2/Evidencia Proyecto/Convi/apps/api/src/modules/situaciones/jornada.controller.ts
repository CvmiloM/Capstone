import { Controller, Get, Inject, Query, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { JornadaService } from './jornada.service.js';

@Controller('convivencia/jornada')
@PerfilesPermitidos('CONVIVENCIA')
export class JornadaController {
  constructor(
    @Inject(JornadaService) private readonly jornada: JornadaService,
  ) {}
  @Get() leer(@Req() r: PeticionConSesion) {
    return this.jornada.leer(r.sesion);
  }
  @Get('seguimientos') seguimientos(
    @Req() r: PeticionConSesion,
    @Query('pagina') pagina: unknown,
  ) {
    return this.jornada.seguimientos(r.sesion, pagina);
  }
}

import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos, Publica } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { SuscripcionCalendarioService } from './suscripcion.service.js';

// Refinamientos de Convivencia, sección 5: enlace privado del calendario para
// Google Calendar. Crear, consultar y revocar el enlace exige la cuenta de
// Convivencia con segundo factor, como el calendario.
@Controller('convivencia/calendario/suscripcion')
@PerfilesPermitidos('CONVIVENCIA')
export class SuscripcionCalendarioController {
  constructor(
    @Inject(SuscripcionCalendarioService)
    private readonly suscripcion: SuscripcionCalendarioService,
  ) {}

  @Get()
  estado(@Req() peticion: PeticionConSesion) {
    return this.suscripcion.estado(peticion.sesion);
  }

  @Post()
  crear(@Req() peticion: PeticionConSesion) {
    return this.suscripcion.crear(peticion.sesion);
  }

  @Post('revocar')
  revocar(@Req() peticion: PeticionConSesion) {
    return this.suscripcion.revocar(peticion.sesion);
  }
}

// Lo consulta Google desde sus servidores, a través de la web, sin sesión: el
// código del enlace es la credencial y el archivo no trae datos personales.
@Controller('calendario/suscrito')
export class CalendarioSuscritoController {
  constructor(
    @Inject(SuscripcionCalendarioService)
    private readonly suscripcion: SuscripcionCalendarioService,
  ) {}

  @Get(':codigo')
  @Publica()
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  archivo(@Param('codigo') codigo: string, @Query('origen') origen?: string) {
    return this.suscripcion.archivo(codigo, origen);
  }
}

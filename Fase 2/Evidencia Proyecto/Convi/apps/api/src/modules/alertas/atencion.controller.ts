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
import { AtencionAlertasService } from './atencion.service.js';
import { AvisosService } from './avisos.service.js';

// PB-093 (HU-080) y PB-095 (HU-082): bandeja de alertas y avisos del equipo
// de Convivencia. Solo entra una cuenta CONVIVENCIA activa con segundo factor
// (PB-009); profesores, administradores y apoderados no reciben avisos
// (HU-081 CA5).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class AtencionController {
  constructor(
    @Inject(AtencionAlertasService)
    private readonly alertas: AtencionAlertasService,
    @Inject(AvisosService) private readonly avisos: AvisosService,
  ) {}

  // ?estado=NUEVA (al entrar), REVISADA, ARCHIVADO o TODAS, y ?pagina=
  @Get('alertas')
  listarAlertas(
    @Req() peticion: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.alertas.listar(peticion.sesion, consulta);
  }

  @Get('alertas/:id')
  detalleAlerta(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertas.detalle(peticion.sesion, id);
  }

  // Cuerpo: estado_nuevo (REVISADA o ARCHIVADO), observacion y version.
  @Post('alertas/:id/revision')
  revisarAlerta(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.alertas.revisar(peticion.sesion, id, cuerpo);
  }

  // ?ver=no-leidos (al entrar) o todos, y ?pagina=
  @Get('avisos')
  listarAvisos(
    @Req() peticion: PeticionConSesion,
    @Query() consulta: Record<string, unknown>,
  ) {
    return this.avisos.listar(peticion.sesion, consulta);
  }

  @Post('avisos/lectura')
  marcarTodos(@Req() peticion: PeticionConSesion) {
    return this.avisos.marcarTodos(peticion.sesion);
  }

  @Post('avisos/:id/lectura')
  marcarLeido(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.avisos.marcarLeido(peticion.sesion, id);
  }

  // Marca el aviso como leído y responde a dónde lleva, o null si ya no se
  // puede abrir su registro.
  @Post('avisos/:id/apertura')
  abrirAviso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.avisos.abrir(peticion.sesion, id);
  }
}

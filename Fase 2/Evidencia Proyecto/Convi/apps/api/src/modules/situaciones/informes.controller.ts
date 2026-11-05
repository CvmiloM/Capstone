import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { enviarArchivo } from './evidencias.controller.js';
import { InformesService } from './informes.service.js';

@Controller('convivencia/informes')
@PerfilesPermitidos('CONVIVENCIA')
export class InformesController {
  constructor(
    @Inject(InformesService) private readonly informes: InformesService,
  ) {}
  @Get('opciones')
  @Header('Cache-Control', 'private, no-store')
  opciones(@Req() r: PeticionConSesion) {
    return this.informes.opciones(r.sesion);
  }
  @Get('buscar')
  @Header('Cache-Control', 'private, no-store')
  buscar(@Req() r: PeticionConSesion, @Query() q: Record<string, unknown>) {
    return this.informes.buscar(r.sesion, q);
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  listar(
    @Req() r: PeticionConSesion,
    @Query('pagina') pagina: string | undefined,
  ) {
    return this.informes.listar(r.sesion, pagina);
  }
  @Post('preparar') preparar(
    @Req() r: PeticionConSesion,
    @Body() entrada: unknown,
  ) {
    return this.informes.preparar(r.sesion, entrada);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  detalle(@Req() r: PeticionConSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.informes.detalle(r.sesion, id);
  }
  @Post(':id/contenido') guardar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entrada: unknown,
  ) {
    return this.informes.guardar(r.sesion, id, entrada);
  }
  @Post(':id/publicar') publicar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() entrada: unknown,
  ) {
    return this.informes.publicar(r.sesion, id, entrada);
  }
  @Get(':id/archivo/:formato')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  archivo(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('formato') formato: string,
  ) {
    return enviarArchivo(this.informes.descargar(r.sesion, id, formato));
  }
}

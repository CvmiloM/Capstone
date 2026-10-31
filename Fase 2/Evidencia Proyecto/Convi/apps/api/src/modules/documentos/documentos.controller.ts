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
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import {
  disposicionDescarga,
  TAMANO_MAXIMO,
  type ArchivoSubido,
} from '../situaciones/archivo-evidencia.js';
import { DocumentosService } from './documentos.service.js';
import { PreparacionDocumentos } from './preparacion.service.js';

const CARGA = FileInterceptor('archivo', {
  limits: { fileSize: TAMANO_MAXIMO + 1024 * 1024, files: 1, fields: 5 },
});

@Controller('documentos')
@PerfilesPermitidos('ADMIN', 'CONVIVENCIA')
export class DocumentosController {
  constructor(
    @Inject(DocumentosService) private readonly documentos: DocumentosService,
    @Inject(PreparacionDocumentos)
    private readonly preparacion: PreparacionDocumentos,
  ) {}
  @Get() listar(@Req() r: PeticionConSesion) {
    return this.documentos.listar(r.sesion);
  }
  @Post()
  @UseInterceptors(CARGA)
  crear(
    @Req() r: PeticionConSesion,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.documentos.cargar(r.sesion, cuerpo, archivo);
  }
  @Get('versiones/:id')
  version(@Req() r: PeticionConSesion, @Param('id', ParseUUIDPipe) id: string) {
    return this.documentos.version(r.sesion, id);
  }
  @Post('versiones/:id/preparacion')
  preparar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.preparacion.solicitar(r.sesion, id);
  }
  // PB-079: habilita para la búsqueda con IA una versión que no lo estaba.
  @Post('versiones/:id/busqueda-ia')
  habilitarBusqueda(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentos.habilitarBusqueda(r.sesion, id);
  }
  @Get('versiones/:id/preparacion')
  @Header('Cache-Control', 'private, no-store')
  estadoPreparacion(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.preparacion.estado(r.sesion, id);
  }
  @Post('versiones/:id/publicacion')
  publicar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.documentos.publicar(r.sesion, id, cuerpo);
  }
  @Post('versiones/:id/cierre-vigencia')
  cerrar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.documentos.cerrarVigencia(r.sesion, id, cuerpo);
  }
  @Post('versiones/:id/republicacion')
  republicar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.documentos.republicar(r.sesion, id, cuerpo);
  }
  @Post('versiones/:id/archivo')
  archivar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentos.archivar(r.sesion, id);
  }
  @Get('versiones/:id/archivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async descargar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('ver') ver?: string,
  ) {
    const a = await this.documentos.descargar(r.sesion, id);
    const disposition = disposicionDescarga(a.nombre);
    return new StreamableFile(a.contenido, {
      type: a.mime,
      length: a.contenido.length,
      disposition:
        ver === '1' && a.mime === 'application/pdf'
          ? disposition.replace(/^attachment/, 'inline')
          : disposition,
    });
  }
  @Get(':id') detalle(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documentos.detalle(r.sesion, id);
  }
  @Post(':id/versiones')
  @UseInterceptors(CARGA)
  cargar(
    @Req() r: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.documentos.cargar(r.sesion, cuerpo, archivo, id);
  }
}

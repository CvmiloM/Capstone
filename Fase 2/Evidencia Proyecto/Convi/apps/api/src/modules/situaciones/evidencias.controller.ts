import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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
} from './archivo-evidencia.js';
import { EvidenciasService } from './evidencias.service.js';

// PB-066 y PB-130: formulario multipart con los campos titulo, tipo,
// descripcion y archivo. El archivo queda en memoria hasta 1 MB más que el
// límite, para responder con un mensaje en vez de cortar la conexión. PB-067:
// las comunicaciones también lo usan para su respaldo.
export const CARGA = FileInterceptor('archivo', {
  limits: { fileSize: TAMANO_MAXIMO + 1024 * 1024, files: 1, fields: 10 },
});

export async function enviarArchivo(
  descarga: Promise<{ nombre: string; mime: string; contenido: Buffer }>,
) {
  const { nombre, mime, contenido } = await descarga;
  return new StreamableFile(contenido, {
    type: mime,
    disposition: disposicionDescarga(nombre),
    length: contenido.length,
  });
}

// Convivencia: solo entra una cuenta CONVIVENCIA activa con segundo factor (PB-009).
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class EvidenciasConvivenciaController {
  constructor(
    @Inject(EvidenciasService) private readonly evidencias: EvidenciasService,
  ) {}

  // Responde 201 con el id de la evidencia.
  @Post('situaciones/:id/evidencias')
  @UseInterceptors(CARGA)
  adjuntarASituacion(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.evidencias.adjuntarASituacion(
      peticion.sesion,
      id,
      cuerpo,
      archivo,
    );
  }

  @Post('casos/:id/evidencias')
  @UseInterceptors(CARGA)
  adjuntarACaso(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.evidencias.adjuntarACaso(peticion.sesion, id, cuerpo, archivo);
  }

  // PB-072 (HU-062): acta firmada de una entrevista o reunión realizada, con
  // los campos titulo, fecha_documento, descripcion y archivo.
  @Post('encuentros/:id/actas')
  @UseInterceptors(CARGA)
  adjuntarActa(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.evidencias.adjuntarActa(peticion.sesion, id, cuerpo, archivo);
  }

  // CA3: la descarga vuelve a comprobar el permiso en cada petición.
  @Get('evidencias/:id/archivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  descargar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return enviarArchivo(
      this.evidencias.descargar(peticion.sesion, 'CONVIVENCIA', id),
    );
  }
}

// Profesor: solo sus propias situaciones y lo que él aportó.
@Controller('profesor')
@PerfilesPermitidos('PROFESOR')
export class EvidenciasProfesorController {
  constructor(
    @Inject(EvidenciasService) private readonly evidencias: EvidenciasService,
  ) {}

  @Post('situaciones/:id/evidencias')
  @UseInterceptors(CARGA)
  adjuntar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.evidencias.adjuntarProfesor(
      peticion.sesion,
      id,
      cuerpo,
      archivo,
    );
  }

  @Get('evidencias/:id/archivo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  descargar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return enviarArchivo(
      this.evidencias.descargar(peticion.sesion, 'PROFESOR', id),
    );
  }
}

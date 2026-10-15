import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { type ArchivoSubido, LIMITES } from './importacion.js';
import { ImportacionesService } from './importaciones.service.js';

// PB-019 (HU-015): importaciones del portal de administración. El decorador de
// la clase aplica a todas las rutas: solo entra una cuenta ADMIN activa con el
// segundo factor completo, y se comprueba antes de recibir el archivo.
@Controller('admin/importaciones')
@PerfilesPermitidos('ADMIN')
export class ImportacionesController {
  constructor(
    @Inject(ImportacionesService)
    private readonly importaciones: ImportacionesService,
  ) {}

  // Las importaciones de la escuela, la más reciente primero.
  @Get()
  listar(@Req() peticion: PeticionConSesion) {
    return this.importaciones.listar(peticion.sesion);
  }

  // Formulario multipart con los campos "tipo" y "archivo". El archivo queda
  // en memoria (hasta 1 MB más que el límite, para responder con un mensaje
  // propio) y la respuesta 201 trae la importación Cargada.
  @Post()
  @UseInterceptors(
    FileInterceptor('archivo', {
      limits: { fileSize: LIMITES.bytes + 1024 * 1024, files: 1 },
    }),
  )
  cargar(
    @Req() peticion: PeticionConSesion,
    @Body('tipo') tipo: unknown,
    @UploadedFile() archivo: ArchivoSubido | undefined,
  ) {
    return this.importaciones.cargar(peticion.sesion, tipo, archivo);
  }

  // La importación con sus columnas y sus primeras filas.
  @Get(':id')
  obtener(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importaciones.obtener(peticion.sesion, id);
  }
}
import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { type ArchivoSubido, FORMATOS, LIMITES } from './importacion.js';
import {
  ImportacionesService,
  validarFiltro,
} from './importaciones.service.js';

// PB-019 y PB-020 (HU-015): importaciones del portal de administración. El
// decorador de la clase aplica a todas las rutas: solo entra una cuenta ADMIN
// activa con el segundo factor completo, y se comprueba antes de recibir el
// archivo.
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

  // Plantilla XLSX de un tipo (estudiantes, cursos, profesores, apoderados,
  // matriculas o asignaciones). Va antes de :id para que no la tome esa ruta.
  @Get('plantillas/:tipo')
  async plantilla(@Param('tipo') tipo: string) {
    const { nombre, contenido } = await this.importaciones.plantilla(tipo);
    return new StreamableFile(contenido, {
      type: FORMATOS.xlsx,
      disposition: `attachment; filename="${nombre}"`,
      length: contenido.length,
    });
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

  // La importación con sus columnas, su revisión y una página de 50 filas,
  // opcionalmente solo las de un estado (?estado=ERROR&pagina=2).
  @Get(':id')
  obtener(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('estado') estado: unknown,
    @Query('pagina') pagina: unknown,
  ) {
    return this.importaciones.obtener(
      peticion.sesion,
      id,
      validarFiltro(estado, pagina),
    );
  }

  // PB-020: { mapeo: { columna: campo }, anio_academico_id, formato_fecha,
  // duplicados }. Responde con la importación En revisión y sus filas.
  @Post(':id/revision')
  @HttpCode(200)
  revisar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.importaciones.revisar(peticion.sesion, id, cuerpo);
  }
}
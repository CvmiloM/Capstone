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

// PB-019, PB-020, PB-026 y PB-027 (HU-015 y HU-020): importaciones del portal
// de administración. El decorador de la clase aplica a todas las rutas: solo
// entra una cuenta ADMIN activa con el segundo factor completo, y se comprueba
// antes de recibir el archivo.
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

    // PB-026 y PB-027: { incluir_advertencias: boolean }. Vuelve a revisar las
  // filas y deja la confirmación en la cola: responde 202 con la importación
  // Procesando (o En revisión, si no quedó nada que confirmar).
  @Post(':id/confirmacion')
  @HttpCode(202)
  confirmar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.importaciones.confirmar(peticion.sesion, id, cuerpo);
  }

  // PB-026: marca Omitidas las filas Con error.
  @Post(':id/omision')
  @HttpCode(200)
  omitir(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importaciones.omitir(peticion.sesion, id);
  }
 
  // PB-027: vuelve a encolar una confirmación que se detuvo. Sigue desde la
  // fila donde quedó.
  @Post(':id/reanudacion')
  @HttpCode(202)
  reanudar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importaciones.reanudar(peticion.sesion, id);
  }

  // PB-027 (HU-020 CA5): estado, conteos por estado y avance, sin las filas.
  @Get(':id/avance')
  avance(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importaciones.avance(peticion.sesion, id);
  }
}
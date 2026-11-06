import {
  Body,
  Controller,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { CorreosService } from './correos.service.js';

// PB-151 (HU-130) y PB-086 (HU-075): borradores de correo al apoderado. Como
// en las comunicaciones, solo entra Convivencia activa con segundo factor. Se
// ven en GET /convivencia/casos/:id (sección comunicaciones). PB-087 (HU-076):
// el envío con confirmación. PB-088 (HU-077): la revisión de la entrega.
@Controller('convivencia')
@PerfilesPermitidos('CONVIVENCIA')
export class CorreosController {
  constructor(
    @Inject(CorreosService) private readonly correos: CorreosService,
  ) {}

  // JSON con persona_destinataria_id o direccion, asunto y contenido. 201 con el id.
  @Post('casos/:id/correos')
  crear(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.correos.crear(peticion.sesion, id, cuerpo);
  }

  // JSON con persona_destinataria_id (apoderado del caso) e indicacion.
  // 201 con el id del borrador; 409 si la IA lo redactó fuera de las reglas;
  // 503 si la IA no está disponible.
  @Post('casos/:id/correos/ia')
  generarConIA(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.correos.generarConIA(peticion.sesion, id, cuerpo);
  }

  // Mismos campos que al crear; 409 si el correo ya fue confirmado.
  @Post('correos/:id')
  editar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.correos.editar(peticion.sesion, id, cuerpo);
  }

  // PB-087: JSON con clave_envio (creada al mostrar la página) y con_advertencia.
  // 201 con id y estado; la misma clave repetida responde lo mismo sin enviar.
  @Post('correos/:id/envio')
  enviar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() cuerpo: unknown,
  ) {
    return this.correos.enviar(peticion.sesion, id, cuerpo);
  }

  // PB-088 (HU-077): pregunta al servicio de correo si un correo enviado llegó.
  // 201 con id y estado; 409 con el mensaje si no se pudo consultar.
  @Post('correos/:id/entrega')
  revisarEntrega(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.correos.revisarEntrega(peticion.sesion, id);
  }

  // PB-087 (HU-076 CA2): copia un correo en un borrador nuevo. 201 con el id.
  @Post('correos/:id/copia')
  copiar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.correos.copiar(peticion.sesion, id);
  }

  // Borra un borrador nunca confirmado; la base deja el descarte en la auditoría.
  @Post('correos/:id/descarte')
  descartar(
    @Req() peticion: PeticionConSesion,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.correos.descartar(peticion.sesion, id);
  }
}

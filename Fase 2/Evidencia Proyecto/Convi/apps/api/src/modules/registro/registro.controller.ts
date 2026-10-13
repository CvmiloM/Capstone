import { Body, Controller, Inject, Post, Req } from '@nestjs/common';
import { CorreoVerificado } from '../../common/acceso.decorator.js';
import type { PeticionConIdentidad } from '../../common/sesion.guard.js';
import { RegistroService } from './registro.service.js';

// Registro inicial (PB-002): la persona ya verificó su correo (PB-001) pero
// todavía no tiene cuenta en CONVI. Solo esta ruta usa @CorreoVerificado.
@Controller('registro')
export class RegistroController {
  constructor(
    @Inject(RegistroService) private readonly registro: RegistroService,
  ) {}

  // El cuerpo se valida en el servicio; la respuesta 201 trae la escuela creada.
  @Post('escuela')
  @CorreoVerificado()
  registrarEscuela(
    @Req() peticion: PeticionConIdentidad,
    @Body() cuerpo: unknown,
  ) {
    return this.registro.registrarEscuela(peticion.identidad, cuerpo);
  }
}
import { Body, Controller, HttpCode, Inject, Post, Req } from '@nestjs/common';
import { PerfilesPermitidos } from '../../common/acceso.decorator.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';
import { NormativaService } from './normativa.service.js';

// PB-117 a PB-119 (HU-101 y HU-102): consulta del reglamento con IA. Solo Convivencia,
// aunque el administrador haya cargado el reglamento (HU-101 CA3).
@Controller('normativa')
@PerfilesPermitidos('CONVIVENCIA')
export class NormativaController {
  constructor(
    @Inject(NormativaService) private readonly normativa: NormativaService,
  ) {}

  // Cuerpo: { pregunta }. Responde la respuesta, si hay disposición y sus citas.
  @Post('consultas')
  @HttpCode(200)
  consultar(@Req() peticion: PeticionConSesion, @Body() cuerpo: unknown) {
    return this.normativa.consultar(peticion.sesion, cuerpo);
  }
}

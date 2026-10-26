import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { COLA_REGLAS, crearColaReglas } from './cola.js';
import { EvaluacionReglas } from './evaluacion.service.js';
import { MotorDiarioService } from './motor-diario.service.js';
import { MotorReglasService } from './motor.service.js';
import { TrabajadorReglas } from './trabajador.js';

// Módulo de Camilo: motor de reglas y alertas (PB-090, HU-079). No tiene
// rutas: lo usa SituacionesModule después de guardar una situación. Importa
// AuthModule para usar CuentaService, que abre la transacción con la
// identidad técnica del motor. La bandeja de alertas es PB-093.
// PB-091 y PB-092: además evalúa cada mañana los vencimientos y la variación
// entre períodos.
@Module({
  imports: [AuthModule],
  providers: [
    MotorReglasService,
    MotorDiarioService,
    { provide: COLA_REGLAS, useFactory: crearColaReglas },
    EvaluacionReglas,
    TrabajadorReglas,
  ],
  exports: [EvaluacionReglas],
})
export class AlertasModule {}

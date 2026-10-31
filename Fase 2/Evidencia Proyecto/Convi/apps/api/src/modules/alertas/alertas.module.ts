import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AtencionController } from './atencion.controller.js';
import { AtencionAlertasService } from './atencion.service.js';
import { AvisosService } from './avisos.service.js';
import { COLA_REGLAS, crearColaReglas } from './cola.js';
import { EvaluacionReglas } from './evaluacion.service.js';
import { MotorDiarioService } from './motor-diario.service.js';
import { MotorReglasService } from './motor.service.js';
import { TrabajadorReglas } from './trabajador.js';
import { VencimientosService } from './vencimientos.service.js';

// Módulo de Camilo: motor de reglas y alertas (PB-090, HU-079). Lo usa
// SituacionesModule después de guardar una situación. Importa AuthModule para
// usar CuentaService, que abre la transacción con la identidad técnica del
// motor. PB-091 y PB-092: además evalúa cada mañana los vencimientos y la
// variación entre períodos.
// PB-093 y PB-095 (Fernando): sus únicas rutas son la bandeja de alertas y
// los avisos de Convivencia (atencion.controller.ts). PB-094: cada mañana,
// después de las reglas diarias, avisa lo que vence ese día.
@Module({
  imports: [AuthModule],
  controllers: [AtencionController],
  providers: [
    AtencionAlertasService,
    AvisosService,
    MotorReglasService,
    MotorDiarioService,
    { provide: COLA_REGLAS, useFactory: crearColaReglas },
    EvaluacionReglas,
    TrabajadorReglas,
    VencimientosService,
  ],
  exports: [EvaluacionReglas],
})
export class AlertasModule {}

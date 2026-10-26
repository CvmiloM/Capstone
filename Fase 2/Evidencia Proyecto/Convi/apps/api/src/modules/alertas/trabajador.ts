import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { aTiempo, conexionRedis } from '../importaciones/cola.js';
import {
  avisoSinRedisReglas,
  COLA_REGLAS,
  type ColaReglas,
  NOMBRE_COLA_REGLAS,
  programarEvaluacionDiaria,
  type TrabajoDiario,
  type TrabajoReglas,
} from './cola.js';
import { MotorDiarioService } from './motor-diario.service.js';
import { MotorReglasService } from './motor.service.js';

// PB-090 (HU-079 CA8): el trabajador corre dentro de la API y evalúa una
// situación a la vez. Si la API se apaga a medias, el trabajo vuelve a la
// cola cuando enciende de nuevo; la clave única de cada alerta evita repetirla.
// PB-091 y PB-092: en la misma cola corre la evaluación de cada mañana.
@Injectable()
export class TrabajadorReglas implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrabajadorReglas.name);
  private trabajador: Worker<TrabajoReglas | TrabajoDiario> | null = null;

  constructor(
    @Inject(MotorReglasService) private readonly motor: MotorReglasService,
    @Inject(MotorDiarioService) private readonly diario: MotorDiarioService,
    @Inject(COLA_REGLAS) private readonly cola: ColaReglas | null,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL;
    // Sin REDIS_URL, crearColaReglas ya avisó y la evaluación corre sin cola.
    if (!url) {
      this.logger.warn(
        'Falta configurar REDIS_URL: la evaluación diaria de reglas no está disponible.',
      );
      return;
    }
    this.trabajador = new Worker<TrabajoReglas | TrabajoDiario>(
      NOMBRE_COLA_REGLAS,
      (trabajo) =>
        'situacion_id' in trabajo.data
          ? this.motor.evaluarSituacion(
              trabajo.data.establecimiento_id,
              trabajo.data.situacion_id,
            )
          : this.diario.evaluarTodas(),
      {
        connection: conexionRedis(url, true),
        // Una evaluación a la vez: son cortas y así no compiten por la escuela.
        concurrency: 1,
        maxStalledCount: 2,
      },
    );
    this.trabajador.on('failed', (trabajo) => {
      // Sin el detalle del error: puede traer datos de la base.
      this.logger.error(
        trabajo && !('situacion_id' in trabajo.data)
          ? `Falló el intento ${trabajo.attemptsMade} de la evaluación diaria de reglas.`
          : `Falló el intento ${trabajo?.attemptsMade ?? '?'} de evaluar las reglas de una situación.`,
      );
    });
    this.trabajador.on('error', avisoSinRedisReglas(this.logger));
    // PB-091 y PB-092: la evaluación de cada mañana queda programada en Redis.
    if (this.cola)
      aTiempo(programarEvaluacionDiaria(this.cola), 5000).catch(() =>
        this.logger.error(
          'No se pudo programar la evaluación diaria de reglas.',
        ),
      );
  }

  async onModuleDestroy() {
    await this.trabajador?.close();
  }
}

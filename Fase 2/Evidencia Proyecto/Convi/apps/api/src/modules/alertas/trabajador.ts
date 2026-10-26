import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import { conexionRedis } from '../importaciones/cola.js';
import {
  avisoSinRedisReglas,
  NOMBRE_COLA_REGLAS,
  type TrabajoReglas,
} from './cola.js';
import { MotorReglasService } from './motor.service.js';

// PB-090 (HU-079 CA8): el trabajador corre dentro de la API y evalúa una
// situación a la vez. Si la API se apaga a medias, el trabajo vuelve a la
// cola cuando enciende de nuevo; la clave única de cada alerta evita repetirla.
@Injectable()
export class TrabajadorReglas implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrabajadorReglas.name);
  private trabajador: Worker<TrabajoReglas> | null = null;

  constructor(
    @Inject(MotorReglasService) private readonly motor: MotorReglasService,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL;
    // Sin REDIS_URL, crearColaReglas ya avisó y la evaluación corre sin cola.
    if (!url) return;
    this.trabajador = new Worker<TrabajoReglas>(
      NOMBRE_COLA_REGLAS,
      (trabajo) =>
        this.motor.evaluarSituacion(
          trabajo.data.establecimiento_id,
          trabajo.data.situacion_id,
        ),
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
        `Falló el intento ${trabajo?.attemptsMade ?? '?'} de evaluar las reglas de una situación.`,
      );
    });
    this.trabajador.on('error', avisoSinRedisReglas(this.logger));
  }

  async onModuleDestroy() {
    await this.trabajador?.close();
  }
}

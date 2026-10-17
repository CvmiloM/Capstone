import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import {
  avisoSinRedis,
  conexionRedis,
  NOMBRE_COLA,
  type TrabajoConfirmacion,
} from './cola.js';
import { ImportacionesService } from './importaciones.service.js';

// PB-027 (HU-020 CA5): el trabajador de la cola corre dentro de la API y
// confirma cada importación encolada por tramos. Si la API se apaga a medias
// (un reinicio, o Azure sin visitas), el trabajo vuelve a la cola cuando la API
// enciende de nuevo y sigue desde la fila donde quedó.
@Injectable()
export class TrabajadorConfirmacion implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrabajadorConfirmacion.name);
  private trabajador: Worker<TrabajoConfirmacion> | null = null;

  constructor(
    @Inject(ImportacionesService)
    private readonly importaciones: ImportacionesService,
  ) {}

  onModuleInit() {
    const url = process.env.REDIS_URL;
    // Sin REDIS_URL, crearCola ya avisó y confirmar responde que no está disponible.
    if (!url) return;
    this.trabajador = new Worker<TrabajoConfirmacion>(
      NOMBRE_COLA,
      (trabajo) => this.importaciones.procesarConfirmacion(trabajo.data),
      {
        connection: conexionRedis(url, true),
        // Dos importaciones a la vez como máximo; cada tramo usa una conexión.
        concurrency: 2,
        // Un trabajo interrumpido vuelve a la cola hasta dos veces; después
        // queda el botón Reanudar.
        maxStalledCount: 2,
      },
    );
    this.trabajador.on('failed', (trabajo) => {
      // Sin el detalle del error: puede traer datos de las filas.
      this.logger.error(
        `Falló el intento ${trabajo?.attemptsMade ?? '?'} de confirmar una importación en segundo plano.`,
      );
    });
    this.trabajador.on('error', avisoSinRedis(this.logger));
  }

  async onModuleDestroy() {
    await this.trabajador?.close();
  }
}
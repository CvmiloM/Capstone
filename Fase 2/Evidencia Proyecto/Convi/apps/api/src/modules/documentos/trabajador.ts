import {
  Inject,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, UnrecoverableError } from 'bullmq';
import type { Redis } from 'ioredis';
import { conexionRedis } from '../importaciones/cola.js';
import {
  COLA_DOCUMENTOS,
  NOMBRE_COLA_DOCUMENTOS,
  type ColaDocumentos,
  type TrabajoDocumento,
} from './cola.js';
import { PreparacionDocumentos } from './preparacion.service.js';
import { ErrorPreparacion } from './preparacion.js';

@Injectable()
export class TrabajadorDocumentos implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrabajadorDocumentos.name);
  private trabajador: Worker<TrabajoDocumento> | null = null;
  private conexion: Redis | null = null;
  constructor(
    @Inject(PreparacionDocumentos)
    private readonly preparacion: PreparacionDocumentos,
    @Inject(COLA_DOCUMENTOS) private readonly cola: ColaDocumentos | null,
  ) {}
  onModuleInit() {
    if (!process.env.REDIS_URL) return;
    this.conexion = conexionRedis(process.env.REDIS_URL, true);
    this.trabajador = new Worker<TrabajoDocumento>(
      NOMBRE_COLA_DOCUMENTOS,
      async (trabajo) => {
        try {
          await this.preparacion.procesar(trabajo.data);
        } catch (error) {
          if (
            error instanceof ForbiddenException ||
            error instanceof UnauthorizedException ||
            error instanceof NotFoundException
          )
            throw new UnrecoverableError(
              'La cuenta o el documento ya no permiten continuar la preparación',
            );
          if (error instanceof ErrorPreparacion && !error.recuperable)
            throw new UnrecoverableError(error.message);
          throw new Error('No se pudo completar la preparación del documento');
        }
      },
      { connection: this.conexion, concurrency: 1, maxStalledCount: 2 },
    );
    let ultimoAviso = 0;
    this.trabajador.on('error', () => {
      if (Date.now() - ultimoAviso < 60_000) return;
      ultimoAviso = Date.now();
      this.logger.error(
        'La cola de preparación de documentos espera una conexión con Redis',
      );
    });
    this.trabajador.on('failed', () =>
      this.logger.warn(
        'Falló un intento de preparar un documento, revisa su estado en CONVI',
      ),
    );
  }
  async onModuleDestroy() {
    await this.trabajador?.close();
    this.conexion?.disconnect();
    await this.cola?.close();
  }
}

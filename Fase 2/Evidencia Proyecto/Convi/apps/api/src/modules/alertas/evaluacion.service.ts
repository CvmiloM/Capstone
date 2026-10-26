import { Inject, Injectable, Logger } from '@nestjs/common';
import { aTiempo } from '../importaciones/cola.js';
import { COLA_REGLAS, type ColaReglas } from './cola.js';
import { MotorReglasService } from './motor.service.js';

/** Esperas de los reintentos cuando se evalúa dentro de la API, sin cola. */
const ESPERAS_SIN_COLA = [5000, 30000, 120000];

/**
 * PB-090 (HU-079 CA4 y CA8): lo que usan los registros de situaciones después
 * de confirmar su transacción. Encola la evaluación en Redis; si no hay cola
 * o Redis no responde, la hace dentro de la API con unos pocos reintentos.
 * Nunca lanza un error: la situación ya quedó guardada.
 */
@Injectable()
export class EvaluacionReglas {
  private readonly logger = new Logger(EvaluacionReglas.name);

  constructor(
    @Inject(COLA_REGLAS) private readonly cola: ColaReglas | null,
    @Inject(MotorReglasService) private readonly motor: MotorReglasService,
  ) {}

  despuesDeGuardar(establecimientoId: string, situacionId: string): void {
    const trabajo = {
      establecimiento_id: establecimientoId,
      situacion_id: situacionId,
    };
    if (!this.cola) {
      void this.evaluarSinCola(trabajo);
      return;
    }
    // Con el id del trabajo, la misma situación no queda dos veces en la cola.
    aTiempo(
      this.cola.add('evaluar', trabajo, { jobId: `situacion-${situacionId}` }),
      2000,
    ).catch(() => {
      this.logger.warn(
        'No se pudo encolar la evaluación de reglas: se evalúa dentro de la API.',
      );
      void this.evaluarSinCola(trabajo);
    });
  }

  private async evaluarSinCola(trabajo: {
    establecimiento_id: string;
    situacion_id: string;
  }) {
    for (let intento = 0; ; intento++) {
      try {
        await this.motor.evaluarSituacion(
          trabajo.establecimiento_id,
          trabajo.situacion_id,
        );
        return;
      } catch {
        // Sin el detalle del error: puede traer datos de la base.
        if (intento >= ESPERAS_SIN_COLA.length) {
          this.logger.error(
            'Falló la evaluación de reglas de una situación después de varios intentos.',
          );
          return;
        }
        await new Promise((listo) =>
          setTimeout(listo, ESPERAS_SIN_COLA[intento]),
        );
      }
    }
  }
}

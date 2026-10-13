import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Identidad } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos, validarNuevaEscuela } from './nueva-escuela.js';

type ErrorPostgres = { code?: string; constraint?: string; message?: string };

@Injectable()
export class RegistroService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  /**
   * HU-002: crea en una sola operación la escuela, la ficha de la persona y su
   * cuenta ADMIN activa (convi.registrar_primer_administrador). El usuario sale
   * del token comprobado, nunca del cuerpo. Reintentar con la misma identidad
   * devuelve la misma escuela y no crea otra (CA5).
   */
  async registrarEscuela(identidad: Identidad, cuerpo: unknown) {
    const datos = validarNuevaEscuela(cuerpo);
    return this.cuentas.operarRegistro(identidad, async (db) => {
      try {
        const resultado = await db.query<{ establecimiento_id: string }>(
          `SELECT convi.registrar_primer_administrador(
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
           ) AS establecimiento_id`,
          [
            identidad.authUsuarioId,
            datos.nombres,
            datos.apellidos,
            datos.telefono,
            datos.nombre,
            datos.codigo,
            datos.region,
            datos.comuna,
            datos.direccion,
            datos.telefono_escuela,
            datos.correo_contacto,
            datos.zona_horaria,
          ],
        );
        return { establecimiento_id: resultado.rows[0].establecimiento_id };
      } catch (error) {
        throw traducirError(error);
      }
    });
  }
}

// Convierte los errores conocidos del modelo en respuestas claras. Los demás
// siguen su curso: operarRegistro revierte y responde 503.
function traducirError(error: unknown) {
  const { code, constraint, message } = (error ?? {}) as ErrorPostgres;
  // CA3: el código institucional no puede repetirse entre escuelas.
  if (code === '23505' && constraint === 'establecimientos_codigo_key')
    return errorDeCampos({
      codigo: 'Ese código institucional ya está registrado en CONVI.',
    });
  if (code === 'P0001' && message?.startsWith('Esta identidad ya tiene'))
    return new ConflictException(
      'Este correo ya tiene una cuenta en CONVI. Usa otro correo para registrar una escuela nueva.',
    );
  if (code === 'P0001' && message?.startsWith('Verificar el correo'))
    return new ForbiddenException('Verifica tu correo para continuar.');
  return error;
}
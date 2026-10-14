import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Identidad } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENLACE_INVALIDO =
  'El enlace de invitación no es válido o ya se usó. Pide al administrador de tu establecimiento que te invite nuevamente.';

type ErrorPostgres = { code?: string; message?: string };

// PB-003 (HU-003): activa la cuenta Pendiente del enlace de invitación con la
// identidad que acaba de verificar el correo. La persona todavía no tiene
// cuenta activa, por eso usa operarRegistro (rol convi_registro), igual que el
// alta de la escuela de PB-002.
@Injectable()
export class ActivacionService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  activar(
    identidad: Identidad,
    cuerpo: unknown,
  ): Promise<{ establecimiento_id: string }> {
    const datos = (
      typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
    ) as Record<string, unknown>;
    const membresiaId =
      typeof datos.membresia_id === 'string' ? datos.membresia_id.trim() : '';
    if (!UUID.test(membresiaId)) throw new BadRequestException(ENLACE_INVALIDO);

    return this.cuentas.operarRegistro(identidad, async (db) => {
      try {
        // convi.activar_invitacion comprueba que el correo verificado sea el
        // invitado, que la cuenta siga Pendiente y que la escuela esté activa;
        // la escuela, la persona y el perfil no cambian (CA1 y CA2).
        const resultado = await db.query<{ establecimiento_id: string }>(
          'SELECT convi.activar_invitacion($1, $2) AS establecimiento_id',
          [membresiaId, identidad.authUsuarioId],
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
  const { code, message } = (error ?? {}) as ErrorPostgres;
  if (code !== 'P0001' || !message) return error;
  // CA3: un enlace de otro correo, ya usado o de una cuenta que no está Pendiente.
  if (
    message.startsWith('La invitación no corresponde') ||
    message.startsWith('La invitación ya fue usada')
  )
    return new ConflictException(ENLACE_INVALIDO);
  // CA2: una identidad ya activada no se vincula a otra cuenta.
  if (message.startsWith('Esta identidad ya tiene'))
    return new ConflictException(
      'Este correo ya tiene una cuenta en CONVI. Pide al administrador una invitación con otro correo.',
    );
  if (message.startsWith('La escuela no está activa'))
    return new ConflictException(
      'Tu establecimiento no está disponible en este momento. Consulta con su administrador.',
    );
  if (message.startsWith('La identidad debe tener el correo verificado'))
    return new ForbiddenException('Verifica tu correo para continuar.');
  return error;
}

import {
  Inject,
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos, validarInvitacion } from './nueva-invitacion.js';

// Cliente de Supabase Auth con la clave secreta: solo vive en la API y solo
// se usa para enviar invitaciones (PB-128). Nunca llega al navegador.
export const SUPABASE_ADMIN = Symbol('supabase-admin');

// PB-010 (HU-009): cuentas de la escuela e invitaciones. La seguridad por fila
// separa por escuela; la escuela y quién invita salen siempre de la sesión.
const PERFILES: Perfil[] = ['ADMIN'];

export type CuentaEscuela = {
  id: string;
  nombres: string;
  apellidos: string;
  correo: string;
  perfil: string;
  estado: string;
  invitado_por: string | null;
  invitado_en: Date | null;
  activado_en: Date | null;
};

export type InvitacionEnviada = {
  id: string;
  correo: string;
  perfil: string;
  estado: string;
};

const CORREO_REPETIDO = 'Ese correo ya tiene una cuenta en tu escuela.';
const CORREO_CON_IDENTIDAD =
  'Ese correo ya tiene una identidad en CONVI. Cada cuenta necesita su propio correo.';

@Injectable()
export class CuentasService {
  private readonly registro = new Logger('Invitaciones');

  constructor(
    @Inject(CuentaService) private readonly cuentas: CuentaService,
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseClient,
  ) {}

  // Las cuentas de la escuela, primero las pendientes de activar.
  listar(sesion: Sesion): Promise<CuentaEscuela[]> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<CuentaEscuela>(
          `SELECT m.id, p.nombres, p.apellidos, m.correo_invitacion AS correo,
                  m.codigo_perfil AS perfil, m.estado,
                  pi.nombres || ' ' || pi.apellidos AS invitado_por,
                  m.invitado_en, m.activado_en
           FROM convi.membresias_establecimiento m
           JOIN convi.personas p ON p.id = m.persona_id
           LEFT JOIN convi.membresias_establecimiento mi ON mi.id = m.invitado_por
           LEFT JOIN convi.personas pi ON pi.id = mi.persona_id
           ORDER BY m.estado = 'PENDIENTE' DESC, p.apellidos, p.nombres`,
        );
        return resultado.rows;
      },
    );
  }

  // PB-011: el correo sale de la cuenta guardada, nunca de lo que manda el navegador.
  reenviar(sesion: Sesion, id: string): Promise<InvitacionEnviada> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // La escuela queda limitada por la sesión y el bloqueo evita activar o reenviar a la vez.
        const resultado = await db.query<
          InvitacionEnviada & { auth_usuario_id: string | null }
        >(
          `SELECT id, correo_invitacion AS correo, codigo_perfil AS perfil,
                  estado, auth_usuario_id
           FROM convi.membresias_establecimiento WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const cuenta = resultado.rows[0];
        if (!cuenta) throw new NotFoundException('La cuenta no existe.');
        if (cuenta.estado !== 'PENDIENTE' || cuenta.auth_usuario_id)
          throw new ConflictException(
            'Solo puedes reenviar una invitación pendiente.',
          );

        let { error } = await this.supabase.auth.admin.inviteUserByEmail(
          cuenta.correo,
          { data: { membresia_id: cuenta.id } },
        );
        // Si ya confirmó el correo pero no terminó, recibe un enlace para la misma identidad.
        if (error?.code === 'email_exists') {
          ({ error } = await this.supabase.auth.signInWithOtp({
            email: cuenta.correo,
            options: { shouldCreateUser: false },
          }));
        }
        if (error) {
          throw new ServiceUnavailableException(
            error.status === 429 || error.code === 'over_email_send_rate_limit'
              ? 'Espera un minuto antes de reenviar la invitación nuevamente.'
              : 'No se pudo reenviar la invitación. Inténtalo nuevamente.',
          );
        }
        // Se conservan persona, escuela, perfil y quién hizo la invitación original.
        return {
          id: cuenta.id,
          correo: cuenta.correo,
          perfil: cuenta.perfil,
          estado: cuenta.estado,
        };
      },
    );
  }

  // CA1, CA2 y CA4: crea (o reutiliza) la ficha de la persona y su cuenta
  // Pendiente, y Supabase envía el correo con el enlace de activación. El
  // correo se envía dentro de la transacción: si falla, no queda una cuenta
  // Pendiente sin invitación (PB-138).
  invitar(sesion: Sesion, cuerpo: unknown): Promise<InvitacionEnviada> {
    const datos = validarInvitacion(cuerpo);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        // CA2: un correo no se invita dos veces en la misma escuela.
        const repetido = await db.query(
          `SELECT 1 FROM convi.membresias_establecimiento
           WHERE lower(correo_invitacion) = $1`,
          [datos.correo],
        );
        if (repetido.rowCount) throw errorDeCampos({ correo: CORREO_REPETIDO });

        // CA1: si la persona ya tiene ficha en la escuela, sin cuenta y sin ser
        // estudiante, se usa esa y se conservan sus nombres.
        const existente = await db.query<{ id: string }>(
          `SELECT p.id FROM convi.personas p
           WHERE lower(p.correo) = $1
             AND NOT EXISTS (SELECT 1 FROM convi.membresias_establecimiento m
                             WHERE m.persona_id = p.id)
             AND NOT EXISTS (SELECT 1 FROM convi.estudiantes e
                             WHERE e.persona_id = p.id)
           ORDER BY p.creado_en
           LIMIT 1`,
          [datos.correo],
        );
        const personaId =
          existente.rows[0]?.id ??
          (
            await db.query<{ id: string }>(
              `INSERT INTO convi.personas (establecimiento_id, nombres, apellidos, correo)
               VALUES (convi.establecimiento_actual(), $1, $2, $3)
               RETURNING id`,
              [datos.nombres, datos.apellidos, datos.correo],
            )
          ).rows[0].id;

        // CA1 y CA4: quién invitó sale de la sesión; validar_membresia exige que
        // sea un administrador activo de la escuela.
        const membresia = await db
          .query<InvitacionEnviada>(
            `INSERT INTO convi.membresias_establecimiento
               (establecimiento_id, persona_id, codigo_perfil, estado,
                invitado_por, invitado_en, correo_invitacion)
             VALUES (convi.establecimiento_actual(), $1, $2, 'PENDIENTE',
                     convi.membresia_actual(), now(), $3)
             RETURNING id, correo_invitacion AS correo, codigo_perfil AS perfil, estado`,
            [personaId, datos.perfil, datos.correo],
          )
          .catch((error: unknown) => {
            // Otro administrador invitó el mismo correo al mismo tiempo.
            if ((error as { code?: string } | null)?.code === '23505')
              throw errorDeCampos({ correo: CORREO_REPETIDO });
            throw error;
          });
        const invitacion = membresia.rows[0];

        // La plantilla supabase/templates/invitacion.html arma el enlace con
        // {{ .Data.membresia_id }}, que luego usa la activación (PB-003).
        const { error } = await this.supabase.auth.admin.inviteUserByEmail(
          datos.correo,
          { data: { membresia_id: invitacion.id } },
        );
        if (error) {
          if (error.code === 'email_exists' || error.status === 422)
            throw errorDeCampos({ correo: CORREO_CON_IDENTIDAD });
          // Solo el código del error: el correo es un dato personal.
          this.registro.warn(
            `Supabase rechazó una invitación (${error.status ?? '?'} ${error.code ?? ''}).`,
          );
          throw new ServiceUnavailableException(
            error.status === 429
              ? 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos e inténtalo nuevamente.'
              : 'No se pudo enviar la invitación. Inténtalo nuevamente.',
          );
        }
        return invitacion;
      },
    );
  }
}

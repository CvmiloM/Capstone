import { Controller, Get, Inject, Req } from '@nestjs/common';
import {
  ConsultaSesion,
  PerfilesPermitidos,
} from '../../common/acceso.decorator.js';
import { PERFILES } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import type { PeticionConSesion } from '../../common/sesion.guard.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  @Get('perfil')
  @PerfilesPermitidos(...PERFILES)
  perfil(@Req() peticion: PeticionConSesion) {
    return this.cuentas.operar(
      peticion.sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query(
          `SELECT p.nombres, p.apellidos, m.codigo_perfil,
          e.nombre AS escuela, e.comuna, CASE WHEN m.codigo_perfil <> 'APODERADO' THEN e.codigo END AS codigo_escuela,
          (SELECT max(anio) FROM convi.anios_academicos
            WHERE establecimiento_id = m.establecimiento_id AND estado = 'ACTIVO') AS anio_activo,
          CASE WHEN m.codigo_perfil = 'CONVIVENCIA' THEN (
            SELECT count(*)::int FROM convi.notificaciones n
            WHERE n.membresia_destinatario_id = m.id AND n.leido_en IS NULL
              AND (n.expira_en IS NULL OR n.expira_en > now())
          ) WHEN m.codigo_perfil = 'PROFESOR' THEN (
            SELECT count(*)::int FROM convi.aclaraciones_situacion a
            JOIN convi.situaciones s ON s.id = a.situacion_id
            WHERE a.profesor_destinatario_id = m.id AND a.estado = 'PENDIENTE'
              AND s.reportado_por_membresia_id = m.id
          ) ELSE 0 END AS avisos_no_leidos
          FROM convi.membresias_establecimiento m JOIN convi.personas p ON p.id = m.persona_id
          JOIN convi.establecimientos e ON e.id = m.establecimiento_id
          WHERE m.id = $1 AND m.establecimiento_id = $2`,
          [peticion.sesion.membresia_id, peticion.sesion.establecimiento_id],
        );
        return resultado.rows[0];
      },
    );
  }

  @Get('zona-horaria')
  @PerfilesPermitidos(...PERFILES)
  zonaHoraria(@Req() peticion: PeticionConSesion) {
    return this.cuentas.operar(
      peticion.sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<{ zona_horaria: string }>(
          'SELECT zona_horaria FROM convi.establecimientos WHERE id = $1',
          [peticion.sesion.establecimiento_id],
        );
        return resultado.rows[0];
      },
    );
  }

  @Get('sesion')
  @ConsultaSesion()
  consultar(@Req() peticion: PeticionConSesion) {
    const sesion = peticion.sesion;
    // PB-144: el login solo necesita perfil y segundo factor; los IDs de escuela
    // y membresía quedan en la sesión interna, no los elige ni necesita el cliente.
    return {
      codigo_perfil: sesion.codigo_perfil,
      requiere_segundo_factor: sesion.requiere_segundo_factor,
      segundo_factor_pendiente:
        sesion.requiere_segundo_factor && sesion.aal !== 'aal2',
    };
  }
}

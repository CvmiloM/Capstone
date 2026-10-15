import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Perfil, Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';

// Encabezado del portal de administración: la escuela, su año activo y el
// nombre de quien inició sesión. Todo sale de la membresía de la sesión; el
// navegador no elige la escuela ni la persona.
const PERFILES: Perfil[] = ['ADMIN'];

export type ContextoAdmin = {
  escuela: {
    nombre: string;
    codigo: string | null;
    comuna: string | null;
    /** Con ella el portal muestra las fechas (HU-021). */
    zona_horaria: string;
  };
  /** El año en estado ACTIVO más reciente, o null si no hay. */
  anio_activo: number | null;
  usuario: { nombres: string; apellidos: string };
};

type Fila = ContextoAdmin['escuela'] &
  ContextoAdmin['usuario'] & { anio_activo: number | null };

@Injectable()
export class ContextoAdminService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion): Promise<ContextoAdmin> {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: PERFILES },
      async (db) => {
        const resultado = await db.query<Fila>(
          `SELECT e.nombre, e.codigo, e.comuna, e.zona_horaria,
                  p.nombres, p.apellidos,
                  (SELECT a.anio FROM convi.anios_academicos a
                    WHERE a.estado = 'ACTIVO'
                    ORDER BY a.anio DESC LIMIT 1) AS anio_activo
           FROM convi.membresias_establecimiento m
           JOIN convi.establecimientos e ON e.id = m.establecimiento_id
           JOIN convi.personas p
             ON p.id = m.persona_id AND p.establecimiento_id = m.establecimiento_id
           WHERE m.id = $1`,
          [sesion.membresia_id],
        );
        const fila = resultado.rows[0];
        if (!fila) throw new ForbiddenException('Cuenta no disponible.');
        return {
          escuela: {
            nombre: fila.nombre,
            codigo: fila.codigo,
            comuna: fila.comuna,
            zona_horaria: fila.zona_horaria,
          },
          anio_activo: fila.anio_activo,
          usuario: { nombres: fila.nombres, apellidos: fila.apellidos },
        };
      },
    );
  }
}

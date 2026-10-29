import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  comprobarCasoHijo,
  paginaPortal,
  PARTICIPA_EN_CASO,
  REGISTROS_PORTAL,
  type RegistroPortal,
} from './portal-apoderado.js';

type EstudiantePortal = { id: string; nombre: string; codigo: string };
type CasoPortal = {
  id: string;
  codigo: string;
  titulo: string;
  estado: string;
  fecha_inicio: string;
  categoria: string | null;
};

const CAMPOS_CASO = `c.id,c.codigo,c.titulo,c.estado_actual AS estado,c.fecha_inicio::text,cat.nombre AS categoria`;
const ORIGEN_CASO = `FROM convi.casos c LEFT JOIN convi.categorias_convivencia cat ON cat.id=c.categoria_principal_id`;

async function estudiante(db: PoolClient, id: string) {
  const { rows } = await db.query<EstudiantePortal>(
    `SELECT e.id,p.nombres||' '||p.apellidos AS nombre,e.codigo_estudiante AS codigo
    FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id WHERE e.id=$1`,
    [id],
  );
  if (!rows[0]) throw new NotFoundException('El estudiante no está disponible');
  return rows[0];
}

@Injectable()
export class ApoderadoService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  listar(sesion: Sesion, consulta: Record<string, unknown>) {
    const pagina = paginaPortal(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['APODERADO'] },
      async (db) => {
        const contexto = (
          await db.query<{
            nombre: string;
            escuela: string;
            zona_horaria: string;
          }>(`SELECT p.nombres||' '||p.apellidos AS nombre,e.nombre AS escuela,e.zona_horaria
        FROM convi.membresias_establecimiento m JOIN convi.personas p ON p.id=m.persona_id
        JOIN convi.establecimientos e ON e.id=m.establecimiento_id WHERE m.id=convi.membresia_actual()`)
        ).rows[0];
        const filtro = `FROM convi.estudiantes e JOIN convi.personas p ON p.id=e.persona_id WHERE convi.puede_ver_estudiante(e.id)`;
        const total = Number(
          (
            await db.query<{ total: string }>(
              `SELECT count(*) AS total ${filtro}`,
            )
          ).rows[0].total,
        );
        const { rows } = await db.query<EstudiantePortal>(
          `SELECT e.id,p.nombres||' '||p.apellidos AS nombre,e.codigo_estudiante AS codigo ${filtro}
        ORDER BY p.apellidos,p.nombres,e.id LIMIT 50 OFFSET $1`,
          [(pagina - 1) * 50],
        );
        return {
          ...contexto,
          estudiantes: rows,
          total,
          pagina,
          por_pagina: 50,
        };
      },
    );
  }

  casos(
    sesion: Sesion,
    estudianteId: string,
    consulta: Record<string, unknown>,
  ) {
    const pagina = paginaPortal(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'estudiante', id: estudianteId, perfiles: ['APODERADO'] },
      async (db) => {
        const hijo = await estudiante(db, estudianteId);
        const total = Number(
          (
            await db.query<{ total: string }>(
              `SELECT count(*) AS total FROM convi.casos c WHERE ${PARTICIPA_EN_CASO}`,
              [estudianteId],
            )
          ).rows[0].total,
        );
        const { rows } = await db.query<CasoPortal>(
          `SELECT ${CAMPOS_CASO} ${ORIGEN_CASO} WHERE ${PARTICIPA_EN_CASO}
        ORDER BY c.fecha_inicio DESC,c.id DESC LIMIT 50 OFFSET $2`,
          [estudianteId, (pagina - 1) * 50],
        );
        return { estudiante: hijo, casos: rows, total, pagina, por_pagina: 50 };
      },
    );
  }

  detalle(
    sesion: Sesion,
    estudianteId: string,
    casoId: string,
    consulta: Record<string, unknown>,
  ) {
    const pagina = paginaPortal(consulta);
    return this.cuentas.operar(
      sesion,
      { tipo: 'caso', id: casoId, estudianteId, perfiles: ['APODERADO'] },
      async (db) => {
        await comprobarCasoHijo(db, estudianteId, casoId);
        const hijo = await estudiante(db, estudianteId);
        const caso = (
          await db.query<
            CasoPortal & { resumen: string; cerrado_en: string | null }
          >(
            `SELECT ${CAMPOS_CASO},c.resumen,c.cerrado_en ${ORIGEN_CASO} WHERE c.id=$1`,
            [casoId],
          )
        ).rows[0];
        const zona = (
          await db.query<{ zona_horaria: string }>(
            'SELECT zona_horaria FROM convi.establecimientos WHERE id=convi.establecimiento_actual()',
          )
        ).rows[0].zona_horaria;
        const total = Number(
          (
            await db.query<{ total: string }>(
              `SELECT count(*) AS total FROM (${REGISTROS_PORTAL}) r`,
              [casoId],
            )
          ).rows[0].total,
        );
        const { rows } = await db.query<RegistroPortal>(
          `SELECT id,tipo,fecha,descripcion,estado,archivo,tamano_bytes::int FROM (${REGISTROS_PORTAL}) r
        ORDER BY fecha DESC NULLS LAST,tipo,id DESC LIMIT 50 OFFSET $2`,
          [casoId, (pagina - 1) * 50],
        );
        return {
          estudiante: hijo,
          caso,
          zona_horaria: zona,
          registros: rows,
          total,
          pagina,
          por_pagina: 50,
        };
      },
    );
  }
}

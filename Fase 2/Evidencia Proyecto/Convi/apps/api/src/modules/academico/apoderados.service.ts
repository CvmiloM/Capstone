import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { errorDeCampos, texto } from './curso.js';
import { validarFinVinculo, validarVinculo } from './apoderado.js';

export type PersonaApoderada = {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string | null;
  correo: string | null;
  telefono: string | null;
};
export type VinculoApoderado = PersonaApoderada & {
  persona_apoderado_id: string;
  tipo_relacion: string | null;
  es_principal: boolean;
  puede_ser_contactado: boolean;
  activo_desde: string | null;
  activo_hasta: string | null;
  vigencia: 'VIGENTE' | 'FUTURO' | 'TERMINADO';
};

@Injectable()
export class ApoderadosService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  listar(sesion: Sesion, estudianteId: string, buscar: unknown) {
    const busqueda = texto(buscar).slice(0, 100);
    return this.operar(sesion, async (db) => {
      await this.estudiante(db, estudianteId);
      const vinculos = await db.query<VinculoApoderado>(
        `SELECT a.id, a.persona_apoderado_id, p.nombres, p.apellidos, p.rut, p.correo, p.telefono,
                a.tipo_relacion, a.es_principal, a.puede_ser_contactado,
                a.activo_desde::text, a.activo_hasta::text,
                CASE WHEN a.activo_hasta < current_date THEN 'TERMINADO'
                     WHEN a.activo_desde > current_date THEN 'FUTURO' ELSE 'VIGENTE' END AS vigencia
         FROM convi.apoderados_estudiante a JOIN convi.personas p ON p.id = a.persona_apoderado_id
         WHERE a.estudiante_id = $1 ORDER BY a.es_principal DESC, p.apellidos, p.nombres, a.id`,
        [estudianteId],
      );
      const personas =
        busqueda.length < 2
          ? []
          : (
              await db.query<PersonaApoderada>(
                `SELECT p.id, p.nombres, p.apellidos, p.rut, p.correo, p.telefono
         FROM convi.personas p
         WHERE p.estado = 'ACTIVO'
           AND NOT EXISTS (SELECT 1 FROM convi.estudiantes e WHERE e.persona_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM convi.apoderados_estudiante a WHERE a.estudiante_id = $1 AND a.persona_apoderado_id = p.id)
           AND (p.nombres || ' ' || p.apellidos ILIKE $2 OR p.rut ILIKE $2 OR p.correo ILIKE $2)
         ORDER BY p.apellidos, p.nombres, p.id LIMIT 20`,
                [estudianteId, `%${busqueda.replace(/[\\%_]/g, '\\$&')}%`],
              )
            ).rows;
      return { vinculos: vinculos.rows, personas };
    });
  }

  crear(sesion: Sesion, estudianteId: string, cuerpo: unknown) {
    const datos = validarVinculo(cuerpo);
    return this.operar(sesion, async (db) => {
      await this.estudiante(db, estudianteId);
      let personaId = datos.persona_apoderado_id;
      if (personaId) {
        const persona = await db.query(
          `SELECT p.id FROM convi.personas p WHERE p.id = $1 AND p.estado = 'ACTIVO'
           AND NOT EXISTS (SELECT 1 FROM convi.estudiantes e WHERE e.persona_id = p.id) FOR SHARE OF p`,
          [personaId],
        );
        if (!persona.rows.length)
          throw new NotFoundException(
            'No encontramos esa persona disponible en tu escuela',
          );
      } else {
        const p = datos.persona!;
        if (
          !p.rut &&
          p.correo &&
          (
            await db.query(
              'SELECT id FROM convi.personas WHERE lower(correo) = $1',
              [p.correo],
            )
          ).rows.length
        )
          throw errorDeCampos(
            {
              correo:
                'Ya hay una persona con ese correo, búscala y selecciona su ficha',
            },
            'No se guardó el vínculo',
          );
        const nueva = await db.query<{ id: string }>(
          `INSERT INTO convi.personas (establecimiento_id, nombres, apellidos, rut, correo, telefono, direccion)
           VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6) RETURNING id`,
          [p.nombres, p.apellidos, p.rut, p.correo, p.telefono, p.direccion],
        );
        personaId = nueva.rows[0].id;
      }
      // La relación no crea membresía, identidad Auth ni acceso al portal
      const vinculo = await db.query<{ id: string }>(
        `INSERT INTO convi.apoderados_estudiante
           (establecimiento_id, estudiante_id, persona_apoderado_id, tipo_relacion, es_principal, puede_ser_contactado, activo_desde, activo_hasta)
         VALUES (convi.establecimiento_actual(), $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          estudianteId,
          personaId,
          datos.tipo_relacion,
          datos.es_principal,
          datos.puede_ser_contactado,
          datos.activo_desde,
          datos.activo_hasta,
        ],
      );
      return vinculo.rows[0];
    });
  }

  terminar(sesion: Sesion, estudianteId: string, id: string, cuerpo: unknown) {
    const fecha = validarFinVinculo(cuerpo);
    return this.operar(sesion, async (db) => {
      await this.estudiante(db, estudianteId);
      const actual = (
        await db.query<{
          activo_desde: string | null;
          activo_hasta: string | null;
        }>(
          `SELECT activo_desde::text, activo_hasta::text FROM convi.apoderados_estudiante
         WHERE id = $1 AND estudiante_id = $2 FOR UPDATE`,
          [id, estudianteId],
        )
      ).rows[0];
      if (!actual)
        throw new NotFoundException(
          'No encontramos ese vínculo en el estudiante',
        );
      if (actual.activo_hasta)
        throw new ConflictException(
          'El vínculo ya tiene una fecha de término, actualiza la ficha',
        );
      if (actual.activo_desde && fecha < actual.activo_desde)
        throw errorDeCampos(
          { activo_hasta: 'El término no puede ser anterior al inicio' },
          'No se terminó el vínculo',
        );
      await db.query(
        'UPDATE convi.apoderados_estudiante SET activo_hasta = $2 WHERE id = $1',
        [id, fecha],
      );
      return { id };
    });
  }

  private async estudiante(db: PoolClient, id: string) {
    if (
      !(
        await db.query(
          'SELECT id FROM convi.estudiantes WHERE id = $1 FOR SHARE',
          [id],
        )
      ).rows.length
    )
      throw new NotFoundException(
        'No encontramos ese estudiante en tu escuela',
      );
  }

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['ADMIN'] },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          const e = error as { code?: string; constraint?: string };
          if (e.code === '23505') {
            if (e.constraint === 'personas_establecimiento_id_rut_idx')
              throw errorDeCampos(
                {
                  rut: 'Ese RUT ya está registrado, busca y selecciona a la persona existente',
                },
                'No se guardó el vínculo',
              );
            throw new ConflictException(
              'Esa persona ya está vinculada con el estudiante, actualiza la ficha',
            );
          }
          if (['40001', '40P01'].includes(e.code ?? ''))
            throw new ConflictException(
              'Los datos cambiaron mientras guardabas, actualiza la ficha e inténtalo nuevamente',
            );
          throw error;
        }
      },
    );
  }
}

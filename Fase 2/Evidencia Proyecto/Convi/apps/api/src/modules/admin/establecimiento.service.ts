import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { validarConfiguracionEscuela } from './configuracion-escuela.js';
import {
  validarCambioRbd,
  validarFichaInstitucional,
} from './ficha-institucional.js';

const ACCESO = { tipo: 'establecimiento', perfiles: ['ADMIN'] } as const;

@Injectable()
export class EstablecimientoService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  consultar(sesion: Sesion) {
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      const resultado = await db.query(
        `SELECT nombre, codigo, direccion, telefono, correo_contacto, region, comuna,
                creado_en::text, actualizado_en::text, zona_horaria, plazo_cierre_dias
         FROM convi.establecimientos WHERE id = $1`,
        [sesion.establecimiento_id],
      );
      if (!resultado.rows[0])
        throw new NotFoundException('Escuela no disponible');
      return resultado.rows[0];
    });
  }

  editarConfiguracion(
    sesion: Sesion,
    cuerpo: unknown,
  ): Promise<{ id: string }> {
    const datos = validarConfiguracionEscuela(cuerpo);
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      try {
        // Evita guardar un plazo que PostgreSQL no podrá convertir en fecha al abrir un caso.
        if (datos.plazo_cierre_dias !== null)
          await db.query('SELECT current_date + $1::int', [
            datos.plazo_cierre_dias,
          ]);
        const cambio = await db.query<{ id: string }>(
          `UPDATE convi.establecimientos
           SET zona_horaria = $1, plazo_cierre_dias = $2
           WHERE id = $3 AND actualizado_en = $4::timestamptz
             AND (zona_horaria, plazo_cierre_dias) IS DISTINCT FROM ($1::varchar, $2::int)
           RETURNING id`,
          [
            datos.zona_horaria,
            datos.plazo_cierre_dias,
            sesion.establecimiento_id,
            datos.actualizado_en,
          ],
        );
        if (cambio.rows[0]) return cambio.rows[0];
        const actual = await db.query<{ vigente: boolean }>(
          'SELECT actualizado_en = $2::timestamptz AS vigente FROM convi.establecimientos WHERE id = $1',
          [sesion.establecimiento_id, datos.actualizado_en],
        );
        if (!actual.rows[0])
          throw new NotFoundException('Escuela no disponible');
        if (actual.rows[0].vigente) return { id: sesion.establecimiento_id };
        throw new ConflictException(
          'La configuración cambió mientras la editabas, recarga la página antes de guardar',
        );
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code === '22008')
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados',
            errores: {
              plazo_cierre_dias: 'El plazo supera el rango de fechas admitido',
            },
          });
        if (code === '22023')
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados',
            errores: {
              zona_horaria:
                'Esta zona horaria no está disponible en la base de datos',
            },
          });
        if (code === '40001' || code === '40P01')
          throw new ConflictException(
            'La configuración cambió mientras la editabas, recarga la página antes de guardar',
          );
        throw error;
      }
    });
  }

  async editar(sesion: Sesion, cuerpo: unknown): Promise<{ id: string }> {
    const datos = validarFichaInstitucional(cuerpo);
    return this.cuentas.operar(sesion, ACCESO, async (db) => {
      try {
        const anterior = await db.query<{ codigo: string | null }>(
          'SELECT codigo FROM convi.establecimientos WHERE id = $1',
          [sesion.establecimiento_id],
        );
        if (!anterior.rows[0])
          throw new NotFoundException('Escuela no disponible');
        validarCambioRbd(datos.codigo, anterior.rows[0].codigo);
        // La versión conserva los microsegundos de PostgreSQL, sin convertirla a Date.
        const cambio = await db.query<{ id: string }>(
          `UPDATE convi.establecimientos
           SET codigo = $1, direccion = $2, telefono = $3, correo_contacto = $4,
               region = $5, comuna = $6
           WHERE id = $8 AND actualizado_en = $7::timestamptz
             AND (codigo, direccion, telefono, correo_contacto, region, comuna)
               IS DISTINCT FROM ($1::varchar, $2::text, $3::varchar, $4::varchar, $5::varchar, $6::varchar)
           RETURNING id`,
          [
            datos.codigo,
            datos.direccion,
            datos.telefono,
            datos.correo_contacto,
            datos.region,
            datos.comuna,
            datos.actualizado_en,
            sesion.establecimiento_id,
          ],
        );
        if (cambio.rows[0]) return cambio.rows[0];
        const actual = await db.query<{ vigente: boolean }>(
          'SELECT actualizado_en = $2::timestamptz AS vigente FROM convi.establecimientos WHERE id = $1',
          [sesion.establecimiento_id, datos.actualizado_en],
        );
        if (actual.rows[0]?.vigente) return { id: sesion.establecimiento_id };
        throw new ConflictException(
          'La ficha cambió mientras la editabas, recarga la página antes de guardar',
        );
      } catch (error) {
        const { code, constraint } = (error ?? {}) as {
          code?: string;
          constraint?: string;
        };
        if (code === '23505' && constraint === 'establecimientos_codigo_key')
          throw new BadRequestException({
            mensaje: 'Revisa los datos marcados',
            errores: {
              codigo: 'Ese RBD ya está registrado en CONVI',
            },
          });
        if (code === '40001' || code === '40P01')
          throw new ConflictException(
            'La ficha cambió mientras la editabas, recarga la página antes de guardar',
          );
        throw error;
      }
    });
  }
}

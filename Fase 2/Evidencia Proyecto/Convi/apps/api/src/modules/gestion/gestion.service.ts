import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import {
  datosAccion,
  datosActividad,
  datosCreacion,
  datosObjetivo,
  datosResultado,
  errorCampo,
  filtrosGestion,
  motivo,
  objeto,
  texto,
  tipoGestion,
  uuid,
  version,
  type TipoGestion,
} from './gestion.js';

const TABLAS = {
  planes: 'planes_gestion',
  objetivos: 'objetivos_plan_gestion',
  acciones: 'acciones_plan_gestion',
  actividades: 'actividades_plan_gestion',
} as const;
const UNIONES = {
  planes: 'JOIN convi.planes_gestion p ON p.id=t.id',
  objetivos: 'JOIN convi.planes_gestion p ON p.id=t.plan_gestion_id',
  acciones:
    'JOIN convi.objetivos_plan_gestion o ON o.id=t.objetivo_id JOIN convi.planes_gestion p ON p.id=o.plan_gestion_id',
  actividades:
    'JOIN convi.acciones_plan_gestion ac ON ac.id=t.accion_plan_id JOIN convi.objetivos_plan_gestion o ON o.id=ac.objetivo_id JOIN convi.planes_gestion p ON p.id=o.plan_gestion_id',
} as const;
const LOCAL = (p: string) =>
  `(${p}::timestamp AT TIME ZONE current_setting('TimeZone'))`;
const CERRADO = ['COMPLETADO', 'ARCHIVADO'];
type Contexto = {
  registro: Record<string, unknown>;
  version: string;
  plan_id: string;
  plan_nombre: string;
  plan_estado: string;
  anio_academico_id: string;
  anio: number;
  objetivo_id?: string;
  objetivo_titulo?: string;
  accion_id?: string;
  accion_titulo?: string;
};

// Todas las escrituras bloquean primero el plan, incluidos sus hijos y evidencias.
export async function contextoGestion(
  db: PoolClient,
  tipo: TipoGestion,
  id: string,
  bloquear = false,
): Promise<Contexto> {
  const desde = `FROM convi.${TABLAS[tipo]} t ${UNIONES[tipo]} JOIN convi.anios_academicos y ON y.id=p.anio_academico_id`;
  const columnas = `to_jsonb(t) AS registro, md5(to_jsonb(t)::text) AS version, p.id AS plan_id, p.nombre AS plan_nombre, p.estado AS plan_estado, p.anio_academico_id, y.anio
    ${tipo === 'acciones' || tipo === 'actividades' ? ', o.id AS objetivo_id, o.titulo AS objetivo_titulo' : ''}
    ${tipo === 'actividades' ? ', ac.id AS accion_id, ac.titulo AS accion_titulo' : ''}`;
  let fila = (
    await db.query<Contexto>(`SELECT ${columnas} ${desde} WHERE t.id=$1`, [id])
  ).rows[0];
  if (!fila)
    throw new NotFoundException(
      'El registro del Plan no existe o no tienes acceso.',
    );
  if (bloquear) {
    await db.query(
      'SELECT id FROM convi.planes_gestion WHERE id=$1 FOR UPDATE',
      [fila.plan_id],
    );
    fila = (
      await db.query<Contexto>(
        `SELECT ${columnas} ${desde} WHERE t.id=$1 FOR UPDATE OF t`,
        [id],
      )
    ).rows[0];
    if (!fila) throw new NotFoundException('El registro del Plan no existe.');
    if (CERRADO.includes(fila.plan_estado))
      throw new ConflictException(
        'El Plan ya terminó, sus objetivos, acciones y actividades se conservan sin cambios.',
      );
  }
  return fila;
}

@Injectable()
export class GestionService {
  constructor(@Inject(CuentaService) private readonly cuentas: CuentaService) {}

  private operar<T>(sesion: Sesion, trabajo: (db: PoolClient) => Promise<T>) {
    return this.cuentas.operar(
      sesion,
      { tipo: 'establecimiento', perfiles: ['CONVIVENCIA'] },
      async (db) => {
        try {
          return await trabajo(db);
        } catch (error) {
          const e = error as { code?: string; message?: string };
          if (e.code === '23505')
            throw new ConflictException(
              'Ya existe un registro con ese nombre, orden o vínculo, revisa lo guardado.',
            );
          if (e.code === '23503')
            throw new BadRequestException(
              'Una de las selecciones ya no está disponible.',
            );
          if (e.code === 'P0001' || e.code === '23514')
            throw new ConflictException(
              e.code === 'P0001'
                ? e.message
                : 'Los datos no cumplen las reglas del Plan.',
            );
          throw error;
        }
      },
      'READ COMMITTED',
    );
  }

  listar(sesion: Sesion, consulta: Record<string, unknown>) {
    const tipo = tipoGestion(texto(consulta, 'tipo', 20, false) ?? 'planes');
    const f = filtrosGestion(consulta),
      titulo = tipo === 'planes' ? 't.nombre' : 't.titulo';
    return this.operar(
      sesion,
      async (db) =>
        (
          await db.query(
            `WITH filas AS (
        SELECT t.id, ${titulo} AS titulo, ${tipo === 'planes' ? 'NULL::text' : 't.descripcion'} AS descripcion,
          ${tipo === 'objetivos' ? "'OBJETIVO'::text" : 't.estado'} AS estado,
          p.id AS plan_id, p.nombre AS plan_nombre, y.anio,
          ${tipo === 'objetivos' ? 't.orden' : 'NULL::int'} AS orden,
          ${tipo === 'acciones' || tipo === 'actividades' ? 'o.titulo' : 'NULL::text'} AS objetivo,
          ${tipo === 'actividades' ? 'ac.titulo' : 'NULL::text'} AS accion,
          ${tipo === 'actividades' ? `to_char(t.inicio_programado,'DD-MM-YYYY HH24:MI')` : 'NULL::text'} AS inicio_programado,
          ${tipo === 'acciones' || tipo === 'actividades' ? "pr.nombres || ' ' || pr.apellidos" : 'NULL::text'} AS responsable
        FROM convi.${TABLAS[tipo]} t ${UNIONES[tipo]}
        JOIN convi.anios_academicos y ON y.id=p.anio_academico_id
        ${tipo === 'acciones' || tipo === 'actividades' ? 'LEFT JOIN convi.personas pr ON pr.id=t.persona_responsable_id' : ''}
        WHERE ($1::int IS NULL OR y.anio=$1) AND ($2::uuid IS NULL OR p.id=$2)
          AND ($3::uuid IS NULL OR ${tipo === 'acciones' || tipo === 'actividades' ? 'o.id' : 'NULL::uuid'}=$3)
          AND ($4::uuid IS NULL OR ${tipo === 'actividades' ? 'ac.id' : 'NULL::uuid'}=$4)
          AND position(lower($5) in lower(concat_ws(' ',${titulo},${tipo === 'planes' ? 'p.nombre' : 't.descripcion'})))>0
      ) SELECT (SELECT count(*)::int FROM filas) AS total, $6::int AS pagina, 20 AS por_pagina,
        coalesce((SELECT jsonb_agg(f) FROM (SELECT * FROM filas ORDER BY orden NULLS LAST, anio DESC, titulo, id LIMIT 20 OFFSET (($6::int-1)*20)) f),'[]') AS filas`,
            [
              f.anio,
              consulta.plan_id || null,
              consulta.objetivo_id || null,
              consulta.accion_id || null,
              f.buscar,
              f.pagina,
            ],
          )
        ).rows[0],
    );
  }

  detalle(
    sesion: Sesion,
    tipoTexto: string,
    id: string,
    consulta: Record<string, unknown>,
  ) {
    const tipo = tipoGestion(tipoTexto),
      { pagina } = filtrosGestion(consulta);
    return this.operar(sesion, async (db) => {
      const c = await contextoGestion(db, tipo, id);
      const r = c.registro;
      if (tipo === 'planes' && r.aprobado_por) {
        const aprobacion = (
          await db.query(
            "SELECT p.nombres || ' ' || p.apellidos AS aprobado_por_nombre, to_char(g.aprobado_en,'DD-MM-YYYY HH24:MI') AS aprobado_fecha FROM convi.planes_gestion g JOIN convi.membresias_establecimiento m ON m.id=g.aprobado_por JOIN convi.personas p ON p.id=m.persona_id WHERE g.id=$1",
            [id],
          )
        ).rows[0];
        Object.assign(r, aprobacion);
      }
      if (tipo === 'acciones' || tipo === 'actividades') {
        const datos = (
          await db.query(
            `SELECT p.nombres || ' ' || p.apellidos AS responsable,
            to_char(t.completado_en,'YYYY-MM-DD"T"HH24:MI') AS completado_en
            ${tipo === 'actividades' ? `,to_char(t.inicio_programado,'YYYY-MM-DD"T"HH24:MI') AS inicio_programado,to_char(t.fin_programado,'YYYY-MM-DD"T"HH24:MI') AS fin_programado,to_char(t.inicio_real,'YYYY-MM-DD"T"HH24:MI') AS inicio_real,to_char(t.fin_real,'YYYY-MM-DD"T"HH24:MI') AS fin_real` : ''}
          FROM convi.${TABLAS[tipo]} t LEFT JOIN convi.personas p ON p.id=t.persona_responsable_id WHERE t.id=$1`,
            [id],
          )
        ).rows[0];
        Object.assign(r, datos);
      }
      const evidencias =
        tipo === 'acciones' || tipo === 'actividades'
          ? (
              await db.query(
                `WITH e AS (SELECT e.id,e.titulo,e.descripcion,e.tipo_evidencia AS tipo,e.creado_en,a.nombre_original AS archivo,a.tamano_bytes::int,
            per.nombres || ' ' || per.apellidos AS creado_por FROM convi.evidencias e LEFT JOIN convi.archivos a ON a.id=e.archivo_id
            JOIN convi.membresias_establecimiento m ON m.id=e.creado_por JOIN convi.personas per ON per.id=m.persona_id
            WHERE e.${tipo === 'acciones' ? 'accion_plan_id' : 'actividad_plan_id'}=$1)
          SELECT (SELECT count(*)::int FROM e) AS total,coalesce((SELECT jsonb_agg(f) FROM (SELECT * FROM e ORDER BY creado_en DESC,id LIMIT 20 OFFSET $2) f),'[]') AS filas`,
                [id, (pagina - 1) * 20],
              )
            ).rows[0]
          : { total: 0, filas: [] };
      const vinculados =
        tipo === 'actividades'
          ? {
              cursos: (
                await db.query(
                  `SELECT ca.id,c.id AS curso_id,c.nombre FROM convi.cursos_actividad ca JOIN convi.cursos c ON c.id=ca.curso_id WHERE ca.actividad_id=$1 ORDER BY c.nombre,ca.id`,
                  [id],
                )
              ).rows,
              profesionales: (
                await db.query(
                  `SELECT pa.id,pa.membresia_id,pa.funcion,p.nombres || ' ' || p.apellidos AS nombre FROM convi.profesionales_actividad pa JOIN convi.membresias_establecimiento m ON m.id=pa.membresia_id JOIN convi.personas p ON p.id=m.persona_id WHERE pa.actividad_id=$1 ORDER BY p.apellidos,p.nombres,pa.id`,
                  [id],
                )
              ).rows,
            }
          : null;
      return {
        ...c,
        siguiente_orden:
          tipo === 'planes'
            ? (
                await db.query(
                  'SELECT coalesce(max(orden),0)+1 AS orden FROM convi.objetivos_plan_gestion WHERE plan_gestion_id=$1',
                  [id],
                )
              ).rows[0].orden
            : undefined,
        editable: !CERRADO.includes(c.plan_estado),
        evidencias,
        vinculados,
        hoy: (
          await db.query(
            'SELECT to_char(now(),\'YYYY-MM-DD"T"HH24:MI\') AS hoy',
          )
        ).rows[0].hoy,
      };
    });
  }

  opciones(sesion: Sesion, consulta: Record<string, unknown>) {
    const f = filtrosGestion(consulta),
      clase = texto(consulta, 'clase', 20, false) ?? 'personas';
    if (!['personas', 'profesionales', 'cursos', 'anios'].includes(clase))
      throw new BadRequestException('La selección no existe.');
    return this.operar(sesion, async (db) => {
      let anio: string | null = null;
      if (clase === 'cursos') {
        const c = await contextoGestion(
          db,
          'actividades',
          uuid(consulta, 'actividad_id'),
        );
        anio = c.anio_academico_id;
      }
      const fuente =
        clase === 'anios'
          ? `SELECT id,anio::text AS nombre FROM convi.anios_academicos`
          : clase === 'cursos'
            ? `SELECT id,nombre FROM convi.cursos WHERE anio_academico_id=$4::uuid`
            : `SELECT ${clase === 'profesionales' ? 'm.id' : 'p.id'} AS id,p.nombres || ' ' || p.apellidos AS nombre FROM convi.membresias_establecimiento m JOIN convi.personas p ON p.id=m.persona_id WHERE m.estado='ACTIVO' AND m.codigo_perfil=ANY(${clase === 'profesionales' ? "ARRAY['PROFESOR','CONVIVENCIA']" : "ARRAY['ADMIN','PROFESOR','CONVIVENCIA']"})`;
      return (
        await db.query(
          `WITH opciones AS (${fuente}), filtradas AS (SELECT * FROM opciones WHERE position(lower($1) in lower(nombre))>0),
        pagina AS (SELECT * FROM filtradas ORDER BY nombre,id LIMIT 25 OFFSET (($2::int-1)*25))
        SELECT (SELECT count(*)::int FROM filtradas) AS total,
          coalesce((SELECT jsonb_agg(x ORDER BY nombre,id) FROM (SELECT * FROM pagina UNION SELECT * FROM opciones WHERE id=$3::uuid) x),'[]') AS filas
          ${clase === 'cursos' ? '' : 'WHERE $4::uuid IS NULL'}`,
          [f.buscar, f.pagina, consulta.seleccionado || null, anio],
        )
      ).rows[0];
    });
  }

  crear(sesion: Sesion, cuerpo: unknown) {
    const d = datosCreacion(cuerpo);
    return this.operar(sesion, async (db) => {
      // La confirmación conserva su UUID, el reintento devuelve el original sin editarlo.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        d.id,
      ]);
      const previo = (
        await db.query<{ id: string; creado_por: string }>(
          'SELECT id,creado_por FROM convi.planes_gestion WHERE id=$1',
          [d.id],
        )
      ).rows[0];
      if (previo) {
        if (previo.creado_por !== sesion.membresia_id)
          throw new ConflictException('Esta confirmación ya fue utilizada.');
        return { id: previo.id };
      }
      if (
        !(
          await db.query('SELECT 1 FROM convi.anios_academicos WHERE id=$1', [
            d.anio_academico_id,
          ])
        ).rowCount
      )
        errorCampo(
          'anio_academico_id',
          'El año no está disponible en tu escuela.',
        );
      if (d.accion) await this.responsable(db, d.accion.persona_responsable_id);
      await db.query(
        `INSERT INTO convi.planes_gestion(id,establecimiento_id,anio_academico_id,nombre,creado_por) VALUES($1,convi.establecimiento_actual(),$2,$3,convi.membresia_actual())`,
        [d.id, d.anio_academico_id, d.nombre],
      );
      if (d.objetivo && d.accion) {
        const objetivo = await this.insertarObjetivo(db, d.id, d.objetivo);
        // La guía no registra un resultado anticipado.
        await this.insertarAccion(db, objetivo.id, {
          ...d.accion,
          valor_indicador: null,
        });
      }
      return { id: d.id };
    });
  }

  agregar(sesion: Sesion, padreTipo: string, id: string, cuerpo: unknown) {
    const tipo = tipoGestion(padreTipo);
    if (tipo === 'actividades')
      throw new BadRequestException('La actividad no tiene esta operación.');
    const datos =
      tipo === 'planes'
        ? datosObjetivo(cuerpo)
        : tipo === 'objetivos'
          ? datosAccion(cuerpo)
          : datosActividad(cuerpo);
    return this.operar(sesion, async (db) => {
      const c = await contextoGestion(db, tipo, id, true);
      if (
        tipo === 'acciones' &&
        ['COMPLETADO', 'CANCELADO'].includes(String(c.registro.estado))
      )
        throw new ConflictException(
          'La acción ya terminó y no recibe nuevas actividades.',
        );
      if (tipo === 'planes')
        return this.insertarObjetivo(
          db,
          id,
          datos as ReturnType<typeof datosObjetivo>,
        );
      await this.responsable(
        db,
        (datos as ReturnType<typeof datosAccion>).persona_responsable_id,
      );
      if (tipo === 'objetivos')
        return this.insertarAccion(
          db,
          id,
          datos as ReturnType<typeof datosAccion>,
        );
      const a = datos as ReturnType<typeof datosActividad>;
      return (
        await db.query(
          `INSERT INTO convi.actividades_plan_gestion(establecimiento_id,accion_plan_id,titulo,descripcion,persona_responsable_id,inicio_programado,fin_programado,lugar,creado_por)
        VALUES(convi.establecimiento_actual(),$1,$2,$3,$4,${LOCAL('$5')},${LOCAL('$6')},$7,convi.membresia_actual()) RETURNING id`,
          [
            id,
            a.titulo,
            a.descripcion,
            a.persona_responsable_id,
            a.inicio_programado,
            a.fin_programado,
            a.lugar,
          ],
        )
      ).rows[0];
    });
  }

  editar(sesion: Sesion, tipoTexto: string, id: string, cuerpo: unknown) {
    const tipo = tipoGestion(tipoTexto),
      d = objeto(cuerpo),
      v = version(d);
    const datos =
      tipo === 'planes'
        ? {
            nombre: texto(d, 'nombre', 220)!,
            anio_academico_id: uuid(d, 'anio_academico_id'),
          }
        : tipo === 'objetivos'
          ? datosObjetivo(d)
          : tipo === 'acciones'
            ? datosAccion(d)
            : datosActividad(d);
    const razon =
      tipo === 'acciones' || tipo === 'actividades'
        ? motivo(d)
        : texto(d, 'motivo', 500, false);
    return this.operar(sesion, async (db) => {
      const c = await contextoGestion(db, tipo, id, true);
      this.comprobarVersion(c, v);
      if (tipo === 'planes' && c.plan_estado !== 'BORRADOR')
        throw new ConflictException(
          'El Plan aprobado conserva su nombre y año.',
        );
      if ('persona_responsable_id' in datos)
        await this.responsable(db, datos.persona_responsable_id);
      await this.motivo(db, razon);
      const campos = Object.keys(datos),
        valores = Object.values(datos);
      const cambios = campos.map(
        (campo, i) =>
          `${campo}=${campo === 'inicio_programado' || campo === 'fin_programado' ? LOCAL('$' + (i + 2)) : '$' + (i + 2)}`,
      );
      await db.query(
        `UPDATE convi.${TABLAS[tipo]} SET ${cambios.join(',')} WHERE id=$1`,
        [id, ...valores],
      );
      return { id };
    });
  }

  estado(sesion: Sesion, tipoTexto: string, id: string, cuerpo: unknown) {
    const tipo = tipoGestion(tipoTexto),
      d = objeto(cuerpo),
      v = version(d);
    if (tipo === 'objetivos')
      throw new BadRequestException('Los objetivos no tienen estado.');
    const resultado =
      tipo === 'planes' ? null : datosResultado(d, tipo === 'actividades');
    const nuevo = resultado?.estado ?? texto(d, 'estado', 30)!;
    return this.operar(sesion, async (db) => {
      // Un plan completado todavía puede archivarse, sus hijos permanecen protegidos.
      const c = await contextoGestion(db, tipo, id, tipo !== 'planes');
      if (tipo === 'planes') {
        await db.query(
          'SELECT id FROM convi.planes_gestion WHERE id=$1 FOR UPDATE',
          [id],
        );
        Object.assign(c, await contextoGestion(db, tipo, id));
      }
      const r = c.registro;
      // Repetir el mismo resultado no modifica ni genera otra auditoría.
      if (r.estado === nuevo) {
        if (tipo === 'planes') return { id };
        const a = resultado!;
        const mismo = (
          await db.query<{ igual: boolean }>(
            `SELECT resumen_resultado IS NOT DISTINCT FROM $2::text AND completado_en IS NOT DISTINCT FROM ${LOCAL('$3')}
          ${tipo === 'actividades' ? `AND inicio_real IS NOT DISTINCT FROM ${LOCAL('$4')} AND fin_real IS NOT DISTINCT FROM ${LOCAL('$5')}` : 'AND valor_indicador IS NOT DISTINCT FROM $4::numeric'} AS igual FROM convi.${TABLAS[tipo]} WHERE id=$1`,
            tipo === 'actividades'
              ? [
                  id,
                  a.resumen_resultado,
                  a.completado_en,
                  a.inicio_real,
                  a.fin_real,
                ]
              : [id, a.resumen_resultado, a.completado_en, a.valor_indicador],
          )
        ).rows[0];
        if (mismo.igual) return { id };
      }
      this.comprobarVersion(c, v);
      if (tipo === 'planes') {
        const transiciones: Record<string, string[]> = {
          BORRADOR: ['ACTIVO', 'ARCHIVADO'],
          ACTIVO: ['COMPLETADO', 'ARCHIVADO'],
          COMPLETADO: ['ARCHIVADO'],
          ARCHIVADO: [],
        };
        if (!transiciones[String(r.estado)]?.includes(nuevo))
          errorCampo('estado', 'Ese cambio de estado no está permitido.');
        await this.motivo(db, texto(d, 'motivo', 500, false));
        await db.query(
          `UPDATE convi.planes_gestion SET estado=$2::text,aprobado_por=CASE WHEN $2::text='ACTIVO' THEN convi.membresia_actual() ELSE aprobado_por END,
          aprobado_en=CASE WHEN $2::text='ACTIVO' THEN now() ELSE aprobado_en END WHERE id=$1`,
          [id, nuevo],
        );
      } else {
        if (r.estado === 'CANCELADO')
          throw new ConflictException(
            'El registro está cancelado y se conserva sin nuevos avances.',
          );
        const razon =
          r.estado === 'COMPLETADO' || nuevo === 'CANCELADO'
            ? motivo(d)
            : texto(d, 'motivo', 500, false);
        await this.motivo(db, razon);
        const a = resultado!;
        for (const [campo, f] of Object.entries({
          completado_en: a.completado_en,
          inicio_real: a.inicio_real,
          fin_real: a.fin_real,
        })) {
          if (
            f &&
            (
              await db.query<{ futura: boolean }>(
                `SELECT ${LOCAL('$1')}>clock_timestamp() AS futura`,
                [f],
              )
            ).rows[0].futura
          )
            errorCampo(campo, 'La fecha real no puede ser futura.');
        }
        if (
          tipo === 'acciones' &&
          a.estado === 'COMPLETADO' &&
          (
            await db.query(
              "SELECT 1 FROM convi.actividades_plan_gestion WHERE accion_plan_id=$1 AND estado NOT IN ('COMPLETADO','CANCELADO') LIMIT 1",
              [id],
            )
          ).rowCount
        )
          throw new ConflictException(
            'Completa o cancela las actividades pendientes antes de completar la acción.',
          );
        if (
          tipo === 'acciones' &&
          a.valor_indicador !== null &&
          (!r.nombre_indicador || !r.unidad_indicador)
        )
          errorCampo(
            'valor_indicador',
            'Define primero el indicador y su unidad en los datos de la acción.',
          );
        await db.query(
          `UPDATE convi.${TABLAS[tipo]} SET estado=$2,resumen_resultado=$3,completado_en=${LOCAL('$4')}
          ${tipo === 'actividades' ? `,inicio_real=${LOCAL('$5')},fin_real=${LOCAL('$6')}` : ',valor_indicador=$5'} WHERE id=$1`,
          tipo === 'actividades'
            ? [
                id,
                a.estado,
                a.resumen_resultado,
                a.completado_en,
                a.inicio_real,
                a.fin_real,
              ]
            : [
                id,
                a.estado,
                a.resumen_resultado,
                a.completado_en,
                a.valor_indicador,
              ],
        );
      }
      return { id };
    });
  }

  vincular(sesion: Sesion, id: string, clase: string, cuerpo: unknown) {
    if (!['cursos', 'profesionales'].includes(clase))
      throw new BadRequestException('El vínculo no existe.');
    const d = objeto(cuerpo),
      elegido = uuid(d, 'elegido_id'),
      funcion = clase === 'profesionales' ? texto(d, 'funcion', 120)! : null;
    return this.operar(sesion, async (db) => {
      const c = await contextoGestion(db, 'actividades', id, true);
      if (clase === 'cursos') {
        if (
          !(
            await db.query(
              'SELECT 1 FROM convi.cursos WHERE id=$1 AND anio_academico_id=$2',
              [elegido, c.anio_academico_id],
            )
          ).rowCount
        )
          errorCampo(
            'elegido_id',
            'Elige un curso del año del Plan y de tu escuela.',
          );
        await db.query(
          `INSERT INTO convi.cursos_actividad(establecimiento_id,actividad_id,curso_id) VALUES(convi.establecimiento_actual(),$1,$2) ON CONFLICT(actividad_id,curso_id) DO NOTHING`,
          [id, elegido],
        );
      } else {
        const m = await db.query(
          "SELECT 1 FROM convi.membresias_establecimiento WHERE id=$1 AND estado='ACTIVO' AND codigo_perfil IN ('PROFESOR','CONVIVENCIA') FOR SHARE",
          [elegido],
        );
        if (!m.rowCount)
          errorCampo(
            'elegido_id',
            'Elige una cuenta activa de Profesor o Convivencia de tu escuela.',
          );
        const previo = (
          await db.query<{ funcion: string }>(
            'SELECT funcion FROM convi.profesionales_actividad WHERE actividad_id=$1 AND membresia_id=$2',
            [id, elegido],
          )
        ).rows[0];
        if (previo && previo.funcion !== funcion)
          throw new ConflictException(
            'Ese profesional ya está asignado con otra función, revisa la lista de participantes.',
          );
        await db.query(
          `INSERT INTO convi.profesionales_actividad(establecimiento_id,actividad_id,membresia_id,funcion) VALUES(convi.establecimiento_actual(),$1,$2,$3) ON CONFLICT(actividad_id,membresia_id) DO NOTHING`,
          [id, elegido, funcion],
        );
      }
      return { id };
    });
  }

  private async responsable(db: PoolClient, id: string) {
    if (
      !(
        await db.query(
          "SELECT id FROM convi.membresias_establecimiento WHERE persona_id=$1 AND estado='ACTIVO' AND codigo_perfil IN ('ADMIN','PROFESOR','CONVIVENCIA') FOR SHARE",
          [id],
        )
      ).rowCount
    )
      errorCampo(
        'persona_responsable_id',
        'Elige a alguien del equipo con cuenta activa.',
      );
  }
  private async motivo(db: PoolClient, valor: string | null) {
    await db.query("SELECT set_config('app.motivo_cambio',$1,true)", [
      valor ?? '',
    ]);
  }
  private comprobarVersion(c: Contexto, v: string) {
    if (c.version !== v)
      throw new ConflictException(
        'Otra persona cambió el registro, recarga la página antes de guardar.',
      );
  }
  private async insertarObjetivo(
    db: PoolClient,
    id: string,
    d: ReturnType<typeof datosObjetivo>,
  ) {
    return (
      await db.query<{ id: string }>(
        `INSERT INTO convi.objetivos_plan_gestion(establecimiento_id,plan_gestion_id,titulo,descripcion,orden) VALUES(convi.establecimiento_actual(),$1,$2,$3,$4) RETURNING id`,
        [id, d.titulo, d.descripcion, d.orden],
      )
    ).rows[0];
  }
  private async insertarAccion(
    db: PoolClient,
    id: string,
    d: ReturnType<typeof datosAccion>,
  ) {
    return (
      await db.query<{ id: string }>(
        `INSERT INTO convi.acciones_plan_gestion(establecimiento_id,objetivo_id,titulo,descripcion,persona_responsable_id,publico_objetivo,evidencia_esperada,nombre_indicador,unidad_indicador,meta_indicador,valor_indicador)
      VALUES(convi.establecimiento_actual(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          id,
          d.titulo,
          d.descripcion,
          d.persona_responsable_id,
          d.publico_objetivo,
          d.evidencia_esperada,
          d.nombre_indicador,
          d.unidad_indicador,
          d.meta_indicador,
          d.valor_indicador,
        ],
      )
    ).rows[0];
  }
}

import pg from 'pg';
import { randomUUID } from 'node:crypto';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { GestionService } from '../gestion/gestion.service.js';
import { JornadaService } from './jornada.service.js';
import { ConvivenciaService } from './convivencia.service.js';
import type { EvaluacionReglas } from '../alertas/evaluacion.service.js';

const url = process.env.CONVI_SEGURIDAD_PG;
const aislada = url === 'postgresql://postgres@127.0.0.1:55432/postgres';
if (url && !aislada)
  throw new Error('Estas pruebas solo admiten el laboratorio desechable.');

describe.skipIf(!aislada)('AD-002, consultas y cambios con RLS real', () => {
  const base = new pg.Pool({ connectionString: url, max: 4 });
  const cuentas = new CuentaService(base);
  const gestion = new GestionService(cuentas);
  const jornada = new JornadaService(cuentas);
  const bandeja = new ConvivenciaService(cuentas, {} as EvaluacionReglas);
  let sesion: Sesion, ajena: Sesion;
  let persona: string,
    anio: string,
    plan: string,
    objetivo: string,
    accion: string,
    actividad: string;
  const otras: string[] = [];

  async function escuela() {
    const auth = randomUUID(),
      conv = randomUUID();
    await base.query(
      'INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now()),($3,$4,now())',
      [auth, `${auth}@aislada.test`, conv, `${conv}@aislada.test`],
    );
    const id = (
      await base.query(
        "SELECT convi.registrar_primer_administrador($1,'Ana','Soto',NULL,'Liceo Los Arrayanes') AS id",
        [auth],
      )
    ).rows[0].id;
    const admin = (
      await base.query(
        'SELECT id FROM convi.membresias_establecimiento WHERE auth_usuario_id=$1',
        [auth],
      )
    ).rows[0].id;
    const p = (
      await base.query(
        "INSERT INTO convi.personas(establecimiento_id,nombres,apellidos) VALUES($1,'Carolina','Morales') RETURNING id",
        [id],
      )
    ).rows[0].id;
    const m = (
      await base.query(
        "INSERT INTO convi.membresias_establecimiento(establecimiento_id,persona_id,codigo_perfil,estado,invitado_por,invitado_en,activado_en,auth_usuario_id,correo_invitacion) VALUES($1,$2,'CONVIVENCIA','ACTIVO',$3,now(),now(),$4,$5) RETURNING id",
        [id, p, admin, conv, `${conv}@aislada.test`],
      )
    ).rows[0].id;
    return {
      sesion: {
        authUsuarioId: conv,
        aal: 'aal2',
        membresia_id: m,
        establecimiento_id: id,
        codigo_perfil: 'CONVIVENCIA',
        requiere_segundo_factor: true,
      } as Sesion,
      persona: p,
    };
  }
  beforeAll(async () => {
    const primera = await escuela();
    sesion = primera.sesion;
    persona = primera.persona;
    ajena = (await escuela()).sesion;
    anio = (
      await base.query(
        "INSERT INTO convi.anios_academicos(establecimiento_id,anio,fecha_inicio,fecha_fin) VALUES($1,extract(year FROM current_date)::int,date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year - 1 day')::date) RETURNING id",
        [sesion.establecimiento_id],
      )
    ).rows[0].id;
    plan = (
      await gestion.crear(sesion, {
        id: randomUUID(),
        nombre: 'Plan de convivencia y buen trato',
        anio_academico_id: anio,
      })
    ).id;
    objetivo = (
      await gestion.agregar(sesion, 'planes', plan, {
        titulo: 'Fortalecer el buen trato',
        descripcion: 'Promover acuerdos entre estudiantes.',
      })
    ).id;
    const datosAccion = {
      titulo: 'Encuentros con las familias',
      descripcion: 'Compartir acuerdos de acompañamiento.',
      persona_responsable_id: persona,
      publico_objetivo: 'Apoderados de enseñanza media',
      evidencia_esperada: 'Registro de acuerdos',
    };
    accion = (await gestion.agregar(sesion, 'objetivos', objetivo, datosAccion))
      .id;
    actividad = (
      await gestion.agregar(sesion, 'acciones', accion, {
        titulo: 'Jornada de escucha familiar',
        descripcion: 'Conversación sobre acuerdos de curso.',
        persona_responsable_id: persona,
        inicio_programado: '2026-03-10T09:00',
        fin_programado: '2026-03-10T10:00',
        lugar: 'Biblioteca',
      })
    ).id;
    const estudiantes: string[] = [];
    for (const [nombres, apellidos, rut, codigo] of [
      ['Martina', 'Rojas Leiva', '12345678-5', 'E-001'],
      ['Diego', 'Fuentes Soto', '11111111-1', 'E-002'],
    ]) {
      const p = (
        await base.query(
          'INSERT INTO convi.personas(establecimiento_id,nombres,apellidos,rut) VALUES($1,$2,$3,$4) RETURNING id',
          [sesion.establecimiento_id, nombres, apellidos, rut],
        )
      ).rows[0].id;
      await base.query(
        'INSERT INTO convi.estudiantes(establecimiento_id,persona_id,codigo_estudiante) VALUES($1,$2,$3)',
        [sesion.establecimiento_id, p, codigo],
      );
      estudiantes.push(p);
    }
    for (let i = 0; i < 24; i++) {
      const s = (
        await base.query(
          `WITH s AS (
        INSERT INTO convi.situaciones(establecimiento_id,codigo,reportado_por_membresia_id,tipo_origen,ocurrido_en,descripcion,estado,urgencia)
        VALUES($1,$2,$3,'FUNCIONARIO',now(),'Acuerdos durante trabajo grupal',$4,$5) RETURNING id
      ) INSERT INTO convi.participaciones(establecimiento_id,persona_id,situacion_id,rol_contextual)
        SELECT $1,$6,id,'INVOLUCRADA' FROM s RETURNING situacion_id`,
          [
            sesion.establecimiento_id,
            `SIT-2026-${String(i).padStart(5, '0')}`,
            sesion.membresia_id,
            'NUEVA',
            i === 23 || i === 0 ? 'URGENTE' : 'NORMAL',
            estudiantes[i === 0 ? 0 : 1],
          ],
        )
      ).rows[0].situacion_id;
      otras.push(s);
      if (i === 23) {
        await base.query(
          "UPDATE convi.situaciones SET estado='EN_REVISION' WHERE id=$1",
          [s],
        );
        await base.query(
          "INSERT INTO convi.revisiones_convivencia(establecimiento_id,situacion_id,tipo_revision,resultado,fundamento,revisado_por) VALUES($1,$2,'DECISION','DESCARTADA','Se comprobó que correspondía a un registro duplicado.',$3)",
          [sesion.establecimiento_id, s, sesion.membresia_id],
        );
      }
    }
  }, 30000);
  afterAll(async () => {
    await base.end();
  });

  it('pagina veinte situaciones y excluye las descartadas por defecto', async () => {
    const primera = await bandeja.bandeja(sesion, undefined, undefined, {});
    const segunda = await bandeja.bandeja(sesion, undefined, undefined, {
      pagina: 2,
    });
    expect(primera.total).toBe(23);
    expect(primera.situaciones).toHaveLength(20);
    expect(segunda.situaciones).toHaveLength(3);
    expect(
      new Set([...primera.situaciones, ...segunda.situaciones].map((f) => f.id))
        .size,
    ).toBe(23);
    expect(
      (await bandeja.bandeja(sesion, 'DESCARTADA', undefined, {})).total,
    ).toBe(1);
  });
  it('combina búsqueda por nombre, RUT y código con urgencia sin incluir descartadas', async () => {
    for (const q of ['Martina', 'Rojas', '12.345.678-5', 'SIT-2026-00000']) {
      const r = await bandeja.bandeja(sesion, undefined, 'PRIORITARIA', { q });
      expect(r.total).toBe(1);
      expect(r.situaciones[0].id).toBe(otras[0]);
    }
    expect(
      (await bandeja.bandeja(sesion, undefined, undefined, { q: "%_' OR 1=1" }))
        .total,
    ).toBe(0);
  });
  it('no muestra registros de otra escuela y rechaza MFA insuficiente', async () => {
    expect((await bandeja.bandeja(ajena, undefined, undefined, {})).total).toBe(
      0,
    );
    await expect(gestion.detalle(ajena, 'planes', plan, {})).rejects.toThrow();
    await expect(jornada.leer({ ...sesion, aal: 'aal1' })).rejects.toThrow();
    await expect(
      jornada.leer({ ...sesion, establecimiento_id: ajena.establecimiento_id }),
    ).rejects.toThrow();
  });
  it('el árbol encuentra una actividad sin cargar todo el Plan y conserva sus contadores', async () => {
    const lista = await gestion.listar(sesion, {});
    expect(lista.filas[0]).toMatchObject({
      objetivos_total: 1,
      acciones_total: 1,
      actividades_total: 1,
    });
    const d = await gestion.detalle(sesion, 'planes', plan, {
      q: 'escucha familiar',
    });
    expect(d.arbol.filas[0].acciones[0].id).toBe(accion);
    const a = await gestion.detalle(sesion, 'acciones', accion, {});
    expect(a.actividades.filas[0].id).toBe(actividad);
    expect(a.actividades.total).toBe(1);
  });
  it('asigna órdenes distintos a altas simultáneas sin confiar en el orden recibido', async () => {
    const ids = await Promise.all(
      ['Participación estudiantil', 'Resolución dialogada'].map((titulo) =>
        gestion.agregar(sesion, 'planes', plan, {
          titulo,
          descripcion: 'Trabajo coordinado con los cursos.',
          orden: 999,
        }),
      ),
    );
    const filas = (
      await base.query(
        'SELECT orden FROM convi.objetivos_plan_gestion WHERE id=ANY($1::uuid[]) ORDER BY orden',
        [ids.map((r) => r.id)],
      )
    ).rows;
    expect(filas.map((f) => f.orden)).toEqual([2, 3]);
  });
  it('corrige un campo conservando los demás y rechaza la versión sustituida', async () => {
    const d = await gestion.detalle(sesion, 'acciones', accion, {});
    const datos = {
      ...d.registro,
      version: d.version,
      descripcion: 'Coordinación con las familias y los profesores jefes.',
      motivo: 'Precisar el alcance de la coordinación.',
    };
    await gestion.editar(sesion, 'acciones', accion, datos);
    await expect(
      gestion.editar(sesion, 'acciones', accion, {
        ...datos,
        descripcion: 'Edición antigua',
      }),
    ).rejects.toThrow();
    const actual = await gestion.detalle(sesion, 'acciones', accion, {});
    expect(actual.registro.descripcion).toBe(datos.descripcion);
    expect(actual.registro.titulo).toBe(d.registro.titulo);
  });
  it('calcula ejecución con actividades completadas sobre todas y protege el Plan aprobado', async () => {
    await base.query(
      "UPDATE convi.actividades_plan_gestion SET estado='COMPLETADO',inicio_real='2026-03-10 12:00Z',fin_real='2026-03-10 13:00Z',completado_en='2026-03-10 13:00Z',resumen_resultado='Se acordaron canales de comunicación.' WHERE id=$1",
      [actividad],
    );
    await gestion.agregar(sesion, 'acciones', accion, {
      titulo: 'Taller de acuerdos',
      persona_responsable_id: persona,
      inicio_programado: '2026-04-10T09:00',
      fin_programado: '2026-04-10T10:00',
    });
    const d = await gestion.detalle(sesion, 'planes', plan, {});
    await gestion.estado(sesion, 'planes', plan, {
      estado: 'ACTIVO',
      version: d.version,
    });
    const resumen = await jornada.leer(sesion);
    expect(resumen.planes[0]).toMatchObject({
      total: 2,
      completadas: 1,
      canceladas: 0,
    });
    const aprobado = await gestion.detalle(sesion, 'planes', plan, {});
    await expect(
      gestion.editar(sesion, 'planes', plan, {
        nombre: 'Cambio de nombre',
        anio_academico_id: anio,
        version: aprobado.version,
      }),
    ).rejects.toThrow();
    await gestion.estado(sesion, 'planes', plan, {
      estado: 'COMPLETADO',
      version: aprobado.version,
    });
    await expect(
      gestion.agregar(sesion, 'planes', plan, {
        titulo: 'Objetivo tardío',
        descripcion: 'No permitido.',
      }),
    ).rejects.toThrow();
  });
  it('la tarjeta de seguimientos incluye meses anteriores y coincide con su lista paginada', async () => {
    const caso = (
      await base.query(
        "INSERT INTO convi.casos(establecimiento_id,titulo,resumen,fecha_inicio,asignado_a_membresia_id,abierto_por) VALUES($1,'Acuerdos de convivencia','Acompañamiento a estudiantes',current_date,$2,$2) RETURNING id",
        [sesion.establecimiento_id, sesion.membresia_id],
      )
    ).rows[0].id;
    await base.query(
      "INSERT INTO convi.actuaciones(establecimiento_id,caso_id,tipo_actuacion,membresia_responsable_id,objetivo,programado_en,creado_por) SELECT $1,$2,'SEGUIMIENTO',$3,'Revisar acuerdos',current_date - interval '2 months' + n*interval '1 minute',$3 FROM generate_series(1,21) n",
      [sesion.establecimiento_id, caso, sesion.membresia_id],
    );
    const r = await jornada.leer(sesion),
      primera = await jornada.seguimientos(sesion, 1),
      segunda = await jornada.seguimientos(sesion, 2);
    expect(r.seguimientos).toBe(21);
    expect(primera.total).toBe(21);
    expect(primera.filas).toHaveLength(20);
    expect(segunda.filas).toHaveLength(1);
    expect((await jornada.seguimientos(ajena, 1)).total).toBe(0);
    expect(() => jornada.seguimientos(sesion, '0')).toThrow();
  });
});

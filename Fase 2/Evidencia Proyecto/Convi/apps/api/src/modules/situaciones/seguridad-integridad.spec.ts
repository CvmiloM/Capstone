import pg, { type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { Sesion } from '../../common/sesion.js';
import { CuentaService } from '../../database/cuenta.service.js';
import { BorradoresService } from '../orientacion/borradores.service.js';
import { CasosService } from './casos.service.js';
import { ConvivenciaService } from './convivencia.service.js';
import type { EvaluacionReglas } from '../alertas/evaluacion.service.js';
import { CorreosService } from './correos.service.js';
import { ErrorEnvio } from './envio-correo.js';
import { CuentasService } from '../cuentas/cuentas.service.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Solo el laboratorio desechable, sin puertos publicados ni datos de Convi.
const url = process.env.CONVI_SEGURIDAD_PG;
const laboratorio = url === 'postgresql://postgres@127.0.0.1:55432/postgres';
if (url && !laboratorio) throw new Error('La prueba exige la base aislada de seguridad.');

describe.skipIf(!laboratorio)('integridad con dos conexiones reales', () => {
  const base = new pg.Pool({ connectionString: url, max: 6 });
  let sesion: Sesion;
  let sesionAdmin: Sesion;
  let escuela: string;
  let versionProtocolo: string;
  let personaEstudiante: string;

  beforeAll(async () => {
    const adminAuth = randomUUID();
    const convAuth = randomUUID();
    await base.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ($1,$2,now()),($3,$4,now())',
      [adminAuth, `${adminAuth}@integridad.test`, convAuth, `${convAuth}@integridad.test`]);
    escuela = (await base.query('SELECT convi.registrar_primer_administrador($1,$2,$3,NULL,$4) AS id',
      [adminAuth, 'Ana', 'Soto', 'Escuela Integridad'])).rows[0].id;
    const admin = (await base.query('SELECT id FROM convi.membresias_establecimiento WHERE auth_usuario_id=$1', [adminAuth])).rows[0].id;
    sesionAdmin = { authUsuarioId: adminAuth, aal: 'aal2', membresia_id: admin,
      establecimiento_id: escuela, codigo_perfil: 'ADMIN', requiere_segundo_factor: true };
    const persona = (await base.query('INSERT INTO convi.personas(establecimiento_id,nombres,apellidos) VALUES ($1,$2,$3) RETURNING id',
      [escuela, 'Carolina', 'Morales'])).rows[0].id;
    const membresia = (await base.query(`INSERT INTO convi.membresias_establecimiento
      (establecimiento_id,persona_id,codigo_perfil,estado,invitado_por,invitado_en,activado_en,auth_usuario_id,correo_invitacion)
      VALUES ($1,$2,'CONVIVENCIA','ACTIVO',$3,now(),now(),$4,$5) RETURNING id`,
    [escuela, persona, admin, convAuth, `${convAuth}@integridad.test`])).rows[0].id;
    sesion = { authUsuarioId: convAuth, aal: 'aal2', membresia_id: membresia,
      establecimiento_id: escuela, codigo_perfil: 'CONVIVENCIA', requiere_segundo_factor: true };
    personaEstudiante = (await base.query(`INSERT INTO convi.personas(establecimiento_id,nombres,apellidos)
      VALUES ($1,'Martina','Rojas') RETURNING id`, [escuela])).rows[0].id;
    await base.query('INSERT INTO convi.estudiantes(establecimiento_id,persona_id,codigo_estudiante) VALUES ($1,$2,$3)',
      [escuela, personaEstudiante, 'E-001']);
    const archivo = (await base.query(`INSERT INTO convi.archivos
      (establecimiento_id,clave_almacenamiento,nombre_original,tipo_mime,tamano_bytes,sha256,subido_por)
      VALUES ($1,$2,'reglamento.pdf','application/pdf',1000,$3,$4) RETURNING id`,
    [escuela, `${escuela}/documentos/reglamento.pdf`, 'a'.repeat(64), membresia])).rows[0].id;
    const documento = (await base.query(`INSERT INTO convi.documentos_institucionales
      (establecimiento_id,tipo_documento,titulo) VALUES ($1,'RICE','Reglamento interno') RETURNING id`, [escuela])).rows[0].id;
    const fuente = (await base.query(`INSERT INTO convi.versiones_documento
      (establecimiento_id,documento_id,etiqueta_version,archivo_id,subido_por)
      VALUES ($1,$2,'2026',$3,$4) RETURNING id`, [escuela, documento, archivo, membresia])).rows[0].id;
    await base.query(`UPDATE convi.versiones_documento SET estado='PUBLICADO',publicado_en=now(),vigente_desde=current_date WHERE id=$1`, [fuente]);
    const protocolo = (await base.query('INSERT INTO convi.protocolos(establecimiento_id,codigo,nombre) VALUES ($1,$2,$3) RETURNING id',
      [escuela, `P-${randomUUID().slice(0, 8)}`, 'Acuerdos de convivencia'])).rows[0].id;
    versionProtocolo = (await base.query('INSERT INTO convi.versiones_protocolo(establecimiento_id,protocolo_id,numero_version,creado_por,version_documento_origen_id) VALUES ($1,$2,1,$3,$4) RETURNING id',
      [escuela, protocolo, membresia, fuente])).rows[0].id;
    await base.query('INSERT INTO convi.pasos_protocolo(establecimiento_id,version_protocolo_id,orden_paso,nombre) VALUES ($1,$2,1,$3)',
      [escuela, versionProtocolo, 'Revisar antecedentes']);
    await base.query(`UPDATE convi.versiones_protocolo SET estado='PUBLICADO',revisado_por=$2,publicado_en=now(),vigente_desde=current_date WHERE id=$1`,
      [versionProtocolo, membresia]);
  });
  afterAll(async () => { await base.end(); });

  async function caso() {
    return (await base.query(`INSERT INTO convi.casos(establecimiento_id,titulo,resumen,fecha_inicio,asignado_a_membresia_id,abierto_por)
      VALUES ($1,'Acuerdos de curso','Revisión de acuerdos entre estudiantes',current_date,$2,$2) RETURNING id`,
    [escuela, sesion.membresia_id])).rows[0].id as string;
  }

  // La barrera detiene la primera operación dentro de su transacción. La segunda
  // debe alcanzar la sección crítica o quedar esperando un bloqueo real de PG.
  async function simultaneas<T>(
    pausa: RegExp,
    ejecutar: (cuentas: CuentaService, segundo: boolean) => Promise<T>,
  ) {
    let llego!: () => void;
    let liberar!: () => void;
    const detenido = new Promise<void>(r => { llego = r; });
    const continuar = new Promise<void>(r => { liberar = r; });
    let segundaAvanzo = false;
    const crear = (segundo: boolean) => new CuentaService({
      connect: async () => {
        const cliente = await base.connect();
        await cliente.query('SELECT set_config($1,$2,false)', ['application_name', segundo ? 'integridad-segunda' : 'integridad-primera']);
        let detenidoUnaVez = false;
        return new Proxy(cliente, {
          get(target, propiedad) {
            if (propiedad !== 'query') {
              const valor = Reflect.get(target, propiedad);
              return typeof valor === 'function' ? valor.bind(target) : valor;
            }
            return async (...args: Parameters<PoolClient['query']>) => {
              const texto = typeof args[0] === 'string' ? args[0] : '';
              const resultado = await (target.query as Function).apply(target, args);
              if (pausa.test(texto)) {
                if (segundo) segundaAvanzo = true;
                else if (!detenidoUnaVez) {
                  detenidoUnaVez = true;
                  llego();
                  await continuar;
                }
              }
              return resultado;
            };
          },
        });
      },
    } as unknown as pg.Pool);
    const primera = ejecutar(crear(false), false);
    // Adjuntar capturador inmediatamente evita rechazos sin observador.
    const primeraSegura = primera.then(valor => ({ ok: true as const, valor }), error => ({ ok: false as const, error }));
    const limite = new Promise<never>((_, reject) => {
      const reloj = setTimeout(() => reject(new Error('No se alcanzó la barrera')), 6000);
      reloj.unref();
    });
    let segundaSegura: Promise<{ ok: true; valor: T } | { ok: false; error: unknown }> | undefined;
    try {
      await Promise.race([detenido, limite, primeraSegura.then(r => { throw r.ok ? new Error('No se alcanzó la sección crítica') : r.error; })]);
      segundaSegura = ejecutar(crear(true), true).then(valor => ({ ok: true as const, valor }), error => ({ ok: false as const, error }));
      const hasta = Date.now() + 5000;
      while (!segundaAvanzo) {
        const esperando = await base.query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity
          WHERE application_name='integridad-segunda' AND wait_event_type='Lock') AS espera`);
        if (esperando.rows[0].espera) break;
        if (Date.now() > hasta) throw new Error('La segunda conexión no llegó a la operación');
        await new Promise(r => setTimeout(r, 15));
      }
    } finally { liberar(); }
    return Promise.all([primeraSegura, segundaSegura!]);
  }

  it('conserva una sola aplicación activa del protocolo y sus pasos', async () => {
    const id = await caso();
    const resultados = await simultaneas(/SELECT 1 FROM convi\.protocolos_caso/, cuentas =>
      new CasosService(cuentas).aplicarProtocolo(sesion, id, {
        version_protocolo_id: versionProtocolo, fundamento: 'Aplicar los pasos para revisar acuerdos',
      }));
    expect(resultados.filter(r => r.ok)).toHaveLength(1);
    expect(resultados.find(r => !r.ok)).toMatchObject({ error: { status: 409 } });
    const total = await base.query(`SELECT count(*)::int AS aplicaciones,
      (SELECT count(*)::int FROM convi.estados_pasos_protocolo_caso ep JOIN convi.protocolos_caso p ON p.id=ep.protocolo_caso_id WHERE p.caso_id=$1) AS pasos
      FROM convi.protocolos_caso WHERE caso_id=$1 AND estado='ACTIVO'`, [id]);
    expect(total.rows[0]).toEqual({ aplicaciones: 1, pasos: 1 });
    await expect(new CasosService(new CuentaService(base)).aplicarProtocolo(sesion, id, {
      version_protocolo_id: versionProtocolo, fundamento: 'Revisar acuerdos nuevamente',
    })).rejects.toMatchObject({ status: 400, response: { errores: {
      version_protocolo_id: 'Este protocolo ya está aplicado y activo en el caso.',
    } } });
  });

  it('rechaza revisar el borrador sustituido mientras se esperaba el bloqueo', async () => {
    const id = await caso();
    const solicitud = (await base.query(`INSERT INTO convi.registros_solicitudes_ia(establecimiento_id,membresia_id,caso_id,codigo_proposito)
      VALUES ($1,$2,$3,'BORRADOR_INFORME') RETURNING id`, [escuela, sesion.membresia_id, id])).rows[0].id;
    await base.query(`UPDATE convi.registros_solicitudes_ia SET estado='COMPLETADO',completado_en=now() WHERE id=$1`, [solicitud]);
    const borrador = (await base.query(`INSERT INTO convi.borradores_documentales_ia
      (establecimiento_id,tipo_borrador,caso_id,solicitud_ia_id,titulo,contenido,creado_por)
      VALUES ($1,'INFORME',$2,$3,'Resumen','Acuerdos iniciales',$4) RETURNING id,md5(to_jsonb(borradores_documentales_ia)::text) AS version`,
    [escuela, id, solicitud, sesion.membresia_id])).rows[0];
    const listado = await new BorradoresService(new CuentaService(base)).listar(sesion, id);
    borrador.version = listado.borradores.find(b => b.id === borrador.id)!.version;
    const resultados = await simultaneas(/INSERT INTO convi\.borradores_documentales_ia/, (cuentas, segundo) => {
      const servicio = new BorradoresService(cuentas);
      return segundo ? servicio.revisar(sesion, borrador.id, { version: borrador.version, estado_nuevo: 'REVISADO' })
        : servicio.editar(sesion, borrador.id, { version: borrador.version, titulo: 'Resumen actualizado', contenido: 'Acuerdos ampliados' });
    });
    expect(resultados[0].ok).toBe(true);
    expect(resultados[1].ok).toBe(false);
    expect(resultados[1]).toMatchObject({ error: { status: 409 } });
    expect((await base.query('SELECT estado FROM convi.borradores_documentales_ia WHERE id=$1', [borrador.id])).rows[0].estado).toBe('BORRADOR');
    const servicio = new BorradoresService(new CuentaService(base));
    const vigente = (await servicio.listar(sesion, id)).borradores.find(b => b.id !== borrador.id)!;
    await expect(servicio.revisar(sesion, vigente.id, { version: vigente.version, estado_nuevo: 'REVISADO' })).resolves.toMatchObject({ id: vigente.id });
  });

  it('rechaza decidir sin la consulta normativa guardada mientras esperaba', async () => {
    const preparacion = await base.connect();
    let id: string;
    try {
      await preparacion.query('BEGIN');
      id = (await preparacion.query(`INSERT INTO convi.situaciones
      (establecimiento_id,reportado_por_membresia_id,tipo_origen,ocurrido_en,descripcion)
      VALUES ($1,$2,'FUNCIONARIO',now(),'Antecedentes para acordar medidas de acompañamiento') RETURNING id`,
      [escuela, sesion.membresia_id])).rows[0].id;
      await preparacion.query(`INSERT INTO convi.participaciones(establecimiento_id,persona_id,situacion_id,rol_contextual)
        VALUES ($1,$2,$3,'AFECTADO')`, [escuela, personaEstudiante, id]);
      await preparacion.query(`UPDATE convi.situaciones SET estado='EN_REVISION' WHERE id=$1`, [id]);
      await preparacion.query('COMMIT');
    } catch (error) { await preparacion.query('ROLLBACK'); throw error; }
    finally { preparacion.release(); }
    const resultados = await simultaneas(/INSERT INTO convi\.revisiones_convivencia/, (cuentas, segundo) => {
      const servicio = new ConvivenciaService(cuentas, {} as EvaluacionReglas);
      return segundo ? servicio.registrarDecision(sesion, id, { resultado: 'ANTECEDENTE', fundamento: 'Conservar antecedentes revisados', revision_anterior_id: null })
        : servicio.registrarRevisionNormativa(sesion, id, { aplicabilidad: 'POR_CONFIRMAR', fundamento: 'Revisar con el equipo la normativa aplicable', referencias: [] });
    });
    expect(resultados[0].ok).toBe(true);
    expect(resultados[1].ok).toBe(false);
    expect(resultados[1]).toMatchObject({ error: { status: 409 } });
    expect((await base.query('SELECT estado FROM convi.situaciones WHERE id=$1', [id])).rows[0].estado).toBe('EN_REVISION');
    const revision = (await base.query('SELECT id FROM convi.revisiones_convivencia WHERE situacion_id=$1 ORDER BY revisado_en DESC,id DESC LIMIT 1', [id])).rows[0].id;
    await expect(new ConvivenciaService(new CuentaService(base), {} as EvaluacionReglas).registrarDecision(sesion, id, {
      resultado: 'ANTECEDENTE', fundamento: 'Conservar antecedentes con la revisión vigente', revision_anterior_id: revision,
    })).resolves.toMatchObject({ estado: 'ANTECEDENTE' });
  });

  it('mantiene MFA y aislamiento de escuela en la operación protegida', async () => {
    const id = await caso();
    const servicio = new CasosService(new CuentaService(base));
    const datos = { version_protocolo_id: versionProtocolo, fundamento: 'Revisar antecedentes' };
    await expect(servicio.aplicarProtocolo({ ...sesion, aal: 'aal1' }, id, datos)).rejects.toMatchObject({ status: 403 });
    await expect(servicio.aplicarProtocolo({ ...sesion, establecimiento_id: randomUUID() }, id, datos)).rejects.toMatchObject({ status: 403 });
  });

  async function correo(entregar: ConstructorParameters<typeof CorreosService>[1], cuentas = new CuentaService(base)) {
    const servicio = new CorreosService(cuentas, entregar, vi.fn());
    const idCaso = await caso();
    const { id } = await servicio.crear(sesion, idCaso, { direccion: 'familia@integridad.test', asunto: 'Reunión de acuerdos', contenido: 'Les invitamos a revisar los acuerdos del curso.' });
    return { servicio, id, clave_envio: randomUUID() };
  }

  it('confirma la reserva antes del envío y una repetición no lo duplica', async () => {
    let id: string;
    const entregar = vi.fn(async () => {
      expect((await base.query('SELECT estado_entrega FROM convi.comunicaciones WHERE id=$1', [id])).rows[0].estado_entrega).toBe('PENDIENTE');
      return { referencia: 'brevo:ficticia' };
    });
    const preparado = await correo(entregar);
    id = preparado.id;
    const solicitud = { clave_envio: preparado.clave_envio };
    expect(await preparado.servicio.enviar(sesion, id, solicitud)).toMatchObject({ estado: 'ENVIADO' });
    expect(await preparado.servicio.enviar(sesion, id, solicitud)).toMatchObject({ estado: 'ENVIADO' });
    expect(entregar).toHaveBeenCalledTimes(1);
    expect(entregar).toHaveBeenCalledWith(expect.objectContaining({ claveIdempotencia: preparado.clave_envio }));
  });

  it('no reenvía tras un resultado incierto del proveedor', async () => {
    const entregar = vi.fn().mockRejectedValue(new ErrorEnvio('SIN_RESPUESTA'));
    const { servicio, id, clave_envio } = await correo(entregar);
    await expect(servicio.enviar(sesion, id, { clave_envio })).rejects.toMatchObject({ status: 409 });
    expect(await servicio.enviar(sesion, id, { clave_envio })).toMatchObject({ estado: 'PENDIENTE' });
    expect(entregar).toHaveBeenCalledTimes(1);
  });

  it('conserva la reserva aunque falle guardar la referencia del envío aceptado', async () => {
    const cuentas = new CuentaService({ connect: async () => {
      const cliente = await base.connect();
      return new Proxy(cliente, { get(target, propiedad) {
        if (propiedad === 'query') return (...args: Parameters<PoolClient['query']>) => {
          if (String(args[0]).includes("SET estado_entrega = 'ENVIADO'")) throw new Error('Fallo simulado al guardar');
          return Reflect.apply(target.query.bind(target), target, args);
        };
        const valor = Reflect.get(target, propiedad);
        return typeof valor === 'function' ? valor.bind(target) : valor;
      } });
    } } as unknown as pg.Pool);
    const entregar = vi.fn().mockResolvedValue({ referencia: 'brevo:ficticia' });
    const { servicio, id, clave_envio } = await correo(entregar, cuentas);
    await expect(servicio.enviar(sesion, id, { clave_envio })).rejects.toMatchObject({ status: 503 });
    expect(await servicio.enviar(sesion, id, { clave_envio })).toMatchObject({ estado: 'PENDIENTE' });
    expect(entregar).toHaveBeenCalledTimes(1);
  });

  it('solo un rechazo inequívoco permite corregir y reintentar el borrador', async () => {
    const entregar = vi.fn().mockRejectedValueOnce(new ErrorEnvio('RECHAZADO')).mockResolvedValue({ referencia: 'brevo:corregido' });
    const { servicio, id, clave_envio } = await correo(entregar);
    await expect(servicio.enviar(sesion, id, { clave_envio })).rejects.toMatchObject({ status: 409 });
    expect((await base.query('SELECT estado_entrega,clave_envio FROM convi.comunicaciones WHERE id=$1', [id])).rows[0]).toEqual({ estado_entrega: 'BORRADOR', clave_envio: null });
    expect(await servicio.enviar(sesion, id, { clave_envio })).toMatchObject({ estado: 'ENVIADO' });
  });

  it('la invitación siempre encuentra su membresía ya confirmada, incluso si Auth falla', async () => {
    const invitar = vi.fn(async (_correo: string, opciones: { data: { membresia_id: string } }) => {
      expect((await base.query('SELECT estado FROM convi.membresias_establecimiento WHERE id=$1', [opciones.data.membresia_id])).rows[0].estado).toBe('PENDIENTE');
      return { error: { status: 503 } };
    });
    const servicio = new CuentasService(new CuentaService(base), { auth: { admin: { inviteUserByEmail: invitar } } } as unknown as SupabaseClient);
    const direccion = `${randomUUID()}@integridad.test`;
    await expect(servicio.invitar(sesionAdmin, { nombres: 'Daniel', apellidos: 'Fuentes', correo: direccion, perfil: 'PROFESOR' })).rejects.toMatchObject({ status: 503 });
    const pendiente = (await base.query('SELECT id,estado FROM convi.membresias_establecimiento WHERE correo_invitacion=$1', [direccion])).rows[0];
    expect(pendiente.estado).toBe('PENDIENTE');
    invitar.mockResolvedValue({ error: null } as never);
    const solicitud_id = randomUUID();
    await servicio.reenviar(sesionAdmin, pendiente.id, { solicitud_id });
    await servicio.reenviar(sesionAdmin, pendiente.id, { solicitud_id });
    expect(invitar).toHaveBeenCalledTimes(2);
  });
});

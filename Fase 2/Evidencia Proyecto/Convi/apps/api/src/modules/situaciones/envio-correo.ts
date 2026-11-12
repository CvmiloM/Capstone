// PB-087 (HU-076): el servicio que entrega el correo al apoderado. En la nube
// es Brevo, con BREVO_API_KEY y un remitente verificado (CORREO_REMITENTE); en
// local es Mailpit, el buzón de pruebas de Supabase (CORREO_MAILPIT_URL), donde
// nada sale a internet. Sin ninguno, el envío no está configurado y no se manda
// nada. Solo usa fetch: no agrega dependencias.

export const ENVIO_CORREO = Symbol('ENVIO_CORREO');

export type CorreoSaliente = {
  para: string;
  nombrePara: string | null;
  asunto: string;
  /** El contenido tal cual quedó guardado, en texto. */
  texto: string;
  /** Nombre que ve el apoderado como remitente: el de la escuela. */
  nombreRemitente: string;
  /** Correo de contacto de la escuela, para que las respuestas lleguen ahí. */
  responderA: string | null;
  /** Misma confirmación en el proveedor, incluso si se pierde su respuesta. */
  claveIdempotencia?: string;
};

/** Entrega el correo y devuelve la referencia del proveedor, o lanza ErrorEnvio. */
export type EnviarCorreo = (
  correo: CorreoSaliente,
) => Promise<{ referencia: string }>;

export type MotivoErrorEnvio =
  'NO_CONFIGURADO' | 'NO_PERMITIDO' | 'RECHAZADO' | 'SIN_RESPUESTA';

export class ErrorEnvio extends Error {
  constructor(readonly motivo: MotivoErrorEnvio) {
    super(`Envío de correo: ${motivo}`);
  }
}

export type ConfiguracionCorreo = {
  proveedor: 'BREVO' | 'MAILPIT' | null;
  url: string | null;
  clave: string | null;
  remitente: string | null;
  /**
   * Correos o dominios (@escuela.cl) a los que se puede enviar, para probar en
   * la nube solo con el equipo. Vacío: todos.
   */
  permitidos: string[];
};

const URL_BREVO = 'https://api.brevo.com/v3/smtp/email';
const ESPERA_MS = 15000;

export function leerConfiguracion(
  env: Record<string, string | undefined>,
): ConfiguracionCorreo {
  const clave = env.BREVO_API_KEY?.trim() || null;
  const mailpit = env.CORREO_MAILPIT_URL?.trim().replace(/\/+$/, '') || null;
  return {
    proveedor: clave ? 'BREVO' : mailpit ? 'MAILPIT' : null,
    url: clave ? URL_BREVO : mailpit ? `${mailpit}/api/v1/send` : null,
    clave,
    remitente: env.CORREO_REMITENTE?.trim() || null,
    permitidos: (env.CORREO_DESTINOS_PERMITIDOS ?? '')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function destinoPermitido(direccion: string, permitidos: string[]) {
  if (permitidos.length === 0) return true;
  const correo = direccion.trim().toLowerCase();
  return permitidos.some((p) =>
    p.startsWith('@') ? correo.endsWith(p) : correo === p,
  );
}

/** Lo que espera cada proveedor: Brevo (API v3) o Mailpit (API de envío). */
function cuerpoDe(
  proveedor: 'BREVO' | 'MAILPIT',
  remitente: string,
  c: CorreoSaliente,
) {
  if (proveedor === 'BREVO')
    return {
      sender: { email: remitente, name: c.nombreRemitente },
      to: [{ email: c.para, ...(c.nombrePara ? { name: c.nombrePara } : {}) }],
      ...(c.responderA ? { replyTo: { email: c.responderA } } : {}),
      subject: c.asunto,
      textContent: c.texto,
      ...(c.claveIdempotencia ? { headers: { idempotencyKey: c.claveIdempotencia } } : {}),
    };
  return {
    From: { Email: remitente, Name: c.nombreRemitente },
    To: [{ Email: c.para, Name: c.nombrePara ?? '' }],
    ReplyTo: c.responderA ? [{ Email: c.responderA }] : [],
    Subject: c.asunto,
    Text: c.texto,
  };
}

export function crearEnvioCorreo(
  config: ConfiguracionCorreo,
  pedir: typeof fetch = fetch,
): EnviarCorreo {
  return async (correo) => {
    const { proveedor, url, clave, remitente, permitidos } = config;
    if (!proveedor || !url || !remitente)
      throw new ErrorEnvio('NO_CONFIGURADO');
    if (!destinoPermitido(correo.para, permitidos))
      throw new ErrorEnvio('NO_PERMITIDO');
    let respuesta: Response;
    try {
      respuesta = await pedir(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(proveedor === 'BREVO' && clave ? { 'api-key': clave } : {}),
        },
        body: JSON.stringify(cuerpoDe(proveedor, remitente, correo)),
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new ErrorEnvio('SIN_RESPUESTA');
    }
    const datos = (await respuesta.json().catch(() => null)) as {
      messageId?: unknown;
      ID?: unknown;
      code?: unknown;
    } | null;
    const id = proveedor === 'BREVO' ? datos?.messageId : datos?.ID;
    if (respuesta.status >= 500 || respuesta.status === 408 || respuesta.status === 409
      || datos?.code === 'duplicate_parameter' || (respuesta.ok && (typeof id !== 'string' || !id)))
      throw new ErrorEnvio('SIN_RESPUESTA');
    if (!respuesta.ok || typeof id !== 'string' || !id)
      throw new ErrorEnvio('RECHAZADO');
    // PB-088 consulta el estado con el proveedor de la referencia.
    return { referencia: `${proveedor.toLowerCase()}:${id}`.slice(0, 220) };
  };
}

// PB-088 (HU-077): el estado de entrega lo informa el mismo servicio que
// envió, buscando por la referencia guardada. La API de Azure es interna y no
// recibe los avisos de Brevo, así que se le pregunta; Brevo guarda los
// eventos de los últimos 90 días.

export const CONSULTA_ENTREGA = Symbol('CONSULTA_ENTREGA');

export type EstadoEntrega = 'ENVIADO' | 'ENTREGADO' | 'REBOTADO' | 'FALLIDO';

/** ENVIADO: el servicio aún no confirma nada. El detalle explica un rebote o un fallo. */
export type ResultadoEntrega = {
  estado: EstadoEntrega;
  detalle: string | null;
};

/** Pregunta el estado por la referencia del envío, o lanza ErrorEnvio. */
export type ConsultarEntrega = (
  referencia: string,
) => Promise<ResultadoEntrega>;

/** Un evento de GET /v3/smtp/statistics/events de Brevo. */
export type EventoBrevo = { event?: unknown; date?: unknown; reason?: unknown };

const URL_EVENTOS_BREVO = 'https://api.brevo.com/v3/smtp/statistics/events';
const LARGO_DETALLE = 500;

function conMotivo(texto: string, motivo: string | null) {
  return (motivo ? `${texto}. Motivo informado: ${motivo}` : `${texto}.`).slice(
    0,
    LARGO_DETALLE,
  );
}

/**
 * Qué significa cada evento de Brevo para la entrega. Los demás (en espera,
 * abierto, clic, spam...) no la cambian.
 */
const SENTIDO_EVENTO = new Map<
  string,
  (motivo: string | null) => ResultadoEntrega
>([
  ['delivered', () => ({ estado: 'ENTREGADO', detalle: null })],
  [
    'hardBounces',
    (m) => ({
      estado: 'REBOTADO',
      detalle: conMotivo(
        'Rebote permanente: el servidor del destinatario rechazó el correo',
        m,
      ),
    }),
  ],
  [
    'bounces',
    (m) => ({
      estado: 'REBOTADO',
      detalle: conMotivo('El servidor del destinatario rechazó el correo', m),
    }),
  ],
  [
    'softBounces',
    (m) => ({
      estado: 'REBOTADO',
      detalle: conMotivo(
        'Rebote temporal: el servidor del destinatario no lo recibió por ahora y Brevo lo reintenta',
        m,
      ),
    }),
  ],
  [
    'blocked',
    () => ({
      estado: 'FALLIDO',
      detalle:
        'Brevo bloqueó el envío a esta dirección, por ejemplo por rebotes o reclamos anteriores.',
    }),
  ],
  [
    'invalid',
    () => ({
      estado: 'FALLIDO',
      detalle: 'Brevo indicó que la dirección no es válida.',
    }),
  ],
  [
    'error',
    () => ({
      estado: 'FALLIDO',
      detalle: 'Brevo informó un error al enviar el correo.',
    }),
  ],
]);

/**
 * HU-077: vale el evento de entrega más reciente. Solo un aviso de entrega
 * deja el correo Entregado (CA2): sin eventos de entrega sigue Enviado, y si
 * un aviso de entrega y un rebote llegan a la misma hora, gana el rebote.
 */
export function estadoDesdeEventos(eventos: EventoBrevo[]): ResultadoEntrega {
  let ultimo: { fecha: number; resultado: ResultadoEntrega } | null = null;
  for (const evento of eventos) {
    const sentido =
      typeof evento.event === 'string'
        ? SENTIDO_EVENTO.get(evento.event)
        : undefined;
    const fecha =
      typeof evento.date === 'string' ? Date.parse(evento.date) : Number.NaN;
    if (!sentido || Number.isNaN(fecha)) continue;
    const motivo =
      typeof evento.reason === 'string' && evento.reason.trim()
        ? evento.reason.trim()
        : null;
    const resultado = sentido(motivo);
    if (
      ultimo &&
      (fecha < ultimo.fecha ||
        (fecha === ultimo.fecha && resultado.estado === 'ENTREGADO'))
    )
      continue;
    ultimo = { fecha, resultado };
  }
  return ultimo?.resultado ?? { estado: 'ENVIADO', detalle: null };
}

export function crearConsultaEntrega(
  config: ConfiguracionCorreo,
  pedir: typeof fetch = fetch,
): ConsultarEntrega {
  return async (referencia) => {
    const separador = referencia.indexOf(':');
    const prefijo = referencia.slice(0, separador);
    const id = referencia.slice(separador + 1);
    const { proveedor, url, clave } = config;
    // Solo responde el servicio que envió: un correo de Mailpit no se busca en Brevo.
    if (
      !proveedor ||
      !url ||
      separador < 1 ||
      !id ||
      prefijo !== proveedor.toLowerCase()
    )
      throw new ErrorEnvio('NO_CONFIGURADO');
    const direccion =
      proveedor === 'BREVO'
        ? `${URL_EVENTOS_BREVO}?${new URLSearchParams({
            messageId: id,
            days: '90',
            limit: '100',
            sort: 'desc',
          })}`
        : `${url.replace(/\/send$/, '')}/message/${encodeURIComponent(id)}`;
    let respuesta: Response;
    try {
      respuesta = await pedir(direccion, {
        headers: {
          accept: 'application/json',
          ...(proveedor === 'BREVO' && clave ? { 'api-key': clave } : {}),
        },
        signal: AbortSignal.timeout(ESPERA_MS),
      });
    } catch {
      throw new ErrorEnvio('SIN_RESPUESTA');
    }
    if (proveedor === 'MAILPIT') {
      // Mailpit guarda todo lo que recibe y nunca rebota: si tiene el mensaje,
      // llegó. Si ya no lo tiene (se borró el buzón), no hay nada que decir.
      if (respuesta.ok) return { estado: 'ENTREGADO', detalle: null };
      if (respuesta.status === 404) return { estado: 'ENVIADO', detalle: null };
      throw new ErrorEnvio('RECHAZADO');
    }
    const datos = (await respuesta.json().catch(() => null)) as {
      events?: unknown;
    } | null;
    if (!respuesta.ok || !datos) throw new ErrorEnvio('RECHAZADO');
    return estadoDesdeEventos(
      Array.isArray(datos.events) ? (datos.events as EventoBrevo[]) : [],
    );
  };
}

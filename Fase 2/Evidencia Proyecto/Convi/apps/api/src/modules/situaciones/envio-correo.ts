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
    } | null;
    const id = proveedor === 'BREVO' ? datos?.messageId : datos?.ID;
    if (!respuesta.ok || typeof id !== 'string' || !id)
      throw new ErrorEnvio('RECHAZADO');
    // PB-088 consulta el estado con el proveedor de la referencia.
    return { referencia: `${proveedor.toLowerCase()}:${id}`.slice(0, 220) };
  };
}

import {
  crearEnvioCorreo,
  destinoPermitido,
  ErrorEnvio,
  leerConfiguracion,
  type CorreoSaliente,
} from './envio-correo.js';

// PB-087 (HU-076): cómo se elige el servicio de correo y qué se le pide. El
// envío con confirmación y sin duplicados se prueba contra la base local.

const correo: CorreoSaliente = {
  para: 'apoderada@familia.test',
  nombrePara: 'Ana Rojas',
  asunto: 'Citación a reunión',
  texto: 'Estimada Ana:\nLa esperamos el lunes.',
  nombreRemitente: 'Escuela Sur',
  responderA: 'convivencia@escuela.test',
};

function respuesta(status: number, datos: unknown) {
  return new Response(JSON.stringify(datos), { status });
}

describe('Servicio de correo (PB-087, HU-076)', () => {
  it('usa Brevo si hay clave, si no Mailpit, y si no ninguno', () => {
    expect(
      leerConfiguracion({
        BREVO_API_KEY: ' xkeysib ',
        CORREO_MAILPIT_URL: 'http://mailpit:54324',
        CORREO_REMITENTE: 'convi@escuela.test',
      }),
    ).toMatchObject({
      proveedor: 'BREVO',
      url: 'https://api.brevo.com/v3/smtp/email',
      clave: 'xkeysib',
    });
    expect(
      leerConfiguracion({ CORREO_MAILPIT_URL: 'http://mailpit:54324/' }),
    ).toMatchObject({
      proveedor: 'MAILPIT',
      url: 'http://mailpit:54324/api/v1/send',
      remitente: null,
    });
    expect(leerConfiguracion({})).toMatchObject({ proveedor: null, url: null });
  });

  it('la lista de permitidos acepta correos y dominios, y vacía deja todos', () => {
    const permitidos = leerConfiguracion({
      CORREO_DESTINOS_PERMITIDOS: 'Equipo@Convi.test, @familia.test',
    }).permitidos;
    expect(permitidos).toEqual(['equipo@convi.test', '@familia.test']);
    expect(destinoPermitido('equipo@convi.test', permitidos)).toBe(true);
    expect(destinoPermitido('ANA@familia.test', permitidos)).toBe(true);
    expect(destinoPermitido('otro@gmail.com', permitidos)).toBe(false);
    expect(destinoPermitido('otro@gmail.com', [])).toBe(true);
  });

  it('a Mailpit le manda el texto tal cual y guarda su referencia', async () => {
    const pedir = vi.fn().mockResolvedValue(respuesta(200, { ID: 'abc123' }));
    const enviar = crearEnvioCorreo(
      leerConfiguracion({
        CORREO_MAILPIT_URL: 'http://mailpit:54324',
        CORREO_REMITENTE: 'convi@escuela.test',
      }),
      pedir,
    );
    expect(await enviar(correo)).toEqual({ referencia: 'mailpit:abc123' });
    const [url, opciones] = pedir.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://mailpit:54324/api/v1/send');
    expect(JSON.parse(opciones.body as string)).toEqual({
      From: { Email: 'convi@escuela.test', Name: 'Escuela Sur' },
      To: [{ Email: 'apoderada@familia.test', Name: 'Ana Rojas' }],
      ReplyTo: [{ Email: 'convivencia@escuela.test' }],
      Subject: 'Citación a reunión',
      Text: 'Estimada Ana:\nLa esperamos el lunes.',
    });
  });

  it('a Brevo le manda la clave en la cabecera y su formato', async () => {
    const pedir = vi
      .fn()
      .mockResolvedValue(respuesta(201, { messageId: '<id@smtp-relay>' }));
    const enviar = crearEnvioCorreo(
      leerConfiguracion({
        BREVO_API_KEY: 'clave-ficticia',
        CORREO_REMITENTE: 'convi@escuela.test',
      }),
      pedir,
    );
    expect(await enviar({ ...correo, responderA: null })).toEqual({
      referencia: 'brevo:<id@smtp-relay>',
    });
    const [, opciones] = pedir.mock.calls[0] as [string, RequestInit];
    expect(opciones.headers).toMatchObject({ 'api-key': 'clave-ficticia' });
    expect(JSON.parse(opciones.body as string)).toEqual({
      sender: { email: 'convi@escuela.test', name: 'Escuela Sur' },
      to: [{ email: 'apoderada@familia.test', name: 'Ana Rojas' }],
      subject: 'Citación a reunión',
      textContent: 'Estimada Ana:\nLa esperamos el lunes.',
    });
  });

  it('no envía sin configuración ni a destinos no permitidos', async () => {
    const pedir = vi.fn();
    const motivo = async (env: Record<string, string>) =>
      crearEnvioCorreo(
        leerConfiguracion(env),
        pedir,
      )(correo).catch((error: ErrorEnvio) => error.motivo);
    expect(await motivo({})).toBe('NO_CONFIGURADO');
    expect(await motivo({ CORREO_MAILPIT_URL: 'http://mailpit:54324' })).toBe(
      'NO_CONFIGURADO',
    );
    expect(
      await motivo({
        CORREO_MAILPIT_URL: 'http://mailpit:54324',
        CORREO_REMITENTE: 'convi@escuela.test',
        CORREO_DESTINOS_PERMITIDOS: '@convi.test',
      }),
    ).toBe('NO_PERMITIDO');
    expect(pedir).not.toHaveBeenCalled();
  });

  it('distingue un rechazo del proveedor de una falta de respuesta', async () => {
    const env = {
      CORREO_MAILPIT_URL: 'http://mailpit:54324',
      CORREO_REMITENTE: 'convi@escuela.test',
    };
    const motivo = (pedir: typeof fetch) =>
      crearEnvioCorreo(
        leerConfiguracion(env),
        pedir,
      )(correo).catch((error: ErrorEnvio) => error.motivo);
    expect(
      await motivo(vi.fn().mockResolvedValue(respuesta(400, { Error: 'x' }))),
    ).toBe('RECHAZADO');
    expect(await motivo(vi.fn().mockResolvedValue(respuesta(200, {})))).toBe(
      'RECHAZADO',
    );
    expect(await motivo(vi.fn().mockRejectedValue(new Error('red')))).toBe(
      'SIN_RESPUESTA',
    );
  });
});

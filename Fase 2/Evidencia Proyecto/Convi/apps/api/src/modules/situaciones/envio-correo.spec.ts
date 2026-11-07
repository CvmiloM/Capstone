import {
  crearConsultaEntrega,
  crearEnvioCorreo,
  destinoPermitido,
  ErrorEnvio,
  estadoDesdeEventos,
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

// PB-088 (HU-077): qué estado queda según lo que informa el servicio de correo.
describe('Estado de entrega (PB-088, HU-077)', () => {
  const evento = (event: string, date: string, reason?: string) => ({
    event,
    date,
    email: 'apoderada@familia.test',
    messageId: '<id@smtp-relay>',
    ...(reason ? { reason } : {}),
  });

  it('solo un aviso de entrega deja el correo Entregado (CA2)', () => {
    expect(estadoDesdeEventos([])).toEqual({
      estado: 'ENVIADO',
      detalle: null,
    });
    expect(
      estadoDesdeEventos([
        evento('requests', '2026-11-06T10:00:00Z'),
        evento('deferred', '2026-11-06T10:01:00Z'),
        evento('opened', '2026-11-06T10:02:00Z'),
        evento('constructor', '2026-11-06T10:03:00Z'),
      ]),
    ).toEqual({ estado: 'ENVIADO', detalle: null });
    expect(
      estadoDesdeEventos([
        evento('requests', '2026-11-06T10:00:00Z'),
        evento('delivered', '2026-11-06T10:00:05Z'),
      ]),
    ).toEqual({ estado: 'ENTREGADO', detalle: null });
  });

  it('un rebote o un fallo guardan el detalle, y vale lo más reciente (CA3)', () => {
    expect(
      estadoDesdeEventos([
        evento('hardBounces', '2026-11-06T10:05:00Z', '550 5.1.1 User unknown'),
        evento('delivered', '2026-11-06T10:00:00Z'),
      ]),
    ).toEqual({
      estado: 'REBOTADO',
      detalle:
        'Rebote permanente: el servidor del destinatario rechazó el correo. Motivo informado: 550 5.1.1 User unknown',
    });
    // Un rebote temporal se reintenta y puede terminar entregado.
    expect(
      estadoDesdeEventos([
        evento('delivered', '2026-11-06T11:00:00Z'),
        evento('softBounces', '2026-11-06T10:00:00Z', 'Mailbox full'),
      ]).estado,
    ).toBe('ENTREGADO');
    expect(
      estadoDesdeEventos([
        evento('softBounces', '2026-11-06T10:00:00Z', 'Mailbox full'),
      ]).detalle,
    ).toMatch(
      /^Rebote temporal: .*Brevo lo reintenta\. Motivo informado: Mailbox full$/,
    );
    expect(
      estadoDesdeEventos([evento('blocked', '2026-11-06T10:00:00Z')]),
    ).toEqual({
      estado: 'FALLIDO',
      detalle:
        'Brevo bloqueó el envío a esta dirección, por ejemplo por rebotes o reclamos anteriores.',
    });
    // A la misma hora, el rebote gana: no se informa una entrega dudosa.
    expect(
      estadoDesdeEventos([
        evento('delivered', '2026-11-06T10:00:00Z'),
        evento('bounces', '2026-11-06T10:00:00Z'),
      ]).estado,
    ).toBe('REBOTADO');
    expect(
      estadoDesdeEventos([
        evento('hardBounces', '2026-11-06T10:00:00Z', 'x'.repeat(900)),
      ]).detalle,
    ).toHaveLength(500);
  });

  it('a Brevo le pregunta por la referencia, con la clave en la cabecera', async () => {
    const pedir = vi.fn().mockResolvedValue(
      respuesta(200, {
        events: [evento('delivered', '2026-11-06T10:00:05Z')],
      }),
    );
    const consultar = crearConsultaEntrega(
      leerConfiguracion({ BREVO_API_KEY: 'clave-ficticia' }),
      pedir,
    );
    expect(await consultar('brevo:<id@smtp-relay>')).toEqual({
      estado: 'ENTREGADO',
      detalle: null,
    });
    const [url, opciones] = pedir.mock.calls[0] as [string, RequestInit];
    const pedido = new URL(url);
    expect(pedido.origin + pedido.pathname).toBe(
      'https://api.brevo.com/v3/smtp/statistics/events',
    );
    expect(pedido.searchParams.get('messageId')).toBe('<id@smtp-relay>');
    expect(pedido.searchParams.get('days')).toBe('90');
    expect(opciones.headers).toMatchObject({ 'api-key': 'clave-ficticia' });
    expect(opciones.method).toBeUndefined();
    // Sin eventos todavía: sigue Enviado.
    pedir.mockResolvedValue(respuesta(200, {}));
    expect(await consultar('brevo:<id@smtp-relay>')).toEqual({
      estado: 'ENVIADO',
      detalle: null,
    });
  });

  it('en local, el mensaje en Mailpit cuenta como entregado', async () => {
    const pedir = vi.fn().mockResolvedValue(respuesta(200, { ID: 'abc123' }));
    const consultar = crearConsultaEntrega(
      leerConfiguracion({ CORREO_MAILPIT_URL: 'http://mailpit:54324' }),
      pedir,
    );
    expect(await consultar('mailpit:abc123')).toEqual({
      estado: 'ENTREGADO',
      detalle: null,
    });
    expect(pedir.mock.calls[0][0]).toBe(
      'http://mailpit:54324/api/v1/message/abc123',
    );
    pedir.mockResolvedValue(respuesta(404, {}));
    expect((await consultar('mailpit:abc123')).estado).toBe('ENVIADO');
  });

  it('no consulta a otro servicio y distingue rechazo de falta de respuesta', async () => {
    const motivo = (
      env: Record<string, string>,
      pedir: typeof fetch,
      ref: string,
    ) =>
      crearConsultaEntrega(
        leerConfiguracion(env),
        pedir,
      )(ref).catch((error: ErrorEnvio) => error.motivo);
    const nunca = vi.fn();
    const brevo = { BREVO_API_KEY: 'clave-ficticia' };
    expect(await motivo({}, nunca, 'brevo:<id>')).toBe('NO_CONFIGURADO');
    expect(await motivo(brevo, nunca, 'mailpit:abc123')).toBe('NO_CONFIGURADO');
    expect(await motivo(brevo, nunca, 'sin-prefijo')).toBe('NO_CONFIGURADO');
    expect(nunca).not.toHaveBeenCalled();
    expect(
      await motivo(
        brevo,
        vi.fn().mockResolvedValue(respuesta(401, { code: 'unauthorized' })),
        'brevo:<id>',
      ),
    ).toBe('RECHAZADO');
    expect(
      await motivo(
        brevo,
        vi.fn().mockRejectedValue(new Error('red')),
        'brevo:<id>',
      ),
    ).toBe('SIN_RESPUESTA');
  });
});

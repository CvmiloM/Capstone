import {
  armarIcs,
  codigoValido,
  type EventoSuscrito,
  huellaCodigo,
  leerOrigen,
  nuevoCodigo,
  tituloEvento,
} from './suscripcion.js';

// Refinamientos de Convivencia, sección 5: el enlace privado del calendario y
// el archivo que recibe Google Calendar.

const evento = (cambios: Partial<EventoSuscrito> = {}): EventoSuscrito => ({
  tipo: 'ACTUACION',
  origen_id: '11111111-1111-4111-8111-111111111111',
  caso_id: '22222222-2222-4222-8222-222222222222',
  caso_codigo: 'CAS-00012',
  tipo_actuacion: 'SEGUIMIENTO',
  estado: 'PLANIFICADA',
  inicio: '2026-11-12T13:00:00+00:00',
  fin: null,
  dia: '2026-11-12',
  ...cambios,
});

const ahora = new Date('2026-11-11T20:00:00Z');

describe('Código del enlace del calendario', () => {
  it('es largo, al azar y la huella no lo contiene', () => {
    const a = nuevoCodigo();
    const b = nuevoCodigo();
    expect(codigoValido(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(huellaCodigo(a)).toHaveLength(32);
    expect(huellaCodigo(a).equals(huellaCodigo(a))).toBe(true);
    expect(huellaCodigo(a).toString('hex')).not.toContain(a);
  });

  it.each([
    '',
    'corto',
    'x'.repeat(44),
    `${'a'.repeat(42)}=`,
    `${'a'.repeat(42)}/`,
    5,
    null,
  ])('rechaza el código %s', (codigo) => {
    expect(codigoValido(codigo)).toBe(false);
  });

  it('solo acepta un origen http o https', () => {
    expect(leerOrigen('https://convi.cl/algo?x=1')).toBe('https://convi.cl');
    expect(leerOrigen('http://localhost:3000')).toBe('http://localhost:3000');
    expect(leerOrigen('javascript:alert(1)')).toBeNull();
    expect(leerOrigen('no es url')).toBeNull();
    expect(leerOrigen(undefined)).toBeNull();
  });
});

describe('Archivo .ics para Google Calendar', () => {
  it('los títulos no llevan nombres ni descripciones', () => {
    expect(tituloEvento(evento())).toBe('Seguimiento del caso CAS-00012');
    expect(
      tituloEvento(evento({ tipo_actuacion: 'REUNION', estado: 'REALIZADA' })),
    ).toBe('Reunión del caso CAS-00012 (realizado)');
    expect(
      tituloEvento(evento({ tipo: 'COMPROMISO', tipo_actuacion: null })),
    ).toBe('Vence un compromiso del caso CAS-00012');
    expect(
      tituloEvento(
        evento({ tipo: 'PLAN_GESTION', caso_id: null, caso_codigo: null }),
      ),
    ).toBe('Actividad del Plan de Gestión');
  });

  it('arma un calendario válido con hora o de día completo', () => {
    const ics = armarIcs({
      eventos: [
        evento(),
        evento({
          tipo: 'COMPROMISO',
          tipo_actuacion: null,
          origen_id: '33333333-3333-4333-8333-333333333333',
          inicio: '2026-11-20T02:59:00+00:00',
          dia: '2026-11-19',
        }),
      ],
      zonaHoraria: 'America/Santiago',
      origen: 'https://convi.cl',
      ahora,
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l) <= 75)).toBe(
      true,
    );
    const plano = ics.replace(/\r\n /g, '');
    expect(plano).toContain(
      'UID:ACTUACION-11111111-1111-4111-8111-111111111111@convi',
    );
    expect(plano).toContain('DTSTART:20261112T130000Z');
    // Sin hora de término se reserva una hora.
    expect(plano).toContain('DTEND:20261112T140000Z');
    // El compromiso vence el 19 en Santiago aunque en UTC ya sea el 20.
    expect(plano).toContain('DTSTART;VALUE=DATE:20261119');
    expect(plano).toContain('DTEND;VALUE=DATE:20261120');
    expect(plano).toContain(
      'URL:https://convi.cl/convivencia/casos/22222222-2222-4222-8222-222222222222?seccion=seguimientos#seguimiento-11111111-1111-4111-8111-111111111111',
    );
    expect(plano).toContain('DTSTAMP:20261111T200000Z');
    expect(plano.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('escapa el texto y omite fechas que no sirven', () => {
    const ics = armarIcs({
      eventos: [
        evento({ caso_codigo: 'A,B;C' }),
        evento({ inicio: 'no', dia: '2026-11-12' }),
      ],
      zonaHoraria: 'America/Santiago',
      origen: null,
      ahora,
    });
    const plano = ics.replace(/\r\n /g, '');
    expect(plano).toContain('SUMMARY:Seguimiento del caso A\\,B\\;C');
    expect(plano).not.toContain('URL:');
    expect(plano.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

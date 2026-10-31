import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  cargadorDeSeccion,
  leerSeccionCaso,
  type DatosCaso,
  type SeccionCaso,
} from './seccion-caso.js';

// La ficha del caso pide solo lo que muestra cada pestaña. Estas pruebas
// revisan qué grupos de datos se consultan en cada una.

const GRUPOS: DatosCaso[] = [
  'situaciones_vinculadas',
  'evidencias',
  'protocolos_aplicados',
  'normativa',
  'estado',
  'plan',
  'fechas',
  'compromisos_seguimientos',
  'actuaciones_origen',
  'encuentros',
  'personas_encuentro',
  'acciones_encuentro',
  'responsables_paso',
];

// Grupos que llegan a consultar la base con la sección indicada.
async function consultados(seccion: SeccionCaso | undefined) {
  const cargar = cargadorDeSeccion(seccion);
  const usados: DatosCaso[] = [];
  for (const grupo of GRUPOS) {
    const consulta = vi.fn(() => Promise.resolve('dato'));
    const valor = await cargar(grupo, consulta, 'vacío');
    if (consulta.mock.calls.length > 0) {
      expect(valor).toBe('dato');
      usados.push(grupo);
    } else {
      expect(valor).toBe('vacío');
    }
  }
  return usados;
}

describe('leerSeccionCaso', () => {
  it('sin sección devuelve undefined para cargar todo', () => {
    expect(leerSeccionCaso(undefined)).toBeUndefined();
  });

  it('acepta las pestañas de la ficha', () => {
    expect(leerSeccionCaso('plan')).toBe('plan');
    expect(leerSeccionCaso('estado')).toBe('estado');
  });

  it('rechaza una sección desconocida o repetida', () => {
    expect(() => leerSeccionCaso('otra')).toThrow(BadRequestException);
    expect(() => leerSeccionCaso(['plan', 'ia'])).toThrow(BadRequestException);
  });
});

describe('cargadorDeSeccion', () => {
  it('sin sección consulta todos los grupos, como antes', async () => {
    expect(await consultados(undefined)).toEqual(GRUPOS);
  });

  it('Orientación IA e Historial solo usan la cabecera', async () => {
    expect(await consultados('ia')).toEqual([]);
    expect(await consultados('historial')).toEqual([]);
  });

  it('el resumen consulta situaciones, evidencias, protocolos y compromisos', async () => {
    expect(await consultados('resumen')).toEqual([
      'situaciones_vinculadas',
      'evidencias',
      'protocolos_aplicados',
      'compromisos_seguimientos',
    ]);
  });

  it('el plan consulta sus planes, los protocolos aplicados y la fecha de hoy', async () => {
    expect(await consultados('plan')).toEqual([
      'protocolos_aplicados',
      'plan',
      'fechas',
    ]);
  });

  it('encuentros consulta sus opciones, incluidas las acciones del plan', async () => {
    expect(await consultados('encuentros')).toEqual([
      'fechas',
      'encuentros',
      'personas_encuentro',
      'acciones_encuentro',
    ]);
  });

  it('compromisos y seguimientos comparten datos y no piden las acciones del plan', async () => {
    const esperados = [
      'fechas',
      'compromisos_seguimientos',
      'actuaciones_origen',
      'personas_encuentro',
    ];
    expect(await consultados('compromisos')).toEqual(esperados);
    expect(await consultados('seguimientos')).toEqual(esperados);
  });

  it('protocolo consulta sus pasos, la normativa y los responsables posibles', async () => {
    expect(await consultados('protocolo')).toEqual([
      'protocolos_aplicados',
      'normativa',
      'fechas',
      'responsables_paso',
    ]);
  });

  it('estado consulta solo su grupo', async () => {
    expect(await consultados('estado')).toEqual(['estado']);
  });
});

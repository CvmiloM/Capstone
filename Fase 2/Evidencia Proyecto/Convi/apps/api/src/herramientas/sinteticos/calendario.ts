// PB-159: fechas del generador en la hora local de la escuela, sin zona
// horaria. Un día es la cantidad de días desde 1970-01-01 y un momento la
// cantidad de minutos; la base los convierte con la zona de la escuela
// (America/Santiago) al guardarlos.

const MINUTOS_DIA = 24 * 60;

/** Día a partir de AAAA-MM-DD. */
export function diaDe(texto: string): number {
  const [anio, mes, dia] = texto.split('-').map(Number);
  return Math.round(Date.UTC(anio, mes - 1, dia) / 86_400_000);
}

/** AAAA-MM-DD de un día. */
export function textoDia(dia: number): string {
  return new Date(dia * 86_400_000).toISOString().slice(0, 10);
}

export function momento(dia: number, hora: number, minuto = 0): number {
  return dia * MINUTOS_DIA + hora * 60 + minuto;
}

/** AAAA-MM-DD HH:MM:SS de un momento, en la hora local de la escuela. */
export function textoMomento(minutos: number): string {
  return new Date(minutos * 60_000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
}

export function diaDeMomento(minutos: number): number {
  return Math.floor(minutos / MINUTOS_DIA);
}

/** 0 domingo, 1 lunes, …, 6 sábado. */
export function diaSemana(dia: number): number {
  return new Date(dia * 86_400_000).getUTCDay();
}

export function anioDe(dia: number): number {
  return new Date(dia * 86_400_000).getUTCFullYear();
}

export function mesDe(dia: number): number {
  return new Date(dia * 86_400_000).getUTCMonth() + 1;
}

export type AnioEscolar = {
  anio: number;
  inicio: number;
  fin: number;
  /** Primer y último día de las vacaciones de invierno. */
  invierno: [number, number];
  feriados: Set<number>;
  estado: 'CERRADO' | 'ACTIVO';
};

const feriados = (...dias: string[]) => new Set(dias.map(diaDe));

/**
 * Tres años escolares de historia: 2024 y 2025 cerrados y 2026 activo, con
 * las vacaciones de invierno y los feriados que caen en días de clases.
 */
export const ANIOS_ESCOLARES: readonly AnioEscolar[] = [
  {
    anio: 2024,
    inicio: diaDe('2024-03-04'),
    fin: diaDe('2024-12-13'),
    invierno: [diaDe('2024-06-24'), diaDe('2024-07-05')],
    feriados: feriados(
      '2024-03-29',
      '2024-05-01',
      '2024-05-21',
      '2024-06-20',
      '2024-07-16',
      '2024-08-15',
      '2024-09-18',
      '2024-09-19',
      '2024-09-20',
      '2024-10-31',
      '2024-11-01',
    ),
    estado: 'CERRADO',
  },
  {
    anio: 2025,
    inicio: diaDe('2025-03-03'),
    fin: diaDe('2025-12-12'),
    invierno: [diaDe('2025-06-23'), diaDe('2025-07-04')],
    feriados: feriados(
      '2025-04-18',
      '2025-05-01',
      '2025-05-21',
      '2025-06-20',
      '2025-07-16',
      '2025-08-15',
      '2025-09-18',
      '2025-09-19',
      '2025-10-31',
    ),
    estado: 'CERRADO',
  },
  {
    anio: 2026,
    inicio: diaDe('2026-03-02'),
    fin: diaDe('2026-12-11'),
    invierno: [diaDe('2026-06-22'), diaDe('2026-07-03')],
    feriados: feriados(
      '2026-04-03',
      '2026-05-01',
      '2026-05-21',
      '2026-07-16',
      '2026-09-18',
      '2026-10-12',
    ),
    estado: 'ACTIVO',
  },
];

/** Último momento de la historia: nada se registra después. */
export const FECHA_CORTE = '2026-10-23';
export const MOMENTO_CORTE = momento(diaDe(FECHA_CORTE), 18, 0);

export function esDiaDeClases(anio: AnioEscolar, dia: number): boolean {
  const semana = diaSemana(dia);
  return (
    dia >= anio.inicio &&
    dia <= anio.fin &&
    semana >= 1 &&
    semana <= 5 &&
    !(dia >= anio.invierno[0] && dia <= anio.invierno[1]) &&
    !anio.feriados.has(dia)
  );
}

/** El mismo día si es hábil (lunes a viernes) o el lunes siguiente. */
export function diaHabil(dia: number): number {
  const semana = diaSemana(dia);
  if (semana === 6) return dia + 2;
  if (semana === 0) return dia + 1;
  return dia;
}

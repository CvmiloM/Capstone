import { conCapacidadIA, leerTextoIA } from './capacidad-ia.js';

it('encola las llamadas en orden y no permite adelantarse a las que esperan', async () => {
  const inicios: string[] = [];
  const liberar: (() => void)[] = [];
  const pedir = (nombre: string) => conCapacidadIA(async () => {
    inicios.push(nombre);
    await new Promise<void>(resolve => { liberar.push(resolve); });
    return nombre;
  });
  const activas = Array.from({ length: 4 }, (_, i) => pedir(`activa-${i}`));
  const primera = pedir('primera');
  const segunda = pedir('segunda');
  expect(inicios).toHaveLength(4);
  liberar[0]();
  await activas[0];
  const tercera = pedir('tercera');
  expect(inicios.slice(4)).toEqual(['primera']);
  liberar[1]();
  await activas[1];
  expect(inicios.slice(4)).toEqual(['primera', 'segunda']);
  liberar[2]();
  await activas[2];
  expect(inicios.slice(4)).toEqual(['primera', 'segunda', 'tercera']);
  liberar.forEach(resolve => resolve());
  await Promise.all([...activas, primera, segunda, tercera]);
});

it('acota la cola y libera todos los cupos tras terminar o fallar', async () => {
  let soltar!: () => void;
  const espera = new Promise<void>(r => { soltar = r; });
  const activas = Array.from({ length: 4 }, () => conCapacidadIA(() => espera));
  const fallo = expect(conCapacidadIA(async () => { throw new Error('Fallo en cola'); })).rejects.toThrow('Fallo en cola');
  const pendientes = Array.from({ length: 19 }, () => conCapacidadIA(async () => 'lista'));
  try { await expect(conCapacidadIA(async () => 'extra')).rejects.toThrow('completa'); }
  finally { soltar(); await Promise.all([...activas, ...pendientes, fallo]); }
  await expect(conCapacidadIA(async () => { throw new Error('Fallo simulado'); })).rejects.toThrow('Fallo simulado');
  await expect(conCapacidadIA(async () => 'disponible')).resolves.toBe('disponible');
});

it('retira una espera vencida sin ejecutar su llamada después', async () => {
  vi.useFakeTimers();
  let soltar!: () => void;
  const espera = new Promise<void>(resolve => { soltar = resolve; });
  const activas = Array.from({ length: 4 }, () => conCapacidadIA(() => espera));
  const trabajo = vi.fn(async () => 'vencida');
  const pendiente = conCapacidadIA(trabajo);
  const vencimiento = expect(pendiente).rejects.toThrow('tiempo de espera');
  try {
    await vi.advanceTimersByTimeAsync(20_000);
    await vencimiento;
    const siguiente = conCapacidadIA(async () => 'siguiente');
    soltar();
    expect(await siguiente).toBe('siguiente');
    expect(trabajo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    soltar();
    await Promise.all(activas);
    vi.useRealTimers();
  }
});

it('cancela al superar bytes reales y conserva texto UTF-8', async () => {
  await expect(leerTextoIA(new Response('Sofía'), 6)).resolves.toBe('Sofía');
  const cancelar = vi.fn();
  const flujo = new ReadableStream({ pull(control) { control.enqueue(new Uint8Array(16)); }, cancel: cancelar });
  await expect(leerTextoIA(new Response(flujo), 8)).rejects.toThrow('tamaño');
  expect(cancelar).toHaveBeenCalledOnce();
});

import { leerBusquedaBandeja } from './bandeja.js';

it('normaliza un RUT y conserva el texto para buscar código o nombre', () => {
  expect(leerBusquedaBandeja({ q: ' 18.624.973-4 ', pagina: '2' })).toEqual({
    buscar: '18.624.973-4',
    rut: '186249734',
    pagina: 2,
  });
  expect(leerBusquedaBandeja({ q: 'Martina Rojas' }).rut).toBeNull();
  expect(leerBusquedaBandeja()).toEqual({ buscar: '', rut: null, pagina: 1 });
});
it.each([
  { pagina: 0 },
  { pagina: '1.5' },
  { pagina: 10001 },
  { q: ['Martina'] },
  { q: 'a'.repeat(121) },
  { q: 'hola\n' },
])('rechaza entradas inválidas %j', (entrada) => {
  expect(() => leerBusquedaBandeja(entrada)).toThrow('Revisa la búsqueda');
});

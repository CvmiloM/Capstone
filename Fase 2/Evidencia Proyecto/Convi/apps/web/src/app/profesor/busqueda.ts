export function coincideBusqueda(texto: string, consulta: string) {
  const normalizar = (valor: string) => valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const contenido = normalizar(texto);
  return normalizar(consulta).trim().split(/\s+/).every((palabra) => contenido.includes(palabra));
}

export const claseFiltroProfesor =
  "mt-1 block w-full rounded-lg border border-input bg-card px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

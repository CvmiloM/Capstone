// PB-014: ciclos y tramos de los niveles educativos, con el texto que se
// muestra. Deben coincidir con CICLOS y TRAMOS de
// apps/api/src/modules/academico/nivel-educativo.ts; la API rechaza otros.
export type Ciclo = "PARVULARIA" | "BASICA" | "MEDIA";

export const NOMBRE_CICLO: Record<Ciclo, string> = {
  PARVULARIA: "Parvularia",
  BASICA: "Básica",
  MEDIA: "Media",
};

// Decisión del PO: lista cerrada de tramos por ciclo.
export const TRAMOS: Record<Ciclo, { valor: string; texto: string }[]> = {
  PARVULARIA: [
    { valor: "PRIMER_NIVEL", texto: "Primer nivel (sala cuna)" },
    { valor: "SEGUNDO_NIVEL", texto: "Segundo nivel (nivel medio)" },
    { valor: "TERCER_NIVEL", texto: "Tercer nivel (transición)" },
  ],
  BASICA: [
    { valor: "PRIMER_CICLO", texto: "Primer ciclo (1° a 4° básico)" },
    { valor: "SEGUNDO_CICLO", texto: "Segundo ciclo (5° a 8° básico)" },
  ],
  MEDIA: [
    { valor: "FORMACION_GENERAL", texto: "Formación general (1° y 2° medio)" },
    {
      valor: "FORMACION_DIFERENCIADA",
      texto: "Formación diferenciada (3° y 4° medio)",
    },
  ],
};

/** Ciclo al que pertenece cada tramo: elegir el tramo define el ciclo. */
export const CICLO_DEL_TRAMO: Record<string, Ciclo> = Object.fromEntries(
  (Object.keys(TRAMOS) as Ciclo[]).flatMap((ciclo) =>
    TRAMOS[ciclo].map((tramo) => [tramo.valor, ciclo] as const),
  ),
);

export function nombreTramo(tramo: string) {
  for (const lista of Object.values(TRAMOS)) {
    const encontrado = lista.find((opcion) => opcion.valor === tramo);
    if (encontrado) return encontrado.texto;
  }
  return tramo;
}

// Mismos límites que valida la API.
export const LARGO_MAXIMO_NIVEL = { codigo: 30, nombre: 80 } as const;
export const ORDEN_MAXIMO = 999;
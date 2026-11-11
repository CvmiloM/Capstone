// Refinamientos de Convivencia, sección 10.1: explicación permanente de qué
// se puede consultar, qué documentos usa la IA y qué no puede determinar.
// Corresponde a la búsqueda de PB-117 (buscar_fragmentos_normativa): solo
// versiones publicadas, vigentes, habilitadas para la búsqueda y preparadas,
// sin plantillas.
const BLOQUES = [
  {
    titulo: "Qué puedes consultar",
    puntos: [
      "Procedimientos y pasos de los protocolos",
      "Medidas que contempla el reglamento",
      "Plazos, responsables y cómo informar a las familias",
    ],
  },
  {
    titulo: "Qué documentos usa",
    puntos: [
      "Los documentos institucionales de tu escuela publicados y vigentes, como el reglamento y los protocolos",
      "Solo las versiones preparadas para la búsqueda, nunca las plantillas",
      "Cada respuesta cita el documento, la versión y la página",
    ],
  },
  {
    titulo: "Qué no puede determinar",
    puntos: [
      "Si una norma se aplica a un caso concreto, eso lo decide el equipo",
      "Sanciones o juicios sobre estudiantes, no decide por la escuela",
      "Leyes o circulares que la escuela no haya subido a Documentos institucionales",
    ],
  },
] as const;

export function AlcanceConsulta() {
  return (
    <section
      aria-labelledby="alcance-consulta"
      className="mb-6 rounded-2xl border border-border bg-card p-5"
    >
      <h2 id="alcance-consulta" className="text-base font-semibold">
        Qué hace esta consulta
      </h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-3">
        {BLOQUES.map((bloque) => (
          <div key={bloque.titulo}>
            <h3 className="text-sm font-medium">{bloque.titulo}</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
              {bloque.puntos.map((punto) => (
                <li key={punto}>{punto}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Para preguntar por un caso o una situación usa CONVI IA dentro de ese
        registro, ahí la IA recibe los antecedentes con seudónimos y sin nombres
        ni RUT.
      </p>
    </section>
  );
}

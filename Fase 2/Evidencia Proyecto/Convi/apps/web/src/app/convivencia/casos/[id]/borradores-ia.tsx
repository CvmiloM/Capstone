import {
  BotonesRevisionBorrador,
  FormularioBorradorIA,
  FormularioEdicionBorrador,
  type ActuacionElegible,
} from "./formularios-borradores";

// PB-125 y PB-126 (HU-106 y HU-107): borradores de acta y de informe de caso con
// IA. Mismas formas que devuelve apps/api/src/modules/orientacion/borradores.service.ts.
export type BorradorCaso = {
  id: string;
  tipo: "ACTA" | "INFORME";
  titulo: string;
  contenido: string;
  estado: "BORRADOR" | "REVISADO" | "DESCARTADO";
  actuacion: string | null;
  creado_por: string;
  creado_en: string;
  revisado_por: string | null;
  revisado_en: string | null;
  borrador_anterior_id: string | null;
  edicion: number;
  reemplazado: boolean;
  propio: boolean;
  version: string;
};

export type BorradoresDelCaso = {
  borradores: BorradorCaso[];
  actuaciones: ActuacionElegible[];
};

const NOMBRE_ESTADO: Record<BorradorCaso["estado"], string> = {
  BORRADOR: "Pendiente de revisión",
  REVISADO: "Revisado",
  DESCARTADO: "Descartado",
};

const CLASE_ESTADO: Record<BorradorCaso["estado"], string> = {
  BORRADOR: "bg-amarillo/15 text-foreground",
  REVISADO: "bg-verde/15 text-foreground",
  DESCARTADO: "bg-muted text-muted-foreground",
};

export function BorradoresIA({
  casoId,
  datos,
  formatearFecha,
}: {
  casoId: string;
  datos: BorradoresDelCaso;
  formatearFecha: (iso: string) => string;
}) {
  // Se muestra la última edición de cada borrador, las anteriores van debajo.
  const vigentes = datos.borradores.filter((b) => !b.reemplazado);
  const porId = new Map(datos.borradores.map((b) => [b.id, b]));
  const anteriores = (b: BorradorCaso) => {
    const lista: BorradorCaso[] = [];
    let actual = b.borrador_anterior_id ? porId.get(b.borrador_anterior_id) : undefined;
    while (actual) {
      lista.push(actual);
      actual = actual.borrador_anterior_id
        ? porId.get(actual.borrador_anterior_id)
        : undefined;
    }
    return lista;
  };
  const fechas = Object.fromEntries(
    datos.actuaciones
      .filter((a) => a.fecha)
      .map((a) => [a.id, formatearFecha(a.fecha!)]),
  );

  return (
    <div id="borradores" className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Son textos de apoyo para revisar y corregir: un borrador nunca es un acta
        firmada ni un informe publicado, y no se agrega como evidencia. El acta
        firmada se adjunta en el encuentro, como siempre.
      </p>

      {vigentes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          El caso todavía no tiene borradores con IA.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {vigentes.map((b) => {
            const previas = anteriores(b);
            return (
              <li key={b.id} className="py-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[b.estado]}`}
                  >
                    {NOMBRE_ESTADO[b.estado]}
                  </span>
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                    {b.tipo === "ACTA" ? "Borrador de acta" : "Borrador de informe"}
                  </span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-foreground">
                    {b.edicion === 1
                      ? "Generado con IA"
                      : `Edición ${b.edicion}, corregida a partir de la IA`}
                  </span>
                </div>
                <p className="mt-2 font-medium">{b.titulo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {b.actuacion ? `${b.actuacion} · ` : ""}
                  {b.edicion === 1 ? "Pedido" : "Editado"} por {b.creado_por} el{" "}
                  {formatearFecha(b.creado_en)}
                  {b.revisado_por && b.revisado_en
                    ? ` · ${NOMBRE_ESTADO[b.estado]} por ${b.revisado_por} el ${formatearFecha(b.revisado_en)}`
                    : ""}
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-primary">
                    Leer el borrador
                  </summary>
                  <div className="mt-3 whitespace-pre-line rounded-xl border border-border bg-background p-4 leading-relaxed">
                    {b.contenido}
                  </div>
                </details>
                {b.estado === "BORRADOR" && (
                  <div className="mt-3 space-y-3">
                    {b.propio && (
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-primary">
                          Corregir el texto
                        </summary>
                        <div className="mt-3">
                          <FormularioEdicionBorrador casoId={casoId} borrador={b} />
                        </div>
                      </details>
                    )}
                    <BotonesRevisionBorrador
                      casoId={casoId}
                      borradorId={b.id}
                      version={b.version}
                    />
                  </div>
                )}
                {previas.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Ediciones anteriores ({previas.length})
                    </summary>
                    <ul className="mt-2 space-y-3">
                      {previas.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border p-3">
                          <p className="text-xs text-muted-foreground">
                            Edición {p.edicion}
                            {p.edicion === 1 ? ", redactada por la IA" : ""} · {p.creado_por} el{" "}
                            {formatearFecha(p.creado_en)}
                          </p>
                          <p className="mt-1 font-medium">{p.titulo}</p>
                          <p className="mt-2 whitespace-pre-line text-muted-foreground">
                            {p.contenido}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details
        className="rounded-2xl border border-border p-4"
        open={vigentes.length === 0}
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Preparar un borrador con IA
        </summary>
        <div className="mt-3">
          <FormularioBorradorIA
            casoId={casoId}
            actuaciones={datos.actuaciones}
            fechas={fechas}
          />
        </div>
      </details>
    </div>
  );
}

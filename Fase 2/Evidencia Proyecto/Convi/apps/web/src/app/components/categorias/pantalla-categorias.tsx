import { BotonEstado } from "./boton-estado";
import type { Categoria } from "./datos";
import { FormularioCategoria } from "./formulario-categoria";

// PB-030 (HU-023): la misma pantalla para los portales de administración y de
// Convivencia. Lista las categorías (primero las activas), permite editarlas y
// desactivarlas, y crear nuevas. No hay forma de borrarlas (CA3).
export function PantallaCategorias({
  categorias,
}: {
  categorias: Categoria[];
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <section aria-labelledby="titulo-lista" className="xl:col-span-2">
        <h2 id="titulo-lista" className="sr-only">
          Categorías de la escuela
        </h2>
        {categorias.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Tu escuela todavía no tiene categorías. Mientras no haya, las
            situaciones se registran sin categoría.
          </p>
        ) : (
          <ul className="space-y-3">
            {categorias.map((categoria) => {
              const activa = categoria.estado === "ACTIVO";
              return (
                <li
                  key={categoria.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-tarjeta"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {categoria.nombre}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            activa
                              ? "bg-accent text-accent-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {activa ? "Activa" : "Inactiva"}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {categoria.descripcion ?? "Sin descripción."}
                      </p>
                      {!activa && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          No se ofrece en situaciones nuevas; las anteriores la
                          conservan.
                        </p>
                      )}
                    </div>
                    <BotonEstado id={categoria.id} estado={categoria.estado} />
                  </div>
                  <details className="mt-3">
                    <summary className="w-fit cursor-pointer rounded text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
                      Editar
                    </summary>
                    <div className="mt-4 max-w-xl">
                      <FormularioCategoria categoria={categoria} />
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="titulo-nueva"
        className="h-fit rounded-2xl border border-border bg-card p-5 shadow-tarjeta"
      >
        <h2 id="titulo-nueva" className="mb-4 text-lg font-semibold">
          Nueva categoría
        </h2>
        <FormularioCategoria />
      </section>
    </div>
  );
}
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { obtenerCategorias } from "@/app/components/categorias/datos";
import { FormularioCategoria } from "@/app/components/categorias/formulario-categoria";
import { claseEnlace } from "@/app/components/formulario";
import { obtenerReglas } from "@/app/components/reglas/datos";
import { FormularioRegla } from "@/app/components/reglas/formulario-regla";
import {
  CLASE_ESTADO,
  describirRegla,
  NOMBRE_ACCION,
  NOMBRE_ESTADO,
  NOMBRE_PRIORIDAD,
} from "@/app/components/reglas/opciones";
import { BotonTerminarPaso } from "./boton-paso";

// PB-037 (HU-030): las categorías y las reglas se crean desde la guía con las
// mismas operaciones del portal (PB-030 y PB-089). La regla de la guía es de
// recurrencia y se explica en una frase, sin códigos (CA1); queda como versión
// 1 en Borrador o Activa según lo que elija el administrador (CA2). Omitir el
// paso no toca las reglas (CA3) y guardar una regla no genera alertas (CA4).
export async function PasoReglas({
  version,
  listo,
}: {
  version: string;
  listo: boolean;
}) {
  const [categorias, reglas] = await Promise.all([
    obtenerCategorias(),
    obtenerReglas(),
  ]);
  const activas = categorias
    .filter((c) => c.estado === "ACTIVO")
    .map(({ id, nombre }) => ({ id, nombre }));
  const guardadas = reglas.filter((r) => r.estado !== "ARCHIVADO");
  const cantidad = new Set(guardadas.map((r) => r.codigo_regla)).size;

  return (
    <div className="space-y-8">
      <section aria-labelledby="titulo-categorias">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="titulo-categorias" className="text-base font-semibold">
            Categorías
          </h3>
          <Link href="/admin/categorias" className={`text-sm ${claseEnlace}`}>
            Editar o desactivar en Categorías
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Con ellas los profesores y Convivencia clasifican las situaciones. Son
          opcionales: una regla también puede contar todas las situaciones.
        </p>
        {activas.length === 0 ? (
          <p className="mt-3 text-sm">
            Tu escuela todavía no tiene categorías activas.
          </p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {activas.map((c) => (
              <li
                key={c.id}
                className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground"
              >
                {c.nombre}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 max-w-xl rounded-xl border border-border p-4">
          <h4 className="mb-4 text-sm font-semibold">Nueva categoría</h4>
          <FormularioCategoria />
        </div>
      </section>

      <section aria-labelledby="titulo-reglas">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="titulo-reglas" className="text-base font-semibold">
            Reglas de aviso
          </h3>
          <Link href="/admin/reglas" className={`text-sm ${claseEnlace}`}>
            Activar o archivar en Reglas
          </Link>
        </div>
        {guardadas.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Tu escuela todavía no tiene reglas de aviso.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {guardadas.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <p className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.codigo_regla}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASE_ESTADO[r.estado]}`}
                  >
                    {NOMBRE_ESTADO[r.estado]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Versión {r.numero_version}
                  </span>
                </p>
                <p className="mt-1 font-medium">
                  <Link href={`/admin/reglas/${r.id}`} className={claseEnlace}>
                    {r.nombre}
                  </Link>
                </p>
                <p className="mt-0.5">{describirRegla(r)}</p>
                <p className="mt-0.5 text-muted-foreground">
                  Prioridad{" "}
                  {NOMBRE_PRIORIDAD[r.codigo_prioridad]?.toLowerCase() ??
                    r.codigo_prioridad}{" "}
                  · {NOMBRE_ACCION[r.codigo_accion] ?? r.codigo_accion}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-nueva-regla">
        <h3 id="titulo-nueva-regla" className="text-base font-semibold">
          Nueva regla
        </h3>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          La regla cuenta las situaciones registradas y avisa cuando se juntan
          varias en pocos días. Elige qué cuenta (cada estudiante, cada curso o
          toda la escuela), cuántas situaciones, en cuántos días y si cuentan
          todas las categorías o solo una. Abajo se lee la regla en una frase.
        </p>
        <div className="max-w-3xl">
          {/* Con cada regla nueva el formulario vuelve a sus valores iniciales. */}
          <FormularioRegla
            key={reglas.length}
            portal="admin"
            categorias={activas}
            tipoFijo="RECURRENCIA"
            volverAGuia
          />
        </div>
      </section>

      <p
        role="note"
        className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        Guardar o activar una regla no genera ni envía alertas. Cada vez que se
        registra una situación, CONVI revisa las reglas activas y crea una
        alerta solo si se cumple alguna.
      </p>

      <section className="border-t border-border pt-5">
        <p className="mb-3 text-sm text-muted-foreground">
          {cantidad === 0
            ? "Para marcar el paso como listo, guarda al menos una regla."
            : `Hay ${cantidad.toLocaleString("es-CL")} ${cantidad === 1 ? "regla guardada" : "reglas guardadas"}, en borrador o activas.`}
        </p>
        {!listo && (
          <BotonTerminarPaso
            paso="reglas"
            version={version}
            habilitado={cantidad > 0}
          />
        )}
      </section>
    </div>
  );
}

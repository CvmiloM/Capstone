import type { Metadata } from "next";
import Link from "next/link";
import {
  claseBotonPrimario,
  claseBotonSecundario,
  claseEnlace,
} from "@/app/components/formulario";
import { AvisoNoDisponible } from "../aviso-no-disponible";
import { formatoFecha } from "../alertas/opciones";
import { abrirAviso, marcarAvisoLeido, marcarTodosLeidos } from "./acciones";
import { obtenerAvisos } from "./datos";

export const metadata: Metadata = { title: "Avisos" };

const MENSAJE: Record<string, { texto: string; error: boolean }> = {
  "no-disponible": {
    texto:
      "El registro de ese aviso ya no está disponible: no existe, tu cuenta no puede consultarlo o el aviso venció. El aviso quedó leído.",
    error: true,
  },
  error: {
    texto: "No pudimos marcar el aviso. Recarga la página e inténtalo nuevamente.",
    error: true,
  },
  "todos-leidos": { texto: "Tus avisos quedaron leídos.", error: false },
};

// PB-095 (HU-082): cada profesional de Convivencia ve solo sus avisos y los
// marca como leídos. Al entrar se ven los no leídos (por defecto).
export default async function Avisos({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; pagina?: string; aviso?: string }>;
}) {
  const parametros = await searchParams;
  const ver = parametros.ver === "todos" ? "todos" : "no-leidos";
  const respuesta = await obtenerAvisos({ ver, pagina: parametros.pagina });
  if (!respuesta.ok) return <AvisoNoDisponible volverA="/convivencia" />;
  const p = respuesta.datos;
  const fecha = formatoFecha(p.zona_horaria);
  const mensaje = parametros.aviso ? MENSAJE[parametros.aviso] : undefined;
  const enlace = (filtro: string, pagina = 1) =>
    `/convivencia/avisos?${new URLSearchParams({ ver: filtro, pagina: String(pagina) })}`;
  // Cada formulario vuelve al mismo filtro y página.
  const contexto = (
    <>
      <input type="hidden" name="ver" value={ver} />
      <input type="hidden" name="pagina" value={p.pagina} />
    </>
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-titulo text-3xl font-semibold">Avisos</h1>
        <p className="mt-2 text-muted-foreground">
          Tus avisos del equipo de Convivencia. Al abrir uno queda leído con la
          fecha de lectura.
        </p>
      </header>

      {mensaje && (
        <div
          role={mensaje.error ? "alert" : "status"}
          className={`rounded-lg border px-4 py-3 text-sm ${
            mensaje.error
              ? "border-destructive/20 bg-destructive/5 text-destructive"
              : "border-verde/30 bg-verde/10"
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filtrar avisos">
          <ul className="flex flex-wrap gap-1.5">
            {[
              { valor: "no-leidos", texto: "No leídos", total: p.no_leidos },
              { valor: "todos", texto: "Todos", total: null },
            ].map((filtro) => {
              const activo = filtro.valor === ver;
              return (
                <li key={filtro.valor}>
                  <Link
                    href={enlace(filtro.valor)}
                    aria-current={activo ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                      activo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {filtro.texto}
                    {filtro.total !== null && (
                      <span
                        className={`rounded-full px-1.5 text-xs ${
                          activo
                            ? "bg-primary-foreground/20"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {filtro.total}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {p.no_leidos > 0 && (
          <form action={marcarTodosLeidos}>
            {contexto}
            <button type="submit" className={claseBotonSecundario}>
              Marcar todos como leídos
            </button>
          </form>
        )}
      </div>

      {p.avisos.length === 0 ? (
        <p className="rounded-2xl border border-border p-6 text-muted-foreground">
          {ver === "no-leidos"
            ? "No tienes avisos sin leer."
            : "Todavía no tienes avisos."}
        </p>
      ) : (
        <ul className="space-y-3">
          {p.avisos.map((a) => (
            <li
              key={a.id}
              className={`rounded-2xl border bg-card p-4 ${
                a.leido_en ? "border-border" : "border-primary/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">
                  {!a.leido_en && <span className="sr-only">No leído: </span>}
                  {a.titulo}
                </p>
                <span
                  className={`rounded-full px-3 py-1 text-xs ${
                    a.leido_en
                      ? "bg-muted text-muted-foreground"
                      : "bg-amarillo/25 text-tinta"
                  }`}
                >
                  {a.leido_en ? "Leído" : "No leído"}
                </span>
              </div>
              {a.cuerpo && <p className="mt-2 text-sm">{a.cuerpo}</p>}
              <p className="mt-2 text-sm text-muted-foreground">
                Recibido el {fecha(a.creado_en)}
                {a.expira_en &&
                  ` · ${a.vencido ? "Venció" : "Vence"} el ${fecha(a.expira_en)}`}
                {a.leido_en && ` · Leído el ${fecha(a.leido_en)}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {a.con_destino && !a.vencido && (
                  <form action={abrirAviso}>
                    {contexto}
                    <input type="hidden" name="aviso_id" value={a.id} />
                    <button type="submit" className={claseBotonPrimario}>
                      Abrir
                    </button>
                  </form>
                )}
                {!a.leido_en && (
                  <form action={marcarAvisoLeido}>
                    {contexto}
                    <input type="hidden" name="aviso_id" value={a.id} />
                    <button type="submit" className={claseBotonSecundario}>
                      Marcar como leído
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="Páginas de avisos" className="flex items-center gap-5">
        {p.pagina > 1 && (
          <Link href={enlace(ver, p.pagina - 1)} className={claseEnlace}>
            Anterior
          </Link>
        )}
        <span className="text-sm">
          Página {p.pagina} · {p.total} {p.total === 1 ? "aviso" : "avisos"}
        </span>
        {p.pagina * p.limite < p.total && (
          <Link href={enlace(ver, p.pagina + 1)} className={claseEnlace}>
            Siguiente
          </Link>
        )}
      </nav>
    </div>
  );
}

import { Encabezado } from "@/app/components/formulario";
import { pedirAdmin } from "../datos";

type Protocolo = {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  numero_version: number | null;
  estado_version: string | null;
  pasos: { orden: number; nombre: string; descripcion: string | null }[];
};
export const metadata = { title: "Protocolos" };
export default async function ProtocolosAdministracion() {
  const r = await pedirAdmin("/admin/protocolos");
  if (!r.ok)
    throw new Error("No pudimos consultar los protocolos de tu escuela");
  const protocolos: Protocolo[] = await r.json();
  return (
    <>
      <Encabezado
        titulo="Protocolos"
        descripcion="Consulta los protocolos de actuación de tu escuela, el equipo de Convivencia prepara y publica sus versiones"
      />
      {!protocolos.length && (
        <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Todavía no hay protocolos registrados, el equipo de Convivencia puede
          prepararlos desde su portal
        </p>
      )}
      <div className="space-y-3">
        {protocolos.map((p) => (
          <details
            key={p.id}
            className="rounded-2xl border border-border bg-card p-5"
          >
            <summary className="cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
              <span className="font-semibold">{p.nombre}</span>
              <span className="ml-3 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground">
                {p.estado_version === "PUBLICADO"
                  ? "Publicado"
                  : p.estado_version === "BORRADOR"
                    ? "Borrador"
                    : "Sin versión publicada"}
              </span>
              <p className="mt-2 text-sm text-muted-foreground">
                {p.numero_version ? `Versión ${p.numero_version} · ` : ""}
                {p.pasos.length} pasos, abre para consultar
              </p>
            </summary>
            <ol className="mt-5 space-y-4 border-t border-border pt-4">
              {p.pasos.map((paso) => (
                <li key={paso.orden}>
                  <p className="text-sm font-medium">
                    {paso.orden} · {paso.nombre}
                  </p>
                  {paso.descripcion && (
                    <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                      {paso.descripcion}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </>
  );
}

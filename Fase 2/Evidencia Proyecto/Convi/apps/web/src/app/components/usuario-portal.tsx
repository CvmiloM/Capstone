import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { EnlaceConCarga as Link } from "@/app/components/actividad";
import { Icono } from "./icono";
import { AvatarUsuario } from "./avatar-usuario";

type PerfilPortal = {
  nombres: string;
  apellidos: string;
  codigo_perfil: string;
  avisos_no_leidos: number;
  escuela: string;
  comuna: string | null;
  codigo_escuela: string | null;
  anio_activo: number | null;
};

// En el celular la persona aparece en la barra de arriba y en el computador
// en el menú lateral: con cache, la sesión y el perfil se leen una sola vez
// por página aunque el bloque se muestre en los dos lugares.
const leerUsuarioPortal = cache(async () => {
  const supabase = await crearClienteServidor();
  // getClaims valida la firma del token antes de usar el correo.
  const { data } = await supabase.auth.getClaims();
  const correo =
    typeof data?.claims?.email === "string" ? data.claims.email : undefined;
  if (!correo) return null;
  const { data: sesion } = await supabase.auth.getSession();
  const respuesta = await fetch(
    `${process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/auth/perfil`,
    {
      headers: { Authorization: `Bearer ${sesion.session?.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  ).catch(() => null);
  const perfil: PerfilPortal | null = respuesta?.ok
    ? await respuesta.json()
    : null;
  return { correo, perfil };
});

export async function FichaEscuelaPortal({ familia = false }: { familia?: boolean }) {
  const perfil = (await leerUsuarioPortal())?.perfil;
  if (!perfil?.escuela) return null;
  const detalle = [!familia && perfil.codigo_escuela && `Código ${perfil.codigo_escuela}`, perfil.comuna]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`rounded-xl border border-border px-3 py-2.5 ${familia ? "min-w-0" : "mx-3"}`}>
      <p className={`text-sm font-semibold ${familia ? "break-words" : "truncate"}`} title={perfil.escuela}>{perfil.escuela}</p>
      {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${perfil.anio_activo ? "bg-primary" : "bg-input"}`} />
        {perfil.anio_activo ? `Año académico ${perfil.anio_activo}` : "Sin año académico activo"}
      </p>
    </div>
  );
}

/** Identidad de la sesión y avisos propios, consultados solo en el servidor. */
export async function UsuarioPortal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const usuario = await leerUsuarioPortal();
  if (!usuario) return null;
  const { correo, perfil } = usuario;
  const roles: Record<string, string> = {
    CONVIVENCIA: "Convivencia",
    PROFESOR: "Profesor",
    APODERADO: "Apoderado",
    ADMIN: "Administrador",
  };

  return (
    <div
      className={`flex min-w-0 items-center gap-2.5 ${compacto ? "" : "mb-3"}`}
    >
      <AvatarUsuario correo={correo} tamano={compacto ? 32 : 36} siempre />
      <div
        className={`min-w-0 flex-1 ${compacto ? "hidden sm:block" : ""}`}
        title={correo}
      >
        <p className="truncate text-sm font-medium">
          {perfil ? `${perfil.nombres} ${perfil.apellidos}` : correo}
        </p>
        {perfil && (
          <p className="text-xs text-muted-foreground">
            {roles[perfil.codigo_perfil]}
          </p>
        )}
      </div>
      {(perfil?.codigo_perfil === "CONVIVENCIA" || perfil?.codigo_perfil === "PROFESOR") && (
        <Link
          href={perfil.codigo_perfil === "PROFESOR" ? "/profesor/situaciones?pendientes=1" : "/convivencia/avisos"}
          aria-label={perfil.codigo_perfil === "PROFESOR" ? `${perfil.avisos_no_leidos} aclaraciones pendientes` : `Avisos, ${perfil.avisos_no_leidos} sin leer`}
          className="relative shrink-0 rounded-lg p-2 text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Icono nombre="avisos" className="size-5" />
          {perfil.avisos_no_leidos > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 text-primary-foreground">
              {perfil.avisos_no_leidos > 99 ? "99+" : perfil.avisos_no_leidos}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}

/** Mismo espacio que ocupa el bloque mientras se lee la sesión. */
export function EsqueletoUsuarioPortal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-2.5 ${compacto ? "" : "mb-3"}`}
    >
      <span
        className={`animate-pulse rounded-full bg-muted ${compacto ? "size-8" : "size-9"}`}
      />
      <span className="h-3 w-28 animate-pulse rounded bg-muted" />
    </div>
  );
}

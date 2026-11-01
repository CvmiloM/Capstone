import { crearClienteServidor } from "@/lib/supabase/servidor";
import Link from "next/link";
import { Icono } from "./icono";
import { AvatarUsuario } from "./avatar-usuario";

/** Identidad de la sesión y avisos propios, consultados solo en el servidor. */
export async function UsuarioPortal({
  compacto = false,
}: {
  compacto?: boolean;
}) {
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
  const perfil: {
    nombres: string;
    apellidos: string;
    codigo_perfil: string;
    avisos_no_leidos: number;
  } | null = respuesta?.ok ? await respuesta.json() : null;
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
      {perfil?.codigo_perfil === "CONVIVENCIA" && (
        <Link
          href="/convivencia/avisos"
          aria-label={`Avisos, ${perfil.avisos_no_leidos} sin leer`}
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

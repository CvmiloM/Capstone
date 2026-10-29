import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Encabezado, claseBotonPrimario, claseEnlace } from "@/app/components/formulario";
import { obtenerAccesosApoderados } from "./datos";

export const metadata: Metadata = { title: "Apoderados" };

export default async function PaginaApoderados({ searchParams }: { searchParams: Promise<{ buscar?: string; pagina?: string }> }) {
  const consulta = await searchParams;
  const texto = typeof consulta.buscar === "string" ? consulta.buscar.trim().slice(0, 100) : "";
  const buscar = texto.length >= 2 ? texto : "";
  const numero = Number(consulta.pagina || 1);
  const pagina = Number.isSafeInteger(numero) && numero >= 1 && numero <= 10000 ? numero : 1;
  const datos = await obtenerAccesosApoderados(buscar, pagina);
  const paginas = Math.max(1, Math.ceil(datos.total / datos.por_pagina));
  const destino = (n: number) => `/admin/apoderados?${new URLSearchParams({ ...(buscar ? { buscar } : {}), pagina: String(n) })}`;
  return <>
    <Encabezado titulo="Apoderados" descripcion="Administra el acceso de cada apoderado por estudiante, registrar un vínculo familiar y otorgar permiso para consultar su información son pasos separados" />
    <Form action="/admin/apoderados" scroll={false} className="mb-5 flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1"><label htmlFor="buscar-apoderados" className="mb-1.5 block text-sm font-medium">Buscar apoderado o estudiante</label><input id="buscar-apoderados" name="buscar" defaultValue={texto} required minLength={2} maxLength={100} placeholder="Nombre, correo o código del estudiante" className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/15" /></div>
      <button type="submit" className={claseBotonPrimario}>Buscar</button>
      {buscar && <Link href="/admin/apoderados" scroll={false} className={claseEnlace}>Limpiar búsqueda</Link>}
    </Form>
    <p className="mb-4 text-sm text-muted-foreground">{datos.total} {datos.total === 1 ? "vínculo registrado" : "vínculos registrados"}, hasta 50 por página</p>
    {!datos.apoderados.length && <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">{buscar ? "No encontramos vínculos con esa búsqueda" : "Todavía no hay vínculos para mostrar, puedes registrar apoderados desde la ficha de cada estudiante"}</p>}
    <ul className="grid gap-3 lg:grid-cols-2">
      {datos.apoderados.map(v => <li key={v.id}><Link href={`/admin/estudiantes/${v.estudiante_id}/apoderados?apoderado=${v.id}#vinculo-${v.id}`} className="block h-full rounded-2xl border border-border bg-card p-5 shadow-tarjeta transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{v.apoderado_nombre}</h2><span className={`rounded-full px-2.5 py-1 text-xs ${v.acceso_habilitado ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{v.acceso_habilitado ? "Acceso vigente" : v.estado_acceso === "REVOCADO" ? "Acceso revocado" : v.estado_acceso === "EXPIRADO" ? "Acceso vencido" : "Sin acceso habilitado"}</span></div>
        <p className="mt-2 text-sm">{v.estudiante_nombre} <span className="text-muted-foreground">· {v.codigo_estudiante}</span></p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{v.correo_cuenta || v.correo || "Correo sin registrar"}</p>
        <p className="mt-3 text-sm font-medium text-primary">Administrar acceso →</p>
      </Link></li>)}
    </ul>
    {paginas > 1 && <nav aria-label="Páginas de apoderados" className="mt-5 flex flex-wrap items-center gap-4">{pagina > 1 && <Link href={destino(pagina - 1)} scroll={false} className={claseEnlace}>← Anterior</Link>}<span className="text-sm text-muted-foreground">Página {pagina} de {paginas}</span>{pagina < paginas && <Link href={destino(pagina + 1)} scroll={false} className={claseEnlace}>Siguiente →</Link>}</nav>}
  </>;
}

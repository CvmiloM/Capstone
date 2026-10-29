"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { AvisoError, BotonEnviar, Campo, claseEnlace, claseBotonSecundario } from "@/app/components/formulario";
import type { VinculoApoderado } from "../estudiantes/datos";
import { gestionarAccesoApoderado } from "./acciones";

const formato = (fecha: string, zona: string) => new Intl.DateTimeFormat("es-CL", { timeZone: zona, dateStyle: "medium", timeStyle: "short" }).format(new Date(fecha));

export function AccesoPortal({ estudianteId, vinculo: v, zonaHoraria, hoy, aviso }: {
  estudianteId: string; vinculo: VinculoApoderado; zonaHoraria: string; hoy: string; aviso?: string;
}) {
  const id = useId();
  const [estado, accion, pendiente] = useActionState(gestionarAccesoApoderado.bind(null, estudianteId, v.id), {});
  const disponible = v.vigencia === "VIGENTE" && v.perfil_cuenta === "APODERADO" && v.estado_cuenta === "ACTIVO";
  const renovable = Boolean(v.acceso_id && ["ACTIVO", "EXPIRADO"].includes(v.estado_acceso ?? ""));
  const puedeRevocar = Boolean(v.acceso_id && v.estado_acceso !== "REVOCADO");
  const etiqueta = v.acceso_habilitado ? "Acceso vigente" : v.estado_acceso === "REVOCADO" ? "Acceso revocado" : v.estado_acceso === "EXPIRADO" ? "Acceso vencido" : "Sin acceso habilitado";
  let minimo = hoy;
  if (renovable && v.vence_el && v.vence_el >= hoy) {
    const siguiente = new Date(`${v.vence_el}T12:00:00Z`);
    siguiente.setUTCDate(siguiente.getUTCDate() + 1);
    minimo = siguiente.toISOString().slice(0, 10);
  }
  return (
    <section aria-labelledby={`${id}-titulo`} className="mt-4 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-titulo`} className="text-sm font-semibold">Acceso al portal</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${v.acceso_habilitado ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{etiqueta}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Este permiso corresponde solo a este estudiante, el vínculo familiar se conserva aunque el permiso venza o se revoque</p>
      {v.correo_cuenta && <p className="mt-2 break-all text-sm">Cuenta: {v.correo_cuenta}</p>}
      {v.expira_en && <p className="mt-1 text-sm">Vencimiento: <time dateTime={v.expira_en}>{formato(v.expira_en, zonaHoraria)}</time></p>}
      {v.otorgado_en && <p className="mt-1 text-xs text-muted-foreground">Otorgado el {formato(v.otorgado_en, zonaHoraria)}</p>}
      {v.revocado_en && <p className="mt-1 text-xs text-muted-foreground">Revocado el {formato(v.revocado_en, zonaHoraria)}</p>}
      {aviso && <p role="status" className="mt-3 rounded-xl bg-primary/10 p-3 text-sm">{aviso}</p>}
      {estado.mensaje && <div className="mt-3"><AvisoError>{estado.mensaje}</AvisoError></div>}
      {!v.cuenta_id && v.vigencia !== "TERMINADO" && (
        <form action={accion} className="mt-3 space-y-3">
          <input type="hidden" name="operacion" value="invitar" />
          <p className="text-sm">Esta persona todavía no tiene una cuenta de CONVI, la invitación se enviará al correo de su ficha, después deberá activarla</p>
          {!v.correo && <p className="text-sm text-muted-foreground">Añade un correo al apoderado en «Corregir datos del contacto» para poder enviarle una invitación</p>}
          <button type="submit" disabled={pendiente || !v.correo} className={`${claseBotonSecundario} text-xs! disabled:opacity-50`}>{pendiente ? "Enviando…" : "Invitar cuenta de Apoderado"}</button>
        </form>
      )}
      {v.cuenta_id && v.perfil_cuenta !== "APODERADO" && <p className="mt-3 text-sm text-muted-foreground">Esta persona tiene una cuenta de otro perfil, el permiso requiere una cuenta de Apoderado para la misma persona</p>}
      {v.perfil_cuenta === "APODERADO" && v.estado_cuenta !== "ACTIVO" && <p className="mt-3 text-sm text-muted-foreground">{v.estado_cuenta === "PENDIENTE" ? "La persona debe completar la invitación, puedes reenviar el correo desde " : "Revisa el estado de su cuenta en "}<Link href="/admin/usuarios?perfil=APODERADO&suspendidas=1" className={claseEnlace}>Usuarios</Link></p>}
      {v.vigencia !== "VIGENTE" && <p className="mt-3 text-sm text-muted-foreground">El vínculo debe estar vigente para otorgar o renovar el acceso</p>}
      {disponible && (
        <details className="mt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded-lg font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">{renovable ? "Renovar acceso" : "Otorgar acceso"}</summary>
          <form action={accion} className="mt-3 space-y-3">
            <input type="hidden" name="operacion" value={renovable ? "renovar" : "otorgar"} />
            <input type="hidden" name="acceso_id" value={v.acceso_id ?? ""} />
            <Campo name="vence_el" etiqueta="Último día con acceso" type="date" required min={minimo} max="9999-12-30" ayuda={`Incluye completo el día seleccionado, con la hora de tu escuela (${zonaHoraria})`} error={estado.errores?.vence_el} />
            <BotonEnviar pendiente={pendiente} textoPendiente="Guardando…">{renovable ? "Confirmar renovación" : "Confirmar otorgamiento"}</BotonEnviar>
          </form>
        </details>
      )}
      {puedeRevocar && (
        <details className="mt-3 text-sm">
          <summary className="w-fit cursor-pointer rounded-lg font-medium text-destructive focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">Revocar acceso</summary>
          <form action={accion} className="mt-3 space-y-3">
            <input type="hidden" name="operacion" value="revocar" />
            <input type="hidden" name="acceso_id" value={v.acceso_id!} />
            <p>Si confirmas, esta cuenta dejará de tener permiso para consultar la información de este estudiante, sus accesos a otros estudiantes se conservarán</p>
            <label className="flex items-start gap-2"><input type="checkbox" name="confirmar" value="si" required className="mt-1 size-4 accent-primary" />Confirmo que quiero revocar este acceso</label>
            <button type="submit" disabled={pendiente} className={`${claseBotonSecundario} text-xs! text-destructive! disabled:opacity-50`}>{pendiente ? "Revocando…" : "Confirmar revocación"}</button>
          </form>
        </details>
      )}
    </section>
  );
}

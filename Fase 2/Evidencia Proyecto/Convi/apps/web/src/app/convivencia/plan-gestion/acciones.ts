"use server";

import { redirect } from "next/navigation";
import { enviar, pedir } from "../datos";
import {
  TIPOS,
  rutaDetalle,
  type ContextoFormulario,
  type EstadoFormulario,
  type Opciones,
  type Tipo,
} from "./opciones";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function buscarOpciones(
  clase: string,
  q: string,
  pagina: number,
  seleccionado: string,
  actividadId?: string,
): Promise<Opciones> {
  if (!["anios", "personas", "profesionales", "cursos"].includes(clase))
    throw new Error("Selección no válida.");
  const p = new URLSearchParams({ clase, q, pagina: String(pagina) });
  if (seleccionado) p.set("seleccionado", seleccionado);
  if (actividadId) p.set("actividad_id", actividadId);
  const r = await pedir<Opciones>(`/convivencia/gestion/opciones?${p}`);
  if (!r.ok) throw new Error("No se pudieron consultar las opciones.");
  return r.datos;
}

export async function guardarGestion(
  contexto: ContextoFormulario,
  _anterior: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const { tipo, operacion, id } = contexto;
  if (!TIPOS.includes(tipo) || (id && !UUID.test(id)))
    return { mensaje: "Recarga la página antes de guardar." };
  const d: Record<string, unknown> = {};
  // Solo los campos de negocio, nunca las propiedades internas de Server Actions.
  const campos = [
    "nombre",
    "anio_academico_id",
    "titulo",
    "descripcion",
    "persona_responsable_id",
    "publico_objetivo",
    "evidencia_esperada",
    "nombre_indicador",
    "unidad_indicador",
    "inicio_programado",
    "fin_programado",
    "lugar",
    "inicio_real",
    "fin_real",
    "completado_en",
    "resumen_resultado",
    "estado",
    "version",
    "motivo",
    "elegido_id",
    "funcion",
  ];
  for (const campo of campos)
    if (form.has(campo)) d[campo] = String(form.get(campo) ?? "");
  for (const campo of ["orden", "meta_indicador", "valor_indicador"])
    if (form.has(campo))
      d[campo] = form.get(campo) === "" ? null : Number(form.get(campo));
  let api = "/convivencia/gestion",
    destinoTipo: Tipo = tipo;
  let metodo: "POST" | "PATCH" = "POST";
  if (operacion === "crear") {
    if (form.get("confirmar_creacion") !== "si")
      return { mensaje: "Revisa el resumen y confirma la creación del Plan." };
    d.id = String(form.get("confirmacion"));
    if (form.get("con_primera_accion") === "si") {
      d.objetivo = {
        titulo: form.get("objetivo_titulo"),
        descripcion: form.get("objetivo_descripcion"),
        orden: 1,
      };
      d.accion = {
        titulo: form.get("accion_titulo"),
        descripcion: form.get("accion_descripcion"),
        persona_responsable_id: d.persona_responsable_id,
        publico_objetivo: d.publico_objetivo,
        evidencia_esperada: d.evidencia_esperada,
      };
    }
  } else if (!id) return { mensaje: "El registro no está disponible." };
  else if (operacion === "agregar") {
    api += `/${tipo}/${id}/hijos`;
    destinoTipo =
      tipo === "planes"
        ? "objetivos"
        : tipo === "objetivos"
          ? "acciones"
          : "actividades";
  } else if (operacion === "editar") {
    api += `/${tipo}/${id}`;
    metodo = "PATCH";
  } else if (operacion === "estado") api += `/${tipo}/${id}/estado`;
  else if (operacion === "cursos" || operacion === "profesionales")
    api += `/actividades/${id}/vinculos/${operacion}`;
  else return { mensaje: "La operación no está disponible." };
  const r = await enviar(metodo, api, d);
  if (!r.ok)
    return {
      mensaje: r.mensaje,
      errores: r.errores,
      valores: Object.fromEntries(
        Array.from(form.entries()).filter(
          (v): v is [string, string] => typeof v[1] === "string",
        ),
      ),
    };
  if (operacion === "cursos" || operacion === "profesionales")
    redirect(
      `${rutaDetalle("actividades", id!)}?seccion=participantes&guardado=1`,
    );
  redirect(
    `${rutaDetalle(destinoTipo, r.id ?? id!)}?guardado=1${operacion === "estado" && tipo !== "planes" ? "&seccion=resultados" : ""}`,
  );
}

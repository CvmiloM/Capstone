"use server";

import { redirect } from "next/navigation";
import { enviarSituacion } from "../../../datos";

export type EstadoRegistro = {
  /** Error general del formulario. */
  mensaje?: string;
  /** Error por campo, con la clave igual al campo que valida la API. */
  errores?: Record<string, string>;
  /** Valores enviados, para no vaciar el formulario si hay errores. */
  valores?: Record<string, string>;
};

const CAMPOS = [
  "curso_id",
  "ocurrido_en",
  "lugar",
  "urgencia",
  "categoria_id",
  "descripcion",
] as const;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-042 (HU-035): arma la situación con lo que envió el formulario y la manda
// a la API, que vuelve a validar todo. Ocultar opciones en la pantalla no
// protege una petición: la API decide (HU-119).
export async function registrarSituacion(
  _anterior: EstadoRegistro,
  formData: FormData,
): Promise<EstadoRegistro> {
  const valores: Record<string, string> = {};
  for (const campo of CAMPOS) valores[campo] = leerTexto(formData, campo);

  // Cada estudiante tiene un campo rol:<id>; vacío significa que no participó.
  const participantes: { estudiante_id: string; rol: string }[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (clave.startsWith("rol:") && typeof valor === "string" && valor) {
      valores[clave] = valor;
      participantes.push({ estudiante_id: clave.slice(4), rol: valor });
    }
  }

  const resultado = await enviarSituacion({
    curso_id: valores.curso_id,
    ocurrido_en: valores.ocurrido_en,
    lugar: valores.lugar || null,
    urgencia: valores.urgencia || "NORMAL",
    categoria_id: valores.categoria_id || null,
    descripcion: valores.descripcion,
    participantes,
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(`/profesor/situaciones/${resultado.id}?registrada=1`);
}
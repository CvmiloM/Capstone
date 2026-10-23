"use server";

import { redirect } from "next/navigation";
import { enviarSituacionHistorica } from "../datos";
import type { EstadoRegistro } from "../registrar/acciones";

const CAMPOS = [
  "tipo_origen",
  "informante_persona_id",
  "ocurrido_en",
  "lugar",
  "categoria_id",
  "descripcion",
  "conclusion",
] as const;

function leerTexto(formData: FormData, campo: string) {
  const valor = formData.get(campo);
  return typeof valor === "string" ? valor.trim() : "";
}

// PB-075 (HU-065): arma la situación de un año anterior con lo que envió el
// formulario y la manda a la API, que vuelve a validar todo y la deja como
// antecedente. No lleva urgencia ni curso: el curso de cada estudiante sale de
// su matrícula del día del hecho.
export async function registrarHistorico(
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

  const resultado = await enviarSituacionHistorica({
    tipo_origen: valores.tipo_origen,
    // Con origen Otro no se envía informante, aunque el campo tenga algo.
    informante_persona_id:
      valores.tipo_origen === "OTRO" ? null : valores.informante_persona_id || null,
    curso_id: null,
    ocurrido_en: valores.ocurrido_en,
    lugar: valores.lugar || null,
    urgencia: "NORMAL",
    categoria_id: valores.categoria_id || null,
    descripcion: valores.descripcion,
    participantes,
    conclusion: valores.conclusion,
  });
  if (!resultado.ok) {
    return { mensaje: resultado.mensaje, errores: resultado.errores, valores };
  }
  redirect(
    resultado.id
      ? `/convivencia/historico?guardada=${encodeURIComponent(resultado.id)}`
      : "/convivencia/historico",
  );
}
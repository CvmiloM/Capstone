"use client";

import { useActionState, useState } from "react";
import { AvisoError, BotonEnviar } from "@/app/components/formulario";
import { Selector } from "../cursos/selector";
import { cargarImportacion, type EstadoFormulario } from "./acciones";
import {
  FORMATOS_ACEPTADOS,
  LIMITE_BYTES,
  NOMBRE_TIPO,
  type TipoImportacion,
} from "./opciones";

const estadoInicial: EstadoFormulario = {};
const PESADO = "El archivo pesa más de 5 MB.";

// PB-019 (HU-015 CA1): elegir el tipo de datos y el archivo. El peso se revisa
// también aquí, para avisar antes de subirlo; la API vuelve a validar todo.
export function FormularioCarga() {
  const [estado, accion, pendiente] = useActionState(
    cargarImportacion,
    estadoInicial,
  );
  const [demasiadoGrande, setDemasiadoGrande] = useState(false);
  const errores = estado.errores ?? {};
  const errorArchivo = demasiadoGrande ? PESADO : errores.archivo;
  const idAyuda = errorArchivo ? "archivo-error" : "archivo-ayuda";

  return (
    <form
      action={accion}
      onSubmit={(evento) => {
        if (demasiadoGrande) evento.preventDefault();
      }}
      noValidate
      className="space-y-5"
    >
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}

      <Selector
        name="tipo"
        etiqueta="¿Qué datos trae el archivo?"
        defaultValue={estado.valores?.tipo ?? ""}
        error={errores.tipo}
      >
        <option value="" disabled>
          Elige el tipo de datos
        </option>
        {(Object.keys(NOMBRE_TIPO) as TipoImportacion[]).map((tipo) => (
          <option key={tipo} value={tipo}>
            {NOMBRE_TIPO[tipo]}
          </option>
        ))}
      </Selector>

      <div>
        <label htmlFor="archivo" className="block text-sm font-medium">
          Archivo
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          required
          accept={FORMATOS_ACEPTADOS}
          aria-invalid={errorArchivo ? true : undefined}
          aria-describedby={idAyuda}
          onChange={(evento) => {
            const archivo = evento.currentTarget.files?.[0];
            setDemasiadoGrande(Boolean(archivo && archivo.size > LIMITE_BYTES));
          }}
          className={`mt-1.5 block w-full rounded-lg border bg-card text-sm file:mr-3 file:border-0 file:border-r file:border-border file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium focus:outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/15 ${
            errorArchivo ? "border-destructive" : "border-input"
          }`}
        />
        <p
          id={idAyuda}
          className={`mt-1.5 text-sm ${errorArchivo ? "text-destructive" : "text-muted-foreground"}`}
        >
          {errorArchivo ??
            "CSV o XLSX de hasta 5 MB y 5.000 filas. La primera fila debe tener los títulos de las columnas."}
        </p>
      </div>

      <BotonEnviar pendiente={pendiente} textoPendiente="Cargando archivo…">
        Cargar archivo
      </BotonEnviar>
    </form>
  );
}
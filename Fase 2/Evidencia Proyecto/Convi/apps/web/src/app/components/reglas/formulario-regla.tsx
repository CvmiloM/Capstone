"use client";

import { useActionState, useState, type ReactNode } from "react";
import { AvisoError, BotonEnviar, Campo } from "@/app/components/formulario";
import { crearRegla, editarRegla, type EstadoFormulario } from "./acciones";
import type { Regla } from "./datos";
import {
  AMBITOS_DEL_TIPO,
  cuentaVencidos,
  describirRegla,
  LARGO_MAXIMO_NOMBRE,
  NOMBRE_ACCION,
  NOMBRE_AMBITO,
  NOMBRE_OPERADOR,
  NOMBRE_PRIORIDAD,
  OPERADORES_DEL_TIPO,
  TIPOS,
  usaVentana,
  VENTANA_MAXIMA_DIAS,
  type Ambito,
  type Tipo,
} from "./opciones";

const estadoInicial: EstadoFormulario = {};

const claseSelect = (error?: string) =>
  `mt-1.5 block w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/15 disabled:bg-muted disabled:text-muted-foreground ${
    error ? "border-destructive" : "border-input"
  }`;

function Lista({
  name,
  etiqueta,
  valor,
  alCambiar,
  error,
  ayuda,
  children,
}: {
  name: string;
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  error?: string;
  ayuda?: string;
  children: ReactNode;
}) {
  const idDescripcion = error ? `${name}-error` : ayuda ? `${name}-ayuda` : undefined;
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {etiqueta}
      </label>
      <select
        id={name}
        name={name}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={idDescripcion}
        className={claseSelect(error)}
      >
        {children}
      </select>
      {idDescripcion && (
        <p
          id={idDescripcion}
          className={`mt-1.5 text-sm ${error ? "text-destructive" : "text-muted-foreground"}`}
        >
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}

/**
 * PB-089 (HU-078): crear una regla o, si recibe un borrador, editarlo. Solo se
 * muestran los campos que usa el tipo elegido (CA3 y CA4) y abajo se lee la
 * regla en una frase. La API vuelve a validar cada dato.
 */
export function FormularioRegla({
  portal,
  regla,
  categorias,
}: {
  portal: "admin" | "convivencia";
  regla?: Regla;
  categorias: { id: string; nombre: string }[];
}) {
  const [estado, accion, pendiente] = useActionState(
    regla ? editarRegla : crearRegla,
    estadoInicial,
  );
  const errores = estado.errores ?? {};

  const [nombre, setNombre] = useState(regla?.nombre ?? "");
  const [tipo, setTipo] = useState<Tipo>(regla?.tipo_regla ?? "RECURRENCIA");
  const [ambito, setAmbito] = useState<string>(regla?.codigo_ambito ?? "ESTUDIANTE");
  const [operador, setOperador] = useState(regla?.codigo_operador ?? "GE");
  const [umbral, setUmbral] = useState(regla?.valor_umbral?.toString() ?? "3");
  const [ventana, setVentana] = useState(regla?.ventana_dias?.toString() ?? "30");
  const [categoria, setCategoria] = useState(regla?.categoria_id ?? "");
  const [accionRegla, setAccionRegla] = useState(regla?.codigo_accion ?? "ALERTA_Y_NOTIFICACION");
  const [prioridad, setPrioridad] = useState(regla?.codigo_prioridad ?? "MEDIA");
  const [desde, setDesde] = useState(regla?.vigente_desde ?? "");
  const [hasta, setHasta] = useState(regla?.vigente_hasta ?? "");

  // Al cambiar el tipo, el ámbito y el operador quedan en un valor que el tipo admite.
  function cambiarTipo(valor: string) {
    const nuevo = valor as Tipo;
    setTipo(nuevo);
    if (!AMBITOS_DEL_TIPO[nuevo].includes(ambito as Ambito)) setAmbito(AMBITOS_DEL_TIPO[nuevo][0]);
    if (!OPERADORES_DEL_TIPO[nuevo].includes(operador)) setOperador("GE");
    if (cuentaVencidos(nuevo)) setCategoria("");
  }

  const ayudaTipo = TIPOS.find((t) => t.valor === tipo)?.ayuda;
  const calcula = tipo !== "OTRO";
  // La categoría elegida puede estar inactiva en un borrador antiguo: se muestra para cambiarla.
  const opcionesCategoria =
    regla?.categoria_id && regla.categoria && !categorias.some((c) => c.id === regla.categoria_id)
      ? [...categorias, { id: regla.categoria_id, nombre: `${regla.categoria} (inactiva)` }]
      : categorias;
  const nombreCategoria = opcionesCategoria.find((c) => c.id === categoria)?.nombre ?? null;
  const numero = (texto: string) => {
    const valor = Number(texto.replace(",", "."));
    return texto.trim() !== "" && Number.isFinite(valor) ? valor : null;
  };
  const frase = describirRegla({
    tipo_regla: tipo,
    codigo_ambito: ambito as Ambito,
    codigo_operador: calcula ? operador : null,
    valor_umbral: numero(umbral),
    ventana_dias: numero(ventana),
    categoria: cuentaVencidos(tipo) ? null : nombreCategoria,
  });

  return (
    <form action={accion} noValidate className="space-y-5">
      {estado.mensaje && <AvisoError>{estado.mensaje}</AvisoError>}
      <input type="hidden" name="portal" value={portal} />
      {regla && <input type="hidden" name="id" value={regla.id} />}

      <Campo
        name="nombre"
        etiqueta="Nombre"
        required
        maxLength={LARGO_MAXIMO_NOMBRE}
        placeholder="Situaciones repetidas de un estudiante"
        value={nombre}
        onChange={(evento) => setNombre(evento.target.value)}
        error={errores.nombre}
      />

      <Lista name="tipo_regla" etiqueta="Tipo de regla" valor={tipo} alCambiar={cambiarTipo} error={errores.tipo_regla} ayuda={ayudaTipo}>
        {TIPOS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.texto}
          </option>
        ))}
      </Lista>

      <Lista
        name="codigo_ambito"
        etiqueta="Qué cuenta"
        valor={ambito}
        alCambiar={setAmbito}
        error={errores.codigo_ambito}
        ayuda={cuentaVencidos(tipo) ? "Las reglas de vencimientos siempre cuentan por caso." : undefined}
      >
        {AMBITOS_DEL_TIPO[tipo].map((a) => (
          <option key={a} value={a}>
            {NOMBRE_AMBITO[a]}
          </option>
        ))}
      </Lista>

      {calcula && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Lista name="codigo_operador" etiqueta="Condición" valor={operador} alCambiar={setOperador} error={errores.codigo_operador}>
            {OPERADORES_DEL_TIPO[tipo].map((o) => (
              <option key={o} value={o}>
                {NOMBRE_OPERADOR[o]}
              </option>
            ))}
          </Lista>
          <Campo
            name="valor_umbral"
            etiqueta={
              tipo === "VARIACION_PERIODO"
                ? "Variación en %"
                : cuentaVencidos(tipo)
                  ? "Cantidad de vencimientos"
                  : "Cantidad de situaciones"
            }
            inputMode="decimal"
            value={umbral}
            onChange={(evento) => setUmbral(evento.target.value)}
            ayuda={tipo === "VARIACION_PERIODO" ? "Un número negativo indica una baja." : undefined}
            error={errores.valor_umbral}
          />
        </div>
      )}

      {usaVentana(tipo) && (
        <Campo
          name="ventana_dias"
          etiqueta={tipo === "VARIACION_PERIODO" ? "Días de cada período" : "En cuántos días"}
          inputMode="numeric"
          value={ventana}
          onChange={(evento) => setVentana(evento.target.value)}
          ayuda={
            tipo === "VARIACION_PERIODO"
              ? "Se comparan los últimos días con el mismo período anterior."
              : `Entre 1 y ${VENTANA_MAXIMA_DIAS} días hacia atrás.`
          }
          error={errores.ventana_dias}
        />
      )}

      {!cuentaVencidos(tipo) && (
        <Lista name="categoria_id" etiqueta="Categoría" valor={categoria} alCambiar={setCategoria} error={errores.categoria_id}>
          <option value="">Todas las categorías</option>
          {opcionesCategoria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Lista>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Lista name="codigo_accion" etiqueta="Al cumplirse" valor={accionRegla} alCambiar={setAccionRegla} error={errores.codigo_accion}>
          {Object.entries(NOMBRE_ACCION).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Lista>
        <Lista name="codigo_prioridad" etiqueta="Prioridad" valor={prioridad} alCambiar={setPrioridad} error={errores.codigo_prioridad}>
          {Object.entries(NOMBRE_PRIORIDAD).map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Lista>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          name="vigente_desde"
          etiqueta="Vigente desde (opcional)"
          type="date"
          value={desde}
          onChange={(evento) => setDesde(evento.target.value)}
          ayuda="Si lo dejas en blanco, empieza el día en que la actives."
          error={errores.vigente_desde}
        />
        <Campo
          name="vigente_hasta"
          etiqueta="Vigente hasta (opcional)"
          type="date"
          value={hasta}
          onChange={(evento) => setHasta(evento.target.value)}
          error={errores.vigente_hasta}
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Así se lee la regla</p>
        <p className="mt-1 font-medium">{frase}</p>
      </div>

      <BotonEnviar pendiente={pendiente} textoPendiente="Guardando…">
        {regla ? "Guardar cambios del borrador" : "Guardar como borrador"}
      </BotonEnviar>
    </form>
  );
}

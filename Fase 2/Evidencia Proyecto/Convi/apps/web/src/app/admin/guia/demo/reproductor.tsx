"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Icono, type NombreIcono } from "@/app/components/icono";
import "./demo.css";

/** Estado de la maqueta: lo que se ve en cada momento de la demo. */
export type EstadoDemo = Record<string, string | number | boolean>;

/**
 * Un paso del guion. El cursor apunta a los elementos de la maqueta por su
 * marca (data-demo), así que la demo funciona con cualquier tamaño de pantalla.
 */
export type Accion =
  /** Cambia el texto que explica lo que está pasando. */
  | { narrar: string }
  /** Lleva el cursor hasta un elemento. */
  | { mover: string }
  /** Lleva el cursor, hace clic y cambia la maqueta. */
  | { clic: string; cambia?: EstadoDemo }
  /** Hace clic en un campo y escribe letra por letra. */
  | { escribir: string; en: string; texto: string }
  /** Cambia la maqueta sin mover el cursor. */
  | { cambia: EstadoDemo }
  | { espera: number };

export type PropsVista = {
  e: EstadoDemo;
  /** Marca un elemento para que el cursor lo encuentre y lo resalte. */
  d: (clave: string) => Record<string, string | undefined>;
  /** El campo en que se está escribiendo, para mostrar la barra de texto. */
  foco: string | null;
};

export type Escena = {
  /** Dirección que se muestra en la barra de la ventana. */
  ruta: string;
  /** Sección del menú marcada al empezar. */
  menu: string;
  inicial: EstadoDemo;
  guion: Accion[];
  Vista: (props: PropsVista) => ReactNode;
};

// Menú de la maqueta: las secciones que usa la guía, con los mismos nombres e
// íconos del portal de administración.
const MENU: [string, NombreIcono][] = [
  ["Resumen", "resumen"],
  ["Cursos", "cursos"],
  ["Estudiantes", "estudiantes"],
  ["Usuarios", "usuarios"],
  ["Importaciones", "importaciones"],
  ["Categorías", "categorias"],
  ["Reglas", "reglas"],
  ["Documentos", "documentos"],
];

const CORTE = Symbol("corte");
const texto = (valor: unknown) => (typeof valor === "string" ? valor : "");

/**
 * Reproduce una demo: una maqueta del portal con datos de ejemplo, donde un
 * cursor se mueve, hace clic y escribe solo, mientras una frase explica cada
 * momento. No es un video: es la misma interfaz, animada con el resorte de
 * CONVI. Empieza cuando se ve en pantalla, se puede pausar y repetir, y al
 * terminar vuelve a empezar.
 */
export function Reproductor({ escena }: { escena: Escena }) {
  const escenario = useRef<HTMLDivElement>(null);
  const pausa = useRef(false);
  const visible = useRef(false);
  const [e, setE] = useState<EstadoDemo>(escena.inicial);
  const [cursor, setCursor] = useState({
    x: 0,
    y: 0,
    clics: 0,
    visible: false,
  });
  const [sobre, setSobre] = useState<string | null>(null);
  const [pulsado, setPulsado] = useState<string | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const [narracion, setNarracion] = useState({ texto: "", numero: 0 });
  const [avance, setAvance] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    pausa.current = pausado;
  }, [pausado]);

  // Solo avanza mientras se ve en pantalla.
  useEffect(() => {
    const caja = escenario.current;
    if (!caja) return;
    const observador = new IntersectionObserver(
      ([entrada]) => {
        visible.current = entrada.isIntersecting;
      },
      { threshold: 0.4 },
    );
    observador.observe(caja);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    let viva = true;
    // Espera el tiempo pedido, sin contar lo que pasa en pausa o fuera de vista.
    const dormir = async (ms: number) => {
      let resta = ms;
      do {
        if (!viva) throw CORTE;
        await new Promise((r) => setTimeout(r, 40));
        if (!pausa.current && visible.current) resta -= 40;
      } while (resta > 0);
      if (!viva) throw CORTE;
    };
    const punto = (clave: string) => {
      const caja = escenario.current;
      const elemento = caja?.querySelector(`[data-demo="${clave}"]`);
      if (!caja || !elemento) return null;
      const a = elemento.getBoundingClientRect();
      const b = caja.getBoundingClientRect();
      return {
        x: a.left - b.left + Math.min(a.width / 2, 48),
        y: a.top - b.top + a.height * 0.6,
      };
    };
    const mover = async (clave: string) => {
      setSobre(null);
      const destino = punto(clave);
      if (destino) setCursor((c) => ({ ...c, ...destino, visible: true }));
      await dormir(780);
      setSobre(clave);
      await dormir(140);
    };
    const clic = async (clave: string) => {
      await mover(clave);
      setCursor((c) => ({ ...c, clics: c.clics + 1 }));
      setPulsado(clave);
      await dormir(170);
      setPulsado(null);
    };

    const correr = async () => {
      await dormir(0);
      setE(escena.inicial);
      setSobre(null);
      setFoco(null);
      setAvance(0);
      setNarracion((n) => ({ texto: "", numero: n.numero + 1 }));
      setCursor((c) => ({ ...c, visible: false }));
      await dormir(600);
      for (const [i, accion] of escena.guion.entries()) {
        if ("narrar" in accion) {
          setNarracion((n) => ({ texto: accion.narrar, numero: n.numero + 1 }));
          await dormir(1100);
        } else if ("mover" in accion) {
          await mover(accion.mover);
        } else if ("clic" in accion) {
          await clic(accion.clic);
          const cambio = accion.cambia;
          if (cambio) setE((x) => ({ ...x, ...cambio }));
          await dormir(480);
        } else if ("escribir" in accion) {
          await clic(accion.escribir);
          setFoco(accion.escribir);
          for (let n = 1; n <= accion.texto.length; n++) {
            setE((x) => ({ ...x, [accion.en]: accion.texto.slice(0, n) }));
            await dormir(46);
          }
          await dormir(260);
          setFoco(null);
        } else if ("cambia" in accion) {
          setE((x) => ({ ...x, ...accion.cambia }));
          await dormir(420);
        } else {
          await dormir(accion.espera);
        }
        setAvance((i + 1) / escena.guion.length);
      }
      setSobre(null);
      await dormir(3400);
      setVuelta((v) => v + 1);
    };
    correr().catch((error: unknown) => {
      if (error !== CORTE) throw error;
    });
    return () => {
      viva = false;
    };
  }, [escena, vuelta]);

  const d = (clave: string) => ({
    "data-demo": clave,
    "data-sobre": sobre === clave ? "true" : undefined,
    "data-pulsado": pulsado === clave ? "true" : undefined,
  });
  const menu = texto(e.menu) || escena.menu;
  const pasos = escena.guion.flatMap((a) => ("narrar" in a ? [a.narrar] : []));

  return (
    <figure className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold">Así se hace</figcaption>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setPausado((p) => !p)}
            className="presion rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            {pausado ? "Seguir" : "Pausar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPausado(false);
              setVuelta((v) => v + 1);
            }}
            className="presion rounded-lg px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            Repetir
          </button>
        </div>
      </div>

      {/* Para lectores de pantalla, la demo se describe con sus frases. */}
      <ol className="sr-only">
        {pasos.map((paso) => (
          <li key={paso}>{paso}</li>
        ))}
      </ol>

      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-border bg-background shadow-tarjeta"
      >
        {/* Barra de la ventana. */}
        <div className="flex items-center gap-3 border-b border-border bg-muted/60 px-3 py-2">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-naranjo/70" />
            <span className="size-2.5 rounded-full bg-amarillo/80" />
            <span className="size-2.5 rounded-full bg-verde/70" />
          </span>
          <span className="flex-1 truncate rounded-md bg-card px-3 py-1 text-center font-mono text-[0.7rem] text-muted-foreground">
            {texto(e.ruta) || escena.ruta}
          </span>
        </div>

        <div
          ref={escenario}
          className="demo-escenario relative grid h-[23rem] grid-cols-[9.5rem_1fr] text-xs select-none"
        >
          <nav className="flex flex-col gap-0.5 border-r border-border bg-card/70 p-2">
            <p className="mb-1.5 px-2 pt-1 text-[0.7rem] font-semibold text-tinta">
              Escuela Los Aromos
            </p>
            {MENU.map(([nombre, icono]) => (
              <span
                key={nombre}
                {...d(`menu-${nombre}`)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
                  menu === nombre
                    ? "bg-primary font-medium text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Icono nombre={icono} className="size-3.5 shrink-0" />
                {nombre}
              </span>
            ))}
          </nav>
          <div className="relative min-w-0 overflow-hidden p-4">
            <escena.Vista e={e} d={d} foco={foco} />
          </div>

          {/* El cursor: una flecha con la onda de cada clic. */}
          <div
            className="demo-cursor"
            style={{
              translate: `${cursor.x}px ${cursor.y}px`,
              opacity: cursor.visible ? 1 : 0,
            }}
          >
            {cursor.clics > 0 && (
              <span key={cursor.clics} className="demo-onda" />
            )}
            <svg
              key={`flecha-${cursor.clics}`}
              width="18"
              height="22"
              viewBox="0 0 18 22"
              className={cursor.clics > 0 ? "demo-presiona" : undefined}
            >
              <path
                d="M2 1.5v16.2l4.3-4.1 2.9 6.6 2.9-1.3-2.9-6.5h6.1z"
                fill="#13254a"
                stroke="white"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        {/* La frase de cada momento y el avance de la demo. */}
        <div className="border-t border-border bg-card px-4 pt-3 pb-3">
          <p
            key={narracion.numero}
            className="demo-entra min-h-5 text-sm text-foreground"
          >
            {narracion.texto}
          </p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-verde transition-[width] duration-500 ease-out"
              style={{ width: `${Math.round(avance * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </figure>
  );
}

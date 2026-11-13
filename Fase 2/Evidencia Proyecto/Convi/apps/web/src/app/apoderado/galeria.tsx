"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { claseBotonPrimario, claseBotonSecundario } from "@/app/components/formulario";
import { Icono } from "@/app/components/icono";

export type ImagenGaleria = { id: string; titulo: string; vista: string; descarga: string; detalle: string };

/**
 * Imágenes que subieron los profesores o Convivencia, con vista previa y
 * descarga. En modo "miniaturas" muestra una grilla que carga las imágenes
 * recién al acercarse a la pantalla, en modo "boton" solo un botón Ver. La
 * vista previa es un <dialog> modal: Escape o tocar afuera lo cierran, y las
 * flechas del teclado pasan de una imagen a otra.
 */
export function Galeria({ imagenes, modo = "miniaturas" }: { imagenes: ImagenGaleria[]; modo?: "miniaturas" | "boton" }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [indice, setIndice] = useState(0);
  const [abierto, setAbierto] = useState(false);
  const actual = imagenes[indice] ?? imagenes[0];
  if (!actual) return null;

  const abrir = (i: number) => {
    setIndice(i);
    setAbierto(true);
    dialogo.current?.showModal();
  };
  const cerrar = () => dialogo.current?.close();
  const mover = (paso: number) => setIndice((i) => (i + paso + imagenes.length) % imagenes.length);
  const alTeclear = (evento: KeyboardEvent<HTMLDialogElement>) => {
    if (imagenes.length < 2) return;
    if (evento.key === "ArrowRight") mover(1);
    if (evento.key === "ArrowLeft") mover(-1);
  };

  return <>
    {modo === "boton" ?
      <button type="button" onClick={() => abrir(0)} aria-label={`Ver ${actual.titulo}`} className={`${claseBotonSecundario} min-h-10 gap-1.5 px-3.5 py-2 text-primary`}>
        <Icono nombre="ojo" className="size-4" />Ver
      </button> :
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {imagenes.map((imagen, i) => <li key={imagen.id}>
          <button type="button" onClick={() => abrir(i)} className="presion group block w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-tarjeta hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <span className="relative block aspect-[4/3] bg-muted">
              <Image src={imagen.vista} alt="" fill unoptimized sizes="(min-width: 640px) 33vw, 50vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            </span>
            <span className="block px-3 py-2">
              <span className="block truncate text-sm font-medium">{imagen.titulo}</span>
              <span className="block truncate text-xs text-muted-foreground">{imagen.detalle}</span>
              <span className="sr-only">, abrir la vista previa</span>
            </span>
          </button>
        </li>)}
      </ul>}

    <dialog
      ref={dialogo}
      aria-label={`Vista previa de ${actual.titulo}`}
      onClose={() => setAbierto(false)}
      onKeyDown={alTeclear}
      onClick={(evento) => { if (evento.target === evento.currentTarget) cerrar(); }}
      className="m-auto w-[min(56rem,calc(100%-1.5rem))] max-w-none scale-95 overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground opacity-0 shadow-xl transition-[opacity,scale,overlay,display] transition-discrete duration-200 backdrop:bg-tinta/70 open:scale-100 open:opacity-100 starting:open:scale-95 starting:open:opacity-0"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{actual.titulo}</p>
          <p className="truncate text-xs text-muted-foreground">{actual.detalle}{imagenes.length > 1 ? ` · ${indice + 1} de ${imagenes.length}` : ""}</p>
        </div>
        <button type="button" onClick={cerrar} className="presion inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <Icono nombre="cerrar" className="size-5" /><span className="sr-only">Cerrar la vista previa</span>
        </button>
      </div>
      <div className="relative h-[min(65dvh,40rem)] bg-muted">
        {/* La imagen grande se pide recién al abrir la vista previa. */}
        {abierto && <Image key={actual.id} src={actual.vista} alt={actual.titulo} fill unoptimized sizes="(min-width: 56rem) 56rem, 100vw" className="object-contain" />}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        {imagenes.length > 1 ? <div className="flex gap-2">
          <button type="button" onClick={() => mover(-1)} className={`${claseBotonSecundario} min-h-10 gap-1.5 px-3.5 py-2`}><Icono nombre="flecha" className="size-4 rotate-180" />Anterior</button>
          <button type="button" onClick={() => mover(1)} className={`${claseBotonSecundario} min-h-10 gap-1.5 px-3.5 py-2`}>Siguiente<Icono nombre="flecha" className="size-4" /></button>
        </div> : <span />}
        <a href={actual.descarga} className={`${claseBotonPrimario} min-h-10 gap-1.5 px-3.5 py-2`}><Icono nombre="descargar" className="size-4" />Descargar</a>
      </div>
    </dialog>
  </>;
}

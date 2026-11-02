"use client";

import type { ClavePaso } from "../opciones";
import { ESCENAS } from "./escenas";
import { Reproductor } from "./reproductor";

/** La demo animada de un paso de la guía inicial. */
export function DemoPaso({ paso }: { paso: ClavePaso }) {
  return <Reproductor escena={ESCENAS[paso]} />;
}

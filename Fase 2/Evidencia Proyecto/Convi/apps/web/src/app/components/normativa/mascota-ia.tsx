"use client";

import { useEffect, useRef, type PointerEvent as EventoPuntero } from "react";

/**
 * Mascota decorativa de la IA de CONVI: el gato ejecutivo pixel-art que diseñó
 * Camilo, dibujado en un canvas. Cada fase de la consulta tiene su animación.
 */
export type FaseMascota =
  | "reposo"
  | "buscando"
  | "pensando"
  | "escribiendo"
  | "listo"
  | "sin-disposicion"
  | "error";

const MENSAJES: Record<FaseMascota, string> = {
  reposo:
    "Hola, pregúntame lo que necesites saber del reglamento de tu escuela",
  buscando: "Buscando en el reglamento…",
  pensando: "Leyendo los artículos que encontré…",
  escribiendo: "Escribiendo la respuesta…",
  listo: "Listo, revisa las citas antes de usar la respuesta",
  "sin-disposicion": "No encontré nada sobre eso en el reglamento",
  error: "No pude conectarme ahora, intenta de nuevo en un rato",
};

// Tamaño de cada píxel del gato y del lienzo, en píxeles de pantalla.
const P = 4;
const ANCHO = 168;
const ALTO = 150;
const BASE_X = 76;
const BASE_Y = 84;

const PALETA = {
  cuerpo: "#0077ff",
  relieve: "#0045a6",
  oscuro: "#0059c9",
  brillo: "#4ce4ff",
  corbataBorde: "#001d52",
  corbata: "#149bff",
  nudo: "#38c0ff",
  ojo: "#04070e",
};

type Bloque = { x: number; y: number; w: number; h: number };
type Fila = { y: number; x1: number; x2: number };

const OREJA_IZQ: Bloque[] = [
  { x: -8, y: -15, w: 1, h: 1 },
  { x: -9, y: -14, w: 3, h: 1 },
  { x: -9, y: -13, w: 4, h: 1 },
  { x: -9, y: -12, w: 5, h: 1 },
];
const OREJA_IZQ_INTERIOR: Bloque[] = [
  { x: -8, y: -13, w: 1, h: 1 },
  { x: -8, y: -12, w: 2, h: 1 },
];
const OREJA_DER: Bloque[] = [
  { x: 8, y: -15, w: 1, h: 1 },
  { x: 7, y: -14, w: 3, h: 1 },
  { x: 6, y: -13, w: 4, h: 1 },
  { x: 5, y: -12, w: 5, h: 1 },
];
const OREJA_DER_INTERIOR: Bloque[] = [
  { x: 8, y: -13, w: 1, h: 1 },
  { x: 7, y: -12, w: 2, h: 1 },
];

const CABEZA: Fila[] = [
  { y: -11, x1: -9, x2: 9 },
  { y: -10, x1: -9, x2: 9 },
  { y: -9, x1: -10, x2: 10 },
  { y: -8, x1: -10, x2: 10 },
  { y: -7, x1: -10, x2: 10 },
  { y: -6, x1: -10, x2: 10 },
  { y: -5, x1: -10, x2: 10 },
  { y: -4, x1: -9, x2: 9 },
  { y: -3, x1: -8, x2: 8 },
  { y: -2, x1: -6, x2: 6 },
];

const BRILLOS_FRENTE = [
  { x: 4, y: -10 },
  { x: 5, y: -10 },
  { x: 4, y: -9 },
  { x: 5, y: -9 },
  { x: 6, y: -8 },
  { x: 7, y: -8 },
  { x: 6, y: -7 },
  { x: 7, y: -7 },
];

const TORSO: Fila[] = [
  { y: -1, x1: -5, x2: 5 },
  { y: 0, x1: -6, x2: 6 },
  { y: 1, x1: -7, x2: 7 },
  { y: 2, x1: -7, x2: 7 },
  { y: 3, x1: -8, x2: 8 },
  { y: 4, x1: -8, x2: 8 },
  { y: 5, x1: -9, x2: 9 },
  { y: 6, x1: -9, x2: 9 },
  { y: 7, x1: -9, x2: 9 },
  { y: 8, x1: -9, x2: 9 },
  { y: 9, x1: -8, x2: 8 },
];

type TipoCorbata = "borde" | "nudo" | "hoja";
const CORBATA: { x: number; y: number; t: TipoCorbata }[] = [
  ...[-1, 0, 1].map((x) => ({ x, y: -1, t: "borde" as const })),
  ...[0, 1].flatMap((y) =>
    [-2, -1, 0, 1, 2].map((x) => ({
      x,
      y,
      t: Math.abs(x) === 2 ? ("borde" as const) : ("nudo" as const),
    })),
  ),
  { x: -1, y: 2, t: "borde" },
  { x: 0, y: 2, t: "hoja" },
  { x: 1, y: 2, t: "borde" },
  ...[3, 4, 5, 6].flatMap((y) =>
    [-2, -1, 0, 1, 2].map((x) => ({
      x,
      y,
      t: Math.abs(x) === 2 ? ("borde" as const) : ("hoja" as const),
    })),
  ),
  { x: -1, y: 7, t: "borde" },
  { x: 0, y: 7, t: "hoja" },
  { x: 1, y: 7, t: "borde" },
  { x: 0, y: 8, t: "borde" },
];

const COLA = [
  { x: 9, y: 7, punta: false },
  { x: 11, y: 6, punta: false },
  { x: 13, y: 5, punta: false },
  { x: 14, y: 3, punta: false },
  { x: 15, y: 1, punta: false },
  { x: 15, y: -1, punta: false },
  { x: 14, y: -3, punta: true },
  { x: 13, y: -4, punta: true },
];

type Particula = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tamano: number;
  color: string;
  vida: number;
  desgaste: number;
};

type EstadoAnimacion = {
  punteroX: number;
  punteroY: number;
  saltoY: number;
  saltoV: number;
  corbata: number;
  orejas: number;
  cola: number;
  ronroneo: number;
  particulas: Particula[];
};

function estallido(
  s: EstadoAnimacion,
  x: number,
  y: number,
  cantidad: number,
  color?: string,
) {
  for (let i = 0; i < cantidad; i++) {
    const angulo = (Math.PI * 2 * i) / cantidad + (Math.random() - 0.5) * 0.4;
    const rapidez = 0.8 + Math.random() * 2.2;
    s.particulas.push({
      x,
      y,
      vx: Math.cos(angulo) * rapidez,
      vy: Math.sin(angulo) * rapidez - 0.6,
      tamano: Math.random() > 0.4 ? 3 : 2,
      color: color ?? (i % 2 === 0 ? PALETA.brillo : PALETA.cuerpo),
      vida: 1,
      desgaste: 0.025 + Math.random() * 0.02,
    });
  }
}

function dibujar(
  ctx: CanvasRenderingContext2D,
  s: EstadoAnimacion,
  fase: FaseMascota,
  t: number,
) {
  const pixel = (
    gx: number,
    gy: number,
    gw: number,
    gh: number,
    color: string,
    sombra: string | null,
    ox: number,
    oy: number,
  ) => {
    const x = Math.round(ox + gx * P);
    const y = Math.round(oy + gy * P);
    const w = Math.round(gw * P);
    const h = Math.round(gh * P);
    if (sombra) {
      ctx.fillStyle = sombra;
      ctx.fillRect(x + 2, y + 2, w, h);
      ctx.fillRect(x, y + 2, w, h);
    }
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };

  ctx.clearRect(0, 0, ANCHO, ALTO);

  const feliz = fase === "listo" || s.ronroneo > 0;
  const dormido = fase === "error" && s.ronroneo === 0;
  const escribiendo = fase === "escribiendo";

  // Salto y temporizadores de cada gesto.
  s.saltoY += s.saltoV;
  s.saltoV += 0.5;
  if (s.saltoY > 0) {
    s.saltoY = 0;
    s.saltoV = 0;
  }
  if (s.corbata > 0) s.corbata--;
  if (s.orejas > 0) s.orejas--;
  if (s.cola > 0) s.cola--;
  if (s.ronroneo > 0) s.ronroneo--;

  // Respiración en escalones de medio píxel y vibración al ronronear.
  const respiracion =
    Math.round((Math.sin(t * 2.5) * P * 0.65) / (P * 0.5)) * (P * 0.5);
  const vibracion = s.ronroneo > 0 ? Math.round(Math.sin(t * 55) * 1.5) : 0;
  const ox = BASE_X + vibracion;
  const oy = Math.round(BASE_Y + respiracion + s.saltoY);

  // Sombra en el suelo.
  ctx.fillStyle = "rgba(0, 10, 28, 0.18)";
  ctx.fillRect(BASE_X - 10 * P, Math.round(BASE_Y + 11.8 * P), 20 * P, P + 2);

  // Hoja del reglamento que se escanea mientras busca.
  if (fase === "buscando") {
    const hojaY = oy + Math.round(Math.sin(t * 3) * 1.5);
    pixel(-19, -1, 6, 8, "#ffffff", "#9bb6dd", ox, hojaY);
    for (let linea = 0; linea < 4; linea++) {
      pixel(
        -18,
        0.6 + linea * 1.6,
        linea === 3 ? 2.5 : 4,
        0.6,
        "#9bb6dd",
        null,
        ox,
        hojaY,
      );
    }
    const barrido = ((t * 1.6) % 1) * 7.4;
    pixel(-19.5, -1 + barrido, 7, 0.5, PALETA.brillo, null, ox, hojaY);
  }

  // Tres puntitos encima de la cabeza mientras piensa.
  if (fase === "pensando") {
    const activo = Math.floor(t * 3) % 4;
    [
      { x: 10, y: -16 },
      { x: 12, y: -18 },
      { x: 14, y: -20 },
    ].forEach((punto, i) => {
      ctx.globalAlpha = i < activo ? 1 : 0.25;
      pixel(punto.x, punto.y, 1.5, 1.5, PALETA.brillo, PALETA.relieve, ox, oy);
    });
    ctx.globalAlpha = 1;
  }

  // Cola.
  const velocidadCola =
    s.cola > 0 ? 15 : feliz || escribiendo ? 8.5 : dormido ? 1.2 : 3.4;
  const amplitudCola = dormido ? 0.35 : s.cola > 0 ? 1.65 : 1.05;
  COLA.forEach((seg, i) => {
    const onda =
      Math.sin(t * velocidadCola - i * 0.55) * amplitudCola * (i * 0.22);
    const gy =
      seg.y +
      (dormido
        ? Math.round(i * 0.45)
        : Math.round(Math.cos(t * velocidadCola - i * 0.5) * 0.4));
    pixel(
      seg.x + Math.round(onda),
      gy,
      2,
      2,
      seg.punta ? PALETA.brillo : PALETA.cuerpo,
      seg.punta ? PALETA.cuerpo : PALETA.relieve,
      ox,
      oy,
    );
  });

  // Torso, hombros y corbata (con destello al terminar).
  TORSO.forEach((f) =>
    pixel(f.x1, f.y, f.x2 - f.x1 + 1, 1, PALETA.cuerpo, PALETA.relieve, ox, oy),
  );
  pixel(-6, 1, 2, 1, PALETA.brillo, null, ox, oy);
  pixel(5, 1, 2, 1, PALETA.brillo, null, ox, oy);
  const filaDestello =
    s.corbata > 0 ? Math.floor((55 - s.corbata) / 5) - 1 : -99;
  CORBATA.forEach((c) => {
    let color =
      c.t === "borde"
        ? PALETA.corbataBorde
        : c.t === "nudo"
          ? PALETA.nudo
          : PALETA.corbata;
    if (c.t !== "borde" && (c.y === filaDestello || c.y === filaDestello - 1))
      color = "#ffffff";
    pixel(c.x, c.y, 1, 1, color, null, ox, oy);
  });

  // Orejas, que se sacuden al buscar o cuando algo le extraña.
  const sacudir = s.orejas > 0 || fase === "buscando";
  const orejaIzq =
    (sacudir && Math.sin(t * 32) > 0.2) || Math.sin(t * 1.7) > 0.96 ? -1 : 0;
  const orejaDer =
    (sacudir && Math.cos(t * 32) > 0.2) || Math.cos(t * 2.1) > 0.96 ? 1 : 0;
  OREJA_IZQ.forEach((b, i) =>
    pixel(
      b.x + (i < 2 ? orejaIzq : 0),
      b.y,
      b.w,
      b.h,
      PALETA.cuerpo,
      PALETA.relieve,
      ox,
      oy,
    ),
  );
  OREJA_IZQ_INTERIOR.forEach((b) =>
    pixel(b.x + orejaIzq, b.y, b.w, b.h, PALETA.brillo, null, ox, oy),
  );
  OREJA_DER.forEach((b, i) =>
    pixel(
      b.x + (i < 2 ? orejaDer : 0),
      b.y,
      b.w,
      b.h,
      PALETA.cuerpo,
      PALETA.relieve,
      ox,
      oy,
    ),
  );
  OREJA_DER_INTERIOR.forEach((b) =>
    pixel(b.x + orejaDer, b.y, b.w, b.h, PALETA.brillo, null, ox, oy),
  );

  // Cabeza, brillos, nariz y bigotes.
  CABEZA.forEach((f) =>
    pixel(f.x1, f.y, f.x2 - f.x1 + 1, 1, PALETA.cuerpo, PALETA.relieve, ox, oy),
  );
  BRILLOS_FRENTE.forEach((b) =>
    pixel(b.x, b.y, 1, 1, PALETA.brillo, null, ox, oy),
  );
  pixel(-1, -4, 2, 1, PALETA.brillo, null, ox, oy);
  const bigote = Math.sin(t * 4.5) > 0.65 ? -1 : 0;
  pixel(-12, -6 + bigote, 2, 1, PALETA.brillo, PALETA.relieve, ox, oy);
  pixel(-11, -4 - bigote, 2, 1, PALETA.oscuro, PALETA.relieve, ox, oy);
  pixel(11, -6 + bigote, 2, 1, PALETA.brillo, PALETA.relieve, ox, oy);
  pixel(10, -4 - bigote, 2, 1, PALETA.oscuro, PALETA.relieve, ox, oy);

  // Ojos según la fase.
  const parpadeo = Math.sin(t * 2.3) > 0.97;
  const dx = s.punteroX - ox;
  const dy = s.punteroY - (oy - 6 * P);
  let pupilaX = dx < -30 ? 0 : dx > 30 ? 2 : 1;
  let pupilaY = dy < -30 ? 0 : dy > 30 ? 2 : 1;
  if (fase === "buscando") {
    pupilaX = Math.round(Math.sin(t * 5) + 1);
    pupilaY = 1;
  } else if (escribiendo) {
    pupilaX = 1;
    pupilaY = 2;
  }
  [
    { gx: -6, gy: -7 },
    { gx: 4, gy: -7 },
  ].forEach((ojo) => {
    if (dormido || parpadeo) {
      pixel(ojo.gx, ojo.gy + 1, 3, 1, PALETA.ojo, null, ox, oy);
      pixel(ojo.gx + 1, ojo.gy + 1, 1, 1, PALETA.brillo, null, ox, oy);
    } else if (feliz) {
      pixel(ojo.gx + 1, ojo.gy, 1, 1, "#ffffff", null, ox, oy);
      pixel(ojo.gx, ojo.gy + 1, 1, 2, PALETA.ojo, null, ox, oy);
      pixel(ojo.gx + 2, ojo.gy + 1, 1, 2, PALETA.ojo, null, ox, oy);
    } else if (fase === "pensando") {
      pixel(ojo.gx, ojo.gy + 1, 3, 2, PALETA.ojo, null, ox, oy);
      pixel(ojo.gx + 2, ojo.gy + 1, 1, 1, "#ffffff", null, ox, oy);
      pixel(ojo.gx, ojo.gy, 3, 1, PALETA.brillo, null, ox, oy);
    } else {
      pixel(ojo.gx, ojo.gy, 3, 3, PALETA.ojo, null, ox, oy);
      pixel(ojo.gx + pupilaX, ojo.gy + pupilaY, 1, 1, "#ffffff", null, ox, oy);
    }
  });

  // Patas, que teclean mientras escribe.
  const golpeIzq = escribiendo ? (Math.sin(t * 34) > 0 ? 1 : -1) : 0;
  const golpeDer = escribiendo ? (Math.sin(t * 34 + Math.PI) > 0 ? 1 : -1) : 0;
  pixel(-7, 9 + golpeIzq, 4, 2, PALETA.cuerpo, PALETA.relieve, ox, oy);
  pixel(-6, 10 + golpeIzq, 1, 1, PALETA.brillo, null, ox, oy);
  pixel(-4, 10 + golpeIzq, 1, 1, PALETA.brillo, null, ox, oy);
  pixel(4, 9 + golpeDer, 4, 2, PALETA.cuerpo, PALETA.relieve, ox, oy);
  pixel(4, 10 + golpeDer, 1, 1, PALETA.brillo, null, ox, oy);
  pixel(6, 10 + golpeDer, 1, 1, PALETA.brillo, null, ox, oy);

  if (escribiendo) {
    const kx = Math.round(ox - 9.5 * P);
    const ky = Math.round(oy + 11.2 * P);
    ctx.fillStyle = "rgba(4, 18, 42, 0.9)";
    ctx.fillRect(kx, ky, 19 * P, Math.round(3.4 * P));
    ctx.strokeStyle = PALETA.brillo;
    ctx.lineWidth = 1;
    ctx.strokeRect(kx + 0.5, ky + 0.5, 19 * P - 1, Math.round(3.4 * P) - 1);
    for (let c = 0; c < 10; c++) {
      for (let r = 0; r < 2; r++) {
        ctx.fillStyle =
          Math.sin(t * 32 + c * 1.9 + r * 2.7) > 0.25
            ? PALETA.brillo
            : PALETA.relieve;
        ctx.fillRect(
          kx + Math.round(P * 0.9) + c * Math.round(P * 1.75),
          ky + Math.round(P * 0.6) + r * Math.round(P * 1.25),
          Math.round(P * 1.45),
          Math.round(P * 0.95),
        );
      }
    }
    if (Math.random() > 0.6)
      estallido(
        s,
        ox + (Math.random() - 0.5) * 12 * P,
        oy + 11 * P,
        1,
        PALETA.brillo,
      );
  }

  if (s.ronroneo > 0 && Math.random() > 0.7)
    estallido(
      s,
      ox + (Math.random() - 0.5) * 14 * P,
      oy - 8 * P,
      1,
      PALETA.brillo,
    );

  // Partículas.
  for (let i = s.particulas.length - 1; i >= 0; i--) {
    const p = s.particulas[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.vida -= p.desgaste;
    if (p.vida <= 0) {
      s.particulas.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = p.vida;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.tamano, p.tamano);
  }
  ctx.globalAlpha = 1;
}

export function MascotaIA({ fase }: { fase: FaseMascota }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const faseActual = useRef<FaseMascota>(fase);
  const animacion = useRef<EstadoAnimacion>({
    punteroX: BASE_X,
    punteroY: 0,
    saltoY: 0,
    saltoV: 0,
    corbata: 0,
    orejas: 0,
    cola: 0,
    ronroneo: 0,
    particulas: [],
  });

  // Cada cambio de fase dispara su gesto una sola vez.
  useEffect(() => {
    const anterior = faseActual.current;
    faseActual.current = fase;
    if (anterior === fase) return;
    const s = animacion.current;
    if (fase === "buscando") s.orejas = 40;
    if (fase === "listo") {
      s.saltoV = -5;
      s.corbata = 55;
      s.cola = 60;
      estallido(s, BASE_X, BASE_Y + 4 * P, 18);
    }
    if (fase === "sin-disposicion") s.orejas = 60;
  }, [fase]);

  useEffect(() => {
    const canvas = lienzo.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = ANCHO * escala;
    canvas.height = ALTO * escala;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const s = animacion.current;
    const mirar = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      s.punteroX = e.clientX - r.left;
      s.punteroY = e.clientY - r.top;
    };
    window.addEventListener("pointermove", mirar);
    let cuadro = 0;
    const animar = (ahora: number) => {
      cuadro = requestAnimationFrame(animar);
      dibujar(ctx, s, faseActual.current, ahora / 1000);
    };
    cuadro = requestAnimationFrame(animar);
    return () => {
      cancelAnimationFrame(cuadro);
      window.removeEventListener("pointermove", mirar);
    };
  }, []);

  // Al hacerle clic, ronronea.
  const acariciar = (e: EventoPuntero<HTMLCanvasElement>) => {
    const s = animacion.current;
    const r = e.currentTarget.getBoundingClientRect();
    s.ronroneo = 90;
    estallido(s, e.clientX - r.left, e.clientY - r.top, 12);
  };

  return (
    <div className="flex items-end gap-2">
      <canvas
        ref={lienzo}
        aria-hidden="true"
        onPointerDown={acariciar}
        className="shrink-0 cursor-pointer"
        style={{ width: ANCHO, height: ALTO, imageRendering: "pixelated" }}
      />
      <p
        role="status"
        className="relative mb-16 max-w-sm rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-2.5 text-sm shadow-sm"
      >
        {MENSAJES[fase]}
      </p>
    </div>
  );
}

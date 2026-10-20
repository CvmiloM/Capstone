import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import mascota from "@/assets/convi-favicon.png";
import escuelaMontegrande from "@/assets/landing/escuela-montegrande.jpg";
import escuelaManquemapu from "@/assets/landing/escuela-rural-manquemapu.jpg";
import liceo1920 from "@/assets/landing/liceo-de-aplicacion-1920.jpg";
import patioLiceo from "@/assets/landing/patio-liceo-de-aplicacion.jpg";
import { CursoAlOcurrir } from "./_landing/curso-al-ocurrir";
import { EntradasAlBajar } from "./_landing/entradas";
import { FilaDeMomentos } from "./_landing/fila-de-momentos";
import {
  AclaracionFragmento,
  BandejaFragmento,
  DecisionFragmento,
  HistorialFragmento,
  ImportacionFragmento,
  LlegaFragmento,
  PerfilesFragmento,
  RegistroFragmento,
  RespuestaFragmento,
  RevisionFragmento,
  SegundoFactorFragmento,
} from "./_landing/fragmentos";
import "./_landing/landing.css";
import { LoQueIncluye, type GrupoIncluye } from "./_landing/lo-que-incluye";

export const metadata: Metadata = {
  title: { absolute: "Convi · Convivencia escolar" },
  description:
    "Registro y seguimiento de la convivencia escolar para colegios de Chile.",
};

/*
 * Landing de Convi. La idea: la página es la carpeta de expedientes del
 * equipo de convivencia. Cada carpeta de la pila lleva a su sección y le
 * presta su color; la de adelante está abierta y muestra la bandeja real.
 * Los datos de las situaciones y estudiantes son de ejemplo.
 */
const CARPETAS = [
  { nombre: "El registro", href: "#registro", fondo: "var(--pizarra)", tinta: "var(--crema)", x: "4%", xTelefono: "4%" },
  { nombre: "Cómo avanza", href: "#como-avanza", fondo: "var(--menta)", tinta: "var(--tinta)", x: "25%", xTelefono: "34%" },
  { nombre: "Curso de ese día", href: "#historial", fondo: "var(--amarillo)", tinta: "var(--tinta)", x: "47%", xTelefono: "48%" },
  { nombre: "Qué incluye", href: "#incluye", fondo: "var(--niebla)", tinta: "var(--tinta)", x: "70%", xTelefono: "10%" },
];

// Comprobantes de "El registro": lo que Convi guarda de cada situación.
const COMPROBANTES = [
  { alto: "36svh", giro: "-1.5deg", lineas: ["SIT-2026-00041", "Nueva · Inmediata", "Agresión verbal", "Cancha techada, recreo largo", "14-10-2026 11:20", "7° básico B · 2 estudiantes"] },
  { alto: "28svh", giro: "0deg", lineas: ["SIT-2026-00040", "En revisión · Urgente", "Conflicto entre pares", "Pasillo del segundo piso", "13-10-2026 16:05", "2° medio A · 3 estudiantes"] },
  { alto: "38svh", giro: "1.2deg", lineas: ["SIT-2026-00039", "Información solicitada", "Uso indebido de redes sociales", "Fuera del colegio", "10-10-2026 09:40", "1° medio C · 1 estudiante", "Esperando aclaración"] },
  { alto: "25svh", giro: "0deg", lineas: ["SIT-2026-00038", "Antecedente · Normal", "Daño a materiales", "Laboratorio de ciencias", "08-10-2026 12:15"] },
  { alto: "33svh", giro: "-1deg", lineas: ["SIT-2026-00037", "Descartada · Normal", "Discusión en el comedor", "07-10-2026 13:30", "3° medio C · 2 estudiantes", "Fundamento registrado"] },
  { alto: "30svh", giro: "0deg", lineas: ["SIT-2026-00036", "Vinculada a un caso", "Acoso escolar", "06-10-2026 10:10", "8° básico A · 4 estudiantes"] },
];

const MOMENTOS: { titulo: string; texto: string; espacio: number; imagen: ReactNode }[] = [
  {
    titulo: "Pasa en el recreo",
    texto: "En la cancha, un estudiante empuja a otro. Lo ve el profesor de turno.",
    espacio: 96,
    imagen: (
      <Image
        src={escuelaManquemapu}
        alt="Escuela rural de Manquemapu, una casa de madera turquesa junto a su cancha de fútbol"
        sizes="300px"
        className="aspect-[4/5] w-full object-cover object-[42%_70%]"
      />
    ),
  },
  { titulo: "El profesor lo registra", texto: "Desde Mis cursos elige a los estudiantes, su rol y la urgencia. La hora queda en la del colegio.", espacio: 132, imagen: <RegistroFragmento /> },
  { titulo: "Llega a Convivencia", texto: "Aparece en la bandeja como Nueva, con las más urgentes arriba.", espacio: 84, imagen: <LlegaFragmento /> },
  { titulo: "Alguien la revisa", texto: "Al iniciar la revisión pasa a En revisión. Si cambia la urgencia, queda escrito el motivo.", espacio: 120, imagen: <RevisionFragmento /> },
  { titulo: "Falta un dato", texto: "Convivencia le pregunta al profesor que la registró, y la situación espera su respuesta.", espacio: 100, imagen: <AclaracionFragmento /> },
  { titulo: "El profesor responde", texto: "La respuesta queda junto a la pregunta, con su fecha. Lo enviado ya no se cambia.", espacio: 140, imagen: <RespuestaFragmento /> },
  { titulo: "Se decide", texto: "Queda como antecedente, se descarta con fundamento o se vincula a un caso.", espacio: 88, imagen: <DecisionFragmento /> },
  { titulo: "Queda en su historial", texto: "Cada estudiante la guarda con el curso que tenía ese día.", espacio: 124, imagen: <HistorialFragmento /> },
];

const GRUPOS: GrupoIncluye[] = [
  {
    nombre: "Para cada perfil",
    filas: [
      { nombre: "Profesor", valor: "sus cursos", detalle: "Registra situaciones de los cursos que tiene asignados y responde las aclaraciones." },
      { nombre: "Convivencia", valor: "todo el colegio", detalle: "Recibe la bandeja, revisa, pide aclaraciones y decide." },
      { nombre: "Administración", valor: "la estructura", detalle: "Años académicos, niveles, cursos, profesores, matrículas y cuentas." },
    ],
  },
  {
    nombre: "Para empezar",
    filas: [
      { nombre: "Nómina en Excel", valor: "con vista previa", detalle: "Estudiantes, cursos o profesores; revisas fila por fila antes de confirmar." },
      { nombre: "Invitaciones", valor: "por correo", detalle: "Cada profesor activa su cuenta desde el enlace que recibe." },
      { nombre: "Categorías", valor: "las de tu colegio", detalle: "El catálogo de tipos de situación lo define cada colegio." },
    ],
  },
  {
    nombre: "Cuidado de los datos",
    filas: [
      { nombre: "Segundo factor", valor: "siempre", detalle: "Administración y Convivencia entran con contraseña y un código de su app." },
      { nombre: "Cada colegio", valor: "por separado", detalle: "Ningún colegio puede ver los datos de otro." },
      { nombre: "El registro original", valor: "no se reescribe", detalle: "Lo que se corrige se agrega como aclaración, con fecha y autor." },
    ],
  },
];

const CREDITOS = [
  { titulo: "Liceo de Aplicación - patio", autor: "Carlos Urzua", licencia: "CC BY 2.0", urlLicencia: "https://creativecommons.org/licenses/by/2.0/", pagina: "https://commons.wikimedia.org/wiki/File:Liceo_de_Aplicaci%C3%B3n_-_patio.jpg" },
  { titulo: "Escuela Rural de Manquemapu", autor: "David Rantul", licencia: "CC BY-SA 4.0", urlLicencia: "https://creativecommons.org/licenses/by-sa/4.0/", pagina: "https://commons.wikimedia.org/wiki/File:Escuela_Rural_de_Manquemapu.jpeg" },
  { titulo: "Liceo de Aplicación 1920", autor: "Dirección de Arquitectura del MOP", licencia: "dominio público", urlLicencia: "https://creativecommons.org/publicdomain/mark/1.0/", pagina: "https://commons.wikimedia.org/wiki/File:Liceo_de_Aplicaci%C3%B3n_1920.jpg" },
  { titulo: "Casa escuela rural de Montegrande", autor: "Magololo", licencia: "CC BY-SA 3.0", urlLicencia: "https://creativecommons.org/licenses/by-sa/3.0/", pagina: "https://commons.wikimedia.org/w/index.php?curid=21246269" },
];

const claseEnlace =
  "underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current";

export default function PaginaInicio() {
  return (
    <div className={`lp-pagina flex flex-1 flex-col font-cuerpo`}>
      <main className="flex-1">
        {/* La pila de carpetas. */}
        <section aria-labelledby="titulo-convi" className="lp-heroe">
          <nav aria-label="Principal" className="lp-barra">
            <Link href="/" aria-label="Convi, inicio" className="rounded-full focus-visible:outline-2 focus-visible:outline-crema">
              <Image src={mascota} alt="" priority className="block size-12" />
            </Link>
            <Link href="/login" className={`lp-acceso ${claseEnlace}`}>
              Iniciar sesión
            </Link>
          </nav>
          <h1 id="titulo-convi" className="lp-nombre">
            Convi
          </h1>
          <p className="lp-bajada">
            Registro y seguimiento de la convivencia escolar para colegios de
            Chile: del aviso del profesor al historial de cada estudiante.
          </p>

          <div className="lp-carpetas">
            {CARPETAS.map((carpeta, i) => (
              <a
                key={carpeta.href}
                href={carpeta.href}
                className="lp-carpeta"
                style={
                  {
                    "--i": i,
                    "--fondo": carpeta.fondo,
                    "--tinta-carpeta": carpeta.tinta,
                    "--x": carpeta.x,
                    "--x-telefono": carpeta.xTelefono,
                  } as CSSProperties
                }
              >
                <span className="lp-pestana">{carpeta.nombre}</span>
              </a>
            ))}
            <div
              className={`lp-carpeta lp-frente`}
              style={
                {
                  "--i": CARPETAS.length,
                  "--fondo": "var(--crema)",
                  "--x": "8%",
                  "--x-telefono": "58%",
                } as CSSProperties
              }
            >
              <span className="lp-pestana" aria-hidden="true">
                Bandeja de hoy
              </span>
              <Link
                href="/registro"
                className={`lp-boton-pestana presion inline-flex h-14 w-full items-center justify-center bg-naranjo px-8 font-bold text-tinta hover:bg-amarillo sm:w-auto`}
              >
                Registrar mi colegio
              </Link>
              <div className="mt-8">
                <BandejaFragmento />
              </div>
            </div>
          </div>
        </section>

        {/* El registro: la foto del patio y los comprobantes. */}
        <section id="registro" aria-labelledby="titulo-registro" className="lp-registro">
          <Image
            src={patioLiceo}
            alt="Patio interior del Liceo de Aplicación, en Santiago, con corredores de madera de dos pisos y árboles"
            fill
            sizes="100vw"
            className="lp-foto"
          />
          <div className="relative pt-[9svh]">
            <div className="lp-columna-registro">
              <h2
                id="titulo-registro"
                data-entra="0"
                className="text-[length:var(--t-frase)] leading-tight font-extrabold"
              >
                Lo que pasa en el patio
              </h2>
              <p data-entra="1" className="mt-3 text-[length:var(--t-frase)] leading-snug text-pretty">
                queda escrito ese mismo día, con su hora, su lugar, quiénes
                participaron y su urgencia.
              </p>
              <p data-entra="2" className="mt-4 text-[length:var(--t-frase)] leading-snug text-pretty">
                Nadie lo reescribe: si falta un dato, se agrega una aclaración.
              </p>
            </div>
          </div>
          <ul aria-label="Situaciones registradas" className="lp-comprobantes">
            {COMPROBANTES.map(({ alto, giro, lineas: [codigo, ...resto] }, i) => (
              <li
                key={codigo}
                data-entra={String(i % 4)}
                className="lp-comprobante"
                style={{ "--alto": alto, "--giro": giro } as CSSProperties}
              >
                <p className="font-bold">{codigo}</p>
                <p aria-hidden="true" className="lp-separador">
                  - - - - - - - - - - - - - - - - - - - -
                </p>
                {resto.map((linea) => (
                  <p key={linea}>{linea}</p>
                ))}
              </li>
            ))}
          </ul>
        </section>

        {/* Cómo avanza: la fila de momentos. */}
        <section
          id="como-avanza"
          aria-labelledby="titulo-como"
          className="bg-menta py-[var(--seccion)]"
        >
          <FilaDeMomentos
            titulo={
              <div className="grid gap-6 px-[var(--margen)] lg:grid-cols-12 lg:items-end">
                <h2
                  id="titulo-como"
                  data-entra="0"
                  className="text-[length:var(--t-titulo)] leading-none font-extrabold tracking-[-0.02em] lg:col-span-5"
                >
                  Cómo avanza una situación
                </h2>
                <p data-entra="1" className="max-w-[52ch] text-pretty lg:col-span-6 lg:col-start-7">
                  Del recreo al historial del estudiante, entre el profesor que
                  la vio y el equipo de convivencia. Arrastra la fila o usa las
                  flechas.
                </p>
              </div>
            }
          >
            {MOMENTOS.map((momento) => (
              <li key={momento.titulo} className="lp-momento">
                <h3 className="text-lg leading-snug font-bold">{momento.titulo}</h3>
                <p className="mt-2 text-[length:var(--t-chico)] text-pretty">{momento.texto}</p>
                <div
                  aria-hidden="true"
                  className="h-[calc(var(--espacio)*0.45)] md:h-[var(--espacio)]"
                  style={{ "--espacio": `${momento.espacio}px` } as CSSProperties}
                />
                {momento.imagen}
              </li>
            ))}
          </FilaDeMomentos>
        </section>

        {/* El curso de ese día: lo que se puede tocar. */}
        <section
          id="historial"
          aria-labelledby="titulo-historial"
          className="bg-amarillo px-[var(--margen)] py-[var(--seccion)]"
        >
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <h2
                id="titulo-historial"
                data-entra="0"
                className="text-[length:var(--t-titulo)] leading-none font-extrabold tracking-[-0.02em]"
              >
                El curso de ese día
              </h2>
              <p data-entra="1" className="mt-6 max-w-[56ch] text-pretty">
                Los estudiantes pasan de curso, se trasladan o se retiran. Cada
                situación guarda la matrícula que tenía el estudiante el día del
                hecho y, aparte, muestra su curso actual. Mueve la fecha y
                mira qué queda guardado.
              </p>
              <div data-entra="2" className="mt-10">
                <CursoAlOcurrir />
              </div>
            </div>
            <figure data-entra="1" className="self-end lg:col-span-5 lg:col-start-8">
              <Image
                src={liceo1920}
                alt="El Liceo de Aplicación de Santiago en 1920, con su cúpula, sus ventanas en arco y la calle aún de tierra"
                sizes="(min-width: 1024px) 40vw, 100vw"
                className="w-full"
              />
              <figcaption className="mt-3 text-[length:var(--t-chico)]">
                Liceo de Aplicación, Santiago, 1920.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* Qué incluye: la hoja con su vista previa. */}
        <section
          id="incluye"
          aria-labelledby="titulo-incluye"
          className="bg-niebla px-[var(--margen)] py-[var(--seccion)]"
        >
          <LoQueIncluye
            titulo={
              <h2
                id="titulo-incluye"
                className="text-[length:var(--t-titulo)] leading-none font-extrabold tracking-[-0.02em]"
              >
                Qué incluye
              </h2>
            }
            grupos={GRUPOS}
            vistas={[
              <PerfilesFragmento key="perfiles" />,
              <ImportacionFragmento key="importacion" />,
              <SegundoFactorFragmento key="segundo-factor" />,
            ]}
          />
        </section>

        {/* Empezar: la tarjeta de respuesta. */}
        <section
          id="empezar"
          aria-labelledby="titulo-empezar"
          className="relative z-10 bg-tinta px-[var(--margen)] pt-[var(--seccion)]"
        >
          <div className="grid items-start gap-12 lg:grid-cols-12">
            <div className="text-crema lg:col-span-5">
              <p
                data-entra="0"
                className="text-[length:var(--t-frase)] leading-snug font-semibold text-pretty"
              >
                Basta el correo de quien administrará el colegio.
              </p>
              <p data-entra="1" className="mt-6 max-w-[40ch] text-pretty">
                Esa persona crea la estructura del colegio. Los profesores
                reciben su invitación por correo y activan su cuenta desde el
                enlace.
              </p>
            </div>
            <div
              data-entra="1"
              className={`lp-tarjeta -mb-[60px] flex flex-col items-center bg-crema px-6 py-14 text-center sm:px-12 lg:col-span-6 lg:col-start-7`}
            >
              <h2
                id="titulo-empezar"
                className="text-[length:var(--t-frase)] leading-tight font-extrabold"
              >
                Registra tu colegio
              </h2>
              <p className="mt-4 max-w-[42ch] text-pretty">
                Crea la cuenta del primer administrador y da de alta el colegio.
                Después configuras años, niveles y cursos, e importas la nómina.
              </p>
              <Link
                href="/registro"
                className="presion mt-8 flex h-14 w-full items-center justify-center bg-naranjo font-bold text-tinta hover:bg-amarillo"
              >
                Registrar mi colegio
              </Link>
              <p className="mt-4 text-[length:var(--t-chico)]">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-semibold underline underline-offset-4">
                  Inicia sesión
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* El reverso de la carpeta. */}
      <footer className="bg-tinta px-[var(--margen)] pt-[120px] pb-[var(--margen)]">
        <div>
          <svg viewBox="0 0 1200 28" preserveAspectRatio="none" aria-hidden="true" className="lp-feston">
            <path
              fill="currentColor"
              d="M0 28A50 28 0 0 1 100 28A50 28 0 0 1 200 28A50 28 0 0 1 300 28A50 28 0 0 1 400 28A50 28 0 0 1 500 28A50 28 0 0 1 600 28A50 28 0 0 1 700 28A50 28 0 0 1 800 28A50 28 0 0 1 900 28A50 28 0 0 1 1000 28A50 28 0 0 1 1100 28A50 28 0 0 1 1200 28Z"
            />
          </svg>
          <div className="grid gap-12 bg-crema px-6 pt-10 pb-8 sm:px-10 lg:min-h-[420px] lg:grid-cols-2">
            <div>
              <h2 className="text-[length:var(--t-frase)] leading-tight font-extrabold">
                Convivencia, en orden
              </h2>
              <p className="mt-4 max-w-[44ch] text-pretty">
                Convi es una plataforma para los equipos de convivencia escolar
                de Chile: los profesores registran, Convivencia revisa y cada
                estudiante conserva su historial.
              </p>
            </div>
            <div className="relative flex items-start justify-between gap-6">
              <ul className="space-y-3 font-semibold">
                <li><Link href="/registro" className={claseEnlace}>Registrar mi colegio</Link></li>
                <li><Link href="/login" className={claseEnlace}>Iniciar sesión</Link></li>
                {/* TODO: páginas de privacidad y términos */}
                <li><a href="#" className={claseEnlace}>Privacidad</a></li>
                <li><a href="#" className={claseEnlace}>Términos</a></li>
              </ul>
              <div className={`lp-sello w-[120px] shrink-0 bg-card p-2`}>
                <Image
                  src={escuelaMontegrande}
                  alt="Escudo de Escuela Pública de Chile en el muro de la escuela de Montegrande"
                  sizes="120px"
                  className="aspect-[3/4] w-full object-cover object-[76%_32%]"
                />
              </div>
            </div>
            <p className="text-[length:var(--t-chico)] text-pretty lg:col-span-2">
              Fotos:{" "}
              {CREDITOS.map((c, i) => (
                <span key={c.titulo}>
                  <a href={c.pagina} className="underline underline-offset-2">
                    «{c.titulo}»
                  </a>
                  , {c.autor},{" "}
                  <a href={c.urlLicencia} className="underline underline-offset-2">
                    {c.licencia}
                  </a>
                  {i < CREDITOS.length - 1 ? "; " : ", vía Wikimedia Commons. "}
                </span>
              ))}
              © 2026 Convi.
            </p>
          </div>
        </div>
      </footer>
      <EntradasAlBajar />
    </div>
  );
}
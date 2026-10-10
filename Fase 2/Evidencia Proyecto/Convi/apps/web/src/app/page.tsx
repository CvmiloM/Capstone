import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import estudiante from "@/assets/convi-favicon.png";
import logo from "@/assets/convi-logo-trim.png";

export const metadata: Metadata = {
  title: { absolute: "Convi · Convivencia escolar" },
};

// Textos de la landing. Las clases de color van completas (text-naranjo,
// bg-verde...) porque Tailwind no reconoce nombres armados por partes.
const pasos = [
  {
    numero: "01",
    color: "text-naranjo",
    titulo: "Reporta",
    texto:
      "Cualquier integrante de la comunidad puede informar una situación de forma segura, incluso de manera anónima.",
  },
  {
    numero: "02",
    color: "text-amarillo",
    titulo: "Acompaña",
    texto:
      "El equipo de convivencia recibe el caso, aplica el protocolo correspondiente y registra cada acción.",
  },
  {
    numero: "03",
    color: "text-menta",
    titulo: "Resuelve",
    texto:
      "Se notifica a las familias, se cierra el caso y queda un historial para prevenir situaciones futuras.",
  },
];

const perfiles = [
  {
    fondo: "bg-verde",
    titulo: "Estudiantes",
    texto:
      "Un canal confiable para pedir ayuda y reportar lo que pasa en el colegio.",
  },
  {
    fondo: "bg-naranjo",
    titulo: "Docentes",
    texto:
      "Registro rápido de anotaciones y derivaciones desde la sala de clases.",
  },
  {
    fondo: "bg-amarillo",
    titulo: "Familias",
    texto:
      "Información clara y oportuna sobre los casos que involucran a sus hijos.",
  },
  {
    fondo: "bg-tinta",
    titulo: "Equipo directivo",
    texto:
      "Visión completa de la convivencia del colegio y reportes para la toma de decisiones.",
  },
];

const claseEtiqueta = "text-sm font-semibold uppercase tracking-[.04em]";
const claseTituloSeccion =
  "font-titulo text-[clamp(34px,4.5vw,52px)] leading-[1.05] font-extrabold tracking-[-.01em]";

export default function PaginaInicio() {
  return (
    <div className="flex flex-1 flex-col bg-crema font-cuerpo text-tinta">
      <header className="sticky top-0 z-10 border-b border-tinta/8 bg-crema/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-6 px-6 py-3.5">
          <Link href="/" className="flex items-center">
            <Image src={logo} alt="Convi" priority className="block h-10 w-auto" />
          </Link>
          <nav className="flex flex-wrap gap-7 text-[15px] font-medium">
            <a href="#como" className="hover:text-verde">
              Cómo funciona
            </a>
            <a href="#comunidad" className="hover:text-verde">
              Para quién
            </a>
          </nav>
          <div className="flex items-center gap-2.5 text-[15px] font-semibold">
            <Link href="/login" className="px-3.5 py-2.5 hover:text-verde">
              Iniciar sesión
            </Link>
            <Link
              href="/registro"
              className="rounded-full bg-tinta px-5 py-[11px] text-crema transition-colors hover:bg-verde hover:text-white"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-[1200px] items-center gap-14 px-6 pt-18 pb-24 lg:grid-cols-2">
          <div className="flex flex-col gap-7">
            <p className={`flex items-center gap-2.5 text-verde ${claseEtiqueta}`}>
              <span aria-hidden="true" className="h-[3px] w-7 rounded-sm bg-naranjo" />
              Plataforma de convivencia escolar
            </p>
            <h1 className="font-titulo text-[clamp(44px,6vw,76px)] leading-none font-extrabold tracking-[-.02em]">
              Un colegio donde todos <span className="text-verde">conviven</span> mejor.
            </h1>
            <p className="max-w-[520px] text-xl leading-[1.55] text-pretty text-pizarra">
              Convi reúne reportes, seguimiento de casos y protocolos en un solo
              lugar, para que estudiantes, familias y equipos de convivencia
              actúen a tiempo.
            </p>
            <div className="flex flex-wrap gap-3 text-[17px] font-semibold">
              <Link
                href="/registro"
                className="rounded-full bg-naranjo px-7 py-4 text-white shadow-[0_6px_0_var(--naranjo-sombra)] transition hover:translate-y-0.5 hover:shadow-[0_4px_0_var(--naranjo-sombra)]"
              >
                Registrarse
              </Link>
              <a
                href="#como"
                className="rounded-full border-2 border-tinta px-6 py-4 transition-colors hover:bg-tinta hover:text-crema"
              >
                Ver cómo funciona
              </a>
            </div>
          </div>

          {/* Ilustración: círculo amarillo con un anillo punteado detrás */}
          <div className="relative flex min-h-[460px] items-center justify-center">
            <div aria-hidden="true" className="absolute aspect-square w-[min(440px,90%)] rounded-full bg-amarillo" />
            <div
              aria-hidden="true"
              className="absolute aspect-square w-[min(440px,90%)] scale-[1.12] rounded-full border-2 border-dashed border-verde"
            />
            <Image
              src={estudiante}
              alt="Estudiante Convi"
              priority
              className="relative block h-auto w-[min(420px,88%)]"
            />
          </div>
        </section>

        <section id="como" className="scroll-mt-20 bg-tinta text-crema">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-14 px-6 py-24">
            <div className="flex max-w-[640px] flex-col gap-4">
              <p className={`text-amarillo ${claseEtiqueta}`}>Cómo funciona</p>
              <h2 className={claseTituloSeccion}>
                De la alerta a la solución, en tres pasos.
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {pasos.map((paso) => (
                <div
                  key={paso.numero}
                  className="flex flex-col gap-4 rounded-3xl border border-crema/12 bg-crema/6 p-8"
                >
                  <span className={`font-titulo text-[56px] leading-none font-extrabold ${paso.color}`}>
                    {paso.numero}
                  </span>
                  <h3 className="font-titulo text-2xl font-bold">{paso.titulo}</h3>
                  <p className="text-[17px] leading-[1.55] text-pretty text-niebla">
                    {paso.texto}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="comunidad"
          className="mx-auto flex max-w-[1200px] scroll-mt-20 flex-col gap-12 px-6 py-24"
        >
          <div className="flex max-w-[640px] flex-col gap-4">
            <p className={`text-verde ${claseEtiqueta}`}>Para toda la comunidad</p>
            <h2 className={claseTituloSeccion}>Cada persona tiene su espacio.</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {perfiles.map((perfil) => (
              <div
                key={perfil.titulo}
                className="flex flex-col gap-3.5 rounded-3xl border border-tinta/8 bg-white p-7 transition hover:-translate-y-[3px] hover:shadow-[0_14px_36px_rgba(19,37,74,.1)]"
              >
                <span aria-hidden="true" className={`block size-12 rounded-[14px] ${perfil.fondo}`} />
                <h3 className="font-titulo text-[22px] font-bold">{perfil.titulo}</h3>
                <p className="leading-[1.55] text-pretty text-pizarra">{perfil.texto}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-tinta/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-5 px-6 py-8 text-sm text-grafito">
          <Image src={logo} alt="Convi" className="block h-7 w-auto" />
          <div className="flex flex-wrap gap-6">
            {/* TODO: páginas de privacidad y términos */}
            <a href="#" className="hover:text-tinta">
              Privacidad
            </a>
            <a href="#" className="hover:text-tinta">
              Términos
            </a>
            <span>© 2026 Convi</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
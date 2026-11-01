"use client";

import { type ReactNode, useEffect, useState } from "react";
import { Icono } from "@/app/components/icono";
import type { ClavePaso } from "../opciones";
import type { Escena, PropsVista } from "./reproductor";

// Escenas de la guía inicial: una por paso, con una escuela y personas de
// ejemplo. Muestran cómo se ve cada sección del portal y qué pasa al usarla.

const txt = (valor: unknown) => (typeof valor === "string" ? valor : "");
const num = (valor: unknown) => (typeof valor === "number" ? valor : 0);

// --- Piezas de la maqueta ---

function Titulo({
  children,
  extra,
}: {
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <p className="text-base font-semibold text-tinta">{children}</p>
      {extra}
    </div>
  );
}

function Boton({
  marca,
  children,
  secundario,
}: {
  marca: Record<string, string | undefined>;
  children: ReactNode;
  secundario?: boolean;
}) {
  return (
    <span
      {...marca}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium ${
        secundario
          ? "border border-border bg-card text-primary"
          : "bg-naranjo text-white shadow-[0_2px_0_var(--naranjo-sombra)]"
      }`}
    >
      {children}
    </span>
  );
}

function Campo({
  etiqueta,
  valor,
  marca,
  escribiendo,
  vacio = "",
  className = "",
}: {
  etiqueta: string;
  valor: string;
  marca: Record<string, string | undefined>;
  escribiendo: boolean;
  vacio?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[0.7rem] font-medium text-muted-foreground">
        {etiqueta}
      </span>
      <span
        {...marca}
        className={`mt-1 flex h-7 items-center rounded-md border bg-card px-2 ${
          escribiendo ? "border-ring" : "border-input"
        }`}
      >
        {valor ||
          (!escribiendo && (
            <span className="text-muted-foreground">{vacio}</span>
          ))}
        {escribiendo && <span className="demo-caret" />}
      </span>
    </label>
  );
}

function Insignia({
  children,
  tono = "gris",
}: {
  children: ReactNode;
  tono?: "gris" | "verde" | "amarillo" | "rojo" | "azul";
}) {
  const tonos = {
    gris: "bg-muted text-muted-foreground",
    verde: "bg-verde/15 text-verde",
    amarillo: "bg-amarillo/25 text-tinta",
    rojo: "bg-destructive/10 text-destructive",
    azul: "bg-accent text-accent-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium ${tonos[tono]}`}
    >
      {children}
    </span>
  );
}

function Tarjeta({
  children,
  className = "",
  marca,
}: {
  children: ReactNode;
  className?: string;
  marca?: Record<string, string | undefined>;
}) {
  return (
    <div
      {...marca}
      className={`rounded-xl border border-border bg-card p-3 ${className}`}
    >
      {children}
    </div>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return (
    <div className="demo-aviso absolute right-4 bottom-4 flex items-center gap-2 rounded-lg bg-tinta px-3 py-2 text-white shadow-lg">
      <span className="flex size-4 items-center justify-center rounded-full bg-verde text-[0.6rem]">
        ✓
      </span>
      {children}
    </div>
  );
}

/** Un número que sube desde cero cuando aparece. */
function Contador({ valor }: { valor: number }) {
  const [actual, setActual] = useState(0);
  useEffect(() => {
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min((ahora - inicio) / 1100, 1);
      setActual(Math.round(valor * (1 - (1 - t) ** 3)));
      if (t < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(cuadro);
  }, [valor]);
  return <>{actual}</>;
}

// --- 1. Bienvenida: un recorrido por el portal ---

const PISTAS: Record<string, string> = {
  Usuarios: "Invitas al equipo de Convivencia y a los profesores",
  Cursos: "El año académico, los niveles y los cursos",
  Importaciones: "Subes la nómina de estudiantes desde Excel",
  Reglas: "Cuándo avisar si se repiten las situaciones",
  Documentos: "El reglamento interno, para las consultas con IA",
};

const PASOS_GUIA = [
  "Bienvenida",
  "Equipo",
  "Año, niveles y cursos",
  "Reglamento",
  "Estudiantes",
  "Categorías y reglas",
  "Resumen y fin",
];

function VistaBienvenida({ e, d }: PropsVista) {
  const pista = txt(e.pista);
  if (e.vista === "guia")
    return (
      <div className="demo-entra">
        <Titulo>Guía inicial</Titulo>
        <ol className="space-y-1.5">
          {PASOS_GUIA.map((paso, i) => (
            <li
              key={paso}
              className="demo-entra flex items-center justify-between rounded-lg border border-border bg-card px-3 py-1.5"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span>
                {i + 1}. {paso}
              </span>
              {i < num(e.listos) ? (
                <span className="demo-surge">
                  <Insignia tono="verde">✓ Listo</Insignia>
                </span>
              ) : (
                <Insignia>Pendiente</Insignia>
              )}
            </li>
          ))}
        </ol>
      </div>
    );
  return (
    <div>
      <Titulo>Resumen</Titulo>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["Cuentas", "1"],
          ["Cursos", "0"],
          ["Estudiantes", "0"],
        ].map(([nombre, valor]) => (
          <Tarjeta key={nombre}>
            <p className="text-muted-foreground">{nombre}</p>
            <p className="mt-1 text-xl font-semibold text-tinta">{valor}</p>
          </Tarjeta>
        ))}
      </div>
      <Tarjeta marca={d("tarjeta-guia")} className="mt-3 border-primary/30">
        <p className="font-semibold text-tinta">Guía inicial</p>
        <p className="mt-0.5 text-muted-foreground">
          Te lleva a configurar la escuela paso a paso
        </p>
        <span className="mt-2 inline-block rounded-lg bg-naranjo px-2.5 py-1 font-medium text-white">
          Empezar la guía
        </span>
      </Tarjeta>
      {pista && (
        <div
          key={pista}
          className="demo-entra mt-3 flex items-start gap-2 rounded-lg bg-tinta px-3 py-2 text-white"
        >
          <span aria-hidden="true">←</span>
          <span>
            <span className="font-semibold">{txt(e.seccion)}:</span> {pista}
          </span>
        </div>
      )}
    </div>
  );
}

const recorrido = Object.keys(PISTAS).flatMap((seccion) => [
  { mover: `menu-${seccion}` },
  { cambia: { pista: PISTAS[seccion], seccion } },
  { espera: 900 },
]);

const BIENVENIDA: Escena = {
  ruta: "convi.tech/admin",
  menu: "Resumen",
  inicial: { vista: "resumen", pista: "", seccion: "", listos: 0 },
  guion: [
    {
      narrar:
        "Este es tu portal de administración: a la izquierda están todas sus secciones",
    },
    ...recorrido,
    { cambia: { pista: "" } },
    {
      narrar:
        "La guía te lleva por cada sección en orden, para que no se te pase nada",
    },
    {
      clic: "tarjeta-guia",
      cambia: { vista: "guia", ruta: "convi.tech/admin/guia" },
    },
    { espera: 600 },
    { cambia: { listos: 1 } },
    { cambia: { listos: 2 } },
    { cambia: { listos: 3 } },
    {
      narrar:
        "Cada paso queda Listo u Omitido, y si sales la guía te espera donde quedaste",
    },
    { espera: 1400 },
  ],
  Vista: VistaBienvenida,
};

// --- 2. Equipo: invitar desde Usuarios ---

function VistaEquipo({ e, d, foco }: PropsVista) {
  return (
    <div>
      <Titulo
        extra={
          <Boton marca={d("invitar")}>
            <Icono nombre="usuarios" className="size-3.5" /> Invitar una cuenta
          </Boton>
        }
      >
        Usuarios
      </Titulo>
      {e.form === true && (
        <Tarjeta className="demo-surge mb-3 border-primary/30">
          <div className="grid grid-cols-2 gap-2">
            <Campo
              etiqueta="Nombres"
              valor={txt(e.nombres)}
              marca={d("campo-nombres")}
              escribiendo={foco === "campo-nombres"}
            />
            <Campo
              etiqueta="Apellidos"
              valor={txt(e.apellidos)}
              marca={d("campo-apellidos")}
              escribiendo={foco === "campo-apellidos"}
            />
            <Campo
              etiqueta="Correo"
              valor={txt(e.correo)}
              marca={d("campo-correo")}
              escribiendo={foco === "campo-correo"}
            />
            <label className="relative block">
              <span className="text-[0.7rem] font-medium text-muted-foreground">
                Perfil
              </span>
              <span
                {...d("campo-perfil")}
                className="mt-1 flex h-7 items-center justify-between rounded-md border border-input bg-card px-2"
              >
                {txt(e.perfil) || (
                  <span className="text-muted-foreground">Elige un perfil</span>
                )}
                <span aria-hidden="true">▾</span>
              </span>
              {e.abierto === true && (
                <span className="demo-surge absolute top-full right-0 left-0 z-10 mt-1 block rounded-md border border-border bg-card p-1 shadow-lg">
                  {["Profesor", "Convivencia"].map((p) => (
                    <span
                      key={p}
                      {...d(`perfil-${p}`)}
                      className="block rounded px-2 py-1"
                    >
                      {p}
                    </span>
                  ))}
                </span>
              )}
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <Boton marca={d("enviar")}>Enviar invitación</Boton>
          </div>
        </Tarjeta>
      )}
      <Tarjeta className="p-0">
        <div className="grid grid-cols-[1fr_6rem_7rem] border-b border-border px-3 py-1.5 font-medium text-muted-foreground">
          <span>Persona</span>
          <span>Perfil</span>
          <span>Estado</span>
        </div>
        {e.fila === true && (
          <div className="demo-entra grid grid-cols-[1fr_6rem_7rem] items-center border-b border-border bg-accent/40 px-3 py-2">
            <span>
              Paula Rojas
              <span className="block text-[0.68rem] text-muted-foreground">
                paula.rojas@losaromos.cl
              </span>
            </span>
            <span>Convivencia</span>
            <Insignia tono="amarillo">Pendiente de activar</Insignia>
          </div>
        )}
        <div className="grid grid-cols-[1fr_6rem_7rem] items-center px-3 py-2">
          <span>
            Tú
            <span className="block text-[0.68rem] text-muted-foreground">
              direccion@losaromos.cl
            </span>
          </span>
          <span>Administrador</span>
          <Insignia tono="verde">Activa</Insignia>
        </div>
      </Tarjeta>
      {e.aviso === true && (
        <Aviso>Invitación enviada a paula.rojas@losaromos.cl</Aviso>
      )}
    </div>
  );
}

const EQUIPO: Escena = {
  ruta: "convi.tech/admin/usuarios",
  menu: "Usuarios",
  inicial: { form: false, fila: false, aviso: false, abierto: false },
  guion: [
    {
      narrar:
        "En Usuarios invitas a cada persona del equipo con su nombre, su correo y su perfil",
    },
    { clic: "invitar", cambia: { form: true } },
    { escribir: "campo-nombres", en: "nombres", texto: "Paula" },
    { escribir: "campo-apellidos", en: "apellidos", texto: "Rojas" },
    {
      escribir: "campo-correo",
      en: "correo",
      texto: "paula.rojas@losaromos.cl",
    },
    {
      narrar:
        "El perfil decide qué ve: Convivencia lleva los casos y Profesor registra situaciones",
    },
    { clic: "campo-perfil", cambia: { abierto: true } },
    {
      clic: "perfil-Convivencia",
      cambia: { perfil: "Convivencia", abierto: false },
    },
    { narrar: "Al enviar, CONVI le manda un correo para que active su cuenta" },
    { clic: "enviar", cambia: { form: false, fila: true, aviso: true } },
    { espera: 1200 },
    { cambia: { aviso: false } },
    {
      narrar:
        "Su cuenta queda Pendiente de activar hasta que acepte la invitación",
    },
    { espera: 1400 },
  ],
  Vista: VistaEquipo,
};

// --- 3. Año, niveles y cursos ---

const NIVELES = ["1°", "2°", "3°", "4°", "5°", "6°", "7°", "8°"];

function VistaCursos({ e, d, foco }: PropsVista) {
  const secciones = ["A", "B", "C"].slice(0, num(e.secciones));
  const cursos =
    e.basica === true
      ? NIVELES.flatMap((n) => secciones.map((s) => `${n} ${s}`))
      : [];
  return (
    <div>
      <Titulo>Año, niveles y cursos</Titulo>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Campo
          etiqueta="Año"
          valor={txt(e.anio)}
          marca={d("campo-anio")}
          escribiendo={foco === "campo-anio"}
          vacio="2027"
        />
        <div>
          <span className="text-[0.7rem] font-medium text-muted-foreground">
            Enseñanza
          </span>
          <div className="mt-1 flex gap-1.5">
            {[
              ["basica", "Básica"],
              ["media", "Media"],
            ].map(([clave, nombre]) => (
              <span
                key={clave}
                {...d(`ens-${clave}`)}
                className={`rounded-md border px-2.5 py-1 ${
                  e[clave] === true
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-card"
                }`}
              >
                {nombre}
              </span>
            ))}
          </div>
        </div>
      </div>
      {e.basica === true && (
        <div className="demo-entra mt-3">
          <span className="text-[0.7rem] font-medium text-muted-foreground">
            Niveles de Básica
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {NIVELES.map((n, i) => (
              <span
                key={n}
                className="demo-surge rounded-md bg-accent px-2 py-0.5 text-accent-foreground"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {n} básico
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="text-[0.7rem] font-medium text-muted-foreground">
              Secciones por nivel
            </span>
            <span className="flex items-center gap-1 rounded-md border border-input bg-card px-1">
              <span className="px-1 text-muted-foreground">−</span>
              <span className="w-4 text-center font-semibold">
                {num(e.secciones)}
              </span>
              <span
                {...d("mas-secciones")}
                className="rounded px-1 text-primary"
              >
                +
              </span>
            </span>
          </div>
        </div>
      )}
      {cursos.length > 0 && (
        <Tarjeta className="mt-3 bg-muted/40">
          <p className="mb-1.5 font-medium">
            Vista previa: se crearán {cursos.length} cursos en {txt(e.anio)}
          </p>
          <div key={cursos.length} className="flex flex-wrap gap-1">
            {cursos.map((curso, i) => (
              <span
                key={curso}
                className="demo-surge rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[0.68rem]"
                style={{ animationDelay: `${i * 25}ms` }}
              >
                {curso}
              </span>
            ))}
          </div>
        </Tarjeta>
      )}
      {e.basica === true && (
        <div className="mt-3 flex justify-end">
          <Boton marca={d("crear")}>
            {e.creando === true && (
              <span className="demo-giro inline-block size-3 rounded-full border-2 border-white/40 border-t-white" />
            )}
            Crear año y cursos
          </Boton>
        </div>
      )}
      {e.creado === true && (
        <Aviso>Año 2027 con 8 niveles y 16 cursos creados</Aviso>
      )}
    </div>
  );
}

const CURSOS: Escena = {
  ruta: "convi.tech/admin/guia?paso=cursos",
  menu: "Cursos",
  inicial: { anio: "", basica: false, media: false, secciones: 1 },
  guion: [
    { narrar: "Primero escribes el año académico que vas a usar" },
    { escribir: "campo-anio", en: "anio", texto: "2027" },
    { narrar: "Luego eliges la enseñanza: aparecen sus niveles ya marcados" },
    { clic: "ens-basica", cambia: { basica: true } },
    { espera: 700 },
    { narrar: "Indica cuántas secciones tiene cada nivel, por ejemplo A y B" },
    { clic: "mas-secciones", cambia: { secciones: 2 } },
    {
      narrar:
        "Antes de guardar ves la vista previa de todos los cursos que se van a crear",
    },
    { espera: 1300 },
    { clic: "crear", cambia: { creando: true } },
    { espera: 700 },
    { cambia: { creando: false, creado: true } },
    {
      narrar:
        "Se crean el año, los niveles y los cursos, sin repetir lo que ya existe",
    },
    { espera: 1600 },
  ],
  Vista: VistaCursos,
};

// --- 4. Reglamento en Documentos ---

const ETAPAS_RICE = [
  ["Preparación: Pendiente", "gris"],
  ["Preparación: Procesando", "amarillo"],
  ["Preparación: Lista", "verde"],
] as const;

function VistaReglamento({ e, d, foco }: PropsVista) {
  const etapa = num(e.etapa);
  return (
    <div>
      <Titulo
        extra={
          <Boton marca={d("subir")}>
            <Icono nombre="documentos" className="size-3.5" /> Subir documento
          </Boton>
        }
      >
        Documentos
      </Titulo>
      {e.form === true && (
        <Tarjeta className="demo-surge mb-3 border-primary/30">
          <span
            {...d("elegir")}
            className="flex items-center gap-2 rounded-lg border-2 border-dashed border-input px-3 py-3"
          >
            {e.archivo === true ? (
              <span className="demo-entra flex items-center gap-2">
                <span className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-destructive">
                  PDF
                </span>
                RICE-Los-Aromos-2027.pdf · 1,8 MB
              </span>
            ) : (
              <span className="text-muted-foreground">
                Arrastra el archivo aquí o haz clic para elegirlo
              </span>
            )}
          </span>
          <div className="mt-2 grid grid-cols-[1fr_7rem] items-end gap-2">
            <Campo
              etiqueta="Título"
              valor={txt(e.titulo)}
              marca={d("campo-titulo")}
              escribiendo={foco === "campo-titulo"}
            />
            <Boton marca={d("guardar")}>Subir</Boton>
          </div>
        </Tarjeta>
      )}
      {etapa > 0 && (
        <Tarjeta className="demo-entra">
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="font-semibold">Reglamento interno 2027</span>
              <span className="block text-[0.68rem] text-muted-foreground">
                Versión 1 · reglamento interno (RICE)
              </span>
            </span>
            <span key={etapa} className="demo-surge">
              <Insignia tono={ETAPAS_RICE[etapa - 1][1]}>
                {etapa === 2 && (
                  <span className="demo-giro inline-block size-2.5 rounded-full border-2 border-current/30 border-t-current" />
                )}
                {etapa === 3 && "✓"} {ETAPAS_RICE[etapa - 1][0]}
              </Insignia>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="demo-llenado h-full rounded-full bg-verde"
              style={{ width: `${etapa === 1 ? 35 : etapa === 2 ? 75 : 100}%` }}
            />
          </div>
        </Tarjeta>
      )}
      {etapa === 3 && (
        <Tarjeta className="demo-entra mt-3 bg-accent/40">
          <p className="font-medium">Así lo usará Convivencia</p>
          <p className="mt-1 text-muted-foreground">
            «¿Qué dice el reglamento sobre el ciberacoso?» → la IA responde y
            muestra la página del reglamento que lo respalda.
          </p>
        </Tarjeta>
      )}
    </div>
  );
}

const REGLAMENTO: Escena = {
  ruta: "convi.tech/admin/documentos",
  menu: "Documentos",
  inicial: { form: false, archivo: false, etapa: 0 },
  guion: [
    {
      narrar:
        "En Documentos subes el reglamento interno de la escuela, el RICE",
    },
    { clic: "subir", cambia: { form: true } },
    { clic: "elegir", cambia: { archivo: true } },
    {
      escribir: "campo-titulo",
      en: "titulo",
      texto: "Reglamento interno 2027",
    },
    { clic: "guardar", cambia: { form: false, etapa: 1 } },
    {
      narrar:
        "El archivo original queda guardado, y CONVI lo prepara para buscar en él",
    },
    { cambia: { etapa: 2 } },
    { espera: 1500 },
    { cambia: { etapa: 3 } },
    {
      narrar:
        "Desde ahí, Convivencia le puede preguntar a la IA y ver la página que respalda cada respuesta",
    },
    { espera: 2000 },
  ],
  Vista: VistaReglamento,
};

// --- 5. Estudiantes desde Importaciones ---

const FILAS = [
  ["Martina Soto", "EST-0101", "1° A", true],
  ["Benjamín Muñoz", "EST-0102", "1° A", true],
  ["Josefa Díaz", "EST-0103", "1° B", true],
  ["Lucas Pérez", "EST-0104", "9° C", false],
  ["Florencia Rojas", "EST-0105", "2° A", true],
] as const;

function VistaEstudiantes({ e, d }: PropsVista) {
  return (
    <div>
      <Titulo
        extra={
          e.archivo !== true && (
            <Boton marca={d("nueva")}>
              <Icono nombre="importaciones" className="size-3.5" /> Nueva
              importación
            </Boton>
          )
        }
      >
        Importaciones
      </Titulo>
      {e.archivo === true && (
        <div className="demo-entra">
          <p className="mb-2 flex items-center gap-2">
            <span className="rounded bg-verde/15 px-1.5 py-0.5 font-mono text-[0.65rem] font-semibold text-verde">
              XLSX
            </span>
            nomina-2027.xlsx · 48 filas
          </p>
          <Tarjeta className="p-0">
            {FILAS.map(([nombre, codigo, curso, bien], i) => (
              <div
                key={nombre}
                className={`demo-entra grid grid-cols-[1fr_5rem_3rem_6.5rem] items-center border-b border-border px-3 py-1.5 last:border-b-0 ${
                  bien ? "" : "bg-destructive/5"
                }`}
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <span>{nombre}</span>
                <span className="font-mono text-[0.68rem]">{codigo}</span>
                <span>{curso}</span>
                {bien ? (
                  <Insignia tono="verde">✓ Lista</Insignia>
                ) : (
                  <span {...d("fila-error")}>
                    <Insignia tono="rojo">Curso no existe</Insignia>
                  </span>
                )}
              </div>
            ))}
          </Tarjeta>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              47 filas listas · 1 con error que no se guardará
            </span>
            {e.importando !== true && e.listo !== true && (
              <Boton marca={d("confirmar")}>Confirmar 47 filas</Boton>
            )}
          </div>
          {(e.importando === true || e.listo === true) && (
            <Tarjeta className="demo-entra mt-2.5">
              <p className="font-medium">
                {e.listo === true ? (
                  "47 estudiantes matriculados en sus cursos"
                ) : (
                  <>
                    Guardando… <Contador valor={47} /> de 47
                  </>
                )}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="demo-llenado h-full rounded-full bg-verde"
                  style={{ width: e.listo === true ? "100%" : "8%" }}
                />
              </div>
            </Tarjeta>
          )}
        </div>
      )}
    </div>
  );
}

const ESTUDIANTES: Escena = {
  ruta: "convi.tech/admin/importaciones",
  menu: "Importaciones",
  inicial: { archivo: false, importando: false, listo: false },
  guion: [
    {
      narrar:
        "En Importaciones subes la nómina de estudiantes en CSV o Excel, con su curso",
    },
    { clic: "nueva", cambia: { archivo: true } },
    { espera: 800 },
    {
      narrar:
        "Antes de guardar revisas cada fila: las que tienen errores se marcan en rojo",
    },
    { mover: "fila-error" },
    { espera: 900 },
    {
      narrar:
        "Confirmas solo las filas buenas, y la fila con error la corriges en el archivo",
    },
    { clic: "confirmar", cambia: { importando: true } },
    { espera: 1300 },
    { cambia: { importando: false, listo: true } },
    { narrar: "Cada estudiante queda matriculado en su curso del año" },
    { espera: 1500 },
  ],
  Vista: VistaEstudiantes,
};

// --- 6. Categorías y reglas ---

function VistaReglas({ e, d, foco }: PropsVista) {
  const pestana = txt(e.pestana);
  return (
    <div>
      <div className="relative mb-3 inline-flex rounded-lg bg-muted p-0.5">
        {/* El resaltado de la pestaña se desliza con el resorte. */}
        <span
          aria-hidden="true"
          className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-card shadow-sm transition-[translate] duration-[420ms] ease-resorte"
          style={{ translate: pestana === "reglas" ? "100% 0" : "0 0" }}
        />
        {[
          ["categorias", "Categorías"],
          ["reglas", "Reglas"],
        ].map(([clave, nombre]) => (
          <span
            key={clave}
            {...d(`pestana-${clave}`)}
            className={`relative w-24 rounded-md py-1 text-center font-medium ${
              pestana === clave ? "text-tinta" : "text-muted-foreground"
            }`}
          >
            {nombre}
          </span>
        ))}
      </div>

      {pestana === "categorias" ? (
        <div key="categorias" className="demo-entra">
          <Tarjeta className="p-0">
            {["Agresión física", "Ciberacoso", "Daño a la infraestructura"].map(
              (c) => (
                <div key={c} className="border-b border-border px-3 py-1.5">
                  {c}
                </div>
              ),
            )}
            {e.nueva === true && (
              <div className="demo-entra flex items-center justify-between bg-accent/40 px-3 py-1.5">
                Agresión verbal <Insignia tono="verde">Nueva</Insignia>
              </div>
            )}
          </Tarjeta>
          {e.nueva !== true && (
            <div className="mt-2.5 grid grid-cols-[1fr_6rem] items-end gap-2">
              <Campo
                etiqueta="Nueva categoría"
                valor={txt(e.categoria)}
                marca={d("campo-categoria")}
                escribiendo={foco === "campo-categoria"}
              />
              <Boton marca={d("agregar")}>Agregar</Boton>
            </div>
          )}
        </div>
      ) : (
        <div key="reglas" className="demo-entra">
          <Tarjeta>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Tipo de regla: Recurrencia</span>
              <span key={String(e.activa)} className="demo-surge">
                {e.activa === true ? (
                  <Insignia tono="verde">Activa</Insignia>
                ) : (
                  <Insignia tono="amarillo">Borrador</Insignia>
                )}
              </span>
            </div>
            {/* La misma frase con que el portal describe cada regla. */}
            <p className="mt-2 leading-7">
              <Ficha valor={txt(e.operador)} />{" "}
              <Ficha valor={txt(e.cantidad)} /> situaciones de{" "}
              <Ficha valor={txt(e.tipo)} /> <Ficha valor={txt(e.ambito)} /> en{" "}
              <Ficha valor={txt(e.dias)} /> días
            </p>
            <p className="mt-1 text-muted-foreground">
              Al cumplirse: <Ficha valor={txt(e.accion)} />
            </p>
            <div className="mt-2.5 flex justify-end">
              {e.activa !== true && (
                <Boton marca={d("activar")}>Activar regla</Boton>
              )}
            </div>
          </Tarjeta>
          {e.alerta === true && (
            <Tarjeta className="demo-aviso mt-3 border-naranjo/40 bg-naranjo/5">
              <p className="flex items-center gap-1.5 font-semibold text-tinta">
                <Icono nombre="alerta" className="size-3.5 text-naranjo" />
                Así llega la alerta a Convivencia
              </p>
              <p className="mt-1 text-muted-foreground">
                Un estudiante de 6° A suma 3 situaciones de Agresión verbal en
                30 días.
              </p>
            </Tarjeta>
          )}
        </div>
      )}
    </div>
  );
}

function Ficha({
  valor,
  marca,
}: {
  valor: string;
  marca?: Record<string, string | undefined>;
}) {
  return (
    <span
      {...marca}
      className={`mx-0.5 inline-block min-w-8 rounded-md border px-1.5 text-center ${
        valor
          ? "demo-surge border-primary/40 bg-accent font-medium text-accent-foreground"
          : "border-dashed border-input text-muted-foreground"
      }`}
    >
      {valor || "…"}
    </span>
  );
}

const REGLAS: Escena = {
  ruta: "convi.tech/admin/categorias",
  menu: "Categorías",
  inicial: {
    pestana: "categorias",
    nueva: false,
    categoria: "",
    operador: "",
    cantidad: "",
    tipo: "",
    ambito: "",
    dias: "",
    accion: "",
    activa: false,
    alerta: false,
  },
  guion: [
    {
      narrar:
        "Las categorías ordenan las situaciones que registran profesores y Convivencia",
    },
    { escribir: "campo-categoria", en: "categoria", texto: "Agresión verbal" },
    { clic: "agregar", cambia: { nueva: true } },
    {
      narrar: "Las reglas avisan cuando algo se repite: se leen como una frase",
    },
    {
      clic: "pestana-reglas",
      cambia: {
        pestana: "reglas",
        menu: "Reglas",
        ruta: "convi.tech/admin/reglas",
      },
    },
    { cambia: { operador: "Al menos" } },
    { cambia: { cantidad: "3" } },
    { cambia: { tipo: "Agresión verbal" } },
    { cambia: { ambito: "del mismo estudiante" } },
    { cambia: { dias: "30" } },
    { cambia: { accion: "Registrar la alerta y avisar a Convivencia" } },
    {
      narrar:
        "La regla nace como Borrador, y empieza a funcionar cuando la activas",
    },
    { clic: "activar", cambia: { activa: true } },
    {
      narrar:
        "Cuando se cumple, Convivencia recibe la alerta para revisar al estudiante",
    },
    { cambia: { alerta: true } },
    { espera: 2000 },
  ],
  Vista: VistaReglas,
};

// --- 7. Resumen y fin ---

const CONFIGURADO = [
  ["Equipo", "Listo", "verde", "2 invitaciones enviadas"],
  ["Año, niveles y cursos", "Listo", "verde", "16 cursos en 2027"],
  ["Reglamento", "Listo", "verde", "Preparación lista para consultas"],
  ["Estudiantes", "Listo", "verde", "47 matriculados"],
  ["Categorías y reglas", "Omitido", "amarillo", "Puedes hacerlo en Reglas"],
] as const;

function VistaFin({ e, d }: PropsVista) {
  if (e.portal === true)
    return (
      <div key="portal" className="demo-entra">
        <Titulo extra={<Insignia tono="verde">✓ Guía terminada</Insignia>}>
          Resumen
        </Titulo>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["Cuentas habilitadas", 3],
            ["Cursos de 2027", 16],
            ["Estudiantes matriculados", 47],
            ["Documentos listos", 1],
          ].map(([nombre, valor]) => (
            <Tarjeta key={nombre}>
              <p className="text-muted-foreground">{nombre}</p>
              <p className="mt-0.5 text-xl font-semibold text-tinta">
                <Contador valor={Number(valor)} />
              </p>
            </Tarjeta>
          ))}
        </div>
      </div>
    );
  return (
    <div>
      <Titulo>Resumen y fin</Titulo>
      {e.lista === true && (
        <Tarjeta className="p-0">
          {CONFIGURADO.map(([paso, estado, tono, detalle], i) => (
            <div
              key={paso}
              className="demo-entra flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
              style={{ animationDelay: `${i * 110}ms` }}
            >
              <span>
                {paso}
                <span className="block text-[0.68rem] text-muted-foreground">
                  {detalle}
                </span>
              </span>
              <Insignia tono={tono}>{estado}</Insignia>
            </div>
          ))}
        </Tarjeta>
      )}
      {e.cifras === true && (
        <div className="demo-entra mt-3 grid grid-cols-3 gap-2">
          {[
            ["Cuentas", 3],
            ["Cursos", 16],
            ["Estudiantes", 47],
          ].map(([nombre, valor]) => (
            <Tarjeta key={nombre}>
              <p className="text-muted-foreground">{nombre}</p>
              <p className="mt-0.5 text-lg font-semibold text-tinta">
                <Contador valor={Number(valor)} />
              </p>
            </Tarjeta>
          ))}
        </div>
      )}
      {e.cifras === true && (
        <div className="mt-3 flex justify-end">
          <Boton marca={d("terminar")}>Terminar e ir al portal</Boton>
        </div>
      )}
    </div>
  );
}

const FIN: Escena = {
  ruta: "convi.tech/admin/guia?paso=fin",
  menu: "Resumen",
  inicial: { lista: false, cifras: false, portal: false },
  guion: [
    { narrar: "Al final ves todo lo que quedó configurado y lo que falta" },
    { cambia: { lista: true } },
    { espera: 900 },
    {
      narrar:
        "Lo omitido no se pierde: lo haces después desde su sección del portal",
    },
    { cambia: { cifras: true } },
    { espera: 1300 },
    {
      clic: "terminar",
      cambia: { portal: true, ruta: "convi.tech/admin" },
    },
    { narrar: "La guía queda terminada y se abre tu portal de administración" },
    { espera: 2000 },
  ],
  Vista: VistaFin,
};

export const ESCENAS: Record<ClavePaso, Escena> = {
  bienvenida: BIENVENIDA,
  equipo: EQUIPO,
  cursos: CURSOS,
  reglamento: REGLAMENTO,
  estudiantes: ESTUDIANTES,
  reglas: REGLAS,
  fin: FIN,
};

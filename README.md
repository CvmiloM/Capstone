# CONVI

**Plataforma de seguimiento y trazabilidad de situaciones de convivencia escolar**

Proyecto APT de Ingeniería en Informática · Duoc UC, sede San Andrés de Concepción · Asignatura Capstone (APT122)

**Plataforma publicada:** [convi.tech](https://convi.tech)

---

## ¿Qué es CONVI?

En los establecimientos educacionales los antecedentes de convivencia escolar suelen quedar repartidos entre el libro de clases, planillas, correos, entrevistas, actas y otros documentos, así que reconstruir lo que ocurrió con un estudiante depende de búsquedas manuales y de la memoria de las personas, y se pierde la relación entre la situación informada, la intervención que se hizo y el seguimiento posterior.

CONVI es una plataforma web que reúne esa información en un **expediente digital ordenado y trazable**: cuándo se registró una situación, quiénes participaron, qué se decidió, qué entrevistas o reuniones se realizaron, qué acuerdos quedaron, qué seguimientos se hicieron y qué evidencias respaldan cada paso.

La solución tiene dos ejes:

- **Reactivo:** gestión de las situaciones y los casos que ya ocurrieron.
- **Preventivo:** organización del Plan de Gestión de Convivencia del establecimiento.

CONVI es **multiestablecimiento**: cada escuela mantiene separados sus usuarios, estudiantes, documentos, reglas y registros.

## Objetivos

**Objetivo general:** mejorar la eficiencia y trazabilidad de la gestión de situaciones de convivencia escolar mediante una plataforma web centralizada.

**Objetivos específicos:**

| | Objetivo |
|---|---|
| **OE1** | Alcanzar una cobertura digital de al menos el 80 % de los casos activos autorizados para carga inicial durante los primeros 4 meses de operación. |
| **OE2** | Reducir en al menos un 60 % el tiempo promedio de consulta del historial de un estudiante durante los primeros 4 meses de operación, respecto del método anterior. |
| **OE3** | Alcanzar trazabilidad verificable en al menos el 90 % de los casos gestionados en CONVI durante los primeros 6 meses de operación. |
| **OE4** | Reducir en al menos un 60 % el tiempo promedio de síntesis de antecedentes de un caso mediante el asistente de IA durante los primeros 4 meses de operación, respecto del proceso manual. |

## Qué permite hacer

CONVI tiene un portal para cada perfil, y cada uno ve solo la información de su escuela que le corresponde:

| Portal | Quién lo usa | Qué permite |
|---|---|---|
| **Administración** | Administrador del establecimiento | Configurar la escuela con una guía inicial, mantener años académicos, niveles, cursos, estudiantes, apoderados y usuarios con invitación por correo, importar datos desde Excel, definir categorías, reglas, protocolos y documentos institucionales, y revisar la auditoría |
| **Convivencia** | Encargado y equipo de convivencia | Revisar su jornada, atender la bandeja de situaciones, gestionar casos con participantes, protocolo, plan de intervención, encuentros, compromisos, seguimientos, comunicaciones, evidencias y cierre, organizar el Plan de Gestión, usar un calendario que se puede suscribir desde Google Calendar, recibir alertas y avisos, buscar expedientes e historiales, preparar indicadores e informes en PDF y Excel, y consultar el reglamento |
| **Profesor** | Docentes | Registrar situaciones de sus cursos, revisar sus registros, responder las aclaraciones que pide Convivencia y adjuntar evidencias |
| **Apoderado** | Apoderados con acceso autorizado | Consultar los casos de su estudiante |

El **asistente de IA** apoya al equipo de Convivencia: orienta la gestión de un caso, explica la comparación de indicadores, responde consultas sobre el reglamento de la escuela y prepara borradores de correo al apoderado, y la decisión final siempre queda en manos del equipo.

Todas las cuentas de Administración y Convivencia usan segundo factor, y la base de datos separa la información de cada escuela con seguridad por fila.

## Tecnologías

| Capa | Tecnología | Uso |
|---|---|---|
| Interfaz | **Next.js 16** + **React 19** + **TypeScript** | Portales de Administración, Convivencia, Profesor y Apoderado |
| Backend principal | **NestJS** + **TypeScript** | Autenticación, autorización, lógica de negocio y acceso a los datos |
| Base de datos | **PostgreSQL** en **Supabase** | Datos de la plataforma, con seguridad por fila por establecimiento |
| Autenticación | **Supabase Auth** | Cuentas, invitaciones, recuperación de acceso y segundo factor (TOTP) |
| Archivos | **Supabase Storage** | Evidencias, actas y documentos institucionales en almacenamiento privado |
| Servicio de IA | **FastAPI** + **Ollama** | Servicio de IA desacoplado (convi-ia), con qwen3.5:9b para generar texto |
| Búsqueda en documentos | **pgvector** (embeddings bge-m3) | Búsqueda de fragmentos del reglamento y otros documentos institucionales |
| Tareas en segundo plano | **Redis** + **BullMQ** | Procesamiento de documentos, importaciones, informes y correos |
| Informes | **PDFKit** + **ExcelJS** | Informes en PDF y planillas Excel |
| Entornos | **Docker** + **Docker Compose** | Entornos reproducibles de desarrollo |
| Publicación | **Azure Container Apps** + **GitHub Actions** | Web y API con HTTPS en convi.tech, validadas y publicadas en cada cambio de la rama principal |
| Control de versiones | **Git** + **GitHub** | Repositorio del proyecto, con revisión por pull request |

## Metodología

El proyecto se desarrolla con **Scrum**:

- **Product Owner:** Camilo Monge, **Scrum Master:** Fernando Torres, **equipo de desarrollo:** los tres integrantes.
- Product Backlog priorizado con **MoSCoW** (Must, Should, Could).
- Historias de usuario con criterios de aceptación verificables, estimadas con una rúbrica de alcance, complejidad e incertidumbre y acordadas con **Planning Poker**.
- Una historia se da por terminada cuando cumple sus criterios de aceptación, su código fue revisado por otro integrante, tiene pruebas ejecutadas con resultado registrado y respeta los permisos de cada perfil.
- El avance se registra en un backlog compartido, donde cada integrante anota el estado, el detalle y la fecha de cada cambio.

## Fases del proyecto

| Fase | Propósito |
|---|---|
| **Fase 1: Definición** | Definir el problema, el alcance, los objetivos, la metodología, las evidencias y el plan de trabajo del proyecto (APT). |
| **Fase 2: Desarrollo** | Especificar y construir la solución por incrementos, verificarla con pruebas e informar el avance del proyecto. |
| **Fase 3: Cierre** | Cerrar la validación, completar la documentación final y preparar la defensa del proyecto. |

## Avance del proyecto

- Proyecto APT definido, con su objetivo general y cuatro objetivos específicos.
- 25 épicas y 137 historias de usuario con criterios de aceptación, prioridad y estimación.
- Product Backlog de 160 ítems priorizados con MoSCoW: 159 terminados y 1 en progreso, el respaldo diario automático en la nube (PB-133).
- Modelo de datos en Supabase (PostgreSQL) con 52 tablas, separación por establecimiento, permisos por perfil, auditoría e historial que no se puede editar, versionado en migraciones.
- Los cuatro portales construidos y publicados en [convi.tech](https://convi.tech), con la base de datos, la autenticación y los archivos en Supabase.
- Pruebas automáticas de la API y de las reglas de la base de datos, y validación de la API y la web antes de cada publicación.
- Respaldo de la base de datos y los archivos, con un ensayo de restauración aprobado frente a la meta de recuperar todo en 4 horas o menos.
- Generador de datos sintéticos con escuelas ficticias y tres años de historia, para probar y demostrar CONVI sin datos de personas reales.

Las épicas, las historias de usuario, el backlog priorizado y el modelo de datos están en `Fase 2/Evidencia Proyecto`.

## Estructura del repositorio

```
Capstone/
├── .github/workflows/             Validación y publicación automáticas en Azure
├── Fase 1/
│   ├── Evidencias Grupales/       APT (Guía 1.5), presentación de la idea, formativa 1.4 y planillas de evaluación
│   └── Evidencias Individuales/   Evidencias 1.1, 1.2 y 1.3 de cada integrante
└── Fase 2/
    ├── Evidencias Grupales/       Guía 2.4 de desarrollo y planilla de evaluación de avance
    ├── Evidencias Individuales/   Autoevaluación de avance 2.2 de cada integrante
    └── Evidencia Proyecto/
        ├── Epicas.xlsx                  25 épicas con descripción, prioridad y story points
        ├── Historias_de_Usuario.xlsx    137 historias con criterios de aceptación, prioridad y estimación
        ├── Backlog_Priorizado.xlsx      Product Backlog ordenado por prioridad MoSCoW
        ├── modelo_de_datos.pdf          Modelo de datos de CONVI para Supabase (también en .html)
        └── Convi/                       Código de la plataforma
            ├── apps/web/                Portales en Next.js
            ├── apps/api/                API en NestJS
            ├── apps/ia/                 Servicio de IA en FastAPI (convi-ia)
            ├── supabase/                Migraciones, pruebas de la base de datos y configuración local
            ├── infra/azure/             Infraestructura de Azure
            └── scripts/                 Iniciar, detener, comprobar, respaldar y restaurar en Windows
```

## Documentación técnica

| Documento | Contenido |
|---|---|
| `Convi/README-DOCKER.md` | Cómo levantar CONVI en un equipo local con Docker y Supabase |
| `Convi/SUPABASE-CLOUD.md` | Cómo conectar el entorno local a Supabase en la nube |
| `Convi/AZURE.md` | Publicación en Azure con HTTPS y dominio propio |
| `Convi/RESPALDOS.md` | Respaldo de la base de datos y los archivos, y ensayo de restauración |
| `Convi/PB-128.md` | Protección de contraseñas y secretos |

## Equipo

| Integrante | Rol | Áreas a cargo |
|---|---|---|
| **Fernando Torres** | Scrum Master y desarrollador | Registro de situaciones, gestión de casos y estados, protocolos, intervenciones y seguimientos |
| **Sebastián Flores** | Desarrollador | Usuarios, perfiles y permisos, auditoría, Plan de Gestión, reportes e indicadores, requisitos, entorno Docker y publicación en Azure |
| **Camilo Monge** | Product Owner y desarrollador | Modelo de datos, estudiantes, importación y fichas de seguimiento, reglas y alertas, asistente de IA y datos sintéticos de prueba |

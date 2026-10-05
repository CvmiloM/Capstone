# CONVI

**Plataforma de seguimiento y trazabilidad de situaciones de convivencia escolar**

Proyecto APT de Ingeniería en Informática · Duoc UC, sede San Andrés de Concepción · Asignatura Capstone (APT122)

---

## ¿Qué es CONVI?

En los establecimientos educacionales, los antecedentes de convivencia escolar suelen quedar repartidos entre el libro de clases, planillas, correos, entrevistas, actas y otros documentos. Reconstruir lo que ocurrió con un estudiante depende de búsquedas manuales y de la memoria de las personas, y se pierde la relación entre la situación informada, la intervención que se hizo y el seguimiento posterior.

CONVI es una plataforma web que reúne esa información en un **expediente digital ordenado y trazable**: cuándo se registró una situación, quiénes participaron, qué se decidió, qué entrevistas o reuniones se realizaron, qué acuerdos quedaron, qué seguimientos se hicieron y qué evidencias respaldan cada paso.

La solución tiene dos ejes:

- **Reactivo:** gestión de las situaciones y los casos que ya ocurrieron.
- **Preventivo:** organización del Plan de Gestión de Convivencia del establecimiento.

CONVI es **multiestablecimiento**: cada escuela mantiene separados sus usuarios, estudiantes, documentos, reglas y registros.

## Objetivos

**Objetivo general.** Mejorar la eficiencia y trazabilidad de la gestión de situaciones de convivencia escolar mediante una plataforma web centralizada.

**Objetivos específicos.**

| | Objetivo |
|---|---|
| **OE1** | Alcanzar una cobertura digital de al menos el 80 % de los casos activos autorizados para carga inicial durante los primeros 4 meses de operación. |
| **OE2** | Reducir en al menos un 60 % el tiempo promedio de consulta del historial de un estudiante durante los primeros 4 meses de operación, respecto del método anterior. |
| **OE3** | Alcanzar trazabilidad verificable en al menos el 90 % de los casos gestionados en CONVI durante los primeros 6 meses de operación. |
| **OE4** | Reducir en al menos un 60 % el tiempo promedio de síntesis de antecedentes de un caso mediante el asistente de IA durante los primeros 4 meses de operación, respecto del proceso manual. |

## Tecnologías

| Capa | Tecnología | Uso |
|---|---|---|
| Interfaz | **Next.js** + **TypeScript** | Portales de Administración, Convivencia, Profesor y Apoderado |
| Backend principal | **NestJS** | Autenticación, autorización, lógica de negocio y acceso a los datos |
| Base de datos | **PostgreSQL** en **Supabase** | Datos de la plataforma, con seguridad por fila |
| Autenticación | **Supabase Auth** | Cuentas, invitaciones, recuperación de acceso y segundo factor (TOTP) |
| Archivos | **Supabase Storage** | Evidencias, actas y documentos institucionales en almacenamiento privado |
| Servicio de IA | **FastAPI** + **Ollama** | Servicio de IA desacoplado; Ollama es el motor de referencia del MVP |
| Búsqueda en documentos | **pgvector** (embeddings bge-m3) | Búsqueda de fragmentos del reglamento y otros documentos institucionales |
| Tareas en segundo plano | **Redis** + **BullMQ** | Procesamiento de documentos, importaciones, informes y correos |
| Entornos | **Docker** + **Docker Compose** | Entornos reproducibles de desarrollo y despliegue |
| Control de versiones | **Git** + **GitHub** | Repositorio del proyecto |


## Metodología

El proyecto se desarrolla con **Scrum**:

- **Product Owner:** Camilo Monge. **Scrum Master:** Fernando Torres. **Equipo de desarrollo:** los tres integrantes.
- Product Backlog priorizado con **MoSCoW** (Must, Should, Could).
- Historias de usuario con criterios de aceptación verificables, estimadas con una rúbrica de alcance, complejidad e incertidumbre y acordadas con **Planning Poker**.
- Una historia se da por terminada cuando cumple sus criterios de aceptación, su código fue revisado por otro integrante, tiene pruebas ejecutadas con resultado registrado y respeta los permisos de cada perfil.

## Fases del proyecto

| Fase | Propósito |
|---|---|
| **Fase 1: Definición** | Definir el problema, el alcance, los objetivos, la metodología, las evidencias y el plan de trabajo del proyecto (APT). |
| **Fase 2: Desarrollo** | Especificar y construir la solución por incrementos, verificarla con pruebas e informar el avance del proyecto. |
| **Fase 3: Cierre** | Cerrar la validación, completar la documentación final y preparar la defensa del proyecto. |

## Avance del proyecto

- Proyecto APT definido, con su objetivo general y cuatro objetivos específicos.
- 25 épicas y 137 historias de usuario con criterios de aceptación, prioridad y estimación.
- Product Backlog priorizado.
- Modelo de datos completo para Supabase (PostgreSQL): 51 tablas con separación por establecimiento, permisos por perfil, auditoría e historial que no se puede editar.

Las épicas, las historias de usuario, el backlog priorizado y el modelo relacional están en `Fase 2/Evidencias del Proyecto`.

## Estructura del repositorio

```
Capstone/
├── Fase 1/
│   ├── Evidencias Grupales/       APT (Guía 1.5), presentación de la idea, formativa 1.4 y planilla de evaluación
│   └── Evidencias Individuales/   Evidencias 1.1, 1.2 y 1.3 de cada integrante
└── Fase 2/
    ├── Evidencias Grupales/       Guía 2.4 de desarrollo y planilla de evaluación de avance
    ├── Evidencias Individuales/   Autoevaluación de avance 2.2 de cada integrante
    └── Evidencias del Proyecto/
        ├── Épicas                 25 épicas con descripción, prioridad y story points
        ├── Historias de Usuario   137 historias con criterios de aceptación, prioridad y estimación
        ├── Backlog Priorizado     Product Backlog ordenado por prioridad MoSCoW
        └── Modelo Relacional      Modelo de datos de CONVI para Supabase (PostgreSQL)
```

## Equipo

| Integrante | Rol | Áreas a cargo |
|---|---|---|
| **Fernando Torres** | Scrum Master y desarrollador | Registro de situaciones, gestión de casos y estados, protocolos, intervenciones y seguimientos |
| **Sebastián Flores** | Desarrollador | Usuarios, perfiles y permisos, auditoría, Plan de Gestión, reportes e indicadores, requisitos y entorno Docker |
| **Camilo Monge** | Product Owner y desarrollador | Modelo de datos, estudiantes, importación y fichas de seguimiento, reglas y alertas, y datos sintéticos de prueba |



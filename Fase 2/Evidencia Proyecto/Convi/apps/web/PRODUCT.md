# CONVI

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El equipo de Convivencia registra, consulta y gestiona la convivencia de su escuela, los informes se crean y consultan exclusivamente con el perfil CONVIVENCIA, el administrador no recibe acceso a estos informes.

## Product Purpose

CONVI conserva los antecedentes, situaciones, casos y actuaciones de convivencia escolar con trazabilidad, los informes permiten revisar la trayectoria de un estudiante, el detalle de un caso o los registros de un período, con cifras comprensibles y criterios visibles.

## Operating Context

La aplicación usa Next.js, NestJS y PostgreSQL con Supabase, se desarrolla localmente con Docker y se publica en Azure, los permisos se vuelven a comprobar en el servidor y los datos se aíslan por escuela.

## Capabilities and Constraints

Los informes se organizan en bloques separados según la tarea de Convivencia, cada bloque ofrece sus propias selecciones y filtros, las búsquedas requieren una solicitud explícita y dos fechas válidas antes de mostrar datos.

Se necesitan PDF y XLSX personalizables con título, período, filtros, secciones, gráficos y comentarios, los gráficos deben corresponder a la naturaleza de los datos y los hallazgos deben respaldarse con cifras verificables.

El informe de estudiante puede incluir sus situaciones, casos y actuaciones dentro del período elegido, el de caso permite seleccionar sus detalles y entrevistas, el análisis del período permite revisar cantidades por tiempo, categoría, curso y nivel educativo, y cambios de categorías entre meses.

Los informes publicados conservan archivo, criterios, valores, creador y fecha, una corrección crea otra edición, la ausencia de datos no produce porcentajes inventados.

Se reutilizan el modelo, los componentes, los permisos y el segundo factor de CONVI, los cambios de esquema o permisos requieren una propuesta y autorización separadas, Git y GitHub los opera Sebastián.

## Brand Commitments

Conservar el diseño, los colores y la identidad visual existentes de CONVI, la redacción usa comas dentro de cada párrafo y reserva el punto para su final, evita punto y coma y dos puntos dentro de los párrafos.

## Product Principles

- Mostrar opciones separadas y adecuadas a la tarea elegida.
- Explicar qué se contó, qué período se utilizó y de dónde salen las cifras.
- Conservar los antecedentes y las publicaciones anteriores.
- Comprobar permisos en cada consulta, generación y descarga.
- Presentar hechos registrados sin clasificar ni predecir la conducta de estudiantes.

## Accessibility & Inclusion

Las tareas deben funcionar con teclado, foco visible, etiquetas y errores claros, los gráficos incluyen valores, textos y acceso a los datos sin depender solamente del color.

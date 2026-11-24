# Plan de tareas — Inventa

El orquestador asigna cada tarea a Develop y no la marca como hecha hasta que Testing
la aprueba (informes en `docs/revisiones/`).

- [x] **T1 — Base y acceso.** Instalar `@supabase/ssr`, `@supabase/supabase-js`, `zod`,
  `vitest`; scripts `typecheck` y `test`. Clientes de Supabase (`src/lib/supabase/`),
  `src/proxy.ts` que refresca la sesión y manda a `/login` sin sesión. Página `/login`
  (email + contraseña, con errores en español), cerrar sesión, layout privado con navegación
  (Panel, Productos, Clientes, Pedidos) y `/` que redirige a `/panel`. `.env.example`.
  Lógica pura de partida en `src/lib/domain/money.ts` (formatear céntimos en euros, convertir
  "12,50" a 1250) con tests.
- [x] **T2 — Base de datos.** `supabase/migrations/0001_esquema.sql`: tablas `productos`,
  `clientes`, `pedidos` (estado `pendiente | enviado | cancelado`), `pedido_lineas`;
  `owner_id`, RLS y políticas; índices por `owner_id` y claves ajenas; funciones
  `crear_pedido(cliente_id, lineas jsonb)`, `cancelar_pedido(id)`, `enviar_pedido(id)`.
  Tipos de las filas en `src/lib/types.ts`.
- [x] **T2b — Identidad visual «Albarán».** (Añadida por decisión del humano: la app no debe
  parecer una plantilla de IA.) Tokens de la guía visual de `develop.md` en `globals.css`,
  fuentes Newsreader / IBM Plex Sans / IBM Plex Mono con `next/font`, y componentes base
  reutilizables (`PageHeader`, `Button`, `Field`, `Stamp`, `LedgerTable`). Rehacer con ese
  estilo lo existente de T1: login, layout privado, navegación, "Próximamente" y páginas de error.
- [x] **T3 — Productos y clientes.** Listado, alta, edición y borrado de productos (nombre,
  SKU, precio, stock, stock mínimo; marca de "stock bajo") y de clientes (nombre, email,
  teléfono). Lógica `isLowStock` con tests.
- [x] **T4 — Pedidos.** Listado con estado y total; nuevo pedido (elegir cliente, añadir
  líneas producto + cantidad, ver total) que llama a `crear_pedido`; detalle con sus líneas;
  botones enviar y cancelar. Lógica `orderTotal` y `validateLines` con tests.
- [x] **T5 — Panel y acabado.** Panel con nº de productos, productos con stock bajo
  (lista), pedidos del mes e ingresos del mes (pedidos no cancelados). Repaso de estados
  vacíos, móvil y textos. README con cómo se trabajó con los agentes.

## Producción (bloques 1 y 2)

Encargo completo, autocontenido, en `docs/tareas/produccion-bloques-1-y-2.md`
(directrices D23–D30 en `testing.md`). Bloque 1 primero.

- [x] **T6 — Integración continua.** GitHub Actions (lint, tipos, tests, build, gitleaks),
  Dependabot, `main` protegida (con confirmación del humano).
- [x] **T7 — Migraciones con historial.** `supabase link` + `migration repair` de 0001/0002;
  a partir de aquí solo `supabase db push`.
- [x] **T8 — Tipos generados.** `supabase gen types` → `src/lib/database.types.ts`.
- [x] **T9 — Tests de base de datos.** pgTAP en `supabase/tests/` (las 27 verificaciones de T2,
  más acceso de `anon`, aislamiento, reglas y esquema de seguridad: 90 pruebas en 4 archivos).
- [x] **T10 — Tests E2E.** Playwright en `e2e/` con los flujos críticos.
- [x] **T11 — Consultas que escalan.** Paginación, agregados del panel en SQL, índices.
- [x] **T12 — Cabeceras de seguridad.** HSTS, CSP (primero report-only) y compañía.
- [ ] **T13 — Pedidos idempotentes.** Clave de idempotencia en `crear_pedido`.
- [ ] **T14 — Movimientos de stock.** Tabla de auditoría alimentada por triggers.
- [ ] **T15 — Endurecer el acceso.** Ajustes de Auth que hace el humano, documentados.

## Decisiones del orquestador

- **T2 (ronda 1) — escrituras directas.** Develop avisó de que, con políticas de escritura en
  `pedidos` y `pedido_lineas` y funciones `security invoker`, un usuario podría saltarse el
  control de stock y de estados escribiendo directamente por la API REST. Decisión: endurecer
  D7 y D8 — esas dos tablas solo se leen por RLS y se escriben exclusivamente mediante
  funciones `security definer` que filtran por `auth.uid()`.
- **T2b (ronda 1) — alineación en tablas.** Develop señaló que D22 obligaba a alinear a la
  derecha también SKU y fechas. Decisión: D22 precisada — solo importes y cantidades van a la
  derecha; SKU, fechas y referencias siguen en Mono pero pueden ir a la izquierda.
- **T6 — protección de `main`.** Con la confirmación del humano, `main` queda protegida con
  `gh api`: PR obligatorio, checks `Calidad` y `Secretos` obligatorios con la rama al día y sin
  force-push ni borrado. El job `E2E (Playwright)` no es obligatorio porque solo corre si
  existen los secretos.
- **T6–T10 — retomadas por el equipo.** La primera versión de T6–T10 (informes r1–r2 de esas
  tareas, PR #1–#5) la hizo otro agente (Gemini en Antigravity) haciendo a la vez los tres
  papeles, sin subagentes. Como la prueba pide este equipo de Claude Code, el orquestador vuelve
  a pasar T6–T10 por el bucle sobre `main`: Develop retoma cada tarea partiendo de ese código y
  rehace lo que no cumpla, y Testing la revisa en rondas nuevas (la numeración continúa). Los
  informes anteriores se conservan tal cual.
- **T7 (ronda 2) — migraciones.** Una migración aplicada no se edita, así que `0002` se queda
  como está; el README documenta cómo marcarla como aplicada en un proyecto que no tenga
  `public.rls_auto_enable()`. Orden: Develop escribe la migración con `supabase migration new`;
  el orquestador la aplica con `supabase db push` cuando Testing ha aprobado la tarea y antes de
  fusionar el PR, y por eso cada migración tiene que ser compatible con el código de `main`.
  `develop.md` se actualiza con esta regla y con el nombre real de los archivos (`<fecha>_nombre.sql`).
- **T8 (ronda 2) — `db:types` y variables.** `npm run db:types` pasa a
  `node scripts/db-types.mjs`: por defecto hace lo mismo que el comando del encargo, pero admite
  otro proyecto con `SUPABASE_PROJECT_REF` y no vacía `database.types.ts` si la CLI falla. D6 se
  interpreta así: la app solo lee las dos variables `NEXT_PUBLIC_*`; `SUPABASE_PROJECT_REF` no es
  un secreto y solo la usa esa herramienta. Los `| null` defensivos de los objetos anidados de las
  páginas se quedan como están (quitarlos cambia la interfaz y no es parte de T8).
- **T9 (ronda 2) — alcance de los tests de esquema.** `public.rls_auto_enable()` es de Supabase
  (`security definer`, `search_path = pg_catalog`): los tests de D8 la excluyen de la regla literal
  `search_path = ''`, pero le exigen `search_path` fijo y que nadie de la API pueda ejecutarla.
  `npm run test:db` no entra en CI de momento: necesitaría un token de Supabase como secreto de
  GitHub, y eso lo decide el humano.
- **T10 (ronda 3) — qué significa «dejar los datos como estaban» (D27).** Los pedidos no se pueden
  borrar por diseño (D7), así que un test E2E que crea un pedido lo cancela: el stock vuelve a su
  valor y el pedido queda cancelado en el listado. Por eso el seed se recarga antes de cada
  despliegue y, si algún día se activan los E2E en CI, se recomienda un usuario E2E propio. En CI
  el artefacto de Playwright solo lleva capturas (el informe HTML y las trazas guardarían la
  contraseña del usuario E2E en un repositorio público), y el job E2E tiene su propio grupo de
  concurrencia sin cancelación; `Calidad` y `Secretos` siguen cancelando las ejecuciones viejas.
- **T11–T14 — migraciones en dos fases.** La app de la rama, sus E2E, los tests pgTAP nuevos y
  `npm run db:types` necesitan que la migración ya exista en Supabase, pero la regla de T7 dice que
  se aplica cuando Testing aprueba. Decisión: en las tareas con migración, Testing revisa primero
  **solo la migración** (una ronda propia: la ejecuta con sus tests dentro de
  `begin … rollback`, fuera del repositorio). Si la aprueba, el orquestador hace `supabase db push`,
  pasa los advisors y regenera los tipos; después Testing hace la revisión completa en la ronda
  siguiente, con E2E. Desde ese momento la migración es inmutable: cualquier arreglo va en una
  migración nueva. Sigue valiendo que cada migración tiene que ser compatible con el código de `main`.
- **T11 — borrador de otra herramienta.** Gemini dejó sin aplicar un borrador de T11
  (`20261124114049_consultas_escalables.sql` y `02_consultas_y_permisos.sql`). Develop lo usa solo
  como referencia: la migración y los tests de T11 son nuevos y pasan por el bucle completo.
- **T11 (ronda 1) — colación de `nombre`.** Para paginar productos y clientes en SQL sin cambiar
  el orden que ve hoy el usuario (`Intl.Collator("es", { sensitivity: "base", numeric: true })`: «nata, Nube, Ñandú»,
  «Item 2, Item 10»), la migración crea la colación ICU `public.es_natural` y la pone en
  `productos.nombre` y `clientes.nombre`. Es el único cambio de T11 que no se limita a añadir; se
  acepta porque la colación es determinista (la igualdad sigue siendo byte a byte), `ilike` sigue
  funcionando, el código de `main` no ordena por `nombre` en SQL y las tablas son pequeñas (el
  bloqueo al reconstruir los índices es breve). Los índices `*_owner_id_idx` antiguos se mantienen,
  aunque los nuevos los cubren, para no quitar nada en esta migración.
- **T11 — migración aplicada.** Tras el APROBADO de la ronda 2 (solo base de datos), el orquestador
  aplicó `20261124144658_consultas_escalables.sql` con `supabase db push` y regeneró
  `database.types.ts`. Advisors: los avisos `authenticated_security_definer_function_executable` de
  `crear_pedido`, `cancelar_pedido` y `enviar_pedido` son el diseño de D8 (ya estaban antes);
  `auth_leaked_password_protection` es un ajuste de Auth que corresponde a T15; los 5 `unused_index`
  son los índices nuevos, que la fase 2 empieza a usar. Ninguno vuelve a Develop.
- **T11 (ronda 3) — límites de la interfaz.** Productos y clientes se paginan por número de página
  (50 por página, `offset`) y no por cursor: el coste está acotado y un cursor por `nombre` en un
  `or` de PostgREST sería frágil. Pedidos sí usa cursor `(created_at, id)`, y «← Los más recientes»
  vuelve a la primera página porque `pedidos_pagina` solo avanza hacia atrás en el tiempo. Los
  desplegables de nuevo pedido traen como mucho 500 clientes y 500 productos (`ORDER_FORM_OPTIONS`)
  con un aviso si hay más: es un límite funcional aceptado para el tamaño de esta app; un selector
  con búsqueda en el servidor queda como mejora futura. La búsqueda (`ilike`) distingue tildes y
  un `*` actúa como comodín de PostgREST; se acepta porque solo afecta a las filas del propio
  usuario (RLS) y no produce errores.
- **T12 (ronda 1) — CSP sin nonce.** La guía de CSP de Next 16 exige renderizado dinámico para los
  nonces y dice que son incompatibles con el prerenderizado parcial, que este proyecto usa
  (`cacheComponents: true`). Decisión: CSP estática en `headers()` de `next.config.ts`, como en el
  apartado «Without Nonces» de la guía, con `script-src 'self' 'unsafe-inline'` (los scripts en
  línea de Next y React cambian en cada petición y no se pueden fijar con hashes). Todo lo demás
  queda en `'self'` o `'none'`, sin `'unsafe-eval'` en producción y sin `'unsafe-inline'` en
  estilos. Se hace en dos pasos dentro de la misma ronda: primero `Content-Security-Policy-Report-Only`
  (commit propio) y, tras recorrer todas las rutas sin violaciones, obligatoria.
  La SRI experimental (`experimental.sri`) no se usa: solo añade `integrity` a los scripts externos,
  y los scripts en línea de Next seguirían necesitando `'unsafe-inline'`. En desarrollo la CSP queda
  en report-only, porque no se ha podido probar el HMR con la política obligatoria.
- **T13 — migración aplicada.** Tras el APROBADO de la ronda 2 (solo base de datos), el orquestador
  aplicó `20261124163811_pedidos_idempotentes.sql` con `supabase db push` (queda una sola
  `crear_pedido(uuid, jsonb, uuid)`) y regeneró `database.types.ts`. Advisors: solo los avisos de
  siempre (las tres funciones `security definer` de D8 y la protección de contraseñas de T15).
- **T9 — ejecución de pgTAP sin Docker.** `supabase test db --linked` también invoca un
  contenedor Docker (`pg_prove`) y falla en máquinas sin Docker en marcha. Decisión: habilitar
  `pgtap` en el esquema `extensions` mediante migración (`supabase migration new`), escribir los
  tests en `supabase/tests/*.sql` en formato pgTAP estándar (`begin; ... plan(N) ... finish();
  rollback;`, emitiendo todas las líneas TAP en un único `select` para compatibilidad dual) y
  hacer que `npm run test:db` ejecute `supabase test db --linked` si Docker está activo o, en su
  defecto, ejecute cada archivo con `supabase db query --linked -f` validando estrictamente la
  salida TAP (plan, cero `not ok`, cero diagnósticos de fallo).

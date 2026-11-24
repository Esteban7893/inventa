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

## Decisiones del orquestador

- **T2 (ronda 1) — escrituras directas.** Develop avisó de que, con políticas de escritura en
  `pedidos` y `pedido_lineas` y funciones `security invoker`, un usuario podría saltarse el
  control de stock y de estados escribiendo directamente por la API REST. Decisión: endurecer
  D7 y D8 — esas dos tablas solo se leen por RLS y se escriben exclusivamente mediante
  funciones `security definer` que filtran por `auth.uid()`.
- **T2b (ronda 1) — alineación en tablas.** Develop señaló que D22 obligaba a alinear a la
  derecha también SKU y fechas. Decisión: D22 precisada — solo importes y cantidades van a la
  derecha; SKU, fechas y referencias siguen en Mono pero pueden ir a la izquierda.

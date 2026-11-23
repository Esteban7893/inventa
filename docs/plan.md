# Plan de tareas — Inventa

El orquestador asigna cada tarea a Develop y no la marca como hecha hasta que Testing
la aprueba (informes en `docs/revisiones/`).

- [ ] **T1 — Base y acceso.** Instalar `@supabase/ssr`, `@supabase/supabase-js`, `zod`,
  `vitest`; scripts `typecheck` y `test`. Clientes de Supabase (`src/lib/supabase/`),
  `src/proxy.ts` que refresca la sesión y manda a `/login` sin sesión. Página `/login`
  (email + contraseña, con errores en español), cerrar sesión, layout privado con navegación
  (Panel, Productos, Clientes, Pedidos) y `/` que redirige a `/panel`. `.env.example`.
  Lógica pura de partida en `src/lib/domain/money.ts` (formatear céntimos en euros, convertir
  "12,50" a 1250) con tests.
- [ ] **T2 — Base de datos.** `supabase/migrations/0001_esquema.sql`: tablas `productos`,
  `clientes`, `pedidos` (estado `pendiente | enviado | cancelado`), `pedido_lineas`;
  `owner_id`, RLS y políticas; índices por `owner_id` y claves ajenas; funciones
  `crear_pedido(cliente_id, lineas jsonb)`, `cancelar_pedido(id)`, `enviar_pedido(id)`.
  Tipos de las filas en `src/lib/types.ts`.
- [ ] **T3 — Productos y clientes.** Listado, alta, edición y borrado de productos (nombre,
  SKU, precio, stock, stock mínimo; marca de "stock bajo") y de clientes (nombre, email,
  teléfono). Lógica `isLowStock` con tests.
- [ ] **T4 — Pedidos.** Listado con estado y total; nuevo pedido (elegir cliente, añadir
  líneas producto + cantidad, ver total) que llama a `crear_pedido`; detalle con sus líneas;
  botones enviar y cancelar. Lógica `orderTotal` y `validateLines` con tests.
- [ ] **T5 — Panel y acabado.** Panel con nº de productos, productos con stock bajo
  (lista), pedidos del mes e ingresos del mes (pedidos no cancelados). Repaso de estados
  vacíos, móvil y textos. README con cómo se trabajó con los agentes.

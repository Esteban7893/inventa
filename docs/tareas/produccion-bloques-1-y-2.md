# Encargo: llevar Inventa a estándares de producción (bloques 1 y 2)

Este documento es un encargo **autocontenido** para un agente que no ha participado en la
construcción de Inventa (por ejemplo, Gemini en Antigravity). Léelo entero antes de tocar nada.

## 0. Contexto en 1 minuto

- **Inventa** es un mini ERP de inventario y pedidos: Next.js 16 (App Router, `src/`,
  Cache Components) + Supabase (Postgres, Auth, RLS) + Vercel. Producción:
  `https://inventa-rosy.vercel.app`. Repositorio: `github.com/Esteban7893/inventa`.
- Se construyó con un **equipo de 3 agentes** y ese proceso es parte de lo que se evalúa.
  Tienes que seguir el mismo proceso (sección 2). Lee, en este orden:
  1. `CLAUDE.md` — el orquestador y su bucle de trabajo.
  2. `.claude/agents/develop.md` — cómo se programa aquí (capas, estilo «Albarán», reglas Next 16).
  3. `.claude/agents/testing.md` — las DIRECTRICES D1–D22 (y D23–D30 nuevas, para este encargo).
  4. `docs/plan.md` — tareas T1–T5 (hechas) y las decisiones del orquestador.
  5. `AGENTS.md` — aviso de Next.js 16: lee `node_modules/next/dist/docs/` antes de usar una API.
  6. `README.md` — visión general, seguridad y cómo se ejecuta.
- Estado: T1–T5 aprobadas, 161 tests, lint/tipos/build en verde. **No rompas nada de eso.**

## 1. Reglas que no se negocian

1. **Supabase: solo la CLI** (`supabase …`), que ya tiene sesión iniciada en la cuenta correcta.
   Proyecto `inventa`, ref `uqupgywhmmdpjjenxywb`, región eu-west-1.
   **Nunca** uses un MCP/conector de Supabase: en este equipo apunta a otra cuenta con
   proyectos ajenos que no se pueden tocar.
2. **Secretos**: nunca en el repositorio, en logs ni en mensajes. No leas ni copies la clave
   `service_role`/`sb_secret_…`, la contraseña de la base de datos ni tokens de acceso. Cuando
   haga falta un secreto (contraseña de la BD, `SUPABASE_ACCESS_TOKEN`, secretos de GitHub
   Actions), **para y pídeselo al humano** para que lo introduzca él (en la terminal o en la web
   de GitHub/Vercel/Supabase).
3. **Cambios de configuración de servicios** (protección de ramas en GitHub, conectar Vercel
   con GitHub, ajustes de Auth en Supabase): propónlos y **pide confirmación al humano** antes
   de hacerlos; algunos solo puede hacerlos él desde la web.
4. **Nada directo a `main`.** Cada tarea en su rama (`t6-ci`, `t7-migraciones`…), con PR.
   El humano fusiona.
5. **Datos de producción**: el usuario de prueba y los datos de demostración que ven los
   evaluadores viven en el proyecto de producción. No borres ni cambies datos. Si una prueba
   crea pedidos, cancélalos y, al terminar, recarga los datos de demostración:
   `supabase db query --linked --project-ref uqupgywhmmdpjjenxywb -f supabase/seed_demo.sql`.
6. Commits con el email *noreply* ya configurado en el repositorio (`git config user.email`).

## 2. Cómo trabajar (el mismo bucle que T1–T5)

Haz los tres papeles, **por separado y en este orden**, para cada tarea:

1. **Orquestador**: crea la rama, añade la tarea a `docs/plan.md` si no está.
2. **Develop**: implementa siguiendo `develop.md`. Ejecuta
   `npm run lint && npm run typecheck && npm test && npm run build`.
3. **Testing**: con «ojos nuevos», revisa la entrega contra **todas** las directrices de
   `testing.md` (D1–D30) y escribe el informe con el formato exacto de `testing.md` en
   `docs/revisiones/T<n>-r<k>.md`. Sé exigente: un solo ❌ es SUSPENSO.
4. Si SUSPENSO → vuelve a Develop con el informe. Si APROBADO → marca la tarea en
   `docs/plan.md`, commit `T<n> r<k>: APROBADO — …`, push de la rama y abre el PR con `gh`.
5. Máximo 4 rondas por tarea; si no sale, para y explícale al humano qué falla.
6. Las decisiones que tomes cuando algo sea ambiguo van a "Decisiones del orquestador" en
   `docs/plan.md`.

Al terminar todo: añade las filas nuevas a la tabla de rondas del `README.md` y una sección
"Producción" que explique CI, migraciones y entornos.

## 3. Bloque 1 — imprescindible (hazlo primero)

### T6 — Integración continua
- `.github/workflows/ci.yml` en `pull_request` y `push` a `main`: Node 22 (o 24) LTS con caché
  de npm, `npm ci`, `lint`, `typecheck`, `test`, `build` (con
  `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co` y
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example`: el build ya funciona sin
  conexión real). Añade `"engines": { "node": ">=22" }` a `package.json`.
- Escaneo de secretos (gitleaks) en el mismo workflow.
- `.github/dependabot.yml` (npm y github-actions, semanal, agrupando menores).
- `concurrency` para cancelar ejecuciones viejas del mismo PR; permisos mínimos
  (`permissions: contents: read`).
- **Pide confirmación al humano** y, si dice que sí, protege `main` con `gh api`
  (PR obligatorio, CI obligatorio, sin force-push). Conectar Vercel con GitHub (previews por
  PR) lo tiene que hacer él: en Vercel, *Account Settings → Authentication → Connect GitHub* y
  luego *Project → Settings → Git*. Déjalo explicado en el README.
- **Hecho cuando**: el PR de T6 muestra el check de CI en verde en GitHub.

### T7 — Migraciones con historial
Hoy las migraciones `0001` y `0002` se aplicaron con consultas sueltas: Supabase **no tiene
historial** (`supabase_migrations.schema_migrations` no existe).
- Pide al humano que ejecute en su terminal `supabase link --project-ref uqupgywhmmdpjjenxywb`
  (le pedirá la contraseña de la BD; tú no la ves).
- Marca como aplicadas las existentes **sin volver a ejecutarlas**:
  `supabase migration repair --status applied 0001 0002 --linked`.
  Comprueba con `supabase migration list --linked` que local y remoto coinciden y que
  `supabase db push --linked --dry-run` dice que no hay nada pendiente.
- Documenta el flujo en el README: nueva migración con `supabase migration new <nombre>`,
  revisión, `supabase db push`. Nunca más SQL suelto contra producción.
- Opcional, solo si el humano añade los secretos `SUPABASE_ACCESS_TOKEN` y
  `SUPABASE_DB_PASSWORD` en GitHub: workflow `db-migrate.yml` con `workflow_dispatch`
  (manual) que haga `supabase db push`. No automático en cada push.

### T8 — Tipos generados desde el esquema
- `npm run db:types` → `supabase gen types typescript --project-id uqupgywhmmdpjjenxywb > src/lib/database.types.ts`.
- `createServerClient<Database>` en `src/lib/supabase/server.ts` y `proxy.ts`; los tipos de
  `src/lib/types.ts` pasan a derivarse de `Database` (`Tables<'productos'>`, etc.) y las
  llamadas `rpc(...)` quedan tipadas. Sin `any`, sin casts innecesarios.
- Todo sigue en verde (lint, tipos, 161+ tests, build).

### T9 — Tests de base de datos en el repositorio (pgTAP)
- Convierte `docs/verificaciones/T2-pruebas.sql` (27 comprobaciones: RLS, stock, atomicidad,
  cancelar una sola vez, aislamiento entre usuarios, escrituras directas denegadas) en tests
  pgTAP en `supabase/tests/*.sql`, cada archivo con `begin; … select * from finish(); rollback;`
  para que **no deje datos**.
- Ejecución: `supabase test db --linked` (Docker no está disponible en esta máquina, así que
  no uses `--local`). Script `npm run test:db`.
- **Hecho cuando**: los 27 casos pasan y la base de datos queda igual (cuenta productos,
  clientes, pedidos y usuarios antes y después).

### T10 — Tests de extremo a extremo (Playwright) en el repositorio
- `@playwright/test` como dependencia de desarrollo, `playwright.config.ts`, `e2e/*.spec.ts`,
  script `npm run test:e2e`. Credenciales por variables de entorno `E2E_EMAIL`/`E2E_PASSWORD`
  (en `.env.local` en local; secretos de GitHub en CI si el humano los añade) — nunca en el código.
- Escenarios: login y redirección sin sesión; crear pedido → baja el stock; pedido sin stock
  rechazado sin guardar nada; cancelar → vuelve el stock; formulario cancelado sale limpio al
  volver (bug de T3 r1); sin scroll horizontal a 375 px. **Cada test deja los datos como
  estaban** (cancela lo que crea).
- En CI: job aparte que solo corre si existen los secretos (`if: secrets…` vía variable),
  contra `npm run build && npm run start`.

## 4. Bloque 2 — escalabilidad y seguridad (después del bloque 1)

### T11 — Consultas que escalan
- Ningún listado sin límite: paginación por cursor (`created_at`, `id`) en pedidos y
  paginación o límite + búsqueda en productos y clientes, con `searchParams` (asíncronos).
- El panel hoy descarga **todos** los pedidos y suma en JavaScript: muévelo a SQL (función
  `public.panel_resumen()` `security invoker` o vista con `security_invoker = on`) que devuelva
  solo las cifras. Migración nueva con `supabase migration new`.
- Índices compuestos: `pedidos (owner_id, created_at desc)`, `productos (owner_id, nombre)`.
- Los tests de `src/lib/domain/dashboard.ts` que dejen de tener sentido se adaptan, no se borran sin más.

### T12 — Cabeceras de seguridad
- En `next.config.ts` (`headers()`): `Strict-Transport-Security`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`.
- CSP: lee primero la guía de CSP de `node_modules/next/dist/docs/`. Empieza en modo
  `Content-Security-Policy-Report-Only`, compruébalo en el navegador (sin violaciones en
  consola en todas las rutas) y solo entonces pásalo a obligatorio.

### T13 — Pedidos idempotentes
- Un doble clic o un reintento de red no puede crear dos pedidos. El formulario genera una
  clave (`crypto.randomUUID()`) al montarse; `crear_pedido` recibe `p_idempotency_key` y, si ya
  existe un pedido del mismo `owner_id` con esa clave, devuelve ese mismo id.
  `unique (owner_id, idempotency_key)`. Mantén todo lo de D8 (definer, `auth.uid()`, filtros).
- Test pgTAP (dos llamadas con la misma clave → un pedido, stock descontado una vez) y unit test.

### T14 — Registro de movimientos de stock
- Tabla `movimientos_stock` (producto, delta, motivo: `pedido` | `cancelacion` | `ajuste`,
  pedido_id, usuario, fecha) rellenada por **triggers**/las funciones, solo lectura para
  `authenticated` (RLS por `owner_id`). Una sección "Movimientos" en la ficha de producto.

### T15 — Endurecer el acceso (lo hace el humano, tú lo documentas)
- Prepara una lista para el humano en el README: en Supabase → Auth, activar protección de
  contraseñas filtradas, longitud mínima, límites de intentos y MFA opcional. No intentes
  cambiar ajustes de la cuenta tú mismo.

## 5. Entrega

- Una rama y un PR por tarea, con CI en verde y su informe de Testing en `docs/revisiones/`.
- Al final, un resumen para el humano: qué PR hay que fusionar y en qué orden, qué secretos o
  ajustes tiene que añadir él, y qué no se pudo verificar.
- Tras fusionar, el despliegue: si Vercel ya está conectado con GitHub, es automático; si no,
  `npx vercel deploy --prod` desde un clon limpio. Después, `curl -sI https://inventa-rosy.vercel.app/login`
  debe dar 200 sin sesión, y recarga los datos de demostración.

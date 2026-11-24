# Inventa

Inventa es un mini ERP de inventario y pedidos para un negocio pequeño: productos con su stock
y stock mínimo, clientes y pedidos que descuentan el stock al crearse y lo devuelven si se
cancelan. Cada usuario solo ve sus propios datos.

La interfaz imita un albarán o libro de almacén impreso (papel, tinta, reglas y sellos).

**App:** <https://inventa-rosy.vercel.app>

## Usuario de prueba

| Email | Contraseña |
|---|---|
| `prueba@inventa.test` | `Albaran-2026` |

Es un usuario ficticio de demostración, con productos, clientes y pedidos ya cargados.

## Qué se puede probar

1. **Panel.** Entra con el usuario de prueba. El panel muestra los ingresos y los pedidos del
   mes (en hora de Madrid, sin contar los cancelados), los pedidos pendientes, el nº de
   productos, las unidades en stock, la lista de productos bajo mínimo y los últimos pedidos.
2. **Crear un pedido.** En *Pedidos → Nuevo pedido*, elige un cliente, añade un par de líneas
   (producto y cantidad) y guarda. Se abre el albarán con sus líneas y el total.
3. **Ver que baja el stock.** En *Productos*, el stock de esos productos ha bajado en las
   cantidades del pedido. Si alguno llega a su mínimo, aparece el sello `STOCK BAJO` y sale en
   el panel.
4. **Pedido sin stock.** Crea otro pedido con una cantidad mayor que el stock de un producto.
   Se rechaza con un mensaje claro (`No hay stock suficiente de "…"`) y no se guarda nada,
   tampoco las otras líneas.
5. **Cancelar.** En el albarán del primer pedido, *Cancelar pedido* (pide confirmación). El
   sello pasa a `CANCELADO` y el stock vuelve a su valor anterior. Un pedido cancelado o
   enviado ya no se puede cancelar ni enviar, así que el stock se devuelve una sola vez.
6. **Enviar.** Un pedido pendiente se puede marcar como enviado; deja de contar como pendiente
   en el panel, pero sigue sumando en los ingresos del mes.

## El equipo de agentes

Inventa se ha construido con tres agentes de Claude Code, cada uno con su archivo de
instrucciones:

| Agente | Archivo | Qué hace |
|---|---|---|
| Orquestador | [`CLAUDE.md`](CLAUDE.md) | Divide el trabajo en tareas ([`docs/plan.md`](docs/plan.md)), se las asigna a Develop, pide la revisión a Testing, guarda los informes, hace los commits, aplica las migraciones y despliega. No escribe código de producto. |
| Develop | [`.claude/agents/develop.md`](.claude/agents/develop.md) | Programa cada tarea siguiendo su guía (stack, estructura, Server Actions, lógica pura con tests, guía visual «Albarán») y las directrices de Testing. No puede darse por aprobado. |
| Testing | [`.claude/agents/testing.md`](.claude/agents/testing.md) | Revisa cada entrega contra las **DIRECTRICES D1–D30** (calidad, seguridad, reglas de negocio, interfaz, Next.js 16, estilo y producción). Ejecuta lint, tipos, tests y build, prueba la app en el navegador y devuelve un informe con veredicto. No edita archivos. |

Durante la construcción, Develop y Testing se lanzaron como subagentes genéricos de Claude Code
con la orden de leer y cumplir su archivo `.md` (los agentes de `.claude/agents/` se crearon en
la misma sesión y Claude Code solo los registra con nombre propio al empezar una sesión nueva).
Cada encargo concreto del orquestador añadía el texto de la tarea y, en las rondas de
corrección, el informe completo de Testing.

### El bucle

```
Orquestador --tarea--> Develop --entrega--> Testing --informe--> Orquestador
     ^                                                               |
     +------- SUSPENSO: el informe completo vuelve a Develop <-------+
              APROBADO: la tarea se marca como hecha y se pasa a la siguiente
```

- Cada informe se guarda **tal cual**, sin editar, en [`docs/revisiones/`](docs/revisiones/)
  (`T<n>-r<k>.md`) y se hace un commit con su veredicto.
- Basta un solo fallo para que el veredicto sea SUSPENSO. El máximo son 4 rondas por tarea.
- Si una directriz es ambigua o Develop no está de acuerdo con ella, decide el orquestador y
  lo anota en las "Decisiones del orquestador" de [`docs/plan.md`](docs/plan.md).
- Lo que no puede comprobar Testing (la base de datos real) lo verifica el orquestador. Esas
  comprobaciones están en [`docs/verificaciones/`](docs/verificaciones/): por ejemplo, 27
  pruebas SQL con dos usuarios contra el proyecto de Supabase.

### Rondas

| Tarea | Ronda | Veredicto | Motivo |
|---|---|---|---|
| T1 — Base y acceso | [r1](docs/revisiones/T1-r1.md) | APROBADO | |
| T2 — Base de datos | [r1](docs/revisiones/T2-r1.md) | SUSPENSO | Pedidos y líneas se podían escribir directamente por la API (D7, D8, D12–D14) |
| T2 — Base de datos | [r2](docs/revisiones/T2-r2.md) | APROBADO | |
| T2b — Identidad visual | [r1](docs/revisiones/T2b-r1.md) | SUSPENSO | Error de prerender de Next 16 en las rutas privadas (D20) |
| T2b — Identidad visual | [r2](docs/revisiones/T2b-r2.md) | APROBADO | |
| T3 — Productos y clientes | [r1](docs/revisiones/T3-r1.md) | SUSPENSO | El estado de los formularios sobrevivía a la navegación (D17) |
| T3 — Productos y clientes | [r2](docs/revisiones/T3-r2.md) | APROBADO | |
| T4 — Pedidos | [r1](docs/revisiones/T4-r1.md) | APROBADO | |
| T5 — Panel y acabado | [r1](docs/revisiones/T5-r1.md) | APROBADO | |
| T6 — Integración continua | [r1](docs/revisiones/T6-r1.md) | APROBADO | |
| T6 — Integración continua | [r2](docs/revisiones/T6-r2.md) | SUSPENSO | Lista del README partida por el párrafo de protección de `main` (D23) |
| T6 — Integración continua | [r3](docs/revisiones/T6-r3.md) | APROBADO | |
| T7 — Migraciones con historial | [r1](docs/revisiones/T7-r1.md) | APROBADO | |
| T7 — Migraciones con historial | [r2](docs/revisiones/T7-r2.md) | APROBADO | |
| T8 — Tipos generados | [r1](docs/revisiones/T8-r1.md) | APROBADO | |
| T8 — Tipos generados | [r2](docs/revisiones/T8-r2.md) | APROBADO | |
| T9 — Tests de base de datos (pgTAP) | [r1](docs/revisiones/T9-r1.md) | APROBADO | |
| T9 — Tests de base de datos (pgTAP) | [r2](docs/revisiones/T9-r2.md) | SUSPENSO | Tests que podían pasar en falso (UPDATE de `anon`, cambio de rol sin comprobar) y guarda de transacciones incompleta (D26) |
| T9 — Tests de base de datos (pgTAP) | [r3](docs/revisiones/T9-r3.md) | APROBADO | |
| T10 — Tests E2E (Playwright) | [r1](docs/revisiones/T10-r1.md) | SUSPENSO | `actions/upload-artifact@v4` en runtime `node20` en CI (D23) |
| T10 — Tests E2E (Playwright) | [r2](docs/revisiones/T10-r2.md) | APROBADO | |

### Fallos que encontró Testing y cómo se corrigieron

1. **Pedidos escribibles sin pasar por el control de stock (T2 r1).** Develop avisó de que,
   con políticas de escritura en `pedidos` y `pedido_lineas`, alguien podría saltarse el
   control de stock escribiendo directamente por la API REST. El orquestador endureció las
   directrices D7 y D8 y Testing suspendió la migración contra ellas: con un `update` directo
   se podía volver a poner como `pendiente` un pedido cancelado y cancelarlo otra vez, con lo
   que el stock se devolvía dos veces; también se podían cambiar precios y totales.
   **Corrección:** esas dos tablas solo tienen política de lectura, se revocan los permisos de
   escritura y las tres funciones (`crear_pedido`, `cancelar_pedido`, `enviar_pedido`) pasan
   a `security definer`. Al empezar exigen sesión y filtran cada lectura y escritura por
   `owner_id = auth.uid()`.
2. **Error de prerender en todas las pantallas privadas (T2b r1).** Con `npm run dev`, Next 16
   (Cache Components) avisaba de que `/panel`, `/productos`, `/clientes` y `/pedidos` usaban
   un valor inestable (`Date.now()`) al prerenderizar. Venía de `supabase.auth.getUser()`.
   **Corrección:** el cliente de Supabase del servidor llama antes a `await connection()` y cada
   ruta privada tiene su `loading.tsx`. La regla se añadió a la guía de Develop.
3. **Formularios con datos fantasma (T3 r1).** Next 16 conserva ocultas las páginas visitadas.
   Si se enviaba un formulario con errores, se cancelaba y se volvía a abrir, reaparecían los
   valores tecleados y los mensajes de error. En una ficha de edición, alguien podía tomar por
   guardados unos valores que nunca se guardaron. **Corrección:** el componente
   `ResetWhenHidden` reinicia el formulario cuando su página se oculta. También pasó a la guía
   de Develop como regla.
Además, una observación que no bloqueaba:

4. **Título de pestaña en el 404 (observación de T3 r1, corregida en T5).** En
   `/productos/<id-que-no-existe>` se veía la página 404, pero la pestaña seguía diciendo
   "Editar producto · Inventa". Al corregirlo se aplicó también a las fichas de clientes y
   pedidos. **Corrección:** las
   fichas calculan su título con `generateMetadata` y comparten con la página una única
   consulta (`React.cache`). Si el registro no existe, lanzan `notFound()` y la pestaña lleva
   el título del 404.

Testing también intentó romper la app a propósito. En T4 manipuló la petición de crear pedido
con `total_cents: 1`, un `owner_id` falso y precios de 1 céntimo: el pedido se guardó con el
precio real del producto.

## Stack y seguridad

- **Next.js 16** (App Router, Cache Components, `src/proxy.ts`), React 19, TypeScript estricto
  y Tailwind CSS v4.
- **Supabase** (Postgres, Auth y RLS) con `@supabase/ssr`. Validación con `zod` y tests con
  `vitest`. Despliegue en Vercel.
- La lógica de negocio pura (dinero, stock, pedidos, fechas en hora de Madrid, cifras del panel)
  está en `src/lib/domain/`, con sus tests.

Decisiones de seguridad:

- **RLS en todas las tablas.** Cada fila tiene `owner_id not null default auth.uid()`, y las
  políticas limitan todo a `owner_id = auth.uid()`. La app nunca envía `owner_id`.
- **Los pedidos solo se escriben con funciones `security definer`.** `pedidos` y
  `pedido_lineas` solo se pueden leer desde la API. Crear, enviar y cancelar pasan por
  `crear_pedido`, `enviar_pedido` y `cancelar_pedido`. Estas funciones exigen sesión, filtran
  por el usuario, usan `search_path = ''` y bloquean las filas con `for update`. Además, hacen
  todo o nada: si una línea no tiene stock, no se guarda ninguna. Solo `authenticated` puede
  ejecutarlas.
- **Los precios nunca vienen del cliente.** La app solo envía el cliente y pares
  `producto_id` + cantidad. La función copia el precio del producto en ese momento y calcula
  el total. Si luego se edita el producto, el albarán no cambia.
- **El stock nunca es negativo.** Hay `check (stock >= 0)` en la tabla y la función comprueba
  el stock dentro de la propia transacción.
- **Sin claves en el repositorio.** La app solo usa la URL del proyecto y la clave
  *publicable* de Supabase, que viven en `.env.local` (ignorado por git) y en las variables de
  entorno de Vercel. La clave secreta del proyecto no se usa en ningún sitio.
- Cada página privada y cada Server Action comprueban la sesión en el servidor, además de la
  redirección a `/login` de `src/proxy.ts`.

## Cómo ejecutarlo en local

Hace falta Node.js 22 o posterior, la CLI de Supabase y un proyecto de Supabase.

1. **Dependencias y variables de entorno**

   ```bash
   npm install
   cp .env.example .env.local
   ```

   En `.env.local`, pon la URL del proyecto y la clave publicable de Supabase
   (*Project Settings → API*). Si quieres ejecutar los tests E2E con Playwright, añade también
   `E2E_EMAIL` y `E2E_PASSWORD` con el usuario de pruebas (o pásalas por variable de entorno).

2. **Base de datos.** El esquema se crea solo con las migraciones de `supabase/migrations/`,
   nunca pegando SQL en el editor de Supabase. Inicia sesión en la CLI, enlaza **tu** proyecto
   (el `ref` es el identificador que aparece en la URL de tu proyecto en el panel de Supabase)
   y aplica las migraciones:

   ```bash
   supabase login
   supabase link --project-ref <ref-de-tu-proyecto>
   supabase db push --linked --dry-run   # lista lo que se va a aplicar, sin aplicar nada
   supabase db push --linked             # aplica las migraciones y las anota en el historial
   supabase migration list --linked      # las columnas Local y Remote tienen que coincidir
   ```

   `supabase link` y `supabase db push` pueden pedir la contraseña de la base de datos; la
   escribes tú en la terminal y no se guarda en el repositorio. Lo que la CLI guarda al enlazar
   va a `supabase/.temp/`, que está en `.gitignore`. Estos comandos se han comprobado con la
   CLI de Supabase 2.122.0.

   Las migraciones actuales son:

   - `supabase/migrations/0001_esquema.sql`: tablas, RLS, políticas y funciones de pedidos.
   - `supabase/migrations/0002_revocar_rls_auto_enable.sql`: quita el permiso de ejecución de
     `public.rls_auto_enable()`. Supabase solo crea esa función en los proyectos que tienen
     activado el RLS automático en las tablas nuevas.
   - `supabase/migrations/20261124094951_habilitar_pgtap.sql`: habilita la extensión `pgtap` en
     el esquema `extensions` para los tests de base de datos.

   **Si tu proyecto no tiene `public.rls_auto_enable()`**, `supabase db push` se para en
   `0002` con un error de función inexistente. En ese caso `0002` no tiene nada que hacer en tu
   proyecto. Comprueba con `supabase migration list --linked` que `0001` ya sale en la columna
   Remote; después marca `0002` como aplicada sin ejecutarla y vuelve a lanzar el push para que
   se aplique el resto:

   ```bash
   supabase migration repair --status applied 0002 --linked
   supabase db push --linked
   ```

3. **Datos de demostración (opcional).** Crea primero el usuario `prueba@inventa.test` en
   *Authentication → Users*. Después carga los datos con la CLI:

   ```bash
   supabase db query --linked -f supabase/seed_demo.sql
   ```

   El script **borra los datos de ese usuario** y vuelve a cargar 10 productos, 6 clientes y
   8 pedidos. Los pedidos se crean con `crear_pedido`, así que el stock queda coherente. Son
   datos, no esquema: no se anotan en el historial de migraciones.

4. **Arrancar y comprobar**

   ```bash
   npm run dev        # http://localhost:3000
   npm run lint       # ESLint
   npm run typecheck  # tsc --noEmit
   npm test           # Vitest
   npm run test:db    # tests pgTAP en supabase/tests/ (no dejan datos)
   npm run test:e2e   # tests E2E con Playwright (e2e/)
   npm run build      # build de producción
   npm run db:types   # regenera src/lib/database.types.ts desde el esquema de Supabase
   ```

   `npm run db:types` (`scripts/db-types.mjs`) solo lee el esquema con
   `supabase gen types typescript` y necesita la sesión de la CLI (`supabase login`). Por
   defecto lee el proyecto de producción (`uqupgywhmmdpjjenxywb`); para tu propio proyecto,
   pasa su ref en la variable `SUPABASE_PROJECT_REF` (no se lee de `.env.local`):

   ```bash
   SUPABASE_PROJECT_REF=<ref-de-tu-proyecto> npm run db:types
   ```

   Si la CLI falla (sin sesión, ref equivocado, sin red), el archivo de tipos se queda como
   estaba. El código no escribe a mano tipos de filas: `src/lib/types.ts` los deriva de
   `Database` (`Tables<"productos">`…) y solo estrecha lo que Postgres no expresa, como
   `estado` (texto con `check`) y `p_lineas` (`jsonb`).

   Los tests de base de datos viven en `supabase/tests/` (formato pgTAP envuelto en `begin; ... rollback;`,
   por lo que no dejan filas en ninguna tabla). `npm run test:db` ejecuta `supabase test db --linked`
   cuando Docker está activo y, si no hay Docker disponible, ejecuta cada archivo con
   `supabase db query --linked -f` validando estrictamente la salida TAP.

   Para los tests E2E de Playwright (`e2e/`), la primera vez instala Chromium con
   `npx playwright install chromium` y define `E2E_EMAIL` y `E2E_PASSWORD` (en `.env.local` o en
   el entorno; nunca en el código). Las pruebas comprueban redirección y login, creación y
   cancelación de pedidos con devolución de stock, rechazo por falta de stock, reinicio de
   formularios cancelados y ausencia de scroll horizontal a 375 px. Necesitan los datos de
   demostración (al menos dos productos, uno con stock 2 o más, un cliente y un pedido): si faltan,
   fallan con un mensaje que lo dice. Cada test cancela al terminar los pedidos que haya creado,
   también si falla a medias, y el stock vuelve a su valor; el pedido cancelado sí se queda en el
   listado (ver «Antes de activar los tests E2E en CI»). El informe HTML local
   (`playwright-report/`, ignorado por git) incluye lo tecleado en el login, contraseña incluida:
   no lo compartas.

## Producción

### Integración continua

Cada pull request y cada push a `main` ejecutan [`.github/workflows/ci.yml`](.github/workflows/ci.yml) en GitHub Actions con dos comprobaciones obligatorias y un job E2E opcional:

- **Calidad:** instala dependencias con `npm ci` (Node.js 22 LTS) y ejecuta `npm run lint` (falla también con avisos), `npm run typecheck`, `npm test` y `npm run build` con valores ficticios para las variables públicas de Supabase.
- **Secretos:** escanea **todo el historial** de git con la CLI de Gitleaks (versión fijada y comprobada por SHA-256 en el workflow; reglas por defecto más `.gitleaks.toml`) para evitar que entren credenciales en el repositorio. Para actualizar Gitleaks se cambian a mano `GITLEAKS_VERSION` y `GITLEAKS_SHA256` en `ci.yml`.
- **E2E (Playwright) (opcional):** solo se ejecuta si están configurados en GitHub Secrets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `E2E_EMAIL` y `E2E_PASSWORD`. Si existen, instala Chromium, compila la app con `npm run build` y lanza `npm run test:e2e` contra `npm run start`. Si faltan, el job se omite sin bloquear el PR. Solo corre un E2E a la vez en todo el repositorio y una ejecución nueva no lo cancela a medias; si falla, sube como artefacto solo las capturas de pantalla (no el informe HTML ni las trazas, que guardarían la contraseña tecleada y las cookies de sesión).

#### Antes de activar los tests E2E en CI

Los secretos los añade el humano en GitHub (*Settings → Secrets and variables → Actions*). Antes,
ten en cuenta que los tests corren contra la base de datos de producción:

- **Cada ejecución deja pedidos cancelados.** El test de crear y cancelar un pedido deja uno en
  estado *cancelado* (dos si CI lo reintenta). El stock vuelve a su valor, pero el pedido sale en
  el listado y cuenta en el panel. Con el usuario de prueba, los evaluadores lo verían.
- **Lo recomendable es un usuario E2E distinto**, con sus propios datos (RLS lo aísla del usuario
  de prueba): créalo en *Authentication → Users* y pon su email y contraseña en `E2E_EMAIL` y
  `E2E_PASSWORD`. `supabase/seed_demo.sql` está escrito para `prueba@inventa.test`, así que, para
  cargarle datos, ejecuta una copia local de ese script con el email cambiado (o crea a mano en la
  app al menos dos productos, uno con stock 2 o más, un cliente y un pedido). Puedes volver a
  ejecutar esa copia de vez en cuando para quitar los pedidos cancelados.
- **Si usas el usuario de prueba**, recarga los datos de demostración después de las ejecuciones
  (`supabase db query --linked -f supabase/seed_demo.sql`) para que no queden pedidos de los tests.
- Los logs de GitHub ocultan el valor de los secretos. Las capturas que se suben si un test falla
  no muestran la contraseña (el campo la tapa), pero sí los datos de la pantalla.

`main` está protegida en GitHub: para los cambios normales el pull request es obligatorio, con los checks `Calidad` y `Secretos` en verde y la rama al día, y no se admiten force-push ni borrar la rama. La protección no se aplica a los administradores del repositorio (`enforce_admins` desactivado), que podrían saltársela. El job E2E no es un check obligatorio porque solo corre si existen sus secretos.

Las actualizaciones de dependencias de `npm` y `github-actions` se revisan cada semana mediante [`.github/dependabot.yml`](.github/dependabot.yml), agrupando las versiones menores y de corrección. Las versiones mayores llegan en PR separados para revisarlas una a una, salvo las de `@types/node`, que se ignoran porque siguen la versión de Node del proyecto (22).

### Migraciones

El esquema de producción (proyecto de Supabase `inventa`, ref `uqupgywhmmdpjjenxywb`, región
eu-west-1) solo cambia con migraciones de `supabase/migrations/` aplicadas con la CLI de
Supabase, que anota cada una en su historial (`supabase_migrations.schema_migrations`).
**Nunca se cambia el esquema con SQL suelto** contra producción: ni desde el editor SQL de
Supabase ni con `supabase db query`. Una migración ya aplicada no se edita; si hay que
corregirla, se crea otra nueva.

**Quién hace qué.** Develop escribe la migración en la rama de la tarea. Solo el orquestador
la aplica a producción con `supabase db push` y, después, ejecuta los *advisors* de seguridad
de Supabase. Develop y Testing solo usan comandos de lectura:
`supabase migration list --linked` y `supabase db push --linked --dry-run`.

Flujo para cada cambio de esquema:

1. **Crear la migración** (Develop, en la rama de la tarea):

   ```bash
   supabase migration new <nombre>
   ```

   Crea `supabase/migrations/<fecha-y-hora>_<nombre>.sql` vacío; ahí va el SQL del cambio.

2. **Revisar antes de aplicar** (Testing, en el PR). La migración nueva solo aparece en la
   columna Local, y el *dry run* lista únicamente esa migración:

   ```bash
   supabase migration list --linked
   supabase db push --linked --dry-run
   ```

3. **Aplicar** (orquestador), cuando Testing ha aprobado la tarea y **antes de fusionar el
   PR**. Después comprueba que las columnas Local y Remote coinciden y, si cambió el esquema,
   regenera los tipos de TypeScript:

   ```bash
   supabase db push --linked
   supabase migration list --linked
   npm run db:types
   ```

Como la migración llega a producción antes que el código del PR, durante ese rato la app
desplegada desde `main` ya trabaja con el esquema nuevo. Por eso **cada migración tiene que
funcionar con el código que ya está en `main`**: por ejemplo, añadir una columna nueva con
valor por defecto sí; borrar o renombrar algo que `main` todavía usa, no.

Para enlazar una copia local con producción hace falta acceso al proyecto `inventa` en
Supabase: `supabase login` y `supabase link --project-ref uqupgywhmmdpjjenxywb` (puede pedir
la contraseña de la base de datos, que escribe la persona en la terminal). El enlace se guarda
en `supabase/.temp/`, que no se sube al repositorio. Para montar tu propio proyecto, sigue el
paso 2 de «Cómo ejecutarlo en local».

**Historial de partida.** `0001` y `0002` se aplicaron antes de que existiera el historial.
En T7 se marcaron como aplicadas sin volver a ejecutarlas
(`supabase migration repair --status applied 0001 0002 --linked`). Fue una corrección puntual:
en el flujo normal no se usa `migration repair`. Al cerrar T7, `supabase migration list --linked` mostraba
`0001`, `0002` y `20261124094951` iguales en local y en remoto, y
`supabase db push --linked --dry-run` respondía que no había nada pendiente.

**Datos, no esquema.** Dos cosas sí ejecutan SQL contra la base de datos con
`supabase db query --linked -f`, y ninguna cambia el esquema: la recarga de los datos de
demostración (`supabase/seed_demo.sql`, solo la hace el orquestador) y `npm run test:db`
cuando no hay Docker (cada archivo de tests va en `begin; … rollback;` y no deja filas).

Inventa trabaja con un único proyecto de Supabase. Si algún día se separa un entorno de
pruebas, el mismo flujo se aplica primero allí, enlazando ese proyecto con su `--project-ref`.
No hay todavía un workflow de GitHub Actions para migraciones. Si se añade, será manual
(`workflow_dispatch`), nunca en cada push, y necesitará que el humano guarde en GitHub los
secretos `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`.

### Conectar Vercel con GitHub (previews por PR)

Para que Vercel genere una URL de vista previa por cada pull request y despliegue `main` automáticamente:

1. En Vercel, abre *Account Settings → Authentication → Connect GitHub* y autoriza la cuenta de GitHub.
2. En el proyecto de Inventa en Vercel, abre *Project → Settings → Git*, vincula el repositorio `Esteban7893/inventa` y deja `main` como rama de producción.

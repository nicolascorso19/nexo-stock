# AGENTS.md

Instrucciones para agentes de IA que trabajan en este repo.

## Qué es

`nexo-stock-api` — API de stock y ventas para **NEXO Móviles**. Express 5 + SQLite
(`better-sqlite3`), ESM puro, tests con `node:test`. Sin build step, sin TypeScript.

## Comandos

```sh
npm start          # node server/index.js
npm run dev        # node --watch server/index.js
npm test           # node --test --test-concurrency=1 "tests/*.test.js"
npm run db:init    # crea el schema
npm run dev:seed   # fixtures de desarrollo
npm run admin:create
```

## Estructura

- `server/routes/` — HTTP, thin. Delegan en `services/`.
- `server/services/` — lógica de negocio. **El grueso del comportamiento vive aquí.**
- `server/db/` — `database.js`, `migrations.js`, `bootstrap.js`, `seed.js`.
- `db/schema.sql` — fuente de verdad del schema.
- `tests/` — incluye `oversell.test.js` y `quote-stability.test.js`: no son
  tests de humo, son las invariantes del negocio. Mirálos antes de tocar stock.

`ecommerce/` es un sub-proyecto separado con su propio `package.json`. No lo
mezcles con el root.

## Skills

Instaladas en `.agents/skills/` (12). Cargar con el tool `skill` por ID.

| ID | Cuándo |
|---|---|
| `ponytail` | **En toda tarea de código.** YAGNI → stdlib → native → una línea. |
| `hallmark` | Al crear, rediseñar o auditar UI. Anti-slop de diseño. |
| `domain-modeling` | Al discutir terminología, o escribir `CONTEXT.md` / un ADR. |
| `diagnosing-bugs` | Bug difícil o regresión de performance. Bucle por fases. |
| `ponytail-review` | Review enfocada solo en over-engineering. |
| `ponytail-audit` | Auditoría de bloat de todo el repo. |
| `belt`, `ai-image-generation`, `ai-video-generation` | Requieren `belt login` — ver abajo. |

Reglas de la casa:

- **`ponytail` es el default, no la excepción.** Antes de agregar una dependencia,
  preguntá si `node:` o la plataforma ya lo resuelve. Este proyecto tiene 7
  dependencias y todas están justificadas; que siga así.
- **`ponytail` y `hallmark` chocan a propósito.** Donde `ponytail` empuja a una
  línea y `hallmark` a tipografía con intención, ganá `ponytail` en lógica y
  `hallmark` en presentación. No al revés.
- **No toques `oversell.test.js` ni `quote-stability.test.js` para hacer pasar un
  cambio.** Si un test de esos falla, el bug está en el código.
- **`domain-modeling` es activo.** Cuando un término nuevo cristalice, glosalo.
  No leas `CONTEXT.md` por costumbre; úsalo para *cambiar* el modelo.

## Git: todo cambio se commitea y pushea

- El proyecto es un repo de GitHub. **Cada cambio que hagás termina en un
  commit y un push.** No dejes trabajo sin commitear: si algo falla o la
  sesión se corta, el push es lo que garantiza que no se perdió.
- Commiteá al cerrar cada tarea, no archivo por archivo a mitad de camino.
- El mensaje de commit va en español y dice **qué cambió y por qué**, no
  "fixes" ni "update".
- Antes de pushear: `npm test`. La base real **no** se commitea
  (está en `.gitignore` y fuera de OneDrive).
- Si el push falla por autenticación, avisá y pedile al usuario que haga
  `gh auth login`. No dejes credenciales en archivos.

## GitHub Pages

- `docs/` es el sitio público del catálogo y se publica con cada push.
- Se regenera con `npm run pages:build`, que lee la base real y escribe
  `docs/`. **Es un build, no una fuente:** si editás `docs/` a mano, el
  próximo build lo pisa. La fuente de verdad es la base.
- Cuando cambien precios, stock o imágenes, hay que volver a correr el build
  y pushear `docs/` para que la página refleje el cambio.

## Entorno

Trampas de esta máquina. Verificadas:

- **`npx` y `npm` están bloqueados en PowerShell** por ExecutionPolicy (los
  shims `.ps1`). Usá los shims `.cmd`: `npx.cmd`, `npm.cmd`. Funcionan.
- `node` v24.21.0 y `git` 2.55.0 ya están. Si una shell nueva no los encuentra,
  anteponé `C:\Program Files\nodejs;C:\Program Files\Git\cmd` al `$env:Path`.
- `belt` v1.19.3 vive en `~/.local/bin` (ya está en el PATH de usuario).
  **Requiere `belt login`, que es un flujo de navegador — no lo ejecutes vos,
  pidile al usuario.** Hasta entonces `ai-image-generation` y
  `ai-video-generation` son inertes: son docs, no generadores.
- Los archivos de skills quedaron con CRLF porque `git` clochea con
  `autocrlf` en Windows. Irrelevante para Markdown.

## Skills: instalar

```sh
npx.cmd skills add <repo-github> --skill <nombre> --copy -y
```

`--copy` importa: estás en OneDrive y los symlinks fallan ahí. Todo queda
registrado en `skills-lock.json`; actualizá con `npx.cmd skills update`.

## Estilo

- ESM: siempre `import`/`export`, nunca `require`.
- Node 20.11+ es el piso (`engines`). No uses API de Node 22+.
- SQLite: `better-sqlite3` es síncrono por diseño. No lo envuelvas en promises
  sin motivo — `ponytail` te va a preguntar por qué.

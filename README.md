# Repro: adapter-node@5.5.5 crashes on start — "Detected unsettled top-level await"

Minimal reproduction for https://github.com/sveltejs/kit/issues/16087.

`@sveltejs/adapter-node@5.5.5` produces a server bundle that **deadlocks during
module evaluation** and exits immediately with code 13:

```
Warning: Detected unsettled top-level await at file:///.../build/server/chunks/CEnvyx7R-*.js
await server.init({
^
```

`@sveltejs/adapter-node@5.5.4` works. Nothing else changes.

## What this project is

A stock `sv create` **minimal** TypeScript app with the **node** adapter. The
only addition is a `src/hooks.server.ts` that does one common thing:

```ts
import { env } from '$env/dynamic/private';
```

That single import is the entire trigger. A `hooks.server.ts` with **no imports**
boots fine on 5.5.5; adding the `$env/dynamic/private` import makes it crash.
An `init` / `ServerInit` hook is **not** required.

This is why the bug is easy to miss in a bare scaffold but hits may 
real apps: importing `$env/dynamic/private` (or any module the bundler places in
the shared server chunk) from `hooks.server` is very common.

## Reproduce

```bash
pnpm install
pnpm run build
node build        # 💥 exits 13 with "Detected unsettled top-level await"
```

Confirm it's the adapter version:

```bash
# edit package.json: "@sveltejs/adapter-node": "5.5.4"
pnpm install && pnpm run build && node build   # ✅ "Listening on http://0.0.0.0:3000"
```

(Set `ORIGIN`/`PORT` if you like; not needed to see the crash, which happens
before the server would listen.)

## Root cause

The adapter's Rollup pass bundles two entries (`index`, `manifest`). The
adapter's `index`/handler code contains a top-level `await server.init(...)`.

- **5.5.4** emits the handler as its own file (`build/handler.js`), separate from
  the shared SvelteKit server chunk.
- **5.5.5** changed the adapter's Rollup output (`dir: out` + `server/chunks/...`),
  and the handler — including its top-level `await server.init(...)` — gets merged
  into the **shared** server chunk (`build/server/chunks/CEnvyx7R-*.js`), which also
  contains the server runtime and `$env/dynamic/private`.

The deadlock:

1. The entry statically imports the shared chunk; the shared chunk runs
   `await server.init(...)` at top level.
2. `server.init()` → `get_hooks()` → `await import('./hooks.server-*.js')`
   (a **dynamic** import).
3. The `hooks.server` chunk **statically imports** `$env/dynamic/private`, which
   lives in the shared chunk — the one currently suspended on the top-level await.
4. The shared chunk can't finish evaluating until the dynamic import resolves; the
   dynamically imported module can't finish until its static dependency (the shared
   chunk) finishes. Neither completes, no async work is pending → Node detects the
   unsettled top-level await and exits 13.

A bare app without that back-edge into the shared chunk has no cycle, so the same
top-level await settles normally — which is why a vanilla scaffold doesn't repro.

## Workaround

Pin `@sveltejs/adapter-node` to `5.5.4`.

## Versions

See `package.json` / `pnpm-lock.yaml`. Reproduced with Node 24, but the deadlock
is in module evaluation and not Node-version specific.

## Transparency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
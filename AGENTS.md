# dsh-loadout-manager

A DSH plugin (profile bundle): switches skills between `on`/`manual`/`off`, connects rule files to the agent context next to AGENTS.md, manages MCP servers per scope, and installs skills and rules from configured indexes. Design decisions live in [docs/SPEC.md](docs/SPEC.md) and the topic files in `docs/`; they are final, so change them only with the user's agreement. Facts about the DSH 0.2.2-rc.2 API with links to the sources are in [docs/research/](docs/research/).

## Layout

- `src/index.ts` – the Host `apply(ctx, config)`: only wires DSH services to the modules in `src/host/`.
- `src/host/` – Host logic. Pure modules with tests: `frontmatter`, `loadout`, `inventory`, `rules`, `index-doc`, `index-sources`, `index-store`. The rest are thin adapters to `ctx` (skill provider, `pre-step`, routes, tool). `index-fetch` and `index-ops` add network, Git, `tar`/`unzip`, and filesystem installs.
- `src/shared/api.ts` – the contract of the `/api/dsh-loadout-manager/<op>` routes: requests and responses shared by Host and Client. To change a response field, change it here and let the compiler show both sides.
- `src/client/` – the Loadout Manager page in React (TSX), styles in `Loadout.module.css`, strings in `locale.ts` (`en` is the source of keys; `ru` and `zh` must match it). `catalog.tsx` is the Catalog tab.
- `lib/` – the built `index.js` and `client.js` that `package.json` points to. They are committed: DSH reads them straight from the checkout when the bundle is installed from a local directory or a Git URL.
- `test/*.test.ts` – `node:test`; `client.test.ts` loads the built `lib/client.js` the way DSH loads it.

## Build and checks

- `npm run check` runs ESLint, `tsc`, and every test; `npm test` builds `lib/` first. Before a commit: `npm run check` is green and the fresh `lib/` is committed. CI (`.github/workflows/ci.yml`) runs the same steps and fails when the committed `lib/` differs from a fresh build.
- Dependencies go only into `devDependencies`: nothing is installed at runtime. The `@deepseek-ai/*` packages are there for their types, at the target DSH version.
- Import only types from `@deepseek-ai/*` (`import type`). Values come through `ctx` services; the build fails on a value import (`hostSelfContained`, `clientPurityGate` in `tsdown.config.ts`). The Host bundle keeps no external imports except `node:*`; the Client takes only `react` and `react/jsx-runtime` from the shell's module table.
- Get DSH services through `ctx.get('name')`, on `agent.ctx` too: without a declared `inject`, Cordis throws on `ctx.name`. An exception in the serial `agent/created` listener aborts agent creation, so wrap everything inside it in `try/catch`.
- When a service or event type is missing, look for the package that extends `Context`, `MessageSourceMap`, or `LocaleNamespaceMap` and add it to `devDependencies` at the same version.

## Environment

- The DSH Host runs on Electron 44 / Node 24: the target syntax is `node24`, and tests run on the system Node without a build (`.ts` straight from `test/` and `src/`).
- DSH sources ship inside the desktop app's `app.asar`, under `dsh/node_modules/@deepseek-ai/<pkg>/`. A file read tool can open files there, but `ls`, grep, and glob cannot; to list or search, run the DSH binary as Node: `ELECTRON_RUN_AS_NODE=1 <dsh-binary> -e "..."`. Before relying on a DSH method or event, check it against `docs/research/`, the types in `node_modules/@deepseek-ai`, or the source; take DSH facts from the built-in `dsh-doc` skill.

## Workflow

- Pure modules are written test-first: a test at the seam (the module's public function), then the code. Adapters to `ctx` are verified on a live DSH after installation.
- Commit after each finished step, in English, in the conventional commits format (`type(scope): description`).
- Releases go through CD (`.github/workflows/cd.yml`): set the new `version` in `package.json`, commit, tag the commit `v<version>`, and push the tag. CD reruns CI on the tag, then publishes to npm, and fails when the tag and the version differ. Publishing, tagging, and pushing happen only after the user's explicit yes.
- Install, enable, or remove the bundle in a DSH profile only after the user's explicit yes. Host changes take effect after the bundle is reloaded (turned off and on) or DSH restarts; DSH picks up `lib/client.js` on a page reload.
- Before installation: `npm run check` is green and the `dsh-doc` → `references/host-plugin.md` checklist passes (`en`/`ru`/`zh` locales, `assets/icon.svg`, and each locale's `meta.detail` README).

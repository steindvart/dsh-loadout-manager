# dsh-loadout-manager Client part: the DSH API for a settings page

These notes were gathered to implement the Client part (`client.js`) of the `dsh-loadout-manager` plugin per [SPEC.md](../SPEC.md). DSH version: `@deepseek-ai/dsh` 0.2.2-rc.2 (Desktop, sources inside `app.asar`).

Path abbreviations:

- `A/` = `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/`;
- `dsh-doc/` = `A/dsh-agent-preset/skills/dsh-doc/`;
- `better-sidebar/` = `~/.dsh/profiles/desktop/node_modules/dsh-better-sidebar/` (an installed third-party plugin with a Client part).

Sources: the sources and READMEs of the packages in `A/`, the `dsh-doc` skill reference, and the live catalog of Host services through `cordis_inspect_query` (Host `Service.listService`). The Client Inspect providers (`Slots`, `Theme`, `Builtin`) did not answer at the time (`timed out after 10000ms. Open or reconnect the Harness page`), so the live slot tree and theme tokens were not captured: everything about slots and tokens below comes from the sources. In addition, `cordis_inspect_query` rejected any non-empty `input` (`"input" must be an object`), so `Config.listConfigs` with a filter did not run either.

## 1. The `client.js` format without a build

### Module registration

The browser part is a classic script (not ESM) that registers a factory through the global `window.__ModuleLoader__.load`. The reference is the `dsh-doc/templates/decoration/client.js` template:

```js
window.__ModuleLoader__.load({
  id: '@local/my-decoration',          // = package name
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    function Decoration() { /* ... */ }
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock', id: 'my-decoration', order: 5,
        }, Decoration));
      },
    };
  },
});
```

The factory contract is `A/dsh-client-modules/src/client/manifest.ts:362-374` (`ClientBundleRegistration { id, chunk?, factory: (require) => Record<string, unknown> }`). `id` must match the package name; otherwise the loader fails with `bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load` (`A/dsh-client-modules/src/client/system.ts:377`). The factory runs lazily, once, on first materialization; its result is an ordinary Cordis plugin (`inject`, `apply(ctx)`), like Host plugins.

The installed `better-sidebar/lib/client.js` (built with tsdown) starts the same way: `window.__ModuleLoader__.load({ id: "dsh-better-sidebar", factory: (require) => { ... let react = require("react"); ...` – the format is the same for built and handwritten bundles.

### Where React and other dependencies come from

Not globals, not an import map, and not `ctx`: the factory's `require` argument supplies them from the shell's frozen module table. The table is in the built `A/dsh-web-frontend/dist/assets/index-ghOpC9uV.js` (function `WJ()`):

```js
{ react, "react/jsx-runtime", "react-dom", "react-dom/client", "@deepseek-ai/cordis", zod,
  "@tanstack/react-virtual", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-dockkit" }
```

README `A/dsh-client-modules/README.md:55`: "The shell seeds a frozen module table (`PLATFORM_MODULES`); every dynamic bundle resolves its externals against exactly that baseline. `dsh.client.external` adds only exact non-baseline requests". The table has no `htm`, so JSX is replaced with `React.createElement` (usually `const h = React.createElement`). A plugin must not use modules from `dsh-client-ui-primitives` and other Harness packages (`dsh-doc/references/practices.md:35`), so from the table it needs only `react` (and optionally `react-dom` for `createPortal`).

### `package.json` fields → `dsh.client`

Type: `A/dsh-package-manifest/src/types.ts:86-100`; parsing: `A/dsh-client-modules/src/client/manifest.ts:179-191`:

| Field | Type | Meaning |
|---|---|---|
| `platform` | `string`, required | `"web"` |
| `inject` | `string[]` | names of packages whose factories must come first ("Informational package-name dependencies, not Cordis service injection"). A package missing from the graph is silently skipped (`system.ts:275-278`) |
| `immediately` | `boolean` | load the script in the first loading stage; without it – the shared application batch |
| `external` | `string[]` | modules outside the baseline table; we do not need it |

The entry point is the `"./client"` export in `exports` (template: `"./client": "./client.js"`). README: "exports a `./client` bundle" (`A/dsh-client-modules/README.md:34`). The `dsh-doc/templates/decoration/package.json` template:

```json
"exports": { ".": "./index.js", "./client": "./client.js", "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-conversation"] }
}
```

For our page it makes sense to list the settings slot owner and the services we use in `inject`: `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings-general`, `@deepseek-ai/dsh-client-ui-sidebar-right`. This affects only the load order; `ctx.slots.inject` still waits for the slot declaration.

### `apply(ctx)` and services

`inject` in the returned object lists Cordis service keys (`'slots'`, `'locale'`, `'sidebarRight'`, `'workspaces'`, `'connection'`). A required `inject` keeps the plugin inactive while the service is missing; optional services are better taken through `ctx.get(name)` with an `undefined` check or through `ctx.inject([...], cb)` (`dsh-doc/references/practices.md:20`).

### Styles

There are two working approaches:

1. Built bundles put a `<style>` into `document.head` right in the factory and mark it with `data-plugin="<package>"`, `data-plugin-css="<id>"` (`better-sidebar/lib/client.js`, the `\0dsh-css:` block). The loader collects such tags itself and removes them when the plugin unloads: `claimStyles` (`A/dsh-client-modules/src/client/system.ts:66-86`), `removeOwnedStyles` (`A/dsh-client-modules/src/client/entry-lifecycle.ts:23-28`).
2. `dsh-doc` recommends keeping the factory free of side effects and registering styles in `apply` through `ctx.effect(() => { ...; return () => tag.remove() })`, or rendering `<style>` as a React element inside the component (`dsh-doc/references/ui-plugin.md:13`).

For an unbuilt `client.js` the second approach is handier: `ctx.effect` in `apply`, with a tag carrying `data-plugin="dsh-loadout-manager"` so the loader cleans it up even after a failure.

### Localization in the Client

The `ctx.locale` service (`A/dsh-client-locale/src/client/index.ts:390-478`, README `A/dsh-client-locale/README.md:38-41`):

```ts
register(ns: string, dicts: Record<localeId, Record<string, string>>): () => void   // all languages at once
register(ns: string, locale: string, dict: LocaleDict): () => void                  // one language
bind(ns: string): (key: string, params?: Record<string, unknown>) => string
```

- Placeholders are `{name}` (`index.ts:476-477`).
- Key lookup: the fallback chain of the active language in its own namespace, then in `common`, then the key itself (`index.ts:470-475`). The chain ends with `en`, so `en` is required. The "both `zh` and `en`" requirement is checked only by TypeScript; at runtime `register` accepts any set (`index.ts:404-425`).
- Registering the same (ns, locale) pair again throws, so registration goes inside `ctx.effect(() => ctx.locale.register(NS, {...}))` (as every built-in package does, for example `A/dsh-client-ui-settings-plugins/src/client/index.ts:37`).
- The slot option `locale: NS` gives the component a `t` prop (`A/dsh-client-ui-renderer/src/client/registry.ts:97-98`: "Declared dictionary namespace (the renderer synthesizes the `t` seat from it)").
- The bundle's `locale/*.json` files only serve metadata (`meta.title`, `meta.description`, `meta.detail`) for Plugin Manager. The Client does not read them: UI strings live in dictionaries inside `client.js`.

## 2. The `settings.section` and `settings.section.icon` slots

### Declaration and registration

Types: `A/dsh-client-ui-settings/src/client/contract/slots.ts:46-65`. `dsh-client-ui-settings-general` declares both slots as children of `sidebar.settings` (`A/dsh-client-ui-settings-general/src/client/index.ts:242-243`): `'settings.section': { kind: 'list', scope: 'root' }`, `'settings.section.icon': { kind: 'list', scope: 'root', inline: true }`. Registration: `ctx.slots.inject(key, () => ctx.slots.register(options, Component))`; `inject` reinstalls the registration when the slot declaration disappears and comes back (`A/dsh-client-ui-renderer/src/client/registry.ts:194-271`).

Registration options (catalog `A/dsh-cordis-client-runner/src/client/slot-catalog.ts:3802-3858`, type `ErasedRegisterOptions` – `registry.ts:84-100`):

| Option | Meaning |
|---|---|
| `name` | `'settings.section'` |
| `id` (required) | section key; a unique id of your own adds a new item, someone else's id replaces a built-in section |
| `order` | ascending position in the navigation, 0 by default |
| `label` | `string \| (() => string)`; the thunk is reread on every projection, so the text follows the language |
| `locale` | dictionary namespace → the `t` prop |
| `inject` | `() => ({...})` – your own functions and `hooks` (see below) |
| `children` | declaration of nested slots (we do not need it) |

Built-in section order (from the sources): `account` −10, `general` 0, `models` 10, `plugins` 15, `agent-presets` 20. For "Loadout Manager" an `order` around 25–30 puts the section after the agent presets. A section has no route or URL of its own: the shell shows the active section through `renderSlot('settings.section', { close: onClose }, { only: active })` (`A/dsh-client-ui-settings-general/src/client/SettingsRoot.tsx:109`), and the `id` is also used by `openSettings(sectionId)` in `settings.launcher` (`contract/slots.ts:160-171`).

A built-in registration example (`A/dsh-client-ui-agent-preset/src/client/index.ts:283-290`):

```ts
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'agent-presets',
  order: 20,
  label: () => ctx.locale.bind('settings.agentPreset')('nav'),
  locale: 'settings.agentPreset',
  inject: sectionInjected,
}, AgentPresetSection))
```

Other `settings.section` registrants: `dsh-client-ui-settings-general` (`general`), `dsh-client-ui-settings-account` (`account`, `src/client/index.ts:318-323`), `dsh-client-ui-settings-models` (`models`, `src/client/index.ts:136-146`), `dsh-client-ui-settings-plugins` (`plugins`, `src/client/index.ts:76-84`).

### Section component props

`PropsRuntime<'settings.section'>` = owner props + the standard root-scope props + the `inject` facet + `t`:

- from the owner, only `close: () => void` (closes the settings panel; `contract/slots.ts:134-137`);
- standard (`slot-catalog.ts:3832-3843`): `useRemoteAccess`, `useResource`, `useContextMenu`, `useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>`, `usePanelInfo`, `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess`, `useWorkspaceAccess`;
- `t`, when `locale` is set;
- everything the `inject` function returned. The special key `hooks: { name: { getSnapshot, subscribe } }` turns into a `useName(selector)` prop (type `PropsHooks` in the catalog `A/dsh-cordis-client-runner/src/client/api-catalog.ts`: ``[N in keyof HS as `use${Capitalize<N>}`]: SnapshotSelectorHook<...>``). This is how you plug in your own external stores; example: `hooks.tabs` → `useTabs` in `A/dsh-client-ui-settings-plugins/src/client/index.ts:42-72` and `PluginsSettingsSection.tsx:33-36`.

### Navigation icon

`settings.section.icon` is a list addressed by the section `id`: "The registration id must equal the target section's id; unmatched ids never render. The icon's label option is not displayed" (`contract/slots.ts:58-65`). The shell calls `renderSlot('settings.section.icon', { size: 16, active }, { only: row.id, fallback: navIcon(row.id) })` (`SettingsRoot.tsx:91-95`); without a registration a gear is shown. Owner props are `{ size: number, active: boolean }` (`contract/slots.ts:140-145`). Built-in packages register no icons (their glyphs are hardcoded in `navIcon`), so there is no ready example for `settings.section.icon`. A registration along the same lines:

```js
ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
  { name: 'settings.section.icon', id: 'loadout' }, LoadoutNavIcon));
// LoadoutNavIcon({ size }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': true }, ...)
```

### Live slot tree

Not verified: Client Inspect (`Slots.listSubTree`) did not answer. The static owner catalog (`slot-catalog.ts:3847-3854`): `settings.section` is declared by an entry in `sidebar.settings` (client-ui-settings-general) and exists while that entry is mounted; it is occupied by `AgentPresetSection 'agent-presets'`, `AccountSection 'account'`, `GeneralSection 'general'`, `ModelsSection 'models'`, `PluginsSettingsSection 'plugins'`. `sidebar.settings` itself is registered only with `settings/describe` access (`settings-general/src/client/index.ts:208`).

### Panel geometry

Settings is an 800 px wide modal with a 188 px navigation column; the section column `.options` has `padding: 0 24px 24px` and scrolls on its own (`A/dsh-client-ui-settings-general/src/client/SettingsRoot.module.css:95-118, 245-251`). About 540–550 px remain for the section content.

## 3. Calling the Host from the Client

### Typert Remote (`ctx.remote.*`) is unavailable to an unbuilt plugin

Host Remote methods are declared with the `@Remote` decorator in TypeScript, and the Client gets them from generated `/remote` artifacts mounted by `ctx.remote.$mount()` (`A/dsh/docs/subsystems/typert.md:477-499`; README `dsh-typert-registry`: "It performs no TypeScript analysis and generates no schemas; the generator and the loader handle those"). The selection of forwarded Host events (`ctx.remote.$on`) is made by the application in `dsh-api-remotes` (README: "The Host entry owns the forwarded-event selection"); a third-party plugin cannot add its own event there. Building the descriptors by hand is possible in theory, but the format is internal and undocumented without the generator (not verified).

`host.call(method, args)` exists only in the dynamic `dsh-tool-cordis`/`dsh-cordis-client-runner` packages, which live until the page reloads (`A/dsh-cordis-client-runner/README.md:12, 32`: "Creator UI plugins use installed Client modules through Plugin Manager"). It does not fit an installed bundle.

`dsh-doc/references/user-actions.md:8` suggests "a session command that `ctx.remote.commands.execute()` runs". The Host method is `@Remote async execute(agent: Agent, line, submittedAttachments, signal)` (live Host catalog, `commands`), so it is bound to a session. That is awkward for a global settings page: it needs a session, and it is unclear what such a command writes to the session log (not verified).

### The working path: a Host HTTP route of our own + `fetch` from the Client

This is how `dsh-better-sidebar` does it. The `webServer` and `connection` Host services are in the live Host catalog (`cordis_inspect_query` → `Service.listService`).

Host (`better-sidebar/src/index.ts:1442, 1630-1687`):

```ts
export const inject = ['webServer', 'sessions', 'connection', 'tools']
const fence = (req) => ctx.connection.requestRejection(req) === undefined
ctx.effect(() => ctx.webServer.register({
  kind: 'prefix',
  path: '/sidebar/api',
  handler: async (req, res) => {
    if (!fence(req)) { writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } }); return }
    if (req.method !== 'POST') { writeJson(res, 405, ...); return }
    const method = pathname.slice('/sidebar/api/'.length)
    const handler = Object.hasOwn(api, method) ? api[method] : undefined
    ...
    writeOk(res, await handler(payload))   // { ok: true, value } | { ok: false, error: { code, message } }
  },
}), 'dsh-better-sidebar: /sidebar/api routes')
```

Service contract (`A/dsh/docs/subsystems/web-server.md:9-49, 132-138, 216-222`):

- `ctx.webServer.register(route: { kind: 'exact' | 'prefix', path, handler(req: IncomingMessage, res: ServerResponse) }): () => void`; a repeated `(kind, path)` throws.
- `ctx.connection.requestRejection(request): ConnectionRequestRejection` – "Apply Connection's Host/Origin checks and browser authentication to another Web route"; `undefined` means "let through". Without this check the route is open to any process on the machine.
- Serialization is plain JSON in the POST body; the server only passes bytes, with no validation or codecs. The plugin encodes errors itself; the `{ ok, value | error: { code, message } }` envelope mirrors the style of DSH's `RemoteResult`.

Client (`better-sidebar/src/client/host-route-url.ts`, `desktop-env.ts`): the route URL is built relative to `document.baseURI` without a leading slash, `new URL('loadout/api/list', document.baseURI)`. That way both a reverse-proxy prefix and the `dsh-app://app/` Desktop shell work, the latter forwarding such paths to the Host under the same scheme. This claim comes from a `better-sidebar` comment; I did not verify it in the Desktop shell myself. Browser session cookies are sent automatically (same-origin).

### Updates from the Host

A third-party plugin cannot extend the application's forwarded events (see above). Options:

- reread data when the section mounts, after each of our own operations, and on the `connection/reset` event (`ctx.on('connection/reset', ...)`; "Wire-derived caches must repull", catalog `api-catalog.ts`, `EVENT_API`);
- for real push, a WebSocket of our own: Host `ctx.webServer.registerUpgrade({ path, handler })` + `ctx.connection.admitConnection(request)`, Client `ctx.connection.openWebSocket(path)` (`A/dsh-client-connection/src/client/index.ts:164-169`: "absolute logical channel path, resolved beneath the Host mount"). This is how the `better-sidebar` sockets (`/sidebar/ws/*`) work. Overkill for an MVP, not tried in practice;
- `ctx.remote.$on('plugin-manager/changed', ...)` – a built-in event sent by Plugin Manager; `dsh-client-ui-skill` uses it (`src/client/index.ts:255`). Useful for rereading the list after plugins are turned on or off.

## 4. The workspace list on the Client

The source is the `ctx.workspaces` service from `dsh-api-workspace-controller` (`A/dsh-api-workspace-controller/src/client/service.ts:46-49, 118-128`):

```ts
interface IWorkspaces { readonly list: { getSnapshot(): WorkspaceSnapshot; subscribe(l: () => void): () => void }; ... }
```

Inside a slot component the standard `useWorkspaces` prop provides the same (available on `settings.section`, see section 2): `props.useWorkspaces(s => s.items)`.

Data shape (`A/dsh-api-workspace-controller/src/client/model.ts:32-41`, catalog `WorkspaceView`):

```ts
interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceView[]          // in Host order
  readonly archivedSessionIds: readonly SessionId[]
  readonly pinnedSessionIds: readonly SessionId[]
  readonly state: 'idle' | 'loading' | 'error'
  readonly phase: 'pending' | 'ready'
  readonly error: RemoteFailure | null
}
interface WorkspaceView {
  readonly workspaceId: WorkspaceId
  readonly path: string            // absolute workspace directory
  readonly title: string
  readonly sessionIds: readonly SessionId[]
  readonly createdAt: string
  readonly updatedAt: string
}
```

These are the registered workspaces from the sidebar. DSH has no notion of an "open" workspace. The list is synced with the Host through the `workspace.follow` stream and updates by itself.

The Host sees the same registry as `ctx.workspaceRegistry.list(): Workspace[]` (live Host catalog; fields `id`, `path`, `title`, `sessionIds` – `A/dsh-workspace/src/types.ts:69-100`). `dsh-client-ui-workspace` holds only UI state and does not expose the list.

The plugin's Host part should compute `projectRoot` (the nearest ancestor with `.git`) from `path`, as `dsh-skill-filesystem` does.

## 5. File preview in the right panel

`dsh-client-ui-skill` opens a preview like this (`A/dsh-client-ui-skill/src/client/index.ts:205-213`):

```ts
const cwd = sessions.list.getSnapshot().byId[session.sessionId]?.cwd
ctx.sidebarRight.openResource(fileAddressFor(session.sessionId, cwd, path))
```

That plugin's `inject` contains `'sidebarRight'` (`index.ts:80`).

Signature: `ctx.sidebarRight.openResource(address: string, options?: SidebarRightOpenResourceOptions): void` (`A/dsh-client-ui-sidebar-right/src/client/service.ts:228-243`). The address is `dsh-resource://file/…`, and the tab type is chosen by the address; for `.md` it is the document viewer.

Limitations for an arbitrary path from the settings page:

1. A session must be on screen. `openResource` calls `this.require()`, which throws `sidebarRight: no session surface is mounted` when `mounted` is empty (`service.ts:854-864`). `mounted` is `undefined` when a global panel occupies the main column or no session is selected (`service.ts:217-226`). `ctx.sidebarRight.mounted.getSnapshot()` gives the current session.
2. The address must carry a session. The `dsh-resource://file/absolute/<path>` form parses, but reading fails with `workspace-file/unknown-workspace` (`A/dsh-api-workspace-files/README.md:94`, `src/client/provider.ts:5-14`). The working form is `dsh-resource://file/session/<sessionId>/<path>`, and the path may be absolute (`README.md:94`: "leading slashes are preserved, as in `dsh-resource://file/session/s//etc/hosts`").
3. File reads are not confined to the workspace: "The composed filesystem decides whether the path is readable; the service does not impose workspace containment on file reads" (`README.md:41`). So `~/.agents/skills/x/SKILL.md` opens through any session if the session filesystem allows the read. How the session sandbox (`dsh-fs-sandbox`) behaves on reads outside the workspace was not verified.
4. `fileAddressFor`/`sessionFileAddress` live in `dsh-util-workspace-path`, which is not in the module table. The function has to be repeated (`A/dsh-util-workspace-path/src/file-address.ts:44-68`):

   ```js
   const enc = s => encodeURIComponent(s).replace(/%3A/gi, ':');
   const sessionFileAddress = (sid, path) =>
     `dsh-resource://file/session/${enc(sid)}/${path.replace(/\\/g, '/').split('/').map(enc).join('/')}`;
   ```

5. Settings is a modal over the application, portaled into `document.body` (`SettingsRoot.tsx:57-114`). For the tab to be visible, call the `close()` prop after `openResource`. It looks like the session behind the modal stays "on screen", but this was not verified live.

Without a mounted session there are two paths: disable the Open button with a hint, or show the file text right on the page through our own Host route.

## 6. Confirmation and notifications

There is no shared Client service for confirm dialogs and toasts. Each built-in package draws its own `ConfirmDialog` on the `Modal` primitive: Plugin Manager (`A/dsh-client-ui-plugin-manager/src/client/PluginManagerPage.tsx:1536-1559`), Plugin Market (`A/dsh-client-ui-plugin-market/src/client/DiscoverSection.tsx:357`), Schedule (`TaskManagerPage.tsx:348`). Toasts are also a local `<Toast>` primitive (`A/dsh-client-ui-schedule/src/client/DeleteToast.tsx:97-113`). Workspace toasts are tied to their own domain (the keyed `workspace.toast` slot, `A/dsh-client-ui-workspace/src/client/contract/toast.ts:50-63`) and do not suit other messages.

Reference text and actions (Plugin Manager):

```tsx
<Modal open onClose={onCancel} title={t('confirmUninstallTitle', { name })} closeLabel={t('close')}
  description={t('confirmUninstallDescription')}
  footer={<><Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
           <Button variant="primary" className={css.dangerButton} onClick={onConfirm}>{t('confirmUninstall')}</Button></>} />
```

`.dangerButton` recolors the primary button: `--dsw-alias-button-primary-fill: var(--dsw-alias-state-error-primary)` (`PluginManagerPage.module.css:1404-1407`).

Consequence for the plugin: it draws confirmation and errors itself. `Modal` cannot be imported from primitives (`dsh-doc/references/practices.md:35`), and the rules also forbid writing DOM outside your own component or into `document.body` (`practices.md:36`). The simplest option is to confirm right in the row: "Move to the trash? [Cancel] [Delete]" in place of the Delete button. Show errors as a line under the item, like `.reason`/`.failure` (`PluginManagerPage.module.css:265-270, 699-707`).

Open question: the settings panel closes on Escape through `useModalLayer` (`SettingsRoot.tsx:63-64`). If our confirmation should also react to Escape, check whether `stopPropagation` on our element runs before the modal's handler. Not verified.

## 7. Theme tokens and layout

### Tokens

The live list (`Theme.listTokens`) was not obtained. The names below come from `A/dsh-client-ui-theme/src/styles/design-platform.css` (132 `--dsw-*` tokens), `base.css`, `focus.css`, and are confirmed by use in the built-in CSS.

| Purpose | Tokens |
|---|---|
| Primary text | `--dsw-alias-label-primary` |
| Secondary and muted text | `--dsw-alias-label-secondary`, `--dsw-alias-label-tertiary`, `--dsw-alias-label-caption` |
| Borders and dividers | `--dsw-alias-border-l1` … `--dsw-alias-border-l4` (list rows – `l2`, frames – `l3`/`l4`), `--dsw-alias-border-selected` |
| Surfaces | `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1/2/3`, `--dsw-alias-bg-module-platform` (the "chip" and selected-segment background), `--dsw-alias-settings-card-fill`, `--dsw-alias-settings-card-stroke` (`base.css:32-33`), `--dsw-alias-bg-skeleton` |
| Hover and press | `--dsw-alias-interactive-bg-hover`, `--dsw-alias-interactive-bg-active`, `--dsw-alias-interactive-bg-hover-danger` |
| Accent | `--dsw-alias-brand-primary` (switch on), `--dsw-alias-state-business-primary` (links, focus), `--dsw-alias-button-primary-fill`, `--dsw-alias-button-primary-hover` |
| Dangerous action and error | `--dsw-alias-state-error-primary` |
| States | `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`, `--dsw-alias-state-warn-tertiary` |
| Switch | `--dsw-alias-switch-thumb`, `--dsw-alias-label-primary-foreground` (thumb in the on state) |
| Radii | `--dsw-radius-xs` 4, `-sm` 8, `-md` 12, `-lg` 16, `-xl` 20, `-panel` 28 px (`base.css:18-23`) |
| Focus | `--dsw-focus-ring-width` (2px), `--dsw-focus-ring-color` (`focus.css:3, 19`) |
| Fonts | `--dsw-font-family`, `--ds-font-family-code` (`base.css:9-13`) |

There are no font-size or spacing tokens. Built-in pages write px directly: section heading 18/600, group heading 14/500, row name 13.5–14/500, description 12–13 `label-tertiary`, monospace label 11.5–12.

### How similar pages are built

The SPEC points to Plugin Manager, but that is the main panel with a column up to 960 px, a sticky header, and cards with 48 px icons (`PluginManagerPage.module.css:9-91, 379-505`). For the narrow settings column the settings sections themselves are closer:

- `PluginsSettingsSection` (`A/dsh-client-ui-settings-plugins/src/client/PluginsSettingsSection.tsx:53-56`, `.module.css:3-21`): `.section { display:flex; flex-direction:column; gap:12px; max-width:760px; color: label-primary }`, `<h2 class=heading>` 18px/600, `<p class=intro>` 13px `label-tertiary`, tabs with a 2px underline.
- `PluginInventorySettingsTab` (`A/dsh-client-ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css:245-363`): groups `.group { gap:10px }`, neighboring groups separated by `border-top: 0.5px solid border-l2; padding-top:14px`, group heading 14px/22px, subheading 12px `label-tertiary`, a 36 px tall "pill" selector (`.switcher`) on `bg-module-platform` – a ready reference for the workspace picker button.
- Plugin Manager list rows (`PluginManagerPage.module.css:1600-1722`): `.row { padding:12px 2px; border-bottom:0.5px solid border-l2 }`, `.rowLine { display:flex; align-items:center; gap:16px }`, `.rowMain` as a column with `gap:2px`, `.rowId` 13.5px/500, `.rowModule` monospace 11.5px `label-tertiary` (fits a path), an off row – `.row[data-state='off'] .rowId { color: label-secondary }`, an icon delete button `.deleteButton` 28×28 in `state-error-primary` with hover `interactive-bg-hover-danger`.
- Three-way choice: the closest reference is the Light/Dark/System theme tiles (`A/dsh-client-ui-theme/src/client/AppearanceRow.tsx:42-62`, `.module.css:29-58`): `<button aria-pressed>`, the selected one with `background: bg-module-platform; border-color: border-selected`. A row needs a compact segmented version with `role="radiogroup"`/`role="radio"`.
- Switch: the `dsh-client-ui-primitives` sources are not in `app.asar`; they are baked into `dsh-web-frontend`. Styles taken from the built `A/dsh-web-frontend/dist/assets/index-CSAdOBx6.css`: `.switch { box-sizing:border-box; width:36px; height:20px; padding:2px; border:0; border-radius:999px; background: var(--dsw-alias-border-l3) }`, `[aria-checked=true] { background: var(--dsw-alias-brand-primary) }`, a 16×16 thumb with `border-radius:50%`, background `--dsw-alias-label-primary-foreground` (`--dsw-alias-switch-thumb` when off), shift `translate(16px)`, `transition: transform .12s ease`, focus `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset:2px`. Markup: `<button role="switch" aria-checked>` (`practices.md:35`).
- Built-in CSS hides hover effects under `@media (hover: hover)` (`PluginManagerPage.module.css:1-7`).

## 8. The dsh-doc checklist for a bundle with a Client part

Per `dsh-doc/references/host-plugin.md`, `plugin-details.md`, `ui-plugin.md`, `artwork.md`, `verification.md`, `plugin-development.md`:

- Manifest: `exports` – `"."`, `"./client"`, `"./locale/*.json"`, `"./icon"`; `files` – all runtime files, `cordis.patch.yml`, `locale/*.json`, `docs`, `icon.svg`; `dsh.bundle.patch` and `dsh.client` (section 1). Installation from a local directory does not filter by `files`, but the list must be checked for publishing (`host-plugin.md:36`).
- `locale/<language>.json` → `meta.title`, `meta.description`, optionally `meta.detail`. Plugin Manager and settings read them without activating the plugin. `en` and the user's language (`ru`) are needed; English titles in sentence case (`host-plugin.md:33`). `meta.description` explains what the plugin does and where to find it, with exact UI labels (for example, "Settings → Loadout Manager"), plus limitations (`plugin-details.md:3`). Template placeholders must not stay.
- The settings section name comes not from `locale/*.json` but from `label: () => t('nav')` of the dictionary registered in `client.js` (sections 1–2). Every visible UI string goes through `ctx.locale` (`ui-plugin.md:13`).
- `docs/DETAIL.md` is optional. When present, it is exactly one line with an image, `![alt](preview.svg)`: a 640×300 SVG without `text`, fonts, scripts, or `foreignObject`, readable in light and dark themes. A declared but missing file is an error with no fallback to the README (`plugin-details.md:3-27`, `host-plugin.md:34`). It is made after the plugin works. To go without a preview, remove `meta.detail` from every locale and delete `docs/DETAIL.md` along with its `files` entry.
- `icon.svg`: `width="36" height="36" viewBox="0 0 36 36"`, one main object within roughly 18–22 units, no backdrop or tile (Plugin Manager draws it), a flat restrained fill, no `<style>`, `<text>`, `<image>`, scripts, or animation, transparent gaps, readable in both themes. Up to 256 KiB, inside the package, no symlinks leading out (`artwork.md:14-23`, `host-plugin.md:52`). Look at 2–3 icons of installed plugins before drawing. The settings navigation icon (`settings.section.icon`) is drawn separately: 16 px, `stroke="currentColor"`, so it inherits the item color.
- Host export: either `export function apply(ctx, config)` with `inject` and `Config`, or a default service class; they must not be mixed (`host-plugin.md:60-65`). Resources go through `ctx.effect`/`ctx.on`.
- Page check (`verification.md:5`): only theme tokens, no imports of Harness Client packages, no `slot entry crashed in '<slot>'` in the console, the page reads well in light and dark themes next to a similar built-in one. Before delivery – a UX review by a subagent: discoverability, the main scenario, feedback, visual consistency (`verification.md:9-11`).
- User actions (`user-actions.md`): an operation is implemented once as a Host service method, the UI calls it through a Client-accessible entry point, and where possible the same operation is exposed to the agent as a tool. Actions that grant or confirm authority stay with the user only.

## 9. Hot reload and verification

- The Host part of `dsh-client-hmr` polls the stat of each graph row's `client.js` every `pollIntervalMs` (500 ms) and, when mtime, ctime, or size changes, sends the browser a `rebuilt` frame. The browser restarts the plugin without reloading the page, and React state is lost (`A/dsh-client-hmr/src/index.ts:1-8, 68-90`, README "Design concept"). For an unbuilt bundle this means an edit to `client.js` in a directory installed as a link should be picked up by itself. `pnpm run dev:web` is only for rebuilding DSH sources from a checkout and has nothing to do with an installed bundle. Whether `dsh-client-hmr` is mounted in the Desktop composition could not be checked (the filtered `Config.listConfigs` request was rejected). If an edit is not picked up, reload the page.
- An edit to `package.json` alone (including `dsh.client`) is not noticed until the plugin entry or the Host restarts (`A/dsh-client-modules/README.md:149`).
- The Host part (`index.js`) updates on the next profile recomposition (for example, after a Plugin Manager operation or a profile change): "Profile recompositions … also replace plugins whose loaded files below the profile directory changed on disk. This covers … the targets of linked packages" (README `A/dsh-hmr`). Otherwise a restart is needed. `host-plugin.md:75`: "replacing an installed package requires restart to load a fresh JavaScript module generation".
- A new bundle may come up through HMR after installation without a restart (`host-plugin.md:75`). If the Host changed releases, the page does not apply new plugins until it is reloaded (`A/dsh-client-modules/README.md:51`).
- Load failures show in Settings → Plugins → Plugin list, which also offers Retry (`A/dsh-client-hmr/README.md`, "Failure policy").
- Post-install check order (`plugin-development.md:20`): read `application` and `warnings` from the install result; then `cordis_inspect_query` Client `Slots.listSubTree` with `root: 'settings.section'` – `id 'loadout'` should appear in `occupants`; then open Settings → Loadout, check both themes and the console.

## Conclusions for the implementation

What the implementation must do:

1. `client.js` – a classic script `window.__ModuleLoader__.load({ id: 'dsh-loadout-manager', factory(require) {...} })`. React comes from `require('react')`, elements are built with `React.createElement`. The plugin returns `{ inject: ['slots', 'locale'], apply(ctx) }` and gets `sidebarRight`, `workspaces`, and `connection` through `ctx.get(...)` so as not to depend on them hard.
2. In `package.json`: `exports["./client"] = "./client.js"`, `dsh.client = { platform: 'web', inject: [...] }` (section 1), plus `./locale/*.json` and `./icon`.
3. In `apply`:
   - `ctx.effect(() => ctx.locale.register('loadout', { en, ru, zh? }))`;
   - styles – `ctx.effect` with a `<style data-plugin="dsh-loadout-manager">` tag;
   - `ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'loadout', order: 25, label: () => t('nav'), locale: 'loadout', inject: () => ({ hooks: { loadout: store }, api }) }, LoadoutSection))`;
   - the icon – a separate registration in `settings.section.icon` with the same `id: 'loadout'`.
4. Host communication – our own route `ctx.webServer.register({ kind: 'prefix', path: '/loadout/api', handler })` checked with `ctx.connection.requestRejection(req) === undefined`, `POST` only, with JSON and the `{ ok, value | error: { code, message } }` envelope. The Client calls `new URL('loadout/api/<method>', document.baseURI)`. On the Host, take the `webServer` and `connection` services through `ctx.inject(['webServer', 'connection'], ...)` so the skill filter and rules work without the Web server too.
5. Data is reread when the section mounts, after each operation, on `connection/reset`, and on `ctx.remote.$on('plugin-manager/changed')` (when `remote` exists). No push channel is needed.
6. The workspace picker is built from `props.useWorkspaces(s => s.items)`: `{ workspaceId, path, title }`. The Host receives `path` and computes `projectRoot` itself.
7. Open: take `sid = ctx.sidebarRight.mounted.getSnapshot()`; if there is a session, call `openResource(sessionFileAddress(sid, absPath))`, then `props.close()`. If it is `undefined`, the button is disabled with a hint, or the file is shown right on the page through the Host route.
8. Delete is confirmed in the row itself (no modal in `body`), and an error is shown as a line under the item. No toasts.
9. Own controls: a switch styled as in section 7, a three-way `role="radiogroup"` segment modeled on the theme tiles. Only `--dsw-alias-*` and `--dsw-radius-*` tokens, column width around 550 px.

Where the SPEC diverges from the facts or needs clarification:

- "The Client calls them through Remote or Service". Typert Remote and `ctx.remote.$on` are unavailable without the generator, and Client services do not expose Host operations. The real path is a Host HTTP route (section 3).
- "File preview in the right sidebar, as `dsh-client-ui-skill` does". It works only with a session on screen and a session-bound address; an `absolute` address does not read. The settings page is not bound to a session, so `close()` and a fallback are needed (section 5).
- "A list of open workspaces". DSH has only registered workspaces (`WorkspaceSnapshot.items`), with no "open" flag. No need to search further in `dsh-workspace` or `dsh-client-ui-workspace`: the source is `ctx.workspaces` / `useWorkspaces` (section 4).
- "The reference for a list is the Plugin Manager page". That is a wide main panel; a settings section takes about 550 px inside an 800 px modal. Take the rows from Plugin Manager (`.row`, `.rowId`, `.rowModule`, `.deleteButton`) and the frame from the settings sections (`PluginsSettingsSection`, `PluginInventorySettingsTab`) (section 7).
- "Own controls instead of importing primitives". The primitives sources are not in `app.asar`, so markup and CSS are copied from the built CSS (switch values are in section 7) or from the rendered page.
- `dsh-doc` (`user-actions.md`) advises exposing the same operations to the agent as a tool. The SPEC does not say so. To decide: switching a skill or rule state can be given to the agent, while moving to the trash is better left to the user only.
- The "Loadout Manager" section name is set by the Client dictionary (`label`), not by `locale/*.json`. The plugin metadata (`meta.title`) is a separate string for Plugin Manager.

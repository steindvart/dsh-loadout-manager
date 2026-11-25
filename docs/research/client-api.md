# Client-часть dsh-loadout-manager: API DSH для страницы настроек

Заметка собрана для реализации Client-части (`client.js`) плагина `dsh-loadout-manager` по [SPEC.md](../SPEC.md). Версия DSH – `@deepseek-ai/dsh` 0.2.2-rc.2 (Desktop, исходники внутри `app.asar`).

Сокращения путей:

- `A/` = `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/`;
- `dsh-doc/` = `A/dsh-agent-preset/skills/dsh-doc/`;
- `better-sidebar/` = `~/.dsh/profiles/desktop/node_modules/dsh-better-sidebar/` (установленный сторонний плагин с Client-частью).

Источники: исходники и README пакетов в `A/`, справка скилла `dsh-doc`, живой каталог Host-сервисов через `cordis_inspect_query` (Host `Service.listService`). Client-провайдеры Inspect (`Slots`, `Theme`, `Builtin`) во время работы не ответили (`timed out after 10000ms. Open or reconnect the Harness page`), поэтому живое дерево слотов и токены темы не сняты: всё про слоты и токены ниже взято из исходников. Кроме того, `cordis_inspect_query` отклонял любой непустой `input` (`"input" must be an object`), так что `Config.listConfigs` с фильтром тоже не выполнялся.

## 1. Формат `client.js` без сборки

### Регистрация модуля

Браузерная часть – это классический скрипт (не ESM), который регистрирует фабрику через глобальный `window.__ModuleLoader__.load`. Образец – шаблон `dsh-doc/templates/decoration/client.js`:

```js
window.__ModuleLoader__.load({
  id: '@local/my-decoration',          // = имя пакета
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

Контракт фабрики – `A/dsh-client-modules/src/client/manifest.ts:362-374` (`ClientBundleRegistration { id, chunk?, factory: (require) => Record<string, unknown> }`). `id` обязан совпадать с именем пакета: иначе загрузчик падает с `bundle ${url} loaded without registering "${id}" via __ModuleLoader__.load` (`A/dsh-client-modules/src/client/system.ts:377`). Фабрика выполняется лениво, один раз, при первой материализации; её результат – обычный Cordis-плагин (`inject`, `apply(ctx)`), как у Host-плагинов.

Установленный `better-sidebar/lib/client.js` (собран tsdown) начинается так же: `window.__ModuleLoader__.load({ id: "dsh-better-sidebar", factory: (require) => { ... let react = require("react"); ...` – формат одинаковый для собранных и рукописных бандлов.

### Откуда берутся React и другие зависимости

Не глобали, не import map и не `ctx`: их отдаёт аргумент `require` фабрики из замороженной таблицы модулей оболочки. Таблица найдена в собранном `A/dsh-web-frontend/dist/assets/index-ghOpC9uV.js` (функция `WJ()`):

```js
{ react, "react/jsx-runtime", "react-dom", "react-dom/client", "@deepseek-ai/cordis", zod,
  "@tanstack/react-virtual", "@deepseek-ai/dsh-client-store", "@deepseek-ai/dsh-client-ui-slots",
  "@deepseek-ai/dsh-client-ui-primitives", "@deepseek-ai/dsh-client-ui-dockkit" }
```

README `A/dsh-client-modules/README.md:55`: «The shell seeds a frozen module table (`PLATFORM_MODULES`); every dynamic bundle resolves its externals against exactly that baseline. `dsh.client.external` adds only exact non-baseline requests». `htm` в таблице нет, поэтому JSX заменяется на `React.createElement` (обычно `const h = React.createElement`). Модули из `dsh-client-ui-primitives` и других пакетов Harness плагину использовать нельзя (`dsh-doc/references/practices.md:35`), значит из таблицы нужен только `react` (и при желании `react-dom` для `createPortal`).

### Поля `package.json` → `dsh.client`

Тип – `A/dsh-package-manifest/src/types.ts:86-100`, разбор – `A/dsh-client-modules/src/client/manifest.ts:179-191`:

| Поле | Тип | Смысл |
|---|---|---|
| `platform` | `string`, обязательно | `"web"` |
| `inject` | `string[]` | имена пакетов, чьи фабрики должны прийти раньше («Informational package-name dependencies, not Cordis service injection»). Отсутствующий в графе пакет молча пропускается (`system.ts:275-278`) |
| `immediately` | `boolean` | грузить скрипт на первой стадии загрузки; без него – общий application batch |
| `external` | `string[]` | модули вне базовой таблицы; нам не нужно |

Точка входа – экспорт `"./client"` в `exports` (шаблон: `"./client": "./client.js"`). README: «exports a `./client` bundle» (`A/dsh-client-modules/README.md:34`). Шаблон `dsh-doc/templates/decoration/package.json`:

```json
"exports": { ".": "./index.js", "./client": "./client.js", "./locale/*.json": "./locale/*.json", "./icon": "./icon.svg" },
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": { "platform": "web", "immediately": true, "inject": ["@deepseek-ai/dsh-client-ui-conversation"] }
}
```

Для нашей страницы в `inject` логично указать владельца слота настроек и сервисы, которыми пользуемся: `@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-settings-general`, `@deepseek-ai/dsh-client-ui-sidebar-right`. Это влияет только на порядок загрузки; `ctx.slots.inject` всё равно ждёт объявления слота.

### `apply(ctx)` и сервисы

`inject` в возвращаемом объекте – это ключи Cordis-сервисов (`'slots'`, `'locale'`, `'sidebarRight'`, `'workspaces'`, `'connection'`). Обязательный `inject` держит плагин неактивным, пока сервиса нет; необязательные сервисы лучше брать через `ctx.get(name)` с проверкой на `undefined` или через `ctx.inject([...], cb)` (`dsh-doc/references/practices.md:20`).

### Стили

Есть два рабочих способа:

1. Собранные бандлы кладут `<style>` в `document.head` прямо в фабрике и помечают его `data-plugin="<пакет>"`, `data-plugin-css="<id>"` (`better-sidebar/lib/client.js`, блок `\0dsh-css:`). Загрузчик сам собирает такие теги и удаляет их при выгрузке плагина: `claimStyles` (`A/dsh-client-modules/src/client/system.ts:66-86`), `removeOwnedStyles` (`A/dsh-client-modules/src/client/entry-lifecycle.ts:23-28`).
2. `dsh-doc` рекомендует держать фабрику без побочных эффектов, а стили регистрировать в `apply` через `ctx.effect(() => { ...; return () => tag.remove() })` или рендерить `<style>` React-элементом внутри компонента (`dsh-doc/references/ui-plugin.md:13`).

Для `client.js` без сборки удобнее второй путь: `ctx.effect` в `apply`, тег с `data-plugin="dsh-loadout-manager"`, чтобы загрузчик подчистил его и при сбое.

### Локализация в Client

Сервис `ctx.locale` (`A/dsh-client-locale/src/client/index.ts:390-478`, README `A/dsh-client-locale/README.md:38-41`):

```ts
register(ns: string, dicts: Record<localeId, Record<string, string>>): () => void   // все языки разом
register(ns: string, locale: string, dict: LocaleDict): () => void                  // один язык
bind(ns: string): (key: string, params?: Record<string, unknown>) => string
```

- Плейсхолдеры – `{name}` (`index.ts:476-477`).
- Поиск ключа: цепочка fallback активного языка в своём namespace, потом в `common`, потом сам ключ (`index.ts:470-475`). Цепочка заканчивается на `en`, поэтому `en` обязателен. Требование «и `zh`, и `en`» проверяет только TypeScript; в рантайме `register` принимает любой набор (`index.ts:404-425`).
- Повторная регистрация той же пары (ns, locale) бросает исключение, поэтому регистрация идёт внутри `ctx.effect(() => ctx.locale.register(NS, {...}))` (так делают все встроенные пакеты, например `A/dsh-client-ui-settings-plugins/src/client/index.ts:37`).
- Опция слота `locale: NS` даёт компоненту проп `t` (`A/dsh-client-ui-renderer/src/client/registry.ts:97-98`: «Declared dictionary namespace (the renderer synthesizes the `t` seat from it)»).
- Файлы `locale/*.json` бандла служат только метаданным (`meta.title`, `meta.description`, `meta.detail`) для Plugin Manager. Client их не читает: тексты UI живут в словарях внутри `client.js`.

## 2. Слоты `settings.section` и `settings.section.icon`

### Объявление и регистрация

Типы – `A/dsh-client-ui-settings/src/client/contract/slots.ts:46-65`. Объявляет оба слота `dsh-client-ui-settings-general` как детей `sidebar.settings` (`A/dsh-client-ui-settings-general/src/client/index.ts:242-243`): `'settings.section': { kind: 'list', scope: 'root' }`, `'settings.section.icon': { kind: 'list', scope: 'root', inline: true }`. Регистрация – `ctx.slots.inject(key, () => ctx.slots.register(options, Component))`; `inject` переустанавливает регистрацию, когда объявление слота исчезает и появляется снова (`A/dsh-client-ui-renderer/src/client/registry.ts:194-271`).

Опции регистрации (каталог `A/dsh-cordis-client-runner/src/client/slot-catalog.ts:3802-3858`, тип `ErasedRegisterOptions` – `registry.ts:84-100`):

| Опция | Смысл |
|---|---|
| `name` | `'settings.section'` |
| `id` (обязательно) | ключ раздела; свой уникальный id добавляет новый пункт, чужой id заменяет встроенный раздел |
| `order` | позиция в навигации по возрастанию, по умолчанию 0 |
| `label` | `string \| (() => string)`; thunk перечитывается при каждой проекции, поэтому текст следует за языком |
| `locale` | namespace словаря → проп `t` |
| `inject` | `() => ({...})` – свои функции и `hooks` (см. ниже) |
| `children` | объявление вложенных слотов (нам не нужно) |

Порядок встроенных разделов (из исходников): `account` −10, `general` 0, `models` 10, `plugins` 15, `agent-presets` 20. Для «Loadout» подойдёт `order` около 25–30, чтобы раздел стоял после пресетов агента. Отдельного маршрута или URL у раздела нет: оболочка показывает активный раздел через `renderSlot('settings.section', { close: onClose }, { only: active })` (`A/dsh-client-ui-settings-general/src/client/SettingsRoot.tsx:109`), а `id` нужен и для `openSettings(sectionId)` в `settings.launcher` (`contract/slots.ts:160-171`).

Встроенный пример регистрации (`A/dsh-client-ui-agent-preset/src/client/index.ts:283-290`):

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

Другие регистранты `settings.section`: `dsh-client-ui-settings-general` (`general`), `dsh-client-ui-settings-account` (`account`, `src/client/index.ts:318-323`), `dsh-client-ui-settings-models` (`models`, `src/client/index.ts:136-146`), `dsh-client-ui-settings-plugins` (`plugins`, `src/client/index.ts:76-84`).

### Пропсы компонента раздела

`PropsRuntime<'settings.section'>` = владелец + стандартные пропсы корневого скоупа + `inject`-грань + `t`:

- от владельца – только `close: () => void` (закрыть панель настроек; `contract/slots.ts:134-137`);
- стандартные (`slot-catalog.ts:3832-3843`): `useRemoteAccess`, `useResource`, `useContextMenu`, `useWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>`, `usePanelInfo`, `useSessions`, `useSessionStatus`, `useSessionRetainInfo`, `useSessionAccess`, `useWorkspaceAccess`;
- `t` – если задан `locale`;
- всё, что вернула функция `inject`. Особый ключ `hooks: { name: { getSnapshot, subscribe } }` превращается в проп `useName(selector)` (тип `PropsHooks` в каталоге `A/dsh-cordis-client-runner/src/client/api-catalog.ts`: ``[N in keyof HS as `use${Capitalize<N>}`]: SnapshotSelectorHook<...>``). Так подключают свои внешние хранилища, пример – `hooks.tabs` → `useTabs` в `A/dsh-client-ui-settings-plugins/src/client/index.ts:42-72` и `PluginsSettingsSection.tsx:33-36`.

### Иконка навигации

`settings.section.icon` – список, адресуемый по `id` раздела: «The registration id must equal the target section's id; unmatched ids never render. The icon's label option is not displayed» (`contract/slots.ts:58-65`). Оболочка вызывает `renderSlot('settings.section.icon', { size: 16, active }, { only: row.id, fallback: navIcon(row.id) })` (`SettingsRoot.tsx:91-95`); без регистрации показывается шестерёнка. Пропсы владельца – `{ size: number, active: boolean }` (`contract/slots.ts:140-145`). Во встроенных пакетах регистраций иконок нет (их глифы зашиты в `navIcon`), так что готового примера для `settings.section.icon` нет. Регистрация по образцу:

```js
ctx.slots.inject('settings.section.icon', () => ctx.slots.register(
  { name: 'settings.section.icon', id: 'loadout' }, LoadoutNavIcon));
// LoadoutNavIcon({ size }) => h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'aria-hidden': true }, ...)
```

### Живое дерево слотов

Не проверено: Client Inspect (`Slots.listSubTree`) не ответил. Статический каталог владельцев (`slot-catalog.ts:3847-3854`): `settings.section` объявляется записью в `sidebar.settings` (client-ui-settings-general) и существует, пока эта запись смонтирована; занимают его `AgentPresetSection 'agent-presets'`, `AccountSection 'account'`, `GeneralSection 'general'`, `ModelsSection 'models'`, `PluginsSettingsSection 'plugins'`. Сам `sidebar.settings` регистрируется только при доступе `settings/describe` (`settings-general/src/client/index.ts:208`).

### Геометрия панели

Настройки – модальное окно шириной 800 px с колонкой навигации 188 px; колонка раздела `.options` имеет `padding: 0 24px 24px` и прокручивается сама (`A/dsh-client-ui-settings-general/src/client/SettingsRoot.module.css:95-118, 245-251`). На содержимое раздела остаётся около 540–550 px.

## 3. Вызов Host из Client

### Typert Remote (`ctx.remote.*`) плагину без сборки недоступен

Remote-методы Host объявляются декоратором `@Remote` в TypeScript, а Client получает их из сгенерированных артефактов `/remote`, которые монтирует `ctx.remote.$mount()` (`A/dsh/docs/subsystems/typert.md:477-499`; README `dsh-typert-registry`: «It performs no TypeScript analysis and generates no schemas; the generator and the loader handle those»). Подборку пробрасываемых Host-событий (`ctx.remote.$on`) делает приложение в `dsh-api-remotes` (README: «The Host entry owns the forwarded-event selection»), сторонний плагин своё событие туда не добавит. Собрать дескрипторы вручную теоретически можно, но формат внутренний и без генератора не документирован (не проверено).

`host.call(method, args)` есть только у динамических пакетов `dsh-tool-cordis`/`dsh-cordis-client-runner`, которые живут до перезагрузки страницы (`A/dsh-cordis-client-runner/README.md:12, 32`: «Creator UI plugins use installed Client modules through Plugin Manager»). Для установленного бандла не подходит.

`dsh-doc/references/user-actions.md:8` предлагает «a session command that `ctx.remote.commands.execute()` runs». Метод Host – `@Remote async execute(agent: Agent, line, submittedAttachments, signal)` (живой каталог Host `commands`), то есть он привязан к сессии. Для глобальной страницы настроек это неудобно: нужна сессия, и неясно, что такая команда пишет в лог сессии (не проверено).

### Рабочий путь: свой HTTP-маршрут Host + `fetch` из Client

Так сделан `dsh-better-sidebar`. Host-сервисы `webServer` и `connection` есть в живом каталоге Host (`cordis_inspect_query` → `Service.listService`).

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

Контракт сервисов (`A/dsh/docs/subsystems/web-server.md:9-49, 132-138, 216-222`):

- `ctx.webServer.register(route: { kind: 'exact' | 'prefix', path, handler(req: IncomingMessage, res: ServerResponse) }): () => void`; повтор `(kind, path)` бросает исключение.
- `ctx.connection.requestRejection(request): ConnectionRequestRejection` – «Apply Connection's Host/Origin checks and browser authentication to another Web route»; `undefined` значит «пропустить». Без этой проверки маршрут открыт любому процессу на машине.
- Сериализация – обычный JSON в теле POST; сервер только передаёт байты, ни валидации, ни кодеков нет. Ошибки плагин кодирует сам, конверт `{ ok, value | error: { code, message } }` повторяет стиль `RemoteResult` DSH.

Client (`better-sidebar/src/client/host-route-url.ts`, `desktop-env.ts`): URL маршрута строится относительно `document.baseURI` без ведущего слеша, `new URL('loadout/api/list', document.baseURI)`. Тогда работают и префикс reverse-proxy, и Desktop-оболочка `dsh-app://app/`, которая пересылает такие пути в Host той же схемой. Это утверждение взято из комментария `better-sidebar`; в Desktop-оболочке сам я его не проверял. Cookie сессии браузера уходят сами (same-origin).

### Обновления от Host

Пробрасываемые события приложения сторонний плагин не расширит (см. выше). Варианты:

- перечитывать данные при монтировании раздела, после каждой своей операции и по событию `connection/reset` (`ctx.on('connection/reset', ...)`; «Wire-derived caches must repull», каталог `api-catalog.ts`, `EVENT_API`);
- для настоящего push – свой WebSocket: Host `ctx.webServer.registerUpgrade({ path, handler })` + `ctx.connection.admitConnection(request)`, Client `ctx.connection.openWebSocket(path)` (`A/dsh-client-connection/src/client/index.ts:164-169`: «absolute logical channel path, resolved beneath the Host mount»). Так устроены сокеты `better-sidebar` (`/sidebar/ws/*`). Для MVP лишнее, на практике не проверено;
- `ctx.remote.$on('plugin-manager/changed', ...)` – встроенное событие, которое шлёт Plugin Manager; так делает `dsh-client-ui-skill` (`src/client/index.ts:255`). Полезно, чтобы перечитать список после включения или выключения плагинов.

## 4. Список workspace на Client

Источник – сервис `ctx.workspaces` из `dsh-api-workspace-controller` (`A/dsh-api-workspace-controller/src/client/service.ts:46-49, 118-128`):

```ts
interface IWorkspaces { readonly list: { getSnapshot(): WorkspaceSnapshot; subscribe(l: () => void): () => void }; ... }
```

Внутри компонента слота то же самое отдаёт стандартный проп `useWorkspaces` (есть у `settings.section`, см. п. 2): `props.useWorkspaces(s => s.items)`.

Форма данных (`A/dsh-api-workspace-controller/src/client/model.ts:32-41`, каталог `WorkspaceView`):

```ts
interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceView[]          // в порядке Host
  readonly archivedSessionIds: readonly SessionId[]
  readonly pinnedSessionIds: readonly SessionId[]
  readonly state: 'idle' | 'loading' | 'error'
  readonly phase: 'pending' | 'ready'
  readonly error: RemoteFailure | null
}
interface WorkspaceView {
  readonly workspaceId: WorkspaceId
  readonly path: string            // абсолютный каталог workspace
  readonly title: string
  readonly sessionIds: readonly SessionId[]
  readonly createdAt: string
  readonly updatedAt: string
}
```

Это зарегистрированные workspace из боковой панели. Понятия «открытого» workspace у DSH нет. Список синхронизирован с Host потоком `workspace.follow` и обновляется сам.

Host видит тот же реестр как `ctx.workspaceRegistry.list(): Workspace[]` (живой каталог Host; поля `id`, `path`, `title`, `sessionIds` – `A/dsh-workspace/src/types.ts:69-100`). `dsh-client-ui-workspace` хранит только UI-состояние и списка не отдаёт.

`projectRoot` (ближайший предок с `.git`) из `path` должен вычислять Host-часть плагина, как это делает `dsh-skill-filesystem`.

## 5. Превью файла в правой панели

`dsh-client-ui-skill` открывает превью так (`A/dsh-client-ui-skill/src/client/index.ts:205-213`):

```ts
const cwd = sessions.list.getSnapshot().byId[session.sessionId]?.cwd
ctx.sidebarRight.openResource(fileAddressFor(session.sessionId, cwd, path))
```

`inject` этого плагина содержит `'sidebarRight'` (`index.ts:80`).

Сигнатура: `ctx.sidebarRight.openResource(address: string, options?: SidebarRightOpenResourceOptions): void` (`A/dsh-client-ui-sidebar-right/src/client/service.ts:228-243`). Адрес – `dsh-resource://file/…`, тип вкладки подбирается по адресу; для `.md` это просмотрщик документов.

Ограничения для произвольного пути из страницы настроек:

1. Нужна сессия, которая сейчас на экране. `openResource` вызывает `this.require()`, а тот бросает `sidebarRight: no session surface is mounted`, если `mounted` пуст (`service.ts:854-864`). `mounted` равен `undefined`, когда основную колонку занимает глобальная панель или сессия не выбрана (`service.ts:217-226`). Текущую сессию даёт `ctx.sidebarRight.mounted.getSnapshot()`.
2. Адрес обязан нести сессию. Форма `dsh-resource://file/absolute/<path>` разбирается, но чтение падает с `workspace-file/unknown-workspace` (`A/dsh-api-workspace-files/README.md:94`, `src/client/provider.ts:5-14`). Рабочая форма – `dsh-resource://file/session/<sessionId>/<путь>`, путь может быть абсолютным (`README.md:94`: «leading slashes are preserved, as in `dsh-resource://file/session/s//etc/hosts`»).
3. Чтение файлов не ограничено workspace: «The composed filesystem decides whether the path is readable; the service does not impose workspace containment on file reads» (`README.md:41`). Значит, `~/.agents/skills/x/SKILL.md` откроется через любую сессию, если файловая система сессии разрешает чтение. Как ведёт себя песочница сессии (`dsh-fs-sandbox`) при чтении вне workspace – не проверено.
4. `fileAddressFor`/`sessionFileAddress` живут в `dsh-util-workspace-path`, которого нет в таблице модулей. Функцию придётся повторить (`A/dsh-util-workspace-path/src/file-address.ts:44-68`):

   ```js
   const enc = s => encodeURIComponent(s).replace(/%3A/gi, ':');
   const sessionFileAddress = (sid, path) =>
     `dsh-resource://file/session/${enc(sid)}/${path.replace(/\\/g, '/').split('/').map(enc).join('/')}`;
   ```

5. Настройки – модальное окно поверх приложения, портал в `document.body` (`SettingsRoot.tsx:57-114`). Чтобы вкладка была видна, после `openResource` надо вызвать проп `close()`. Похоже, что сессия за модалкой остаётся «на экране», но живьём это не проверено.

Если смонтированной сессии нет, остаются два пути: выключить кнопку «Открыть» с подсказкой или показать текст файла прямо на странице через свой Host-маршрут.

## 6. Подтверждение и уведомления

Общего Client-сервиса для confirm-диалогов и тостов нет. Каждый встроенный пакет рисует свой `ConfirmDialog` на примитиве `Modal`: Plugin Manager (`A/dsh-client-ui-plugin-manager/src/client/PluginManagerPage.tsx:1536-1559`), Plugin Market (`A/dsh-client-ui-plugin-market/src/client/DiscoverSection.tsx:357`), Schedule (`TaskManagerPage.tsx:348`). Тосты – тоже локальный примитив `<Toast>` (`A/dsh-client-ui-schedule/src/client/DeleteToast.tsx:97-113`). Тосты workspace привязаны к своему домену (keyed-слот `workspace.toast`, `A/dsh-client-ui-workspace/src/client/contract/toast.ts:50-63`) и для чужих сообщений не годятся.

Образец текста и действий (Plugin Manager):

```tsx
<Modal open onClose={onCancel} title={t('confirmUninstallTitle', { name })} closeLabel={t('close')}
  description={t('confirmUninstallDescription')}
  footer={<><Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
           <Button variant="primary" className={css.dangerButton} onClick={onConfirm}>{t('confirmUninstall')}</Button></>} />
```

`.dangerButton` перекрашивает основную кнопку: `--dsw-alias-button-primary-fill: var(--dsw-alias-state-error-primary)` (`PluginManagerPage.module.css:1404-1407`).

Следствие для плагина: подтверждение и ошибки рисует он сам. `Modal` из primitives импортировать нельзя (`dsh-doc/references/practices.md:35`), а писать DOM вне своего компонента или в `document.body` правила тоже запрещают (`practices.md:36`). Проще всего подтверждать прямо в строке: «Удалить в корзину? [Отмена] [Удалить]» вместо кнопки «Удалить». Ошибки выводить строкой под элементом, как `.reason`/`.failure` (`PluginManagerPage.module.css:265-270, 699-707`).

Открытый вопрос: панель настроек закрывается по Escape через `useModalLayer` (`SettingsRoot.tsx:63-64`). Если наше подтверждение тоже должно реагировать на Escape, надо проверить, успевает ли `stopPropagation` на своём элементе раньше обработчика модалки. Не проверено.

## 7. Токены темы и вёрстка

### Токены

Live-список (`Theme.listTokens`) не получен. Имена ниже взяты из `A/dsh-client-ui-theme/src/styles/design-platform.css` (132 токена `--dsw-*`), `base.css`, `focus.css` и подтверждены использованием во встроенных CSS.

| Назначение | Токены |
|---|---|
| Основной текст | `--dsw-alias-label-primary` |
| Вторичный и приглушённый текст | `--dsw-alias-label-secondary`, `--dsw-alias-label-tertiary`, `--dsw-alias-label-caption` |
| Границы и разделители | `--dsw-alias-border-l1` … `--dsw-alias-border-l4` (строки списка – `l2`, рамки – `l3`/`l4`), `--dsw-alias-border-selected` |
| Поверхности | `--dsw-alias-bg-base`, `--dsw-alias-bg-layer-1/2/3`, `--dsw-alias-bg-module-platform` (подложка «чипа» и выбранного сегмента), `--dsw-alias-settings-card-fill`, `--dsw-alias-settings-card-stroke` (`base.css:32-33`), `--dsw-alias-bg-skeleton` |
| Hover и press | `--dsw-alias-interactive-bg-hover`, `--dsw-alias-interactive-bg-active`, `--dsw-alias-interactive-bg-hover-danger` |
| Акцент | `--dsw-alias-brand-primary` (включённый switch), `--dsw-alias-state-business-primary` (ссылки, focus), `--dsw-alias-button-primary-fill`, `--dsw-alias-button-primary-hover` |
| Опасное действие и ошибка | `--dsw-alias-state-error-primary` |
| Состояния | `--dsw-alias-state-success-primary`, `--dsw-alias-state-warn-primary`, `--dsw-alias-state-warn-tertiary` |
| Switch | `--dsw-alias-switch-thumb`, `--dsw-alias-label-primary-foreground` (бегунок во включённом состоянии) |
| Радиусы | `--dsw-radius-xs` 4, `-sm` 8, `-md` 12, `-lg` 16, `-xl` 20, `-panel` 28 px (`base.css:18-23`) |
| Фокус | `--dsw-focus-ring-width` (2px), `--dsw-focus-ring-color` (`focus.css:3, 19`) |
| Шрифты | `--dsw-font-family`, `--ds-font-family-code` (`base.css:9-13`) |

Токенов размера шрифта и отступов нет. Встроенные страницы пишут px напрямую: заголовок раздела 18/600, заголовок группы 14/500, имя в строке 13.5–14/500, описание 12–13 `label-tertiary`, моноширинная метка 11.5–12.

### Как устроены похожие страницы

SPEC ссылается на Plugin Manager, но это основная панель с колонкой до 960 px, липкой шапкой и карточками с иконками 48 px (`PluginManagerPage.module.css:9-91, 379-505`). Для узкой колонки настроек ближе разделы самих настроек:

- `PluginsSettingsSection` (`A/dsh-client-ui-settings-plugins/src/client/PluginsSettingsSection.tsx:53-56`, `.module.css:3-21`): `.section { display:flex; flex-direction:column; gap:12px; max-width:760px; color: label-primary }`, `<h2 class=heading>` 18px/600, `<p class=intro>` 13px `label-tertiary`, вкладки с подчёркиванием 2px.
- `PluginInventorySettingsTab` (`A/dsh-client-ui-settings-plugin-inventory/src/client/PluginInventorySettingsTab.module.css:245-363`): группы `.group { gap:10px }`, соседние группы разделены `border-top: 0.5px solid border-l2; padding-top:14px`, заголовок группы 14px/22px, подзаголовок 12px `label-tertiary`, селектор-«пилюля» (`.switcher`) высотой 36 px на `bg-module-platform` – готовый образец кнопки выбора workspace.
- Строки списка Plugin Manager (`PluginManagerPage.module.css:1600-1722`): `.row { padding:12px 2px; border-bottom:0.5px solid border-l2 }`, `.rowLine { display:flex; align-items:center; gap:16px }`, `.rowMain` колонкой с `gap:2px`, `.rowId` 13.5px/500, `.rowModule` моноширинный 11.5px `label-tertiary` (подходит для пути), выключенная строка – `.row[data-state='off'] .rowId { color: label-secondary }`, иконочная кнопка удаления `.deleteButton` 28×28 цвета `state-error-primary` с hover `interactive-bg-hover-danger`.
- Трёхпозиционный выбор: ближайший образец – кубы темы «Светлая/Тёмная/Системная» (`A/dsh-client-ui-theme/src/client/AppearanceRow.tsx:42-62`, `.module.css:29-58`): `<button aria-pressed>`, у выбранного `background: bg-module-platform; border-color: border-selected`. Для строки нужна компактная сегментная версия с `role="radiogroup"`/`role="radio"`.
- Switch: исходников `dsh-client-ui-primitives` в `app.asar` нет, они вшиты в `dsh-web-frontend`. Стили взяты из собранного `A/dsh-web-frontend/dist/assets/index-CSAdOBx6.css`: `.switch { box-sizing:border-box; width:36px; height:20px; padding:2px; border:0; border-radius:999px; background: var(--dsw-alias-border-l3) }`, `[aria-checked=true] { background: var(--dsw-alias-brand-primary) }`, бегунок 16×16 `border-radius:50%`, фон `--dsw-alias-label-primary-foreground` (у выключенного – `--dsw-alias-switch-thumb`), сдвиг `translate(16px)`, `transition: transform .12s ease`, фокус `outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset:2px`. Разметка – `<button role="switch" aria-checked>` (`practices.md:35`).
- Hover-эффекты встроенные CSS прячут под `@media (hover: hover)` (`PluginManagerPage.module.css:1-7`).

## 8. Чек-лист dsh-doc для бандла с Client-частью

По `dsh-doc/references/host-plugin.md`, `plugin-details.md`, `ui-plugin.md`, `artwork.md`, `verification.md`, `plugin-development.md`:

- Манифест: `exports` – `"."`, `"./client"`, `"./locale/*.json"`, `"./icon"`; `files` – все рантайм-файлы, `cordis.patch.yml`, `locale/*.json`, `docs`, `icon.svg`; `dsh.bundle.patch` и `dsh.client` (п. 1). При установке из локального каталога `files` не фильтрует, но для публикации список надо сверить (`host-plugin.md:36`).
- `locale/<язык>.json` → `meta.title`, `meta.description`, опционально `meta.detail`. Plugin Manager и настройки читают их без активации плагина. Нужны `en` и язык пользователя (`ru`); заголовки на английском – в sentence case (`host-plugin.md:33`). `meta.description` объясняет, что делает плагин и где его найти, с точными подписями UI (например, «Settings → Loadout»), плюс ограничения (`plugin-details.md:3`). Заглушки шаблона оставлять нельзя.
- Название раздела настроек берётся не из `locale/*.json`, а из `label: () => t('nav')` словаря, зарегистрированного в `client.js` (п. 1–2). Все видимые строки UI идут через `ctx.locale` (`ui-plugin.md:13`).
- `docs/DETAIL.md` необязателен. Если он есть, это ровно одна строка с картинкой `![alt](preview.svg)`, SVG 640×300 без `text`, шрифтов, скриптов и `foreignObject`, читаемая в светлой и тёмной теме. Указанный, но отсутствующий файл – ошибка без fallback на README (`plugin-details.md:3-27`, `host-plugin.md:34`). Делается после того, как плагин заработал. Если обходимся без превью, убрать `meta.detail` из всех локалей и удалить `docs/DETAIL.md` с записью в `files`.
- `icon.svg`: `width="36" height="36" viewBox="0 0 36 36"`, один главный объект в поле примерно 18–22 единицы, без подложки и плитки (её рисует Plugin Manager), плоская сдержанная заливка, без `<style>`, `<text>`, `<image>`, скриптов и анимации, прозрачные пустоты, читается в обеих темах. До 256 KiB, внутри пакета, без симлинков наружу (`artwork.md:14-23`, `host-plugin.md:52`). Перед рисованием посмотреть 2–3 иконки установленных плагинов. Иконку навигации в настройках (`settings.section.icon`) рисуем отдельно: 16 px, `stroke="currentColor"`, чтобы она наследовала цвет пункта.
- Host-экспорт: либо `export function apply(ctx, config)` с `inject` и `Config`, либо сервис-класс по умолчанию; смешивать нельзя (`host-plugin.md:60-65`). Ресурсы – через `ctx.effect`/`ctx.on`.
- Проверка страницы (`verification.md:5`): только токены темы, ни одного импорта Client-пакетов Harness, в консоли нет `slot entry crashed in '<slot>'`, страница читается в светлой и тёмной теме рядом с похожей встроенной. Перед сдачей – UX-ревью субагентом: находимость, основной сценарий, обратная связь, визуальная согласованность (`verification.md:9-11`).
- Действия пользователя (`user-actions.md`): операция реализуется один раз как метод Host-сервиса, UI вызывает её через Client-доступную точку входа, и та же операция по возможности выставляется агенту как tool. Действия, которые дают или подтверждают полномочия, остаются только у пользователя.

## 9. Hot reload и проверка

- Host-часть `dsh-client-hmr` раз в `pollIntervalMs` (500 мс) опрашивает stat `client.js` каждой строки графа и при изменении mtime, ctime или размера шлёт браузеру кадр `rebuilt`. Браузер перезапускает плагин без перезагрузки страницы, состояние React теряется (`A/dsh-client-hmr/src/index.ts:1-8, 68-90`, README «Design concept»). Для бандла без сборки это значит: правка `client.js` в каталоге, установленном ссылкой, должна подхватываться сама. `pnpm run dev:web` нужен только для пересборки исходников DSH из чекаута и к установленному бандлу отношения не имеет. Смонтирован ли `dsh-client-hmr` в композиции Desktop, проверить не удалось (запрос `Config.listConfigs` с фильтром отклонён). Если правка не подхватилась, остаётся обновить страницу.
- Правка одного `package.json` (в том числе `dsh.client`) не замечается до перезапуска записи плагина или Host (`A/dsh-client-modules/README.md:149`).
- Host-часть (`index.js`) обновляется при следующей перекомпоновке профиля (например, после операции Plugin Manager или изменения профиля): «Profile recompositions … also replace plugins whose loaded files below the profile directory changed on disk. This covers … the targets of linked packages» (README `A/dsh-hmr`). Иначе нужен перезапуск. `host-plugin.md:75`: «replacing an installed package requires restart to load a fresh JavaScript module generation».
- Новый бандл после установки может включиться через HMR без перезапуска (`host-plugin.md:75`). Если Host сменил релиз, страница новые плагины не применяет, пока её не перезагрузят (`A/dsh-client-modules/README.md:51`).
- Сбои загрузки видны в Settings → Plugins → Plugin list, там же есть Retry (`A/dsh-client-hmr/README.md`, «Failure policy»).
- Порядок проверки после установки (`plugin-development.md:20`): прочитать `application` и `warnings` из результата установки; затем `cordis_inspect_query` Client `Slots.listSubTree` с `root: 'settings.section'` – в `occupants` должен появиться `id 'loadout'`; затем открыть Settings → Loadout, проверить обе темы и консоль.

## Выводы для реализации

Что должна сделать реализация:

1. `client.js` – классический скрипт `window.__ModuleLoader__.load({ id: 'dsh-loadout-manager', factory(require) {...} })`. React берётся из `require('react')`, элементы строятся через `React.createElement`. Плагин возвращает `{ inject: ['slots', 'locale'], apply(ctx) }`, а `sidebarRight`, `workspaces` и `connection` получает через `ctx.get(...)`, чтобы не зависеть от них жёстко.
2. В `package.json`: `exports["./client"] = "./client.js"`, `dsh.client = { platform: 'web', inject: [...] }` (п. 1), плюс `./locale/*.json` и `./icon`.
3. В `apply`:
   - `ctx.effect(() => ctx.locale.register('loadout', { en, ru, zh? }))`;
   - стили – `ctx.effect` с тегом `<style data-plugin="dsh-loadout-manager">`;
   - `ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'loadout', order: 25, label: () => t('nav'), locale: 'loadout', inject: () => ({ hooks: { loadout: store }, api }) }, LoadoutSection))`;
   - иконка – отдельная регистрация в `settings.section.icon` с тем же `id: 'loadout'`.
4. Связь с Host – свой маршрут `ctx.webServer.register({ kind: 'prefix', path: '/loadout/api', handler })` с проверкой `ctx.connection.requestRejection(req) === undefined`, только `POST` с JSON и конвертом `{ ok, value | error: { code, message } }`. Client обращается к `new URL('loadout/api/<method>', document.baseURI)`. На Host сервисы `webServer` и `connection` брать через `ctx.inject(['webServer', 'connection'], ...)`, чтобы фильтр скиллов и правила работали и без Web-сервера.
5. Данные перечитываются при монтировании раздела, после каждой операции, по `connection/reset` и по `ctx.remote.$on('plugin-manager/changed')` (если `remote` есть). Push-канал не нужен.
6. Выбор workspace строится из `props.useWorkspaces(s => s.items)`: `{ workspaceId, path, title }`. Host получает `path` и сам считает `projectRoot`.
7. «Открыть»: взять `sid = ctx.sidebarRight.mounted.getSnapshot()`; если сессия есть, вызвать `openResource(sessionFileAddress(sid, absPath))`, затем `props.close()`. Если `undefined`, кнопка неактивна с подсказкой, либо файл показывается прямо на странице через Host-маршрут.
8. «Удалить» подтверждается в самой строке (без модалки в `body`), ошибка выводится строкой под элементом. Тостов нет.
9. Свои контролы: switch по стилям из п. 7, трёхпозиционный сегмент `role="radiogroup"` по образцу кубов темы. Только токены `--dsw-alias-*` и `--dsw-radius-*`, ширина колонки около 550 px.

Где SPEC расходится с фактами или требует уточнения:

- «Client вызывает их через Remote или Service». Typert Remote и `ctx.remote.$on` без генератора недоступны, а Client-сервисы Host-операций не дают. Реальный путь – HTTP-маршрут Host (п. 3).
- «Превью файла в правой боковой панели, как делает `dsh-client-ui-skill`». Работает только при сессии на экране и с адресом, привязанным к сессии; адрес `absolute` не читается. Страница настроек к сессии не привязана, поэтому нужны `close()` и запасной вариант (п. 5).
- «Список из открытых workspace». У DSH есть только зарегистрированные workspace (`WorkspaceSnapshot.items`), признака «открыт» нет. Искать дальше в `dsh-workspace` или `dsh-client-ui-workspace` не нужно: источник – `ctx.workspaces` / `useWorkspaces` (п. 4).
- «Образец списка – страница Plugin Manager». Это широкая основная панель; раздел настроек занимает примерно 550 px внутри модалки 800 px. Строки берём из Plugin Manager (`.row`, `.rowId`, `.rowModule`, `.deleteButton`), а каркас – из разделов настроек (`PluginsSettingsSection`, `PluginInventorySettingsTab`) (п. 7).
- «Свои контролы вместо импорта primitives». Исходников primitives в `app.asar` нет, поэтому разметку и CSS копируем из собранного CSS (значения switch приведены в п. 7) или из отрисованной страницы.
- `dsh-doc` (`user-actions.md`) советует выставить те же операции агенту как tool. В SPEC этого нет. Нужно решить: переключение состояния скилла или правила можно отдать агенту, а удаление в корзину лучше оставить только пользователю.
- Название раздела «Loadout» задаётся словарём Client (`label`), а не `locale/*.json`. Метаданные плагина (`meta.title`) – отдельная строка для Plugin Manager.

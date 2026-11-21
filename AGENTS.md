# dsh-loadout

DSH-плагин (бандл профиля): переключает скиллы в `on`/`manual`/`off` и подключает файлы правил в контекст агента рядом с AGENTS.md. Решения – [docs/SPEC.md](docs/SPEC.md), они окончательные; меняй их только после согласия пользователя. Факты об API DSH 0.2.2-rc.2 со ссылками на исходники – [docs/research/](docs/research/).

## Раскладка

- `index.js` – Host `apply(ctx, config)`: только связывание сервисов DSH с модулями из `src/host/`.
- `src/host/` – логика Host. Чистые модули с тестами: `frontmatter.js`, `loadout.js`, `inventory.js`, `rules.js`. Остальные файлы – тонкие адаптеры к `ctx` (провайдер скиллов, `pre-step`, маршруты, инструмент).
- `client.js` – классический скрипт для `window.__ModuleLoader__`, React через `require('react')`, разметка через `React.createElement`.
- `test/*.test.js` – `node:test`, запуск `node --test` из корня.

## Ограничения среды

- Ни зависимостей, ни сборки, ни голых импортов (`import x from 'pkg'`). Бандл ставится ссылкой на этот каталог, и голое имя разрешается от реального пути репозитория, где `node_modules` нет. Только `node:*` и относительные пути.
- Синтаксис не выше Node 24 (Host DSH – Electron 44 / Node 24), хотя системный `node` новее. Декораторов нет.
- Исходники DSH лежат в `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/<pkg>/`. Инструмент read их читает, а `ls`, grep и glob – нет; для листинга и поиска: `cd /tmp; ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" -e "..."`.
- Перед опорой на метод или событие DSH сверь его с `docs/research/` или исходником, факты бери через скилл `dsh-doc`.

## Работа

- Чистые модули – через скилл `tdd`: тест на шве (публичная функция модуля), потом код. Адаптеры к `ctx` проверяются на живом DSH после установки.
- Коммит после каждого законченного шага; сообщение на русском, тире `–`, перед текстом загрузить `humanizer`.
- Установка, включение и удаление бандла в профиле (`plugin_manager`) – только после явного «да» пользователя.
- Перед установкой: `node --test` зелёный и пройден чеклист `dsh-doc` → `references/host-plugin.md` (локали `en`/`ru`, `icon.svg`, `docs/DETAIL*.md`).

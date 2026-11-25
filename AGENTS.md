# dsh-loadout

DSH-плагин (бандл профиля): переключает скиллы в `on`/`manual`/`off` и подключает файлы правил в контекст агента рядом с AGENTS.md. Решения – [docs/SPEC.md](docs/SPEC.md), они окончательные; меняй их только после согласия пользователя. Факты об API DSH 0.2.2-rc.2 со ссылками на исходники – [docs/research/](docs/research/).

## Раскладка

- `src/index.ts` – Host `apply(ctx, config)`: только связывание сервисов DSH с модулями из `src/host/`.
- `src/host/` – логика Host. Чистые модули с тестами: `frontmatter`, `loadout`, `inventory`, `rules`. Остальные – тонкие адаптеры к `ctx` (провайдер скиллов, `pre-step`, маршруты, инструмент).
- `src/shared/api.ts` – контракт маршрутов `/api/dsh-loadout/<op>`: запросы и ответы, общие для Host и Client. Меняешь поле ответа – меняй его здесь, компилятор покажет обе стороны.
- `src/client/` – страница Loadout на React (TSX), стили в `Loadout.module.css`, тексты в `locale.ts` (`en` – источник ключей, `ru` обязан совпадать).
- `lib/` – собранные `index.js` и `client.js`, на них указывает `package.json`. Коммитятся: бандл установлен ссылкой на этот каталог, DSH читает их из рабочей копии.
- `test/*.test.ts` – `node:test`; `client.test.ts` грузит собранный `lib/client.js` так, как его грузит DSH.

## Сборка и проверки

- `npm run check` – `tsc` и все тесты; `npm test` сначала собирает `lib/`. Перед коммитом – зелёный `npm run check` и закоммиченный свежий `lib/`.
- Зависимости только в `devDependencies`: в рантайм ничего не ставится. Пакеты `@deepseek-ai/*` нужны ради типов, их версия равна целевой версии DSH.
- Из `@deepseek-ai/*` импортируй только типы (`import type`). Значения приходят через сервисы `ctx`; сборка падает на импорте значения (`hostSelfContained`, `clientPurityGate` в `tsdown.config.ts`). Host-бандл не держит внешних импортов, кроме `node:*`; Client берёт из таблицы модулей оболочки только `react` и `react/jsx-runtime`.
- Сервисы DSH бери через `ctx.get('name')`, в том числе на `agent.ctx`: без объявленного `inject` Cordis бросает исключение на `ctx.name`. Исключение в serial-слушателе `agent/created` обрывает создание агента, поэтому всё внутри него оборачивай в `try/catch`.
- Если тип сервиса или события не находится, поищи пакет, который расширяет `Context`, `MessageSourceMap` или `LocaleNamespaceMap`, и добавь его в `devDependencies` той же версии.

## Среда

- Host DSH – Electron 44 / Node 24: целевой синтаксис `node24`, тесты идут на системном Node без сборки (`.ts` из `test/` и `src/`).
- Исходники DSH лежат в `/usr/lib/deepseek-harness-desktop/resources/app.asar/dsh/node_modules/@deepseek-ai/<pkg>/`. Инструмент read их читает, а `ls`, grep и glob – нет; для листинга и поиска: `cd /tmp; ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" -e "..."`. Перед опорой на метод или событие DSH сверь его с `docs/research/`, типами в `node_modules/@deepseek-ai` или исходником, факты бери через скилл `dsh-doc`.

## Работа

- Чистые модули – через скилл `tdd`: тест на шве (публичная функция модуля), потом код. Адаптеры к `ctx` проверяются на живом DSH после установки.
- Коммит после каждого законченного шага; сообщение на английском, формат conventional commits (`type(scope): описание`), перед текстом загрузить `humanizer`.
- Установка, включение и удаление бандла в профиле (`plugin_manager`) – только после явного «да» пользователя. Изменения Host вступают в силу после перезагрузки бандла (выключить и включить) или перезапуска DSH; `lib/client.js` DSH подхватывает при обновлении страницы.
- Перед установкой: `npm run check` зелёный и пройден чеклист `dsh-doc` → `references/host-plugin.md` (локали `en`/`ru`, `icon.svg`, `docs/DETAIL*.md`).

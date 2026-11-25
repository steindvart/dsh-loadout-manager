# Правила (rules)

Правило – плоский файл `<file>.md` в корне правил (как в Kilo Code). Frontmatter необязателен; если он есть, панель берёт из него `name` и `description`, как у скиллов. Без frontmatter имя – это `<file>`, описания нет. В контекст модели уходит тело файла без frontmatter.

Идентификатор правила (ключ в `loadout.json`) строится по имени файла, а не по `name` из frontmatter, чтобы переименование в frontmatter не сбрасывало состояние.

## Корни правил

| Уровень | Путь |
|---|---|
| проект | `<projectRoot>/.agents/rules/` |
| глобальный | `~/.dsh/rules/` (`$DSH_HOME/rules`) |
| глобальный | `~/.agents/rules/` (`$DSH_AGENTS_HOME/rules`) |

Каждое правило включается и выключается по отдельности; удаляется в корзину после подтверждения. По умолчанию включено.

Включённые правила попадают в контекст запроса наравне с AGENTS.md: тот же формат `<system-reminder>`, тот же приоритет («workspace instructions»), отдельное сообщение сразу после baseline `dsh-agent-instructions`.

Субагенты получают правила так же, как основной агент. Проверить при реализации, как `dsh-agent-instructions` доставляет AGENTS.md дочерним агентам, и повторить тот же путь.

Установку правил (создание в UI, импорт, URL) в первую версию не включаем: файлы кладутся руками.

## Правила в контексте

Механика повторяет `dsh-agent-instructions` и работает только у агентов, в композиции которых он есть: `ctx.agentPresets.inspectCompositions(agent.ctx)` содержит модуль `@deepseek-ai/dsh-agent-instructions`.

- Слушатель `agent/pre-step` (waterfall): сначала `await next()`, на `reject` и на пустом первом шаге решение возвращается без изменений.
- На первом подходящем шаге – baseline со всеми включёнными правилами (сначала `dsh`, `agents`, потом `project`). Вставка – сразу после последнего сообщения `agent-instructions`, иначе после последнего claimed-сообщения; решение распространяется (spread).
- На каждом шаге правила сверяются заново (`stat` + дайджест, watcher не нужен). Разница с увиденным – одно сообщение с секциями `Additional rule from` / `Updated rule from` / `Rule removed`.
- Сообщение – `user/message` с `source: { kind: 'dsh-loadout-rules', form: 'instructions', baseline?: true, projectRoot, snapshot }`, где `snapshot` – `{ displayPath: digest }` после этого сообщения. Состояние восстанавливается из последнего такого сообщения на поверхности сессии (`session.deriveMessages()`), поэтому replay, resume, fork и compaction работают без отдельного хранилища. Смена `projectRoot` – новый baseline.
- `displayPath`: `~/.dsh/rules/<file>.md`, `~/.agents/rules/<file>.md`, проектные – относительно `projectRoot`.
- Бюджет `maxBytes` (Config, по умолчанию 65536) на одно сообщение: сначала отбрасываются самые широкие правила, потом обрезается последнее, в начале – маркер `Rule budget N bytes: …`. Отброшенные записываются в снапшот как `omitted:<digest>` и не повторяются, пока не изменятся.

Шаблон baseline (текст для модели, английский, как у AGENTS.md):

```markdown
<system-reminder>
The following rules apply to your work. Treat them like workspace instructions: more specific rules take precedence over broader ones, and they do not override system, developer, or direct user instructions.

Rule from: ~/.dsh/rules/<file>.md

<rule body without frontmatter>

Rule from: .agents/rules/<file>.md

<rule body without frontmatter>
</system-reminder>
```

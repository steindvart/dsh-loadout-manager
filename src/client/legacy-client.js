/* dsh-loadout Client half: the Loadout page in the left sidebar panel list. Classic script for the DSH module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-loadout',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'loadout'
    const PANEL_ID = 'loadout'
    const SCOPE_KEY = 'dsh-loadout.scope'
    const TAB_KEY = 'dsh-loadout.tab'
    const GLOBAL = 'global' // workspace values are absolute paths, so they never equal it

    const DICT = {
      en: {
        nav: 'Loadout',
        title: 'Loadout',
        intro: 'Choose which skills and rules agents carry. Changes apply from the next agent step.',
        global: 'Global',
        globalHint: 'Skills and rules from ~/.dsh, ~/.agents, and built-in skills',
        scope: 'Scope',
        tabs: 'Item kinds',
        savedToLabel: 'Saved to',
        noWorkspaces: 'No workspaces yet. Add one in the sidebar to manage its skills and rules.',
        skills: 'Skills',
        noSkills: 'No skills here.',
        noRules: 'No rule files. Put .md files into {path}.',
        instructionsTab: 'Instructions',
        instructionFiles: 'Instruction files',
        rules: 'Rules',
        noGlobalInstructions: 'No AGENTS.md in ~/.dsh or ~/.agents.',
        noProjectInstructions: 'No AGENTS.md, CLAUDE.md, or their .local.md variants from the project root down to this workspace.',
        alwaysLoaded: 'Always loaded',
        alwaysLoadedHint: 'DSH adds this file to the context of every session in this scope. Loadout does not switch it.',
        projectRoot: 'Project root',
        'state.on': 'On',
        'state.manual': 'Manual',
        'state.off': 'Off',
        'stateHint.on': 'In the model catalog and the / menu',
        'stateHint.manual': 'Hidden from the model, still available as /name',
        'stateHint.off': 'Hidden everywhere',
        fileManual: 'The skill file sets disable-model-invocation, so it cannot be On',
        overridden: 'Overridden by {path}',
        builtIn: 'Built in',
        ruleOn: 'Rule is on',
        ruleOff: 'Rule is off',
        open: 'Open',
        hide: 'Hide',
        delete: 'Delete',
        confirmDelete: 'Move to the trash?',
        cancel: 'Cancel',
        confirm: 'Move to trash',
        loading: 'Loading…',
        retry: 'Retry',
        malformed: '{path} is malformed: {error}. Fix the file to change this group.',
        truncated: 'Showing the first 256 KB.',
        'source.project-dsh': '.dsh/skills',
        'source.project-agents': '.agents/skills',
        'source.custom': 'Custom and built-in',
        'source.user-dsh': '~/.dsh/skills',
        'source.user-agents': '~/.agents/skills',
        'source.dsh': '~/.dsh/rules',
        'source.agents': '~/.agents/rules',
        'source.project': '.agents/rules',
        'location.dsh': '~/.dsh',
        'location.agents': '~/.agents',
      },
      ru: {
        nav: 'Loadout',
        title: 'Loadout',
        intro: 'Выберите, какие скиллы и правила берут с собой агенты. Изменения действуют со следующего шага агента.',
        global: 'Глобальные',
        globalHint: 'Скиллы и правила из ~/.dsh, ~/.agents и встроенные скиллы',
        scope: 'Область',
        tabs: 'Виды элементов',
        savedToLabel: 'Сохраняется в',
        noWorkspaces: 'Workspace пока нет. Добавьте его в боковой панели, чтобы управлять его скиллами и правилами.',
        skills: 'Скиллы',
        noSkills: 'Скиллов нет.',
        noRules: 'Файлов правил нет. Положите .md-файлы в {path}.',
        instructionsTab: 'Инструкции',
        instructionFiles: 'Файлы инструкций',
        rules: 'Правила',
        noGlobalInstructions: 'В ~/.dsh и ~/.agents нет AGENTS.md.',
        noProjectInstructions: 'От корня проекта до этого workspace нет AGENTS.md, CLAUDE.md и их вариантов .local.md.',
        alwaysLoaded: 'Всегда загружается',
        alwaysLoadedHint: 'DSH добавляет этот файл в контекст каждой сессии этой области. Loadout его не переключает.',
        projectRoot: 'Корень проекта',
        'state.on': 'Вкл',
        'state.manual': 'Вручную',
        'state.off': 'Выкл',
        'stateHint.on': 'В каталоге модели и в меню /',
        'stateHint.manual': 'Модель не видит, но вызывается через /name',
        'stateHint.off': 'Скрыт везде',
        fileManual: 'В файле скилла стоит disable-model-invocation, поэтому включить его нельзя',
        overridden: 'Перекрыт: {path}',
        builtIn: 'Встроенный',
        ruleOn: 'Правило включено',
        ruleOff: 'Правило выключено',
        open: 'Открыть',
        hide: 'Скрыть',
        delete: 'Удалить',
        confirmDelete: 'Переместить в корзину?',
        cancel: 'Отмена',
        confirm: 'В корзину',
        loading: 'Загрузка…',
        retry: 'Повторить',
        malformed: '{path} повреждён: {error}. Исправьте файл, чтобы менять эту группу.',
        truncated: 'Показаны первые 256 КБ.',
        'source.project-dsh': '.dsh/skills',
        'source.project-agents': '.agents/skills',
        'source.custom': 'Дополнительные и встроенные',
        'source.user-dsh': '~/.dsh/skills',
        'source.user-agents': '~/.agents/skills',
        'source.dsh': '~/.dsh/rules',
        'source.agents': '~/.agents/rules',
        'source.project': '.agents/rules',
        'location.dsh': '~/.dsh',
        'location.agents': '~/.agents',
      },
    }

    const CSS = `
.dshlo-page { --dshlo-inset: clamp(24px, 4vw, 48px); box-sizing: border-box; height: 100%; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; align-items: center; padding: 0 var(--dshlo-inset) 48px; color: var(--dsw-alias-label-primary); }
@media (max-width: 767px) { .dshlo-page { --dshlo-inset: 20px; } }

/* Header: the Plugins page bar. Title and scope on one row, tabs on the last row; it stays on screen while the list scrolls. */
.dshlo-head { position: sticky; top: 0; z-index: 2; flex: none; width: calc(100% + 2 * var(--dshlo-inset)); max-width: none; margin-inline: calc(-1 * var(--dshlo-inset)); box-sizing: border-box; padding: 28px var(--dshlo-inset) 16px; background: var(--dsw-alias-bg-base); display: flex; justify-content: center; }
html[data-platform='darwin'] .dshlo-head { padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px)); }
.dshlo-headInner { width: 100%; max-width: 960px; display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dshlo-heading { min-width: 0; max-width: 100%; flex: 1 1 320px; }
.dshlo-head h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 500; }
.dshlo-intro { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dshlo-scopeMeta { display: flex; flex-wrap: wrap; gap: 0 16px; min-height: 18px; margin-top: 4px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dshlo-scopeMeta code { font-family: var(--ds-font-family-code); font-size: 11.5px; overflow-wrap: anywhere; }
.dshlo-headTabs { display: flex; flex: 1 1 100%; }

/* Scope picker: an outline Button (32px, radius-md, 13px) with a leading glyph and a chevron. */
.dshlo-toolbar { display: flex; flex: 0 1 auto; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
.dshlo-select { position: relative; display: inline-flex; min-width: 0; max-width: 100%; color: var(--dsw-alias-label-secondary); }
.dshlo-select svg { position: absolute; top: 50%; transform: translateY(-50%); pointer-events: none; }
.dshlo-select .dshlo-lead { left: 12px; }
.dshlo-select .dshlo-chevron { right: 10px; }
.dshlo-picker { box-sizing: border-box; height: 32px; min-width: 200px; max-width: 360px; padding: 0 30px 0 31px; border: 0; border-radius: var(--dsw-radius-md); background: transparent; box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsh-button-outline-color, var(--dsw-alias-border-l3)); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; appearance: none; -webkit-appearance: none; cursor: pointer; }
.dshlo-picker option { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-overlay); }
.dshlo-picker:disabled { opacity: .4; cursor: not-allowed; }

/* Tabs: SegmentedTabs size "sm". */
.dshlo-tabs { --dshlo-tabs-inset: 2px; position: relative; display: grid; width: fit-content; min-width: 240px; padding: var(--dshlo-tabs-inset); border-radius: calc(var(--dsw-radius-md) + var(--dshlo-tabs-inset)); background: var(--dsw-alias-bg-module-platform); }
.dshlo-tabIndicator { position: absolute; inset: var(--dshlo-tabs-inset) auto var(--dshlo-tabs-inset) var(--dshlo-tabs-inset); box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l3); border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-3); transition: transform .18s ease; pointer-events: none; }
.dshlo-tab { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: var(--dsw-radius-md); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; line-height: 20px; cursor: pointer; transition: color .18s ease; }
.dshlo-tab[aria-selected='true'] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dshlo-tab:focus-visible { outline: none; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.dshlo-count { font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-tertiary); }

/* Body: 32px under the header; each source is a heading over a settings card (Models / Agent presets sections). */
.dshlo { flex: none; width: 100%; max-width: 960px; padding-top: 16px; }
.dshlo-tabpanel { display: flex; flex-direction: column; gap: 28px; }
.dshlo-part { display: flex; flex-direction: column; gap: 16px; }
.dshlo-part + .dshlo-part { padding-top: 28px; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dshlo-partHead { display: flex; align-items: baseline; gap: 8px; }
.dshlo-partTitle { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.dshlo-sub { display: flex; flex-direction: column; gap: 8px; }
.dshlo-sourceHead { display: flex; align-items: baseline; gap: 8px; padding: 0 2px; }
.dshlo-source { margin: 0; font-size: 14px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dshlo-sourceCount { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dshlo-list { display: flex; flex-direction: column; padding: 0 16px; border: 0.5px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-lg); background: var(--dsw-alias-settings-card-fill); }

/* Rows: Plugin Manager .row / .rowLine. */
.dshlo-row { padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; gap: 8px; }
.dshlo-row:last-child { border-bottom: 0; }
.dshlo-rowLine { display: flex; align-items: center; gap: 16px; }
.dshlo-rowMain { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dshlo-name { font-size: 13.5px; line-height: 20px; font-weight: 500; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dshlo-row[data-state='off'] .dshlo-name, .dshlo-row[data-overridden='true'] .dshlo-name { color: var(--dsw-alias-label-secondary); }
.dshlo-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dshlo-mono { font-family: var(--ds-font-family-code); font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary); overflow-wrap: anywhere; }
.dshlo-badge { font-size: 11px; line-height: 16px; font-weight: 400; padding: 0 6px; border-radius: var(--dsw-radius-xs); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); }
.dshlo-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Skill state: SegmentedTabs in a smaller size, so both segmented controls on the page read alike. */
.dshlo-seg { display: inline-flex; padding: 2px; gap: 0; border-radius: calc(var(--dsw-radius-sm) + 2px); background: var(--dsw-alias-bg-module-platform); }
.dshlo-seg button { box-sizing: border-box; height: 24px; padding: 0 10px; border: 0.5px solid transparent; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.dshlo-seg button[aria-checked='true'] { background: var(--dsw-alias-bg-layer-3); border-color: var(--dsw-alias-border-l3); color: var(--dsw-alias-label-primary); font-weight: 500; }
.dshlo-seg button:disabled { cursor: not-allowed; opacity: .4; }

/* Rule switch: the Switch primitive. */
.dshlo-switch { box-sizing: border-box; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; flex-shrink: 0; }
.dshlo-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dshlo-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb); transition: transform .12s ease; }
.dshlo-switch[aria-checked='true']::after { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground); }
.dshlo-switch:disabled { cursor: not-allowed; opacity: .4; }

/* Buttons: Button size "sm" (28px, radius-sm); delete is the 28x28 icon button of Plugin Manager. */
.dshlo-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 28px; padding: 0 10px; border: 0; border-radius: var(--dsw-radius-sm); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.dshlo-btn:disabled { cursor: not-allowed; opacity: .4; }
.dshlo-btn[data-tone='outline'] { color: var(--dsw-alias-label-primary); box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsh-button-outline-color, var(--dsw-alias-border-l3)); }
.dshlo-btn[data-tone='icon'] { width: 28px; padding: 0; }
.dshlo-btn[data-tone='danger'] { color: var(--dsw-alias-state-error-primary); width: 28px; padding: 0; }
.dshlo-btn[data-tone='primary'] { background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary-foreground); }

@media (hover: hover) {
  .dshlo-tab:hover { color: var(--dsw-alias-label-primary); }
  .dshlo-picker:not(:disabled):hover, .dshlo-btn:not(:disabled):hover, .dshlo-seg button:not(:disabled):not([aria-checked='true']):hover { background: var(--dsw-alias-interactive-bg-hover); }
  .dshlo-btn[data-tone='danger']:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover-danger); }
  .dshlo-btn[data-tone='primary']:not(:disabled):hover { background: var(--dsw-alias-state-error-primary); opacity: .9; }
}
@media (prefers-reduced-motion: reduce) { .dshlo-tabIndicator, .dshlo-tab, .dshlo-switch::after { transition: none; } }
.dshlo-page :is(button:not(.dshlo-tab), select):focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }

/* Row extras and page states: Plugin Manager .status / .failure (13px). */
.dshlo-confirm { display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dshlo-error { font-size: 13px; line-height: 20px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dshlo-error:has(button) { display: flex; align-items: center; gap: 10px; }
.dshlo-empty { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dshlo-fixed { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; white-space: nowrap; cursor: default; }
.dshlo-preview { margin: 0; max-height: 260px; overflow: auto; padding: 10px 12px; border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-3); font-family: var(--ds-font-family-code); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
`

    async function call(op, body) {
      const response = await fetch(new URL(`api/dsh-loadout/${op}`, document.baseURI), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      let data
      try {
        data = await response.json()
      } catch {
        throw new Error(`HTTP ${response.status}`)
      }
      if (!data.ok) throw new Error(data.error?.message ?? `HTTP ${response.status}`)
      return data.value
    }

    function groupBy(items, key) {
      const groups = new Map()
      for (const item of items) {
        if (!groups.has(item[key])) groups.set(item[key], [])
        groups.get(item[key]).push(item)
      }
      return [...groups]
    }

    function readStored(key) {
      try {
        return window.localStorage.getItem(key) ?? undefined
      } catch {
        return undefined
      }
    }

    function store(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // storage unavailable: the choice lasts for this page only
      }
    }

    function Segmented({ t, value, fileManual, disabled, onChange }) {
      return h('div', { className: 'dshlo-seg', role: 'radiogroup', 'aria-label': t('skills') },
        ['on', 'manual', 'off'].map(state => h('button', {
          key: state,
          type: 'button',
          role: 'radio',
          'aria-checked': value === state,
          title: state === 'on' && fileManual ? t('fileManual') : t(`stateHint.${state}`),
          disabled: disabled || (state === 'on' && fileManual),
          onClick: () => { if (value !== state) onChange(state) },
        }, t(`state.${state}`))))
    }

    function Switch({ t, checked, disabled, onChange }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        className: 'dshlo-switch',
        'aria-checked': checked,
        'aria-label': checked ? t('ruleOn') : t('ruleOff'),
        disabled,
        onClick: () => onChange(!checked),
      })
    }

    function Row({ t, item, kind, scope, locked, reload }) {
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const [confirming, setConfirming] = useState(false)
      const [preview, setPreview] = useState(undefined)

      const run = useCallback(async (operation) => {
        setBusy(true)
        setError(undefined)
        try {
          await operation()
          await reload()
        } catch (failure) {
          setError(failure.message)
        } finally {
          setBusy(false)
        }
      }, [reload])

      const onOpen = async () => {
        if (preview !== undefined) return setPreview(undefined)
        setError(undefined)
        try {
          setPreview(await call('read', { ...scope.body, path: item.file }))
        } catch (failure) {
          setError(failure.message)
        }
      }

      const control = kind === 'instruction'
        ? h('span', { className: 'dshlo-fixed', title: t('alwaysLoadedHint') }, t('alwaysLoaded'))
        : kind === 'skill'
        ? h(Segmented, {
          t,
          value: item.state,
          fileManual: item.fileManual,
          disabled: busy || locked,
          onChange: state => run(() => call('set-skill', { ...scope.body, level: scope.level, name: item.name, state })),
        })
        : h(Switch, {
          t,
          checked: item.enabled,
          disabled: busy || locked,
          onChange: enabled => run(() => call('set-rule', { ...scope.body, id: item.id, enabled })),
        })

      const deletePath = kind === 'skill' ? item.entry : item.file
      return h('div', {
        className: 'dshlo-row',
        'data-state': kind === 'skill' ? item.state : kind === 'rule' && !item.enabled ? 'off' : 'on',
        'data-overridden': item.overriddenBy !== undefined,
      },
      h('div', { className: 'dshlo-rowLine' },
        h('div', { className: 'dshlo-rowMain' },
          h('div', { className: 'dshlo-name' },
            item.name,
            item.readOnly ? h('span', { className: 'dshlo-badge' }, t('builtIn')) : null),
          item.description ? h('div', { className: 'dshlo-desc', title: item.description }, item.description) : null,
          h('div', { className: 'dshlo-mono' }, item.file),
          item.overriddenBy !== undefined ? h('div', { className: 'dshlo-mono' }, t('overridden', { path: item.overriddenBy })) : null),
        h('div', { className: 'dshlo-controls' },
          h('button', { type: 'button', className: 'dshlo-btn', 'aria-expanded': preview !== undefined, onClick: onOpen }, preview === undefined ? t('open') : t('hide')),
          item.readOnly || kind === 'instruction' ? null : h('button', {
            type: 'button',
            className: 'dshlo-btn',
            'data-tone': 'danger',
            'aria-label': t('delete'),
            title: t('delete'),
            disabled: busy || confirming,
            onClick: () => setConfirming(true),
          }, h(TrashIcon)),
          control)),
      confirming
        ? h('div', { className: 'dshlo-confirm' },
          t('confirmDelete'),
          h('button', { type: 'button', className: 'dshlo-btn', 'data-tone': 'outline', onClick: () => setConfirming(false) }, t('cancel')),
          h('button', {
            type: 'button',
            className: 'dshlo-btn',
            'data-tone': 'primary',
            disabled: busy,
            onClick: () => run(async () => { await call('remove', { ...scope.body, path: deletePath }); setConfirming(false) }),
          }, t('confirm')))
        : null,
      error !== undefined ? h('div', { className: 'dshlo-error', role: 'alert' }, error) : null,
      preview !== undefined
        ? h(React.Fragment, null,
          h('pre', { className: 'dshlo-preview' }, preview.text),
          preview.truncated ? h('div', { className: 'dshlo-empty' }, t('truncated')) : null)
        : null)
    }

    /** Group heading: a skill or rule source, or the folder an instruction file sits in. */
    function groupTitle(t, kind, key) {
      if (kind !== 'instruction') return t(`source.${key}`)
      if (key === 'dsh' || key === 'agents') return t(`location.${key}`)
      return key === '.' ? t('projectRoot') : key
    }

    function Groups({ t, kind, items, scope, locked, reload }) {
      return groupBy(items, kind === 'instruction' ? 'location' : 'source').map(([source, group]) => h('section', { key: `${kind}:${source}`, className: 'dshlo-sub' },
        h('div', { className: 'dshlo-sourceHead' },
          h('h3', { className: 'dshlo-source' }, groupTitle(t, kind, source)),
          h('span', { className: 'dshlo-sourceCount' }, group.length)),
        h('div', { className: 'dshlo-list' }, group.map(item => h(Row, { key: item.file, t, item, kind, scope, locked, reload })))))
    }

    /**
     * A tab's sections in order. A titled section is a heading over its own
     * groups, with its own empty text; a single untitled section renders its
     * groups directly.
     */
    function Items({ t, sections, scope, locked, reload }) {
      return sections.map(({ kind, title, items, empty }) => {
        const body = items.length === 0
          ? h('div', { className: 'dshlo-empty' }, empty)
          : h(Groups, { t, kind, items, scope, locked, reload })
        if (title === undefined) return h(React.Fragment, { key: kind }, body)
        return h('section', { key: kind, className: 'dshlo-part' },
          h('div', { className: 'dshlo-partHead' },
            h('h2', { className: 'dshlo-partTitle' }, title),
            h('span', { className: 'dshlo-sourceCount' }, items.length)),
          body)
      })
    }

    /**
     * Tabs. Each lists sections built from the Host state; the rules tab shows
     * AGENTS.md files before rules, the order they take in the agent's context.
     * A new kind is one more entry here and one more list in the Host state.
     */
    const KINDS = [
      {
        id: 'skills',
        label: 'skills',
        sections: (t, group) => [{ kind: 'skill', items: group.skills ?? [], empty: t('noSkills') }],
      },
      {
        id: 'rules',
        label: 'instructionsTab',
        sections: (t, group, { level, rulesHint }) => [
          { kind: 'instruction', title: t('instructionFiles'), items: group.instructions ?? [], empty: t(level === 'global' ? 'noGlobalInstructions' : 'noProjectInstructions') },
          { kind: 'rule', title: t('rules'), items: group.rules ?? [], empty: t('noRules', { path: rulesHint }) },
        ],
      },
    ]
    const countOf = (kind, group) => kind.sections(String, group, {}).reduce((sum, section) => sum + section.items.length, 0)

    function Tabs({ t, value, counts, onChange }) {
      const index = Math.max(0, KINDS.findIndex(kind => kind.id === value))
      const onKeyDown = (event, at) => {
        const next = { ArrowLeft: (at + KINDS.length - 1) % KINDS.length, ArrowRight: (at + 1) % KINDS.length, Home: 0, End: KINDS.length - 1 }[event.key]
        if (next === undefined) return
        event.preventDefault()
        event.currentTarget.parentElement?.querySelectorAll('[role="tab"]').item(next).focus()
        onChange(KINDS[next].id)
      }
      return h('div', { className: 'dshlo-tabs', role: 'tablist', 'aria-label': t('tabs'), style: { gridTemplateColumns: `repeat(${KINDS.length}, minmax(0, 1fr))` } },
        h('span', { className: 'dshlo-tabIndicator', 'aria-hidden': true, style: { width: `calc((100% - 4px) / ${KINDS.length})`, transform: `translateX(${index * 100}%)` } }),
        KINDS.map((kind, at) => h('button', {
          key: kind.id,
          type: 'button',
          role: 'tab',
          id: `dshlo-tab-${kind.id}`,
          className: 'dshlo-tab',
          'aria-selected': kind.id === value,
          'aria-controls': 'dshlo-tabpanel',
          tabIndex: kind.id === value ? 0 : -1,
          onClick: () => onChange(kind.id),
          onKeyDown: event => onKeyDown(event, at),
        }, t(kind.label), counts[kind.id] === undefined ? null : h('span', { className: 'dshlo-count' }, counts[kind.id]))))
    }

    const noWorkspaces = () => []

    /** Workspace title, with the path only when another workspace shares the title. */
    function optionLabel(item, all) {
      return all.filter(other => other.title === item.title).length > 1 ? `${item.title} – ${item.path}` : item.title
    }

    function LoadoutPage(props) {
      const { t } = props
      const useWorkspaces = props.useWorkspaces ?? noWorkspaces
      const workspaces = useWorkspaces(snapshot => snapshot.items) ?? []
      const [chosenScope, setChosenScope] = useState(() => readStored(SCOPE_KEY) ?? GLOBAL)
      const scopeValue = chosenScope !== GLOBAL && workspaces.some(item => item.path === chosenScope) ? chosenScope : GLOBAL
      const workspacePath = scopeValue === GLOBAL ? undefined : scopeValue
      const [chosenTab, setChosenTab] = useState(() => readStored(TAB_KEY) ?? KINDS[0].id)
      const tab = KINDS.some(kind => kind.id === chosenTab) ? chosenTab : KINDS[0].id
      const [data, setData] = useState(undefined)
      const [error, setError] = useState(undefined)

      const reload = useCallback(async () => {
        try {
          setData({ for: workspacePath, value: await call('state', workspacePath === undefined ? {} : { workspacePath }) })
          setError(undefined)
        } catch (failure) {
          setError(failure.message)
        }
      }, [workspacePath])

      useEffect(() => { void reload() }, [reload])

      const pickScope = (value) => {
        setChosenScope(value)
        store(SCOPE_KEY, value)
      }
      const pickTab = (value) => {
        setChosenTab(value)
        store(TAB_KEY, value)
      }

      const current = data !== undefined && data.for === workspacePath ? data.value : undefined
      const group = current === undefined ? undefined : workspacePath === undefined ? current.global : current.workspace
      const scope = workspacePath === undefined ? { level: 'global', body: {} } : { level: 'project', body: { workspacePath } }
      const rulesHint = workspacePath === undefined ? '~/.agents/rules' : `${group?.projectRoot ?? workspacePath}/.agents/rules`
      const kind = KINDS.find(item => item.id === tab)
      const locked = group?.error !== undefined

      return h('div', { className: 'dshlo-page', 'aria-busy': group === undefined && error === undefined },
        h('style', null, CSS),
        h('header', { className: 'dshlo-head', 'data-window-drag': true },
          h('div', { className: 'dshlo-headInner' },
            h('div', { className: 'dshlo-heading' },
              h('h1', null, t('title')),
              h('p', { className: 'dshlo-intro' }, t('intro')),
              h('div', { className: 'dshlo-scopeMeta' },
                workspacePath === undefined
                  ? h('span', null, workspaces.length === 0 ? t('noWorkspaces') : t('globalHint'))
                  : h('code', null, group?.projectRoot ?? workspacePath),
                group !== undefined ? h('span', null, t('savedToLabel'), ' ', h('code', null, group.loadoutPath)) : null)),
            h('div', { className: 'dshlo-toolbar' },
              h('span', { className: 'dshlo-select' },
                h(ScopeIcon, { global: workspacePath === undefined }),
                h('select', {
                  className: 'dshlo-picker',
                  'aria-label': t('scope'),
                  title: workspacePath ?? t('globalHint'),
                  value: scopeValue,
                  disabled: workspaces.length === 0,
                  onChange: event => pickScope(event.target.value),
                },
                h('option', { value: GLOBAL }, t('global')),
                workspaces.map(item => h('option', { key: item.workspaceId ?? item.path, value: item.path }, optionLabel(item, workspaces)))),
                h('svg', { className: 'dshlo-chevron', width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
                  h('path', { d: 'M3 4.5 6 7.5l3-3' })))),
            h('div', { className: 'dshlo-headTabs' },
              h(Tabs, { t, value: tab, counts: group === undefined ? {} : Object.fromEntries(KINDS.map(item => [item.id, countOf(item, group)])), onChange: pickTab })))),
        h('div', { className: 'dshlo' },
          h('div', { className: 'dshlo-tabpanel', role: 'tabpanel', id: 'dshlo-tabpanel', 'aria-labelledby': `dshlo-tab-${tab}` },
            error !== undefined
              ? h('div', { className: 'dshlo-error', role: 'alert' }, h('span', null, error), h('button', { type: 'button', className: 'dshlo-btn', 'data-tone': 'outline', onClick: () => void reload() }, t('retry')))
              : null,
            group === undefined && error === undefined ? h('div', { className: 'dshlo-empty', role: 'status' }, t('loading')) : null,
            locked ? h('div', { className: 'dshlo-error', role: 'alert' }, t('malformed', { path: group.loadoutPath, error: group.error })) : null,
            group !== undefined
              ? h(Items, { key: `${scopeValue}:${tab}`, t, sections: kind.sections(t, group, { level: scope.level, rulesHint }), scope, locked, reload })
              : null)))
    }

    function TrashIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6M6.7 7v4.5M9.3 7v4.5' }))
    }

    function ScopeIcon({ global }) {
      return global
        ? h('svg', { className: 'dshlo-lead', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, 'aria-hidden': true },
          h('circle', { cx: 8, cy: 8, r: 6 }),
          h('path', { d: 'M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14M8 2C6.3 3.8 5.5 5.8 5.5 8s.8 4.2 2.5 6' }))
        : h('svg', { className: 'dshlo-lead', width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round', 'aria-hidden': true },
          h('path', { d: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z' }))
    }

    function LoadoutIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M6.5 3.5V3a1.5 1.5 0 0 1 3 0v.5' }),
        h('rect', { x: 3, y: 3.5, width: 10, height: 10.5, rx: 3 }),
        h('path', { d: 'M3 7.5c1.5.8 3.2 1.2 5 1.2s3.5-.4 5-1.2' }),
        h('rect', { x: 5.5, y: 10, width: 5, height: 2.5, rx: 0.8 }))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT))
        const t = ctx.locale.bind(NS)

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
        }, LoadoutPage))

        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          label: () => t('nav'),
          locale: NS,
        }, LoadoutIcon))
      },
    }
  },
})

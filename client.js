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
        intro: 'Choose which skills and rules agents carry. Changes apply from the next agent step and are saved to loadout.json.',
        global: 'Global',
        globalHint: 'Skills and rules from ~/.dsh, ~/.agents, and built-in skills',
        scope: 'Scope',
        tabs: 'Item kinds',
        savedTo: 'Saved to {path}',
        noWorkspaces: 'No workspaces yet. Add one in the sidebar to manage its skills and rules.',
        skills: 'Skills',
        rules: 'Rules',
        noSkills: 'No skills here.',
        noRules: 'No rule files. Put .md files into {path}.',
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
      },
      ru: {
        nav: 'Loadout',
        title: 'Loadout',
        intro: 'Выберите, какие скиллы и правила берут с собой агенты. Изменения действуют со следующего шага агента и сохраняются в loadout.json.',
        global: 'Глобальные',
        globalHint: 'Скиллы и правила из ~/.dsh, ~/.agents и встроенные скиллы',
        scope: 'Область',
        tabs: 'Виды элементов',
        savedTo: 'Сохраняется в {path}',
        noWorkspaces: 'Workspace пока нет. Добавьте его в боковой панели, чтобы управлять его скиллами и правилами.',
        skills: 'Скиллы',
        rules: 'Правила',
        noSkills: 'Скиллов нет.',
        noRules: 'Файлов правил нет. Положите .md-файлы в {path}.',
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
      },
    }

    const CSS = `
.dshlo-page { --dshlo-inset: clamp(24px, 4vw, 48px); box-sizing: border-box; height: 100%; overflow-x: hidden; overflow-y: auto; display: flex; flex-direction: column; align-items: center; padding: 0 var(--dshlo-inset) 48px; color: var(--dsw-alias-label-primary); }
@media (max-width: 767px) { .dshlo-page { --dshlo-inset: 20px; } }
.dshlo-head { flex: none; width: 100%; max-width: 960px; box-sizing: border-box; padding-top: calc(28px + var(--dsh-frame-top-clearance, 0px)); padding-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.dshlo-head h1 { margin: 0; font-size: 20px; line-height: 28px; font-weight: 500; }
.dshlo { flex: none; width: 100%; max-width: 960px; display: flex; flex-direction: column; gap: 16px; padding-top: 16px; }
.dshlo-intro { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dshlo-mono { font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); overflow-wrap: anywhere; }
.dshlo-sub { display: flex; flex-direction: column; }
.dshlo-source { margin-top: 8px; }
.dshlo-row { padding: 10px 2px; border-bottom: 0.5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; gap: 8px; }
.dshlo-rowLine { display: flex; align-items: flex-start; gap: 12px; }
.dshlo-rowMain { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.dshlo-name { font-size: 13.5px; line-height: 20px; font-weight: 500; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.dshlo-row[data-state='off'] .dshlo-name, .dshlo-row[data-overridden='true'] .dshlo-name { color: var(--dsw-alias-label-secondary); }
.dshlo-desc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dshlo-badge { font-size: 11px; line-height: 16px; font-weight: 400; padding: 0 6px; border-radius: var(--dsw-radius-xs, 4px); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.dshlo-controls { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.dshlo-actions { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.dshlo-seg { display: inline-flex; padding: 2px; gap: 2px; border-radius: var(--dsw-radius-sm, 8px); border: 0.5px solid var(--dsw-alias-border-l2); }
.dshlo-seg button { font: inherit; font-size: 12px; line-height: 18px; padding: 1px 8px; border: 0.5px solid transparent; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dshlo-seg button[aria-checked='true'] { background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); border-color: var(--dsw-alias-border-selected, var(--dsw-alias-border-l2)); color: var(--dsw-alias-label-primary); }
.dshlo-seg button:disabled { cursor: default; opacity: 0.45; }
.dshlo-switch { box-sizing: border-box; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); cursor: pointer; flex-shrink: 0; }
.dshlo-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dshlo-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, #fff); transition: transform .12s ease; }
.dshlo-switch[aria-checked='true']::after { transform: translateX(16px); background: var(--dsw-alias-label-primary-foreground, #fff); }
.dshlo-switch:disabled { cursor: default; opacity: 0.45; }
.dshlo-btn { font: inherit; font-size: 12px; line-height: 18px; padding: 3px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dshlo-btn:disabled { cursor: default; opacity: 0.45; }
.dshlo-btn[data-tone='danger'] { color: var(--dsw-alias-state-error-primary); }
.dshlo-btn[data-tone='primary'] { background: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-label-primary-foreground, #fff); }
@media (hover: hover) {
  .dshlo-btn:not(:disabled):hover, .dshlo-seg button:not(:disabled):not([aria-checked='true']):hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
  .dshlo-btn[data-tone='danger']:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover-danger, var(--dsw-alias-bg-layer-2)); }
  .dshlo-btn[data-tone='primary']:not(:disabled):hover { background: var(--dsw-alias-state-error-primary); opacity: .9; }
}
.dshlo-page :is(button:not(.dshlo-tab), select):focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.dshlo-confirm { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlo-error { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dshlo-empty { font-size: 12px; line-height: 18px; padding: 8px 2px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dshlo-preview { margin: 0; max-height: 260px; overflow: auto; padding: 10px; border-radius: var(--dsw-radius-sm, 8px); background: var(--dsw-alias-bg-layer-2); font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
.dshlo-toolbar { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.dshlo-tabs { --dshlo-tabs-inset: 2px; position: relative; display: grid; align-self: flex-start; min-width: 280px; padding: var(--dshlo-tabs-inset); border-radius: calc(var(--dsw-radius-md, 12px) + var(--dshlo-tabs-inset)); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2)); }
.dshlo-tabIndicator { position: absolute; inset: var(--dshlo-tabs-inset) auto var(--dshlo-tabs-inset) var(--dshlo-tabs-inset); box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); border-radius: var(--dsw-radius-md, 12px); background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-1)); transition: transform .18s ease; pointer-events: none; }
.dshlo-tab { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 12px; border: 0; border-radius: var(--dsw-radius-md, 12px); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 14px; line-height: 20px; cursor: pointer; transition: color .18s ease; }
.dshlo-tab[aria-selected='true'] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dshlo-tab:focus-visible { outline: none; text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.dshlo-count { font-size: 12px; font-weight: 400; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
@media (hover: hover) { .dshlo-tab:hover { color: var(--dsw-alias-label-primary); } }
@media (prefers-reduced-motion: reduce) { .dshlo-tabIndicator, .dshlo-tab { transition: none; } }
.dshlo-tabpanel { display: flex; flex-direction: column; }
.dshlo-picker { box-sizing: border-box; height: 36px; max-width: 100%; padding: 0 10px; border-radius: var(--dsw-radius-sm, 8px); border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
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

      const control = kind === 'skill'
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
        'data-state': kind === 'skill' ? item.state : (item.enabled ? 'on' : 'off'),
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
        h('div', { className: 'dshlo-controls' }, control)),
      h('div', { className: 'dshlo-actions' },
        confirming
          ? h('div', { className: 'dshlo-confirm' },
            t('confirmDelete'),
            h('button', { type: 'button', className: 'dshlo-btn', onClick: () => setConfirming(false) }, t('cancel')),
            h('button', {
              type: 'button',
              className: 'dshlo-btn',
              'data-tone': 'primary',
              disabled: busy,
              onClick: () => run(async () => { await call('remove', { ...scope.body, path: deletePath }); setConfirming(false) }),
            }, t('confirm')))
          : [
            h('button', { key: 'open', type: 'button', className: 'dshlo-btn', onClick: onOpen }, preview === undefined ? t('open') : t('hide')),
            item.readOnly ? null : h('button', { key: 'delete', type: 'button', className: 'dshlo-btn', 'data-tone': 'danger', disabled: busy, onClick: () => setConfirming(true) }, t('delete')),
          ]),
      error !== undefined ? h('div', { className: 'dshlo-error', role: 'alert' }, error) : null,
      preview !== undefined
        ? h(React.Fragment, null,
          h('pre', { className: 'dshlo-preview' }, preview.text),
          preview.truncated ? h('div', { className: 'dshlo-empty' }, t('truncated')) : null)
        : null)
    }

    function Items({ t, kind, items, scope, locked, reload, emptyText }) {
      if (items.length === 0) return h('div', { className: 'dshlo-empty' }, emptyText)
      return groupBy(items, 'source').map(([source, group]) => h('div', { key: source, className: 'dshlo-sub' },
        h('div', { className: 'dshlo-mono dshlo-source' }, t(`source.${source}`)),
        group.map(item => h(Row, { key: item.file, t, item, kind, scope, locked, reload }))))
    }

    /** Item kinds shown as tabs; a new kind is one more entry here and one more list in the Host state. */
    const KINDS = [
      { id: 'skills', kind: 'skill', label: 'skills', empty: (t) => t('noSkills') },
      { id: 'rules', kind: 'rule', label: 'rules', empty: (t, hint) => t('noRules', { path: hint }) },
    ]

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

      return h('div', { className: 'dshlo-page' },
        h('style', null, CSS),
        h('header', { className: 'dshlo-head', 'data-window-drag': true },
          h('h1', null, t('title')),
          h('p', { className: 'dshlo-intro' }, t('intro'))),
        h('div', { className: 'dshlo' },
          h('div', { className: 'dshlo-toolbar' },
            h('select', {
              className: 'dshlo-picker',
              'aria-label': t('scope'),
              value: scopeValue,
              onChange: event => pickScope(event.target.value),
            },
            h('option', { value: GLOBAL }, t('global')),
            workspaces.map(item => h('option', { key: item.workspaceId ?? item.path, value: item.path }, `${item.title} – ${item.path}`))),
            h('div', { className: 'dshlo-mono' }, workspacePath === undefined ? t('globalHint') : (group?.projectRoot ?? workspacePath)),
            group !== undefined ? h('div', { className: 'dshlo-mono' }, t('savedTo', { path: group.loadoutPath })) : null,
            workspaces.length === 0 ? h('div', { className: 'dshlo-empty' }, t('noWorkspaces')) : null),
          h(Tabs, { t, value: tab, counts: group === undefined ? {} : { skills: group.skills.length, rules: group.rules.length }, onChange: pickTab }),
          h('div', { className: 'dshlo-tabpanel', role: 'tabpanel', id: 'dshlo-tabpanel', 'aria-labelledby': `dshlo-tab-${tab}` },
            error !== undefined
              ? h('div', { className: 'dshlo-error', role: 'alert' }, error, ' ', h('button', { type: 'button', className: 'dshlo-btn', onClick: () => void reload() }, t('retry')))
              : null,
            group === undefined && error === undefined ? h('div', { className: 'dshlo-empty' }, t('loading')) : null,
            locked ? h('div', { className: 'dshlo-error', role: 'alert' }, t('malformed', { path: group.loadoutPath, error: group.error })) : null,
            group !== undefined
              ? h(Items, { key: `${scopeValue}:${tab}`, t, kind: kind.kind, items: group[kind.id], scope, locked, reload, emptyText: kind.empty(t, rulesHint) })
              : null)))
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

/* dsh-loadout Client half: the Loadout page in the left sidebar panel list. Classic script for the DSH module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-loadout',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const NS = 'loadout'
    const PANEL_ID = 'loadout'
    const WORKSPACE_KEY = 'dsh-loadout.workspace'

    const DICT = {
      en: {
        nav: 'Loadout',
        title: 'Loadout',
        intro: 'Choose which skills and rules agents carry. Changes apply from the next agent step and are saved to loadout.json.',
        global: 'Global',
        workspace: 'Workspace',
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
        workspace: 'Workspace',
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
.dshlo { flex: none; width: 100%; max-width: 960px; display: flex; flex-direction: column; gap: 24px; padding-top: 16px; }
.dshlo-intro { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dshlo-group { display: flex; flex-direction: column; gap: 10px; border-top: 0.5px solid var(--dsw-alias-border-l2); padding-top: 20px; }
.dshlo-group:first-of-type { border-top: 0; padding-top: 0; }
.dshlo-groupHead { display: flex; flex-direction: column; gap: 2px; }
.dshlo-groupTitle { font-size: 14px; line-height: 22px; font-weight: 500; }
.dshlo-mono { font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 11.5px; line-height: 16px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); overflow-wrap: anywhere; }
.dshlo-sub { display: flex; flex-direction: column; }
.dshlo-subTitle { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-secondary); margin-top: 6px; }
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
.dshlo-page :is(button, select):focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.dshlo-confirm { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlo-error { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dshlo-empty { font-size: 12px; line-height: 18px; padding: 8px 2px; color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary)); }
.dshlo-preview { margin: 0; max-height: 260px; overflow: auto; padding: 10px; border-radius: var(--dsw-radius-sm, 8px); background: var(--dsw-alias-bg-layer-2); font-family: var(--ds-font-family-code, ui-monospace, monospace); font-size: 12px; line-height: 18px; white-space: pre-wrap; overflow-wrap: anywhere; }
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

    function readStoredWorkspace() {
      try {
        return window.localStorage.getItem(WORKSPACE_KEY) ?? undefined
      } catch {
        return undefined
      }
    }

    function storeWorkspace(path) {
      try {
        window.localStorage.setItem(WORKSPACE_KEY, path)
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

    function Group({ t, title, header, group, scope, reload, rulesHint }) {
      const locked = group.error !== undefined
      return h('section', { className: 'dshlo-group' },
        h('div', { className: 'dshlo-groupHead' },
          h('div', { className: 'dshlo-groupTitle' }, title),
          header,
          h('div', { className: 'dshlo-mono' }, t('savedTo', { path: group.loadoutPath }))),
        locked ? h('div', { className: 'dshlo-error', role: 'alert' }, t('malformed', { path: group.loadoutPath, error: group.error })) : null,
        h('div', { className: 'dshlo-subTitle' }, t('skills')),
        h(Items, { t, kind: 'skill', items: group.skills, scope, locked, reload, emptyText: t('noSkills') }),
        h('div', { className: 'dshlo-subTitle' }, t('rules')),
        h(Items, { t, kind: 'rule', items: group.rules, scope, locked, reload, emptyText: t('noRules', { path: rulesHint }) }))
    }

    const noWorkspaces = () => []

    function LoadoutPage(props) {
      const { t } = props
      const useWorkspaces = props.useWorkspaces ?? noWorkspaces
      const items = useWorkspaces(snapshot => snapshot.items) ?? []
      const [chosen, setChosen] = useState(readStoredWorkspace)
      const workspacePath = items.some(item => item.path === chosen) ? chosen : items[0]?.path
      const [data, setData] = useState(undefined)
      const [error, setError] = useState(undefined)

      const reload = useCallback(async () => {
        try {
          setData(await call('state', workspacePath === undefined ? {} : { workspacePath }))
          setError(undefined)
        } catch (failure) {
          setError(failure.message)
        }
      }, [workspacePath])

      useEffect(() => { void reload() }, [reload])

      const pick = (path) => {
        setChosen(path)
        storeWorkspace(path)
      }

      return h('div', { className: 'dshlo-page' },
        h('style', null, CSS),
        h('header', { className: 'dshlo-head', 'data-window-drag': true },
          h('h1', null, t('title')),
          h('p', { className: 'dshlo-intro' }, t('intro'))),
        h('div', { className: 'dshlo' },
        error !== undefined
          ? h('div', { className: 'dshlo-error', role: 'alert' }, error, ' ', h('button', { type: 'button', className: 'dshlo-btn', onClick: () => void reload() }, t('retry')))
          : null,
        data === undefined && error === undefined ? h('div', { className: 'dshlo-empty' }, t('loading')) : null,
        data !== undefined
          ? h(Group, { t, title: t('global'), group: data.global, scope: { level: 'global', body: {} }, reload, rulesHint: '~/.agents/rules' })
          : null,
        items.length === 0
          ? h('section', { className: 'dshlo-group' },
            h('div', { className: 'dshlo-groupTitle' }, t('workspace')),
            h('div', { className: 'dshlo-empty' }, t('noWorkspaces')))
          : data?.workspace !== undefined
            ? h(Group, {
              t,
              title: t('workspace'),
              header: h('select', {
                className: 'dshlo-picker',
                'aria-label': t('workspace'),
                value: workspacePath,
                onChange: event => pick(event.target.value),
              }, items.map(item => h('option', { key: item.workspaceId ?? item.path, value: item.path }, `${item.title} – ${item.path}`))),
              group: data.workspace,
              scope: { level: 'project', body: { workspacePath } },
              reload,
              rulesHint: `${data.workspace.projectRoot}/.agents/rules`,
            })
            : null))
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

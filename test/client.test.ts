/**
 * The built client bundle, loaded the way the DSH module loader loads it:
 * a classic script calling `window.__ModuleLoader__.load({ id, factory })`,
 * whose factory gets `require` for the shell's module table. The page then
 * renders with real React into jsdom against a fake Host. Run `npm run
 * build` first (`npm test` does).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import type { ComponentType } from 'react'
import type { IndexView, Requests, StateView } from '../src/shared/api.ts'
import { en } from '../src/client/locale.ts'

const require = createRequire(import.meta.url)
const BUNDLE = new URL('../lib/client.js', import.meta.url)

interface Registration {
  id: string
  factory(require: (name: string) => unknown): { inject: string[], apply(ctx: unknown): void }
}

function loadBundle() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1/app/' })
  const window = dom.window as unknown as Window & typeof globalThis & { __ModuleLoader__: { load(r: Registration): void } }
  Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })
  let registration: Registration | undefined
  window.__ModuleLoader__ = { load: (r) => { registration = r } }
  window.eval(readFileSync(BUNDLE, 'utf8'))
  assert.ok(registration, 'the bundle registers itself through __ModuleLoader__.load')
  const shellModules: Record<string, unknown> = { 'react': require('react'), 'react/jsx-runtime': require('react/jsx-runtime') }
  const plugin = registration.factory((name) => {
    if (!(name in shellModules)) throw new Error(`module "${name}" is not in the shell module table`)
    return shellModules[name]
  })
  return { window, registration, plugin }
}

const indexView: IndexView = {
  sourcesPath: '/home/me/.agents/loadout-indexes.json',
  sources: [{ source: 'owner/repo', kind: 'git', title: 'Team skills', fetchedAt: 1, itemCount: 2 }],
  entries: [
    { source: 'owner/repo', kind: 'skill', name: 'tdd', description: 'Test first', version: '1.0.0', tags: ['testing'], installs: [] },
    { source: 'owner/repo', kind: 'rule', name: 'style', description: 'Short functions', tags: [], installs: [] },
  ],
}

function fakeHost(window: Window, state: (body: Requests['state']) => StateView, index: IndexView = indexView, values: Record<string, unknown> = {}) {
  const calls: Array<[string, unknown]> = []
  // In a browser `window` is `globalThis`; here the bundle reads the global, so replace both.
  globalThis.fetch = window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const op = String(url).split('/').pop() ?? ''
    const body = JSON.parse(String(init?.body ?? '{}')) as Requests['state']
    calls.push([op, body])
    const value = op in values ? values[op]
      : op === 'state' ? state(body)
      : op === 'index-refresh' || op === 'index-state' ? index
      : op === 'index-install' ? { source: 'owner/repo', kind: 'skill', name: 'tdd', level: 'global', path: '/home/me/.agents/skills/tdd', action: 'installed' }
      : op === 'mcp-probe' ? { ok: true, serverName: 'mcp-servers/everything', serverVersion: '1.0.0', tools: ['echo', 'add'], truncated: false, durationMs: 120 }
      : { ok: true }
    return new Response(JSON.stringify({ ok: true, value }), { headers: { 'content-type': 'application/json' } })
  }
  return calls
}

const level = (root: string) => ({
  loadoutPath: `${root}/loadout.json`,
  skills: [{ name: 'tdd', description: 'Test first', version: '3.0.0', source: 'user-agents' as const, state: 'manual' as const, fileManual: false, readOnly: false, file: `${root}/skills/tdd/SKILL.md`, entry: `${root}/skills/tdd` }],
  rules: [{ id: 'agents/style', name: 'style', source: 'agents' as const, enabled: true, file: `${root}/rules/style.md` }],
  instructions: [{ name: 'AGENTS.md', location: 'agents', file: `${root}/AGENTS.md` }],
  mcp: [
    {
      name: 'everything', source: 'profile' as const, transport: 'stdio' as const, endpoint: 'npx -y @modelcontextprotocol/server-everything', enabled: true,
      status: { state: 'connected' as const, toolCount: 2 },
      tools: [{ name: 'mcp__everything__echo', title: 'echo', description: 'Echo back' }, { name: 'mcp__everything__add', title: 'add', description: 'Add numbers' }],
    },
    { name: 'docs', source: 'plugin' as const, enabled: true, status: { state: 'failed' as const, reason: 'gave-up', error: 'ECONNREFUSED' }, tools: [] },
  ],
})

test('the bundle registers as dsh-loadout-manager and needs only React from the shell', () => {
  const { registration, plugin } = loadBundle()
  assert.equal(registration.id, 'dsh-loadout-manager')
  assert.deepEqual(plugin.inject, ['slots', 'locale'])
  const style = document.querySelector('style[data-plugin="dsh-loadout-manager"]')
  assert.ok(style?.textContent?.includes('--dsw-alias-'), 'styles are injected as one tagged <style> and use theme tokens')
})

test('apply registers the locale, the main panel, and the sidebar entry', () => {
  const { plugin } = loadBundle()
  const locales: string[] = []
  const slots: Array<{ name: string, id?: string, key?: string, order?: number, label?: string }> = []
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: (ns: string, locale: string) => { locales.push(`${ns}:${locale}`); return () => {} }, bind: () => (key: string) => key },
    slots: {
      inject: (_name: string, f: () => unknown) => f(),
      register: (options: { name: string, id?: string, key?: string, order?: number, label?: () => string }) => {
        slots.push({ name: options.name, id: options.id, key: options.key, order: options.order, label: options.label?.() })
      },
    },
  })
  assert.deepEqual(locales, ['loadout:en', 'loadout:ru', 'loadout:zh'])
  assert.deepEqual(slots, [
    { name: 'main', id: undefined, key: 'loadout', order: undefined, label: undefined },
    { name: 'sidebar.panellist', id: 'loadout', key: undefined, order: 20, label: 'nav' },
    { name: 'plugins.row.config', id: undefined, key: 'dsh-loadout-manager#loadout', order: undefined, label: undefined },
  ])
})

test('the plugin configuration page switches autoUpdate through the Host form', async () => {
  const { plugin } = loadBundle()
  let Config: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: {
      inject: (_n: string, f: () => unknown) => f(),
      register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'plugins.row.config') Config = c },
    },
  })
  assert.ok(Config)

  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en) => en[key]
  const writes: Array<[unknown, unknown]> = []
  const form = {
    state: { status: 'ready' as const, value: { autoUpdate: false }, revision: 7, writable: true },
    mutate: async (ops: unknown, revision?: number) => { writes.push([ops, revision]); return true },
  }
  const root = createRoot(document.getElementById('root')!)
  const settle = (): Promise<void> => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

  // The summary view is a one-liner for a row without its own description.
  await act(async () => { root.render(React.createElement(Config!, { view: 'summary', form, t })) })
  assert.equal(document.querySelector('[role=switch]'), null)
  assert.ok(document.body.textContent?.includes(en['config.autoUpdate.title']))

  await act(async () => { root.render(React.createElement(Config!, { view: 'page', form, t })) })
  const toggle = document.querySelector('[role=switch]') as HTMLButtonElement
  assert.equal(toggle.getAttribute('aria-checked'), 'false')
  await act(async () => { toggle.click() })
  await settle()
  assert.deepEqual(writes, [[[{ op: 'set', path: ['autoUpdate'], value: true }], 7]])
  await act(async () => { root.unmount() })
})

test('the page switches tabs and scope and asks the Host for the chosen workspace', async () => {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const calls = fakeHost(window, body => body.workspacePath === undefined
    ? { global: level('/home/me/.agents') }
    : { global: level('/home/me/.agents'), workspace: { path: body.workspacePath, projectRoot: body.workspacePath, ...level(`${body.workspacePath}/.agents`) } })
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  assert.ok(Page)
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  // React 18, as in the DSH shell: act lives in react-dom/test-utils.
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const workspaces = [{ workspaceId: 'w1', path: '/work/repo', title: 'repo' }]
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const tabs = () => [...document.querySelectorAll('[role=tab]')].map(tab => `${tab.textContent}${tab.getAttribute('aria-selected') === 'true' ? '*' : ''}`)
  const names = () => [...document.querySelectorAll('h3')].map(h => h.textContent)

  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: (select: (s: { items: typeof workspaces }) => unknown) => select({ items: workspaces }) })) })
  await settle()
  assert.deepEqual(tabs(), ['Skills1*', 'Instructions2', 'MCP2'])
  assert.deepEqual(names(), ['~/.agents/skills'])
  const version = document.querySelector('[title="Version 3.0.0"]')
  assert.equal(version?.textContent, 'v3.0.0', 'the skill row shows its frontmatter version')

  await act(async () => { (document.getElementById('dshlo-tab-rules') as HTMLButtonElement).click() })
  assert.deepEqual(tabs(), ['Skills1', 'Instructions2*', 'MCP2'])
  assert.deepEqual([...document.querySelectorAll('h2')].map(h => h.textContent), ['Instruction files', 'Rules'])
  assert.ok(document.body.textContent?.includes('Always loaded'))

  const select = document.querySelector('select')!
  await act(async () => {
    select.value = '/work/repo'
    select.dispatchEvent(new window.Event('change', { bubbles: true }))
  })
  await settle()
  assert.deepEqual(calls.map(([op, body]) => [op, body]), [['state', {}], ['state', { workspacePath: '/work/repo' }]])
  assert.equal(window.localStorage.getItem('dsh-loadout-manager.scope'), '/work/repo')
  assert.ok(document.body.textContent?.includes('/work/repo/.agents/loadout.json'))

  await act(async () => { (document.getElementById('dshlo-tab-mcp') as HTMLButtonElement).click() })
  const text = () => document.body.textContent ?? ''
  assert.deepEqual(names(), ['Profile servers', 'From plugins'])
  assert.ok(text().includes('Connected, tools: 2') && text().includes('ECONNREFUSED'))
  assert.ok(text().includes('hides or shows a server\'s tools for agents in this workspace'), 'the workspace note explains hiding')
  const button = (label: string) => [...document.querySelectorAll('button')].find(b => b.textContent === label)!
  await act(async () => { button('Tools (2)').click() })
  assert.ok(text().includes('echo') && text().includes('Add numbers'))
  await act(async () => { button('Check').click() })
  await settle()
  assert.ok(text().includes('mcp-servers/everything 1.0.0 answered in 120 ms, tools: 2'))
  const switches = [...document.querySelectorAll('[role=switch]')] as HTMLButtonElement[]
  assert.equal(switches.length, 2)
  await act(async () => { switches[0]!.click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op.startsWith('mcp-')), [
    ['mcp-probe', { name: 'everything' }],
    ['mcp-set', { workspacePath: '/work/repo', name: 'everything', enabled: false }],
  ])
  await act(async () => { root.unmount() })
})

test('the catalog subpage lists indexed skills and installs one into the current scope', async () => {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const calls = fakeHost(window, () => ({ global: level('/home/me/.agents') }))
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const text = () => document.body.textContent ?? ''
  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: () => [] })) })
  await settle()

  await act(async () => { (document.getElementById('dshlo-open-catalog') as HTMLButtonElement).click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op.startsWith('index-')).map(([op]) => op), ['index-refresh'])
  assert.ok(text().includes('Team skills') && text().includes('tdd') && text().includes('Test first'))
  assert.ok(text().includes('Install'))

  const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!
  await act(async () => { button('Install').click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op === 'index-install'), [
    ['index-install', { source: 'owner/repo', kind: 'skill', name: 'tdd', force: false }],
  ])
  assert.deepEqual(calls.filter(([op]) => op === 'index-state').length, 1)
  assert.ok(document.querySelector('nav[aria-label="Breadcrumbs"]'), 'the catalog page has breadcrumbs')
  assert.equal(document.querySelectorAll('[role=tab]').length, 0, 'the catalog subpage has no kind tabs')
  await act(async () => { (document.getElementById('dshlo-back') as HTMLButtonElement).click() })
  await settle()
  assert.equal(document.querySelectorAll('[role=tab]').length, 3, 'Back returns to the loadout tabs')
  await act(async () => { root.unmount() })
})

test('the catalog subpage removes an installed copy after confirmation', async () => {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const installed: IndexView = {
    ...indexView,
    entries: [{
      ...indexView.entries[0]!,
      installs: [{ level: 'global', version: '1.0.0', installedAt: 1, updateAvailable: false, modified: false, foreign: false, unmanaged: false, installedFrom: 'owner/repo', path: '/home/me/.agents/skills/tdd' }],
    }],
  }
  const movedTo = '/home/me/.dsh/.trash/2026-11-27T10-15-00/tdd'
  const calls = fakeHost(window, () => ({ global: level('/home/me/.agents') }), installed, { remove: { path: '/home/me/.agents/skills/tdd', trashed: true, movedTo } })
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const text = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!
  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: () => [] })) })
  await settle()
  await act(async () => { (document.getElementById('dshlo-open-catalog') as HTMLButtonElement).click() })
  await settle()

  const remove = document.querySelector('button[aria-label="Delete"]') as HTMLButtonElement
  assert.ok(remove, 'an installed entry has a delete button')
  await act(async () => { remove.click() })
  assert.ok(text().includes('Move to the trash?'))
  assert.equal(calls.filter(([op]) => op === 'remove').length, 0, 'removal waits for confirmation')

  await act(async () => { button('Move to trash').click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op === 'remove'), [['remove', { path: '/home/me/.agents/skills/tdd' }]])
  assert.deepEqual(calls.filter(([op]) => op === 'index-state').length, 1)
  assert.ok(text().includes(`The system trash is unavailable, so tdd was moved to ${movedTo}.`), 'the row says where the copy went')
  await act(async () => { root.unmount() })
})

test('a skill deleted without the system trash leaves a notice with its new path', async () => {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const movedTo = '/home/me/.dsh/.trash/2026-11-27T10-15-00/tdd'
  const calls = fakeHost(window, () => ({ global: level('/home/me/.agents') }), indexView, { remove: { path: '/home/me/.agents/skills/tdd', trashed: true, movedTo } })
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const text = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!
  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: () => [] })) })
  await settle()

  await act(async () => { (document.querySelector('button[aria-label="Delete"]') as HTMLButtonElement).click() })
  await act(async () => { button('Move to trash').click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op === 'remove'), [['remove', { path: '/home/me/.agents/skills/tdd' }]])
  const notice = document.querySelector('[role="status"]')
  assert.equal(notice?.textContent?.includes(`The system trash is unavailable, so tdd was moved to ${movedTo}.`), true, 'the notice outlives the deleted row')

  await act(async () => { button('Dismiss').click() })
  assert.equal(text().includes(movedTo), false)
  await act(async () => { root.unmount() })
})

test('a locally changed update asks for confirmation before replacing the copy', async () => {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const changed: IndexView = {
    ...indexView,
    entries: [{
      ...indexView.entries[0]!,
      installs: [{ level: 'global', version: '0.9.0', installedAt: 1, updateAvailable: true, modified: true, foreign: false, unmanaged: false, installedFrom: 'owner/repo', path: '/home/me/.agents/skills/tdd' }],
    }],
  }
  const calls = fakeHost(window, () => ({ global: level('/home/me/.agents') }), changed)
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  const text = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!
  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: () => [] })) })
  await settle()
  await act(async () => { (document.getElementById('dshlo-open-catalog') as HTMLButtonElement).click() })
  await settle()
  await act(async () => { button('Update').click() })
  assert.ok(text().includes('This copy has local changes. Updating replaces them.'))
  assert.equal(calls.filter(([op]) => op === 'index-install').length, 0)
  await act(async () => { button('Replace and update').click() })
  await settle()
  assert.deepEqual(calls.filter(([op]) => op === 'index-install'), [
    ['index-install', { source: 'owner/repo', kind: 'skill', name: 'tdd', force: true }],
  ])
  await act(async () => { root.unmount() })
})

/** Render the page with `index`, open the Catalog subpage, and return helpers to drive it. */
async function openCatalog(index: IndexView) {
  const { window, plugin } = loadBundle()
  window.localStorage.clear()
  const calls = fakeHost(window, () => ({ global: level('/home/me/.agents') }), index)
  let Page: ComponentType<Record<string, unknown>> | undefined
  plugin.apply({
    effect: (f: () => unknown) => f(),
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_n: string, f: () => unknown) => f(), register: (o: { name: string }, c: ComponentType<Record<string, unknown>>) => { if (o.name === 'main') Page = c } },
  })
  const React = require('react') as typeof import('react')
  const { createRoot } = require('react-dom/client') as typeof import('react-dom/client')
  const { act } = require('react-dom/test-utils') as { act(callback: () => Promise<void>): Promise<void> }
  const t = (key: keyof typeof en, params?: Record<string, unknown>) => en[key].replace(/\{(\w+)\}/g, (_m, name: string) => String(params?.[name] ?? ''))
  const root = createRoot(document.getElementById('root')!)
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  await act(async () => { root.render(React.createElement(Page!, { t, useWorkspaces: () => [] })) })
  await settle()
  await act(async () => { (document.getElementById('dshlo-open-catalog') as HTMLButtonElement).click() })
  await settle()
  return {
    calls,
    act,
    settle,
    text: () => document.body.textContent ?? '',
    button: (label: string) => [...document.querySelectorAll('button')].find(item => item.textContent === label)!,
    confirmButton: () => document.querySelector('button[data-tone="dangerText"]') as HTMLButtonElement,
    unmount: () => act(async () => { root.unmount() }),
  }
}

test('a same-named skill that no index installed is replaced only after confirmation', async () => {
  const page = await openCatalog({
    ...indexView,
    entries: [{
      ...indexView.entries[0]!,
      installs: [{ level: 'global', updateAvailable: false, modified: false, foreign: false, unmanaged: true, path: '/home/me/.agents/skills/tdd' }],
    }],
  })
  assert.ok(page.text().includes('Same name, not from an index'))
  assert.equal(document.querySelector('button[aria-label="Delete"]'), null, 'the page does not offer to delete a copy it did not install')
  await page.act(async () => { page.button('Replace').click() })
  assert.ok(page.text().includes('/home/me/.agents/skills/tdd already exists and was not installed from an index.'))
  assert.equal(page.calls.filter(([op]) => op === 'index-install').length, 0, 'nothing is replaced before the confirmation')
  await page.act(async () => { page.confirmButton().click() })
  await page.settle()
  assert.deepEqual(page.calls.filter(([op]) => op === 'index-install'), [
    ['index-install', { source: 'owner/repo', kind: 'skill', name: 'tdd', force: true }],
  ])
  await page.unmount()
})

test('a copy from another index names that index and is replaced only after confirmation', async () => {
  const page = await openCatalog({
    ...indexView,
    sources: [...indexView.sources, { source: 'other/repo', kind: 'git', title: 'Other skills', fetchedAt: 1, itemCount: 1 }],
    entries: [{
      ...indexView.entries[0]!,
      installs: [{
        level: 'global', version: '2.0.0', installedAt: 1, updateAvailable: false, modified: false, foreign: true, unmanaged: false,
        installedFrom: 'other/repo', path: '/home/me/.agents/skills/tdd',
      }],
    }],
  })
  assert.ok(page.text().includes('Installed from Other skills'))
  assert.ok(!page.text().includes('Installed globally'), 'the copy is not shown as installed from this index')
  await page.act(async () => { page.button('Replace').click() })
  assert.ok(page.text().includes('This copy was installed from Other skills.'))
  assert.equal(page.calls.filter(([op]) => op === 'index-install').length, 0)
  await page.act(async () => { page.confirmButton().click() })
  await page.settle()
  assert.deepEqual(page.calls.filter(([op]) => op === 'index-install'), [
    ['index-install', { source: 'owner/repo', kind: 'skill', name: 'tdd', force: true }],
  ])
  await page.unmount()
})

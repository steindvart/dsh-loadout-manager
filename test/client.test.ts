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

function fakeHost(window: Window, state: (body: Requests['state']) => StateView, index: IndexView = indexView) {
  const calls: Array<[string, unknown]> = []
  // In a browser `window` is `globalThis`; here the bundle reads the global, so replace both.
  globalThis.fetch = window.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const op = String(url).split('/').pop() ?? ''
    const body = JSON.parse(String(init?.body ?? '{}')) as Requests['state']
    calls.push([op, body])
    const value = op === 'state' ? state(body)
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
  ])
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
  assert.deepEqual(tabs(), ['Skills1*', 'Catalog', 'Instructions2', 'MCP2'])
  assert.deepEqual(names(), ['~/.agents/skills'])
  const version = document.querySelector('[title="Version 3.0.0"]')
  assert.equal(version?.textContent, 'v3.0.0', 'the skill row shows its frontmatter version')

  await act(async () => { (document.getElementById('dshlo-tab-rules') as HTMLButtonElement).click() })
  assert.deepEqual(tabs(), ['Skills1', 'Catalog', 'Instructions2*', 'MCP2'])
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

test('the catalog tab lists indexed skills and installs one into the current scope', async () => {
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

  await act(async () => { (document.getElementById('dshlo-tab-catalog') as HTMLButtonElement).click() })
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
  await act(async () => { root.unmount() })
})

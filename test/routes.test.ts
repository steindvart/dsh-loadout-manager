import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { registerRoutes } from '../src/host/routes.ts'
import type { Operations } from '../src/host/operations.ts'

function routesFor(calls: Array<[string, unknown]>): ConnectionFetchRoute[] {
  const routes: ConnectionFetchRoute[] = []
  const operations = new Proxy({}, {
    get: (_target, operation) => async (body: unknown) => {
      calls.push([String(operation), body])
      return { operation: String(operation) }
    },
  }) as unknown as Operations
  const ctx = {
    inject: (_deps: string[], callback: (scoped: unknown) => void) => {
      callback({
        effect: (register: () => unknown) => register(),
        connection: {
          fetch: {
            register: (route: ConnectionFetchRoute) => {
              routes.push(route)
              return async () => {}
            },
          },
        },
      })
    },
  } as unknown as Context
  registerRoutes(ctx, operations)
  return routes
}

async function call(routes: ConnectionFetchRoute[], op: string, body: unknown): Promise<unknown> {
  const route = routes.find(item => item.path === `/api/dsh-loadout-manager/${op}`)
  assert.ok(route, `route ${op} is registered`)
  const response = await route.fetch(new Request(`http://127.0.0.1/api/dsh-loadout-manager/${op}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
  assert.equal(response.headers.get('cache-control'), 'no-store')
  return await response.json()
}

test('registers one owner route per contract operation and validates index bodies', async () => {
  const calls: Array<[string, unknown]> = []
  const routes = routesFor(calls)
  assert.deepEqual(routes.map(route => route.path).sort(), [
    '/api/dsh-loadout-manager/index-add-source',
    '/api/dsh-loadout-manager/index-install',
    '/api/dsh-loadout-manager/index-refresh',
    '/api/dsh-loadout-manager/index-remove-source',
    '/api/dsh-loadout-manager/index-state',
    '/api/dsh-loadout-manager/mcp-probe',
    '/api/dsh-loadout-manager/mcp-restart',
    '/api/dsh-loadout-manager/mcp-set',
    '/api/dsh-loadout-manager/read',
    '/api/dsh-loadout-manager/remove',
    '/api/dsh-loadout-manager/set-rule',
    '/api/dsh-loadout-manager/set-skill',
    '/api/dsh-loadout-manager/state',
  ])

  const install = await call(routes, 'index-install', { workspacePath: '/work/repo', source: 'owner/repo', kind: 'skill', name: 'tdd', force: true })
  assert.deepEqual(install, { ok: true, value: { operation: 'indexInstall' } })
  assert.deepEqual(calls.at(0), ['indexInstall', { workspacePath: '/work/repo', source: 'owner/repo', kind: 'skill', name: 'tdd', force: true }])

  const refresh = await call(routes, 'index-refresh', { ifStale: true })
  assert.deepEqual(refresh, { ok: true, value: { operation: 'indexRefresh' } })
  assert.deepEqual(calls.at(1), ['indexRefresh', { workspacePath: undefined, source: undefined, ifStale: true }])

  const bad = await call(routes, 'index-install', { source: 'owner/repo', kind: 'mcp', name: 'tdd' })
  assert.deepEqual(bad, { ok: false, error: { code: 'dsh-loadout-manager/bad-request', message: 'kind must be "skill" or "rule"' } })
  assert.equal(calls.length, 2, 'a rejected body never reaches the operation')
})

test('an empty body is an empty request, and a non-object body is rejected', async () => {
  const emptyCalls: Array<[string, unknown]> = []
  const emptyRoutes = routesFor(emptyCalls)
  const emptyRoute = emptyRoutes.find(item => item.path === '/api/dsh-loadout-manager/index-state')!
  const empty = await emptyRoute.fetch(new Request('http://127.0.0.1/api/dsh-loadout-manager/index-state', { method: 'POST' }))
  assert.deepEqual(await empty.json(), { ok: true, value: { operation: 'indexState' } })
  assert.deepEqual(emptyCalls, [['indexState', { workspacePath: undefined }]])

  const calls: Array<[string, unknown]> = []
  const routes = routesFor(calls)
  const route = routes.find(item => item.path === '/api/dsh-loadout-manager/index-state')!
  const response = await route.fetch(new Request('http://127.0.0.1/api/dsh-loadout-manager/index-state', { method: 'POST', body: '[]' }))
  const body = await response.json() as { ok: boolean, error: { code: string } }
  assert.equal(body.ok, false)
  assert.equal(body.error.code, 'dsh-loadout-manager/bad-request')
  assert.equal(calls.length, 0)
})

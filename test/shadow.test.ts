import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '@deepseek-ai/cordis'
import { registerShadows } from '../src/host/shadow.ts'

type Listener = (...args: any[]) => unknown

/** Minimal Cordis-like context: services are reachable only through `get()`, as without `inject`. */
function fakeCtx(services: Record<string, unknown>) {
  const listeners: Record<string, Listener> = {}
  const target: Record<string | symbol, unknown> = {
    on: (name: string, fn: Listener) => { listeners[name] = fn },
    effect: () => {},
    get: (name: string) => services[name],
    logger: { warn() {} },
  }
  const ctx = new Proxy(target, {
    get(object, prop) {
      if (prop in object) return object[prop]
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  }) as unknown as Context
  return { ctx, listeners }
}

const homes = { dshHome: '/nonexistent/dsh', agentsHome: '/nonexistent/agents' }

test('registers the shadow provider through agent.ctx.get("skills")', async () => {
  const registered: string[] = []
  const { ctx, listeners } = fakeCtx({ skills: {}, agents: { list: () => [] } })
  registerShadows(ctx, homes)
  const agentCtx = fakeCtx({
    skills: { registerProvider: (create: (control: unknown) => { name: string }) => { registered.push(create({ invalidate() {} }).name); return () => {} } },
  }).ctx
  await listeners['agent/created']?.({ agent: { ctx: agentCtx } })
  assert.deepEqual(registered, ['dsh-loadout'])
})

test('a failing registration never breaks agent creation', async () => {
  const { ctx, listeners } = fakeCtx({ skills: {}, agents: { list: () => [] } })
  registerShadows(ctx, homes)
  const agentCtx = fakeCtx({ skills: { registerProvider: () => { throw new Error('boom') } } }).ctx
  await assert.doesNotReject(async () => listeners['agent/created']?.({ agent: { ctx: agentCtx } }))
})

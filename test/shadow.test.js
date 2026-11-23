import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerShadows } from '../src/host/shadow.js'

/** Minimal Cordis-like context: services are reachable only through `get()`. */
function fakeCtx(services) {
  const listeners = {}
  const ctx = new Proxy({
    on: (name, fn) => { listeners[name] = fn },
    effect: () => {},
    get: name => services[name],
    logger: { warn() {} },
  }, {
    get(target, prop) {
      if (prop in target) return target[prop]
      throw new Error(`cannot get property "${String(prop)}" without inject`)
    },
  })
  return { ctx, listeners }
}

test('registers the shadow provider through agent.ctx.get("skills")', async () => {
  const registered = []
  const { ctx, listeners } = fakeCtx({ skills: {}, agents: { list: () => [] } })
  registerShadows(ctx, { dshHome: '/nonexistent/dsh', agentsHome: '/nonexistent/agents' })
  const agentCtx = fakeCtx({ skills: { registerProvider: (create) => { registered.push(create({ invalidate() {} }).name); return () => {} } } }).ctx
  await listeners['agent/created']({ agent: { ctx: agentCtx } })
  assert.deepEqual(registered, ['dsh-loadout'])
})

test('a failing registration never breaks agent creation', async () => {
  const { ctx, listeners } = fakeCtx({ skills: {}, agents: { list: () => [] } })
  registerShadows(ctx, { dshHome: '/nonexistent/dsh', agentsHome: '/nonexistent/agents' })
  const agentCtx = fakeCtx({ skills: { registerProvider: () => { throw new Error('boom') } } }).ctx
  await assert.doesNotReject(async () => listeners['agent/created']({ agent: { ctx: agentCtx } }))
})

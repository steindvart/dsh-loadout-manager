/**
 * Owner-only Fetch routes for the settings page:
 * `POST /api/dsh-loadout/<op>` with a JSON body, answering
 * `{ ok: true, value }` or `{ ok: false, error: { code, message } }`.
 */

import { OperationError } from './operations.ts'

export function registerRoutes(ctx, operations) {
  const handlers = {
    'state': body => operations.state({ workspacePath: optionalString(body.workspacePath) }),
    'set-skill': body => operations.setSkill({
      workspacePath: optionalString(body.workspacePath),
      name: requiredString(body.name, 'name'),
      state: body.state,
      level: body.level === 'global' || body.level === 'project' ? body.level : undefined,
    }),
    'set-rule': body => operations.setRule({ workspacePath: optionalString(body.workspacePath), id: requiredString(body.id, 'id'), enabled: body.enabled }),
    'remove': body => operations.remove({ workspacePath: optionalString(body.workspacePath), path: requiredString(body.path, 'path') }),
    'read': body => operations.read({ workspacePath: optionalString(body.workspacePath), path: requiredString(body.path, 'path') }),
  }
  ctx.inject(['connection'], (scoped) => {
    for (const [op, handler] of Object.entries(handlers)) {
      scoped.effect(() => scoped.connection.fetch.register({
        path: `/api/dsh-loadout/${op}`,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: request => respond(request, handler),
      }), `dsh-loadout: /api/dsh-loadout/${op}`)
    }
  })
}

async function respond(request, handler) {
  let body
  try {
    const text = await request.text()
    body = text === '' ? {} : JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('body must be a JSON object')
  } catch (error) {
    return json({ ok: false, error: { code: 'dsh-loadout/bad-request', message: error.message } })
  }
  try {
    return json({ ok: true, value: await handler(body) })
  } catch (error) {
    const code = error instanceof OperationError ? `dsh-loadout/${error.code}` : 'dsh-loadout/failed'
    return json({ ok: false, error: { code, message: error?.message ?? String(error) } })
  }
}

function json(value) {
  return Response.json(value, { headers: { 'cache-control': 'no-store' } })
}

function optionalString(value) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function requiredString(value, name) {
  if (typeof value !== 'string' || value === '') throw new OperationError('bad-request', `${name} is required`)
  return value
}

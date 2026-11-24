/**
 * Owner-only Fetch routes for the Loadout page:
 * `POST /api/dsh-loadout/<op>` with a JSON body, answering an `Envelope`.
 * The request body is untrusted JSON, so every field is validated here;
 * `Handlers` makes the compiler require one handler per contract operation.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import { routePath, type Envelope, type Operation, type Responses } from '../shared/api.ts'
import { OperationError, type Operations } from './operations.ts'
import { messageOf } from './shadow.ts'

type Body = Record<string, unknown>
type Handlers = { [Op in Operation]: (body: Body) => Promise<Responses[Op]> }

export function registerRoutes(ctx: Context, operations: Operations): void {
  const handlers: Handlers = {
    'state': body => operations.state({ workspacePath: optionalString(body.workspacePath) }),
    'set-skill': body => operations.setSkill({
      workspacePath: optionalString(body.workspacePath),
      name: requiredString(body.name, 'name'),
      state: requiredString(body.state, 'state'),
      level: body.level === 'global' || body.level === 'project' ? body.level : undefined,
    }),
    'set-rule': body => operations.setRule({ workspacePath: optionalString(body.workspacePath), id: requiredString(body.id, 'id'), enabled: body.enabled }),
    'remove': body => operations.remove({ ...workspaceOf(body), path: requiredString(body.path, 'path') }),
    'read': body => operations.read({ ...workspaceOf(body), path: requiredString(body.path, 'path') }),
  }
  ctx.inject(['connection'], (scoped) => {
    for (const op of Object.keys(handlers) as Operation[]) {
      const handler = handlers[op] as (body: Body) => Promise<unknown>
      scoped.effect(() => scoped.connection.fetch.register({
        path: routePath(op),
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: request => respond(request, handler),
      }), `dsh-loadout: ${routePath(op)}`)
    }
  })
}

async function respond(request: Request, handler: (body: Body) => Promise<unknown>): Promise<Response> {
  let body: Body
  try {
    const text = await request.text()
    const parsed: unknown = text === '' ? {} : JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('body must be a JSON object')
    body = parsed as Body
  } catch (error) {
    return json({ ok: false, error: { code: 'dsh-loadout/bad-request', message: messageOf(error) } })
  }
  try {
    return json({ ok: true, value: await handler(body) })
  } catch (error) {
    const code = error instanceof OperationError ? `dsh-loadout/${error.code}` : 'dsh-loadout/failed'
    return json({ ok: false, error: { code, message: messageOf(error) } })
  }
}

function json(value: Envelope<unknown>): Response {
  return Response.json(value, { headers: { 'cache-control': 'no-store' } })
}

function workspaceOf(body: Body): { workspacePath?: string } {
  const workspacePath = optionalString(body.workspacePath)
  return workspacePath === undefined ? {} : { workspacePath }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') throw new OperationError('bad-request', `${name} is required`)
  return value
}

/** Calls to the Host routes, typed by the shared contract. */

import type { Envelope, Operation, Requests, Responses } from '../shared/api.ts'
import { routePath } from '../shared/api.ts'

/**
 * POST one operation. The URL is relative to the document base without a
 * leading slash, so it also works behind a reverse-proxy prefix and in the
 * Desktop shell.
 * @throws with the Host's message when the operation fails
 */
export async function call<Op extends Operation>(op: Op, body: Requests[Op]): Promise<Responses[Op]> {
  const response = await fetch(new URL(routePath(op).slice(1), document.baseURI), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data: Envelope<Responses[Op]>
  try {
    data = await response.json() as Envelope<Responses[Op]>
  } catch {
    throw new Error(`HTTP ${response.status}`)
  }
  if (!data.ok) throw new Error(data.error.message)
  return data.value
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `localStorage` that never throws: without storage the choice lasts for this page only. */
export const stored = {
  read(key: string): string | undefined {
    try {
      return window.localStorage.getItem(key) ?? undefined
    } catch {
      return undefined
    }
  },
  write(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // storage unavailable
    }
  },
}

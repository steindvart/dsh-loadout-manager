/** An error with a stable code for the `{ ok: false, error }` envelope. */
export class OperationError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

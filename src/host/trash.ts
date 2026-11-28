/**
 * Deletion without permanent loss: the system trash through `gio trash`, and
 * when that fails, a folder of the DSH home that DSH does not scan. The
 * plugin never empties that folder.
 */

import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, lstat, mkdir, rename as renamePath, rm, rmdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { messageOf, OperationError } from './errors.ts'

/** Moves a file or directory out of the way; resolves to its new path when it went to the DSH trash. */
export type Trash = (path: string) => Promise<string | undefined>

export interface TrashOptions {
  /** The system trash; rejects with the reason it could not take the path. */
  system?: (path: string) => Promise<void>
  now?: () => Date
  rename?: (from: string, to: string) => Promise<void>
  /** Copies a file or directory tree across drives. */
  copy?: (from: string, to: string) => Promise<void>
  /** Removes the original after the copy across drives. */
  remove?: (path: string) => Promise<void>
}

/** The entry is in the DSH trash and gone from its place, but a staging folder could not be removed. */
export class TrashLeftoverError extends OperationError {
  readonly movedTo: string
  readonly leftover: string

  constructor(path: string, movedTo: string, leftover: string, reason: string) {
    super('trash-failed', `moved ${path} to ${movedTo}, but could not remove the leftover ${leftover}: ${reason}. Delete it by hand.`)
    this.movedTo = movedTo
    this.leftover = leftover
  }
}

/** `<dshHome>/.trash/<UTC time>/<name>`: one folder per entry keeps equal names apart. */
export function createTrash(dshHome: string, {
  system = gioTrash,
  now = () => new Date(),
  rename = renamePath,
  copy = copyTree,
  remove = path => rm(path, { recursive: true, maxRetries: 3 }),
}: TrashOptions = {}): Trash {
  const root = join(dshHome, '.trash')
  return async (path) => {
    let systemReason: string
    try {
      await system(path)
      return undefined
    } catch (error) {
      systemReason = messageOf(error)
    }
    // `gio` may report a failure after it moved the entry, for example on a timeout.
    if (!await exists(path)) return undefined
    let folder: string
    try {
      folder = await freshFolder(root, now().toISOString().slice(0, 19).replace(/:/g, '-'))
    } catch (error) {
      throw unavailable(path, systemReason, root, error)
    }
    const target = join(folder, basename(path))
    try {
      await rename(path, target)
      return target
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        await rmdir(folder).catch(() => {})
        throw unavailable(path, systemReason, root, error)
      }
    }
    // Another drive. A rename on the entry's own drive first takes it out of the
    // root DSH scans in one step, so a failed removal never leaves half a skill
    // there; the staged copy goes only after the copy in the trash is complete.
    const staging = join(dirname(dirname(path)), `.loadout-trash-${randomUUID()}`)
    const staged = join(staging, basename(path))
    try {
      await mkdir(staging)
      await rename(path, staged)
    } catch (error) {
      await rmdir(staging).catch(() => {})
      await rmdir(folder).catch(() => {})
      throw unavailable(path, systemReason, root, error)
    }
    try {
      await copy(staged, target)
    } catch (error) {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
      try {
        await rename(staged, path)
      } catch (restore) {
        throw new OperationError('trash-failed', `could not copy ${path} to ${target}: ${messageOf(error)}; the entry is at ${staged} and could not be put back: ${messageOf(restore)}`)
      }
      await rmdir(staging).catch(() => {})
      throw unavailable(path, systemReason, root, error)
    }
    try {
      await remove(staging)
    } catch (error) {
      throw new TrashLeftoverError(path, target, staging, messageOf(error))
    }
    return target
  }
}

async function copyTree(from: string, to: string): Promise<void> {
  await cp(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true })
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** `<stamp>`, else `<stamp>-2`, `<stamp>-3`, … when an earlier delete in the same second took it. */
async function freshFolder(root: string, stamp: string): Promise<string> {
  await mkdir(root, { recursive: true })
  for (let attempt = 1; ; attempt += 1) {
    const folder = join(root, attempt === 1 ? stamp : `${stamp}-${attempt}`)
    try {
      await mkdir(folder)
      return folder
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
}

function unavailable(path: string, systemReason: string, root: string, error: unknown): OperationError {
  return new OperationError(
    'trash-unavailable',
    `could not move ${path} to the trash: ${systemReason}; moving it to ${root} failed too: ${messageOf(error)}. Nothing was deleted.`,
  )
}

/** `gio trash`; on any failure the file stays where it is. */
export function gioTrash(path: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile('gio', ['trash', '--', path], { timeout: 15_000 }, (error, _stdout, stderr) => {
      if (error === null) {
        resolvePromise()
        return
      }
      reject(new Error((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'gio is not installed' : (stderr.trim() || error.message)))
    })
  })
}

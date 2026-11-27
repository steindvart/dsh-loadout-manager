/**
 * Deletion without permanent loss: the system trash through `gio trash`, and
 * when that fails, a folder of the DSH home that DSH does not scan. The
 * plugin never empties that folder.
 */

import { execFile } from 'node:child_process'
import { cp, mkdir, rename as renamePath, rm, rmdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { OperationError } from './errors.ts'
import { messageOf } from './shadow.ts'

/** Moves a file or directory out of the way; resolves to its new path when it went to the DSH trash. */
export type Trash = (path: string) => Promise<string | undefined>

export interface TrashOptions {
  /** The system trash; rejects with the reason it could not take the path. */
  system?: (path: string) => Promise<void>
  now?: () => Date
  rename?: (from: string, to: string) => Promise<void>
}

/** `<dshHome>/.trash/<UTC time>/<name>`: one folder per entry keeps equal names apart. */
export function createTrash(dshHome: string, { system = gioTrash, now = () => new Date(), rename = renamePath }: TrashOptions = {}): Trash {
  const root = join(dshHome, '.trash')
  return async (path) => {
    let systemReason: string
    try {
      await system(path)
      return undefined
    } catch (error) {
      systemReason = messageOf(error)
    }
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
    // Another drive: the original goes only after the copy is complete.
    try {
      await cp(path, target, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true, verbatimSymlinks: true })
    } catch (error) {
      await rm(folder, { recursive: true, force: true }).catch(() => {})
      throw unavailable(path, systemReason, root, error)
    }
    try {
      await rm(path, { recursive: true })
    } catch (error) {
      throw new OperationError('trash-failed', `copied ${path} to ${target}, but could not remove the original: ${messageOf(error)}`)
    }
    return target
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

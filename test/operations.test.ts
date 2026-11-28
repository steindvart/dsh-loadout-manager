import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createOperations } from '../src/host/operations.ts'
import { TrashLeftoverError, type Trash } from '../src/host/trash.ts'

// No DSH services: the scan covers only the standard roots under the homes.
const ctx = { get: () => undefined, logger: { warn: () => {} } } as unknown as Context

function setup(trash: Trash) {
  const base = mkdtempSync(join(tmpdir(), 'loadout-operations-'))
  const homes = { dshHome: join(base, 'dsh'), agentsHome: join(base, 'agents') }
  const entry = join(homes.agentsHome, 'skills/tdd')
  mkdirSync(entry, { recursive: true })
  writeFileSync(join(entry, 'SKILL.md'), '---\nname: tdd\ndescription: Test first.\n---\n# tdd\n')
  let invalidations = 0
  const operations = createOperations(ctx, homes, { invalidate: () => { invalidations += 1 }, trash })
  return { base, entry, operations, invalidations: () => invalidations }
}

test('remove returns where the DSH trash put the entry', async (t) => {
  const movedTo = '/home/me/.dsh/.trash/2026-11-27T10-15-00/tdd'
  const { base, entry, operations, invalidations } = setup(async (path) => { await rm(path, { recursive: true }); return movedTo })
  t.after(() => rm(base, { recursive: true, force: true }))

  assert.deepEqual(await operations.remove({ path: entry }), { path: entry, trashed: true, movedTo })
  assert.equal(invalidations(), 1)
})

test('remove leaves movedTo out when the system trash took the entry', async (t) => {
  const { base, entry, operations } = setup(async (path) => { await rm(path, { recursive: true }); return undefined })
  t.after(() => rm(base, { recursive: true, force: true }))

  assert.deepEqual(await operations.remove({ path: entry }), { path: entry, trashed: true })
})

test('a leftover after the move still refreshes the skills, then reports the error', async (t) => {
  const { base, entry, operations, invalidations } = setup(async (path) => {
    await rm(path, { recursive: true })
    throw new TrashLeftoverError(path, '/home/me/.dsh/.trash/x/tdd', '/project/.agents/.loadout-trash-1', 'EBUSY')
  })
  t.after(() => rm(base, { recursive: true, force: true }))

  await assert.rejects(operations.remove({ path: entry }), (error: Error & { code?: string }) => error.code === 'trash-failed')
  assert.equal(invalidations(), 1)
})

test('a failed trash changes nothing', async (t) => {
  const { base, entry, operations, invalidations } = setup(async () => { throw Object.assign(new Error('Nothing was deleted.'), { code: 'trash-unavailable' }) })
  t.after(() => rm(base, { recursive: true, force: true }))

  await assert.rejects(operations.remove({ path: entry }), /Nothing was deleted/)
  assert.equal(invalidations(), 0)
})

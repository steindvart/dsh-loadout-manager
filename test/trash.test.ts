import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createTrash } from '../src/host/trash.ts'

function tree(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'loadout-trash-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

const noSystemTrash = async (): Promise<void> => { throw new Error('gio is not installed') }
const at = (iso: string) => () => new Date(iso)
const exdev = async (): Promise<void> => { throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }) }

test('the system trash takes the entry when it works', async (t) => {
  const base = tree({ 'skills/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const taken: string[] = []
  const trash = createTrash(join(base, 'dsh'), { system: async (path) => { taken.push(path); await rm(path, { recursive: true }) } })

  assert.equal(await trash(join(base, 'skills/tdd')), undefined)
  assert.deepEqual(taken, [join(base, 'skills/tdd')])
  assert.equal(existsSync(join(base, 'dsh/.trash')), false)
})

test('without the system trash the entry moves into a timestamped folder of the DSH trash', async (t) => {
  const base = tree({ 'skills/tdd/SKILL.md': '# tdd', 'skills/tdd/refs/notes.md': 'Notes' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, now: at('2026-11-27T10:15:00.123Z') })

  const movedTo = await trash(join(base, 'skills/tdd'))
  assert.equal(movedTo, join(base, 'dsh/.trash/2026-11-27T10-15-00/tdd'))
  assert.equal(existsSync(join(base, 'skills/tdd')), false)
  assert.equal(await readFile(join(movedTo, 'refs/notes.md'), 'utf8'), 'Notes')
})

test('equal names deleted in the same second get folders of their own', async (t) => {
  const base = tree({ 'agents/rules/style.md': 'agents', 'dsh/rules/style.md': 'dsh' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, now: at('2026-11-27T10:15:00Z') })

  const first = await trash(join(base, 'agents/rules/style.md'))
  const second = await trash(join(base, 'dsh/rules/style.md'))
  assert.equal(first, join(base, 'dsh/.trash/2026-11-27T10-15-00/style.md'))
  assert.equal(second, join(base, 'dsh/.trash/2026-11-27T10-15-00-2/style.md'))
  assert.equal(await readFile(first, 'utf8'), 'agents')
  assert.equal(await readFile(second, 'utf8'), 'dsh')
})

test('across drives the entry is copied, then the original is removed', async (t) => {
  const base = tree({ 'project/.agents/skills/tdd/SKILL.md': '# tdd', 'project/.agents/skills/tdd/refs/notes.md': 'Notes' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, now: at('2026-11-27T10:15:00Z'), rename: exdev })

  const movedTo = await trash(join(base, 'project/.agents/skills/tdd'))
  assert.equal(movedTo, join(base, 'dsh/.trash/2026-11-27T10-15-00/tdd'))
  assert.equal(await readFile(join(movedTo, 'SKILL.md'), 'utf8'), '# tdd')
  assert.equal(await readFile(join(movedTo, 'refs/notes.md'), 'utf8'), 'Notes')
  assert.equal(existsSync(join(base, 'project/.agents/skills/tdd')), false)
})

test('when the move fails too, nothing is deleted and the error names both reasons', async (t) => {
  const base = tree({ 'rules/style.md': 'Short functions.', 'dsh': '' })
  t.after(() => rm(base, { recursive: true, force: true }))
  // The DSH home is a file, so the trash folder cannot be created.
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, rename })

  await assert.rejects(trash(join(base, 'rules/style.md')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'trash-unavailable')
    assert.match(error.message, /gio is not installed/)
    assert.match(error.message, /\.trash/)
    assert.match(error.message, /Nothing was deleted\./)
    return true
  })
  assert.equal(await readFile(join(base, 'rules/style.md'), 'utf8'), 'Short functions.')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { cp, readFile, readlink, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createTrash, TrashLeftoverError } from '../src/host/trash.ts'

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
const failure = (code: string) => Object.assign(new Error(`${code}: injected`), { code })
/** A DSH home on another drive: a rename into it fails, other renames work. */
const otherDrive = (dshHome: string) => async (from: string, to: string): Promise<void> => {
  if (to.startsWith(dshHome)) throw failure('EXDEV')
  await rename(from, to)
}

test('the system trash takes the entry when it works', async (t) => {
  const base = tree({ 'skills/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const taken: string[] = []
  const trash = createTrash(join(base, 'dsh'), { system: async (path) => { taken.push(path); await rm(path, { recursive: true }) } })

  assert.equal(await trash(join(base, 'skills/tdd')), undefined)
  assert.deepEqual(taken, [join(base, 'skills/tdd')])
  assert.equal(existsSync(join(base, 'dsh/.trash')), false)
})

test('an entry the system trash took before it failed counts as trashed', async (t) => {
  const base = tree({ 'skills/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  // gio moved the entry, then the timeout killed it.
  const trash = createTrash(join(base, 'dsh'), { system: async (path) => { await rm(path, { recursive: true }); throw new Error('timed out') } })

  assert.equal(await trash(join(base, 'skills/tdd')), undefined)
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

test('a symlinked entry moves as the link itself', async (t) => {
  const base = tree({ 'outside/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  mkdirSync(join(base, 'skills'))
  symlinkSync(join(base, 'outside/tdd'), join(base, 'skills/tdd'))
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, now: at('2026-11-27T10:15:00Z'), rename: otherDrive(join(base, 'dsh')) })

  const movedTo = await trash(join(base, 'skills/tdd'))
  assert.equal(await readlink(movedTo!), join(base, 'outside/tdd'))
  assert.equal(existsSync(join(base, 'skills/tdd')), false)
  assert.equal(await readFile(join(base, 'outside/tdd/SKILL.md'), 'utf8'), '# tdd', 'the link target stays')
})

test('across drives the entry leaves its root first, then is copied, then the original is removed', async (t) => {
  const base = tree({ 'project/.agents/skills/tdd/SKILL.md': '# tdd', 'project/.agents/skills/tdd/refs/notes.md': 'Notes' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const seen: string[] = []
  const trash = createTrash(join(base, 'dsh'), {
    system: noSystemTrash,
    now: at('2026-11-27T10:15:00Z'),
    rename: otherDrive(join(base, 'dsh')),
    copy: async (from, to) => { seen.push(...readdirSync(join(base, 'project/.agents/skills'))); await cp(from, to, { recursive: true }) },
  })

  const movedTo = await trash(join(base, 'project/.agents/skills/tdd'))
  assert.equal(movedTo, join(base, 'dsh/.trash/2026-11-27T10-15-00/tdd'))
  assert.deepEqual(seen, [], 'the skill is out of the scanned root before the copy starts')
  assert.equal(await readFile(join(movedTo, 'SKILL.md'), 'utf8'), '# tdd')
  assert.equal(await readFile(join(movedTo, 'refs/notes.md'), 'utf8'), 'Notes')
  assert.deepEqual(readdirSync(join(base, 'project/.agents')), ['skills'], 'no staging folder is left behind')
})

test('a failed rename leaves the entry in place and no empty folder in the trash', async (t) => {
  const base = tree({ 'rules/style.md': 'Short functions.' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash, now: at('2026-11-27T10:15:00Z'), rename: async () => { throw failure('EPERM') } })

  await assert.rejects(trash(join(base, 'rules/style.md')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'trash-unavailable')
    assert.match(error.message, /gio is not installed.*EPERM.*Nothing was deleted\./)
    return true
  })
  assert.equal(await readFile(join(base, 'rules/style.md'), 'utf8'), 'Short functions.')
  assert.deepEqual(readdirSync(join(base, 'dsh/.trash')), [])
})

test('a failed copy across drives puts the entry back and removes the partial copy', async (t) => {
  const base = tree({ 'project/.agents/skills/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), {
    system: noSystemTrash,
    rename: otherDrive(join(base, 'dsh')),
    copy: async (_from, to) => { mkdirSync(to); writeFileSync(join(to, 'SKILL.md'), '# t'); throw failure('ENOSPC') },
  })

  await assert.rejects(trash(join(base, 'project/.agents/skills/tdd')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'trash-unavailable')
    assert.match(error.message, /ENOSPC.*Nothing was deleted\./)
    return true
  })
  assert.equal(await readFile(join(base, 'project/.agents/skills/tdd/SKILL.md'), 'utf8'), '# tdd')
  assert.deepEqual(readdirSync(join(base, 'project/.agents')), ['skills'])
  assert.deepEqual(readdirSync(join(base, 'dsh/.trash')), [])
})

test('a leftover that could not be removed after the copy is named in the error', async (t) => {
  const base = tree({ 'project/.agents/skills/tdd/SKILL.md': '# tdd' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const trash = createTrash(join(base, 'dsh'), {
    system: noSystemTrash,
    now: at('2026-11-27T10:15:00Z'),
    rename: otherDrive(join(base, 'dsh')),
    remove: async () => { throw failure('EBUSY') },
  })

  await assert.rejects(trash(join(base, 'project/.agents/skills/tdd')), (error: unknown) => {
    assert.ok(error instanceof TrashLeftoverError)
    assert.equal(error.code, 'trash-failed')
    assert.equal(error.movedTo, join(base, 'dsh/.trash/2026-11-27T10-15-00/tdd'))
    assert.ok(existsSync(join(error.leftover, 'tdd/SKILL.md')), 'the leftover is where the error says')
    assert.ok(!error.leftover.startsWith(join(base, 'project/.agents/skills')), 'the leftover is outside the scanned root')
    assert.match(error.message, /EBUSY/)
    return true
  })
  assert.equal(existsSync(join(base, 'project/.agents/skills/tdd')), false)
  assert.equal(await readFile(join(base, 'dsh/.trash/2026-11-27T10-15-00/tdd/SKILL.md'), 'utf8'), '# tdd')
})

test('when the trash folder cannot be created, nothing is deleted and the error names both reasons', async (t) => {
  const base = tree({ 'rules/style.md': 'Short functions.', 'dsh': '' })
  t.after(() => rm(base, { recursive: true, force: true }))
  // The DSH home is a file, so the trash folder cannot be created.
  const trash = createTrash(join(base, 'dsh'), { system: noSystemTrash })

  await assert.rejects(trash(join(base, 'rules/style.md')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'trash-unavailable')
    assert.match(error.message, /gio is not installed/)
    assert.match(error.message, /\.trash/)
    assert.match(error.message, /Nothing was deleted\./)
    return true
  })
  assert.equal(await readFile(join(base, 'rules/style.md'), 'utf8'), 'Short functions.')
})

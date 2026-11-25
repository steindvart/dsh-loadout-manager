import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, chmodSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  cacheFile, compareVersions, copySkillTree, digestFile, digestTree, installKey, installedFile, readBytes, readCache, readInstalled,
  resolveEntry, updateAvailable, within, writeCache, writeInstalled, type CachedSkill, type InstalledItem,
} from '../src/host/index-store.ts'

function tree(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'loadout-index-store-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

test('the same tree always has the same digest; a changed file changes it', async (t) => {
  const first = tree({ 'SKILL.md': '---\nname: tdd\ndescription: d\n---\n', 'refs/a.md': 'A' })
  const second = tree({ 'SKILL.md': '---\nname: tdd\ndescription: d\n---\n', 'refs/a.md': 'A' })
  const changed = tree({ 'SKILL.md': '---\nname: tdd\ndescription: d\n---\n', 'refs/a.md': 'B' })
  t.after(() => Promise.all([first, second, changed].map(path => rm(path, { recursive: true, force: true }))))
  assert.equal(await digestTree(first), await digestTree(second))
  assert.notEqual(await digestTree(first), await digestTree(changed))
  assert.match(await digestFile(join(first, 'SKILL.md')), /^sha256:[0-9a-f]{64}$/)
})

test('the source index file is not part of a skill digest or a copied skill', async (t) => {
  const source = tree({ 'SKILL.md': 'x', 'loadout-index.json': '{"format":1}', 'notes.md': 'n' })
  const copy = tree({ 'SKILL.md': 'x', 'notes.md': 'n' })
  t.after(() => Promise.all([source, copy].map(path => rm(path, { recursive: true, force: true }))))
  const target = mkdtempSync(join(tmpdir(), 'loadout-index-copy-'))
  t.after(() => rm(target, { recursive: true, force: true }))
  assert.equal(await digestTree(source), await digestTree(copy))
  await copySkillTree(source, join(target, 'skill'))
  assert.equal(await digestTree(join(target, 'skill')), await digestTree(copy))
})

test('copying a skill keeps modes and refuses symbolic links', async (t) => {
  const source = tree({ 'SKILL.md': 'x', 'run.sh': '#!/bin/sh\n' })
  chmodSync(join(source, 'run.sh'), 0o755)
  const target = mkdtempSync(join(tmpdir(), 'loadout-index-copy-'))
  t.after(() => Promise.all([source, target].map(path => rm(path, { recursive: true, force: true }))))
  await copySkillTree(source, join(target, 'skill'))
  assert.equal(await digestTree(join(target, 'skill')), await digestTree(source))
  assert.equal(statSync(join(target, 'skill/run.sh')).mode & 0o777, 0o755)

  symlinkSync('/etc/passwd', join(source, 'escape'))
  await assert.rejects(copySkillTree(source, join(target, 'linked')), /symbolic link/)
})

test('updateAvailable reacts to changed content and to a newer index version', () => {
  const item = (patch: Partial<InstalledItem>): InstalledItem => ({
    kind: 'skill', name: 'tdd', source: 'owner/repo', path: 'skills/tdd', digest: 'sha256:a', installedAt: 1, ...patch,
  })
  const entry = (patch: Partial<CachedSkill>): CachedSkill => ({
    name: 'tdd', description: undefined, version: undefined, tags: [], path: 'skills/tdd', files: undefined, ...patch,
  })
  assert.equal(updateAvailable(item({ oid: 'tree-1' }), 'owner/repo', entry({ oid: 'tree-2' })), true, 'a changed git tree')
  assert.equal(updateAvailable(item({ oid: 'tree-1', version: '1.0.0' }), 'owner/repo', entry({ oid: 'tree-1', version: '2.0.0' })), true, 'a version bump with the same tree')
  assert.equal(updateAvailable(item({ oid: 'tree-1', version: '2.0.0' }), 'owner/repo', entry({ oid: 'tree-1', version: '1.0.0' })), false, 'a downgrade with the same tree')
  assert.equal(updateAvailable(item({ oid: undefined, digest: 'sha256:a' }), 'owner/repo', entry({ digest: 'sha256:b' })), true, 'changed local content')
  assert.equal(updateAvailable(item({ oid: undefined, digest: 'sha256:a', version: '1.0.0' }), 'owner/repo', entry({ digest: 'sha256:a', version: '1.1.0' })), true, 'a version bump with the same local digest')
  assert.equal(updateAvailable(item({ oid: undefined, digest: 'sha256:a', version: '2.0.0' }), 'owner/repo', entry({ digest: 'sha256:a', version: '1.9.0' })), false, 'a downgrade with the same local digest')
  assert.equal(updateAvailable(item({ oid: undefined, digest: undefined, version: '1' }), 'owner/repo', entry({ version: '2' })), true, 'version-only HTTP entries')
  assert.equal(updateAvailable(item({ oid: undefined, digest: undefined, version: '2' }), 'owner/repo', entry({ version: '2' })), false, 'the same version')
  assert.equal(updateAvailable(item({ oid: undefined, digest: undefined, version: undefined }), 'owner/repo', entry({ version: '2' })), true, 'an installed copy without a recorded version')
  assert.equal(updateAvailable(item({ source: 'other/repo' }), 'owner/repo', entry({ version: '9' })), false, 'a copy from another source')
})

test('compareVersions reads SemVer, numeric, and prerelease forms', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0')! > 0)
  assert.ok(compareVersions('1.9.0', '1.10.0')! < 0)
  assert.equal(compareVersions('1.2', '1.2.0'), 0)
  assert.equal(compareVersions('v1.2.3', '=1.2.3'), 0)
  assert.ok(compareVersions('2.0.0-rc.1', '2.0.0')! < 0)
  assert.ok(compareVersions('2.0.0-rc.2', '2.0.0-rc.10')! < 0)
  assert.ok(compareVersions('2.0.0', '2.0.0-rc.1')! > 0)
  assert.equal(compareVersions('banana', '1.0.0'), undefined)
  assert.equal(compareVersions('1.0.0', 'banana'), undefined)
})

test('installed manifests round-trip, tolerate missing files, and report malformed JSON', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const path = installedFile(base)
  assert.equal(path, join(base, '.loadout-manager/installed.json'))
  assert.deepEqual(await readInstalled(path), { items: {} })

  const item: InstalledItem = { kind: 'skill', name: 'tdd', source: 'owner/repo', path: 'skills/tdd', digest: 'sha256:a', installedAt: 1 }
  await writeInstalled(path, { items: { [installKey('skill', 'tdd')]: item } })
  assert.deepEqual(await readInstalled(path), { items: { 'skill/tdd': item } })

  await writeFileSync(path, '{ broken')
  const malformed = await readInstalled(path)
  assert.equal(malformed.items['skill/tdd'], undefined)
  assert.match(malformed.error ?? '', /malformed/)
})

test('project installs keep their manifest under the project', () => {
  assert.equal(installedFile('/home/me/.agents', '/work/repo'), '/work/repo/.agents/.loadout-manager/installed.json')
})

test('cache files round-trip and a malformed cache reads as absent', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const path = cacheFile(base, 'owner/repo')
  assert.equal(path, join(base, 'loadout-manager/indexes', path.split('/').at(-2)!, 'cache.json'))
  assert.equal(await readCache(path), undefined)
  const cache = { format: 1 as const, source: 'owner/repo', kind: 'git' as const, fetchedAt: 5, commit: 'abc', skills: [], rules: [] }
  await writeCache(path, cache)
  assert.deepEqual(await readCache(path), cache)
  await writeFileSync(path, '{"format":1,"source":"x","kind":"git"}')
  assert.equal(await readCache(path), undefined)
})

test('within refuses a path that escapes its root', () => {
  assert.equal(within('/a/b', 'c/d'), '/a/b/c/d')
  assert.throws(() => within('/a/b', '../c'), /escapes/)
})

test('resolveEntry refuses links and paths whose real location leaves the root', async (t) => {
  const base = tree({ 'root/rules/ok.md': 'ok', 'root/skills/a/SKILL.md': 's', 'secret.md': 'secret', 'outside/SKILL.md': 's' })
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = join(base, 'root')
  symlinkSync(join(base, 'secret.md'), join(root, 'rules/leak.md'))
  symlinkSync('ok.md', join(root, 'rules/alias.md'))
  symlinkSync(join(base, 'outside'), join(root, 'skills/linked'))
  symlinkSync(join(base, 'outside'), join(root, 'via'))
  assert.equal(await resolveEntry(root, 'rules/ok.md', 'file'), join(root, 'rules/ok.md'))
  assert.equal(await resolveEntry(root, 'skills/a', 'directory'), join(root, 'skills/a'))
  assert.equal(await resolveEntry(root, '.', 'directory'), root)
  await assert.rejects(resolveEntry(root, 'rules/leak.md', 'file'), /symbolic link/)
  await assert.rejects(resolveEntry(root, 'rules/alias.md', 'file'), /symbolic link/)
  await assert.rejects(resolveEntry(root, 'skills/linked', 'directory'), /symbolic link/)
  await assert.rejects(resolveEntry(root, 'via/SKILL.md', 'file'), /outside the source/)
  await assert.rejects(resolveEntry(root, 'rules', 'file'), /not a file/)
  await assert.rejects(resolveEntry(root, 'rules/ok.md', 'directory'), /not a directory/)
  await assert.rejects(resolveEntry(root, 'rules/missing.md', 'file'), /ENOENT/)
})

test('readBytes enforces its limit and refuses a link', async (t) => {
  const base = tree({ 'small.md': 'abc', 'large.md': 'x'.repeat(10) })
  t.after(() => rm(base, { recursive: true, force: true }))
  symlinkSync(join(base, 'small.md'), join(base, 'link.md'))
  assert.equal(Buffer.from(await readBytes(join(base, 'small.md'), 5)).toString('utf8'), 'abc')
  await assert.rejects(readBytes(join(base, 'large.md'), 5), /larger than 5 bytes/)
  await assert.rejects(readBytes(join(base, 'link.md'), 5), /symbolic link/)
})

test('a tree digest orders names by code unit, whatever the locale', async (t) => {
  const root = tree({ 'b.md': 'b', 'B.md': 'B', '_x.md': 'x', 'a/c.md': 'c' })
  t.after(() => rm(root, { recursive: true, force: true }))
  const hash = createHash('sha256')
  hash.update('file\0B.md\0').update('B').update('\0')
  hash.update('file\0_x.md\0').update('x').update('\0')
  hash.update('dir\0a\0')
  hash.update('file\0a/c.md\0').update('c').update('\0')
  hash.update('file\0b.md\0').update('b').update('\0')
  assert.equal(await digestTree(root), `sha256:${hash.digest('hex')}`)
})

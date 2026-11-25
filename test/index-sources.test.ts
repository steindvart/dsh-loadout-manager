import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { classifySource, parseIndexesFile, serializeIndexesFile } from '../src/host/index-sources.ts'

test('classifies local directories, HTTP indexes, and git repositories', () => {
  assert.deepEqual(classifySource('/srv/skills'), { id: '/srv/skills', kind: 'local' })
  assert.deepEqual(classifySource('~/skills'), { id: join(homedir(), 'skills'), kind: 'local' })
  assert.deepEqual(classifySource('  https://nexus.example/repository/skills/loadout-index.json  '), {
    id: 'https://nexus.example/repository/skills/loadout-index.json', kind: 'http',
  })
  assert.deepEqual(classifySource('https://example.com/index.json?v=2'), { id: 'https://example.com/index.json?v=2', kind: 'http' })
  assert.deepEqual(classifySource('https://github.com/owner/repo.git'), { id: 'https://github.com/owner/repo.git', kind: 'git' })
  assert.deepEqual(classifySource('https://github.com/owner/repo'), { id: 'https://github.com/owner/repo', kind: 'git' })
  assert.deepEqual(classifySource('owner/repo'), { id: 'owner/repo', kind: 'git', gitUrl: 'https://github.com/owner/repo.git' })
  assert.deepEqual(classifySource('git@github.com:owner/repo.git'), { id: 'git@github.com:owner/repo.git', kind: 'git' })
  assert.deepEqual(classifySource('ssh://git@example.com/owner/repo'), { id: 'ssh://git@example.com/owner/repo', kind: 'git' })
})

test('rejects empty, relative, credential-bearing, and unknown sources', () => {
  assert.throws(() => classifySource('   '), /cannot be empty/)
  assert.throws(() => classifySource('./skills'), /unrecognized index source/)
  assert.throws(() => classifySource('https://user:pass@example.com/index.json'), /carry no credentials/)
  assert.throws(() => classifySource('ftp://example.com/index.json'), /unrecognized index source/)
  assert.throws(() => classifySource('--upload-pack=cmd@host:path'), /cannot start with "-"/)
})

test('reads the source list from an object or a bare array and deduplicates', () => {
  assert.deepEqual(parseIndexesFile('{"format":1,"indexes":["/srv/a","/srv/a","owner/repo"]}'), ['/srv/a', 'owner/repo'])
  assert.deepEqual(parseIndexesFile('["/srv/a"]'), ['/srv/a'])
  assert.deepEqual(parseIndexesFile(''), [])
  assert.deepEqual(parseIndexesFile('   '), [])
})

test('rejects a malformed source list', () => {
  assert.throws(() => parseIndexesFile('{'), /not valid JSON/)
  assert.throws(() => parseIndexesFile('{"sources":[]}'), /"indexes" array/)
  assert.throws(() => parseIndexesFile('{"indexes":[1]}'), /indexes\[0\] must be a string/)
  assert.throws(() => parseIndexesFile('{"format":2,"indexes":[]}'), /unsupported format 2/)
})

test('serializes a stable, human-editable file', () => {
  const text = serializeIndexesFile(['/srv/a', 'owner/repo'])
  assert.equal(text, '{\n  "format": 1,\n  "indexes": [\n    "/srv/a",\n    "owner/repo"\n  ]\n}\n')
  assert.deepEqual(parseIndexesFile(text), ['/srv/a', 'owner/repo'])
})

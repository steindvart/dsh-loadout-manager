import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { isStale, refreshSource, ruleContent, scanGitCheckout, stageSkill } from '../src/host/index-fetch.ts'
import { classifySource } from '../src/host/index-sources.ts'
import { MAX_SKILL_BYTES, MAX_SKILL_FILES, cacheDir, cacheFile, digestTree, readCache, repoDir } from '../src/host/index-store.ts'

function tree(files: Record<string, string>): string {
  const base = mkdtempSync(join(tmpdir(), 'loadout-fetch-'))
  for (const [path, content] of Object.entries(files)) {
    const full = join(base, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return base
}

const index = (skills: unknown[], rules: unknown[] = []) => JSON.stringify({ format: 1, title: 'Test', skills, rules })
const skillFile = (name: string, extra = '') => `---\nname: ${name}\ndescription: ${name} skill\n${extra}---\n# ${name}\n`

test('refreshes a local source, hashes its entries, and stages a skill', async (t) => {
  const base = tree({
    'source/loadout-index.json': index(
      [{ name: 'tdd', description: 'Test first.', path: 'skills/tdd' }],
      [{ name: 'style', path: 'rules/style.md' }],
    ),
    'source/skills/tdd/SKILL.md': skillFile('tdd'),
    'source/skills/tdd/refs/notes.md': 'Notes',
    'source/rules/style.md': '---\nname: Style\n---\nShort functions.\n',
  })
  t.after(() => rm(base, { recursive: true, force: true }))
  const source = classifySource(join(base, 'source'))
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  assert.equal(cache.title, 'Test')
  assert.equal(cache.skills.length, 1)
  assert.match(cache.skills[0]?.digest ?? '', /^sha256:/)
  assert.match(cache.rules[0]?.digest ?? '', /^sha256:/)
  const stored = await readCache(cacheFile(join(base, 'home'), source.id))
  assert.equal(stored?.title, 'Test')

  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.equal(await digestTree(staging), cache.skills[0]?.digest)
  const rule = await ruleContent(cache, cache.rules[0]!, { dshHome: join(base, 'home') })
  assert.equal(Buffer.from(rule).toString('utf8'), '---\nname: Style\n---\nShort functions.\n')

  assert.equal(isStale(cache, 10 * 60 * 1000), false)
  assert.equal(isStale(undefined, 10 * 60 * 1000), true)
  assert.equal(isStale({ ...cache, checkedAt: Date.now() - 11 * 60 * 1000 }, 10 * 60 * 1000), true)
})

test('keeps the previous entries when a source breaks, and reports last-fetch timing', async (t) => {
  const base = tree({ 'source/loadout-index.json': index([{ name: 'tdd', path: 'skills/tdd' }]), 'source/skills/tdd/SKILL.md': skillFile('tdd') })
  t.after(() => rm(base, { recursive: true, force: true }))
  const source = classifySource(join(base, 'source'))
  const first = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(first.error, undefined)
  writeFileSync(join(base, 'source/loadout-index.json'), '{ broken')
  const second = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(second.error ?? '', /not valid JSON/)
  assert.equal(second.skills.length, 1, 'the last good entries stay visible')
  assert.equal(second.fetchedAt, first.fetchedAt)
  assert.ok((second.checkedAt ?? 0) >= (first.checkedAt ?? 0))
})

test('a local source refuses entries that are links or lead outside it', async (t) => {
  const base = tree({
    'source/loadout-index.json': index([], [{ name: 'leak', path: 'rules/leak.md' }]),
    'source/rules/ok.md': 'ok',
    'secret.txt': 'private\n',
    'outside/SKILL.md': skillFile('outside'),
  })
  t.after(() => rm(base, { recursive: true, force: true }))
  symlinkSync(join(base, 'secret.txt'), join(base, 'source/rules/leak.md'))
  const source = classifySource(join(base, 'source'))
  const rule = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(rule.error ?? '', /rules\/leak\.md is a symbolic link/)
  assert.deepEqual(rule.rules, [])

  symlinkSync(join(base, 'outside'), join(base, 'source/skills'))
  writeFileSync(join(base, 'source/loadout-index.json'), index([{ name: 'outside', path: 'skills' }]))
  const skill = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(skill.error ?? '', /skills is a symbolic link/)

  await rm(join(base, 'source/loadout-index.json'))
  symlinkSync(join(base, 'secret.txt'), join(base, 'source/loadout-index.json'))
  const linked = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(linked.error ?? '', /loadout-index\.json is a symbolic link/)
  assert.doesNotMatch(linked.error ?? '', /private/)
})

test('reads a git checkout at a pinned commit, stages from it, and refuses links', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const dshHome = join(base, 'home')
  const source = classifySource('owner/repo')
  const dir = repoDir(dshHome, source.id)
  const files: Record<string, string> = {
    'loadout-index.json': index(
      [{ name: 'tdd', description: 'Test first.', path: 'skills/tdd' }],
      [{ name: 'style', path: 'rules/style.md' }],
    ),
    'skills/tdd/SKILL.md': skillFile('tdd'),
    'skills/tdd/refs/notes.md': 'Notes',
    'rules/style.md': 'Short functions.\n',
  }
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' })
  git('init', '-q')
  git('add', '.')
  git('commit', '-qm', 'one')

  const cache = await scanGitCheckout(source, dir)
  assert.equal(cache.commit, git('rev-parse', 'HEAD').trim())
  assert.equal(cache.skills[0]?.oid, git('rev-parse', 'HEAD:skills/tdd').trim())
  assert.equal(cache.rules[0]?.oid, git('rev-parse', 'HEAD:rules/style.md').trim())
  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome }, staging)
  assert.equal(await readFile(join(staging, 'refs/notes.md'), 'utf8'), 'Notes')
  assert.equal(Buffer.from(await ruleContent(cache, cache.rules[0]!, { dshHome })).toString('utf8'), 'Short functions.\n')

  writeFileSync(join(dir, 'rules/style.md'), 'Changed.\n')
  git('commit', '-qam', 'two')
  await assert.rejects(ruleContent(cache, cache.rules[0]!, { dshHome }), /cached clone changed/)
  await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome }, join(base, 'staging-2')), /cached clone changed/)

  symlinkSync('../../../secret', join(dir, 'rules/leak.md'))
  writeFileSync(join(dir, 'loadout-index.json'), index([], [{ name: 'leak', path: 'rules/leak.md' }]))
  git('add', '.')
  git('commit', '-qm', 'three')
  await assert.rejects(scanGitCheckout(source, dir), /rules\/leak\.md is a symbolic link/)

  writeFileSync(join(dir, 'loadout-index.json'), index([{ name: 'gone', path: 'skills/gone' }]))
  git('commit', '-qam', 'four')
  await assert.rejects(scanGitCheckout(source, dir), /skills\/gone is missing/)
})

test('refreshes an HTTP index and fetches a skill by its files list and a rule by its URL', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const served: Record<string, { type: string, body: string }> = {
    '/index.json': {
      type: 'application/json',
      body: index(
        [{ name: 'remote', description: 'From HTTP', version: '1.0.0', path: 'skills/remote', files: ['SKILL.md', 'refs/a.md'] }],
        [{ name: 'http-rule', path: 'rules/http-rule.md' }],
      ),
    },
    '/skills/remote/SKILL.md': { type: 'text/markdown', body: skillFile('remote') },
    '/skills/remote/refs/a.md': { type: 'text/markdown', body: 'A' },
    '/rules/http-rule.md': { type: 'text/markdown', body: 'Rule body.\n' },
  }
  const server = await listen((request, response) => {
    const item = served[request.url ?? '']
    if (item === undefined) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': item.type }).end(item.body)
  })
  t.after(() => close(server))
  const source = classifySource(`${urlOf(server)}/index.json`)
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  assert.equal(cache.kind, 'http')
  assert.equal(cache.base, `${urlOf(server)}/index.json`)
  assert.deepEqual(cache.skills.map(skill => [skill.name, skill.version]), [['remote', '1.0.0']])

  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.equal(await readFile(join(staging, 'refs/a.md'), 'utf8'), 'A')
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: remote/)
  assert.equal(Buffer.from(await ruleContent(cache, cache.rules[0]!, { dshHome: join(base, 'home') })).toString('utf8'), 'Rule body.\n')

  served['/index.json']!.body = '{"format":9}'
  const failed = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.match(failed.error ?? '', /unsupported format/)
  assert.equal(failed.skills.length, 1)
})

test('an HTTP response without a final URL resolves entries against the source', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const requested: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    requested.push(String(input))
    return new Response(String(input).endsWith('/index.json') ? index([], [{ name: 'style', path: 'rules/style.md' }]) : 'Rule.\n')
  }) as typeof fetch
  const dshHome = join(base, 'home')
  const cache = await refreshSource(classifySource('https://idx.example/team/index.json'), { dshHome, fetchImpl })
  assert.equal(cache.base, 'https://idx.example/team/index.json')
  assert.equal(Buffer.from(await ruleContent(cache, cache.rules[0]!, { dshHome, fetchImpl })).toString('utf8'), 'Rule.\n')
  assert.deepEqual(requested, ['https://idx.example/team/index.json', 'https://idx.example/team/rules/style.md'])
})

test('HTTP entries stay on the origin of their index', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const requested: string[] = []
  const server = await listen((request, response) => {
    requested.push(request.url ?? '')
    response.writeHead(200, { 'content-type': 'application/json' }).end(index(
      [{ name: 'away', path: 'skills/away', files: ['SKILL.md', 'https:evil.example/x.md'] }],
      [{ name: 'other-host', path: 'https:evil.example/rule.md' }, { name: 'inline', path: 'data:text/plain,hi.md' }],
    ))
  })
  t.after(() => close(server))
  const dshHome = join(base, 'home')
  const cache = await refreshSource(classifySource(`${urlOf(server)}/index.json`), { dshHome })
  assert.equal(cache.error, undefined)
  const origin = new URL(urlOf(server)).origin
  for (const rule of cache.rules) {
    await assert.rejects(ruleContent(cache, rule, { dshHome }), new RegExp(`leaves ${origin.replaceAll('.', '\\.')}`))
  }
  await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome }, join(base, 'staging')), /leaves/)
  assert.deepEqual(requested, ['/index.json'])
})

test('stages a skill from a .tar.gz served by an HTTP index', async (t) => {
  const base = tree({ 'pkg/SKILL.md': skillFile('archived'), 'pkg/refs/notes.md': 'Archived notes' })
  t.after(() => rm(base, { recursive: true, force: true }))
  execFileSync('tar', ['-czf', join(base, 'skill.tgz'), '-C', base, 'pkg'])
  const archive = readFileSync(join(base, 'skill.tgz'))
  const server = await listen((request, response) => {
    if (request.url === '/index.json') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(index([{ name: 'archived', path: 'archives/skill.tgz' }]))
    } else if (request.url === '/archives/skill.tgz') {
      response.writeHead(200, { 'content-type': 'application/gzip' }).end(archive)
    } else {
      response.writeHead(404).end()
    }
  })
  t.after(() => close(server))
  const source = classifySource(`${urlOf(server)}/index.json`)
  const cache = await refreshSource(source, { dshHome: join(base, 'home') })
  assert.equal(cache.error, undefined)
  const staging = join(base, 'staging')
  await stageSkill(cache, cache.skills[0]!, { dshHome: join(base, 'home') }, staging)
  assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: archived/)
  assert.equal(await readFile(join(staging, 'refs/notes.md'), 'utf8'), 'Archived notes')
})

/** Serve `/index.json` with one archived skill and the archive bytes under `/archives/<name>`. */
async function archiveServer(name: string, archive: Buffer): Promise<Server> {
  return await listen((request, response) => {
    if (request.url === '/index.json') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(index([{ name: 'archived', path: `archives/${name}` }]))
    } else if (request.url === `/archives/${name}`) {
      response.writeHead(200).end(archive)
    } else {
      response.writeHead(404).end()
    }
  })
}

test('archives are checked against the skill limits before they are unpacked', async (t) => {
  const base = tree({ 'big/SKILL.md': skillFile('archived'), 'many/SKILL.md': skillFile('archived'), 'zipped/SKILL.md': skillFile('archived') })
  t.after(() => rm(base, { recursive: true, force: true }))
  writeFileSync(join(base, 'big/zeros.bin'), Buffer.alloc(MAX_SKILL_BYTES + 5 * 1024 * 1024))
  for (let index = 0; index < MAX_SKILL_FILES; index += 1) writeFileSync(join(base, `many/f${String(index)}.md`), '')
  execFileSync('tar', ['-czf', join(base, 'big.tgz'), '-C', base, 'big'])
  execFileSync('tar', ['-czf', join(base, 'many.tgz'), '-C', base, 'many'])
  execFileSync('zip', ['-qr', join(base, 'big.zip'), 'big'], { cwd: base })
  execFileSync('zip', ['-qr', join(base, 'zipped.zip'), 'zipped'], { cwd: base })
  const dshHome = join(base, 'home')

  const cases: Array<[string, RegExp | undefined]> = [
    ['big.tgz', /unpacks to more than/],
    ['many.tgz', /more than 2000 files/],
    ['big.zip', /unpacks to more than/],
    ['zipped.zip', undefined],
  ]
  for (const [name, failure] of cases) {
    const server = await archiveServer(name, readFileSync(join(base, name)))
    try {
      const source = classifySource(`${urlOf(server)}/index.json`)
      const cache = await refreshSource(source, { dshHome })
      const staging = join(base, `staging-${name}`)
      if (failure === undefined) {
        await stageSkill(cache, cache.skills[0]!, { dshHome }, staging)
        assert.match(await readFile(join(staging, 'SKILL.md'), 'utf8'), /name: archived/)
      } else {
        await assert.rejects(stageSkill(cache, cache.skills[0]!, { dshHome }, staging), failure)
      }
      assert.deepEqual(readdirSync(join(cacheDir(dshHome, source.id), 'tmp')), [], 'unpacked files are removed')
      assert.equal(existsSync(cacheDir(dshHome, `${urlOf(server)}/archives/${name}`)), false, 'no cache directory per archive URL')
    } finally {
      await close(server)
    }
  }
})

test('a failed HTTP read reports its status and keeps the source usable', async (t) => {
  const base = tree({})
  t.after(() => rm(base, { recursive: true, force: true }))
  const server = await listen((_request, response) => { response.writeHead(503).end() })
  t.after(() => close(server))
  const cache = await refreshSource(classifySource(`${urlOf(server)}/index.json`), { dshHome: join(base, 'home') })
  assert.match(cache.error ?? '', /HTTP 503/)
  assert.deepEqual(cache.skills, [])
})

function urlOf(server: Server): string {
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no address')
  return `http://127.0.0.1:${String(address.port)}`
}

function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve(server) })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => { if (error === undefined) resolve(); else reject(error) })
  })
}

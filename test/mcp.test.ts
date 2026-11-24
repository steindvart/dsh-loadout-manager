import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deniedTools, statusView, toolsByServer } from '../src/host/mcp.ts'

const tool = (name: string, description = `${name} description`) => ({ name, description })

test('groups MCP tools by server name and strips the mcp__<server>__ prefix for display', () => {
  const grouped = toolsByServer(['github', 'docs'], [
    tool('mcp__github__create_issue', 'Create an issue'),
    tool('mcp__docs__search'),
    tool('mcp__github__list_repos'),
    tool('read'),
    tool('mcp__other__x'),
  ])
  assert.deepEqual(grouped.get('github'), [
    { name: 'mcp__github__create_issue', title: 'create_issue', description: 'Create an issue' },
    { name: 'mcp__github__list_repos', title: 'list_repos', description: 'mcp__github__list_repos description' },
  ])
  assert.deepEqual(grouped.get('docs')?.map(item => item.title), ['search'])
  assert.equal(grouped.has('other'), false)
})

test('a tool belongs to the longest server name whose prefix matches', () => {
  const grouped = toolsByServer(['a', 'a__b'], [tool('mcp__a__b__x'), tool('mcp__a__y')])
  assert.deepEqual(grouped.get('a__b')?.map(item => item.title), ['x'])
  assert.deepEqual(grouped.get('a')?.map(item => item.title), ['y'])
})

test('denied tools are the current tools of the hidden servers, sorted', () => {
  const tools = [tool('mcp__github__b'), tool('mcp__github__a'), tool('mcp__docs__search'), tool('read')]
  assert.deepEqual(deniedTools(['github'], ['github', 'docs'], tools), ['mcp__github__a', 'mcp__github__b'])
  assert.deepEqual(deniedTools([], ['github'], tools), [])
})

test('status view keeps what the page shows and the last error of every failing state', () => {
  assert.deepEqual(statusView({ state: 'connected', toolCount: 3, connectedAt: 5 }), { state: 'connected', toolCount: 3 })
  assert.deepEqual(statusView({ state: 'disabled' }), { state: 'disabled' })
  assert.deepEqual(statusView({ state: 'connecting', attempt: 2 }), { state: 'connecting', attempt: 2 })
  assert.deepEqual(
    statusView({ state: 'reconnecting', attempt: 1, maxAttempts: 5, nextRetryAtMs: 9, lastError: 'ECONNREFUSED' }),
    { state: 'reconnecting', attempt: 1, maxAttempts: 5, error: 'ECONNREFUSED' },
  )
  assert.deepEqual(statusView({ state: 'failed', reason: 'gave-up', lastError: 'timeout' }), { state: 'failed', reason: 'gave-up', error: 'timeout' })
  assert.deepEqual(statusView({ state: 'failed', reason: 'cleanup', result: { closeConfirmed: false, cleanupError: 'stuck' } }), { state: 'failed', reason: 'cleanup', error: 'stuck' })
  assert.deepEqual(statusView({ state: 'waiting-credentials', lastError: 'no GITHUB_TOKEN' }), { state: 'waiting-credentials', error: 'no GITHUB_TOKEN' })
  assert.deepEqual(statusView({ state: 'closed', result: { closeConfirmed: true } }), { state: 'closed' })
})

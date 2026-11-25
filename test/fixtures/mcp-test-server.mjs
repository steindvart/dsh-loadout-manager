#!/usr/bin/env node
/**
 * Minimal MCP server over stdio (newline-delimited JSON-RPC), for exercising
 * the Loadout Manager plugin's MCP tab: three tools, no dependencies, no network.
 *
 * Framing matches `@modelcontextprotocol/client`'s StdioClientTransport:
 * each message is one line of JSON terminated by `\n`.
 *
 * Run it directly (`node test/fixtures/mcp-test-server.mjs`) or point an MCP
 * `stdio` entry at it: command `node`, args [`test/fixtures/mcp-test-server.mjs`].
 */

import { createInterface } from 'node:readline'

const NAME = 'loadout-test-server'
const VERSION = '1.0.0'

const TOOLS = [
  {
    name: 'echo',
    description: 'Echoes the given text back.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to echo' } },
      required: ['text'],
    },
  },
  {
    name: 'add',
    description: 'Adds two integers and returns the sum.',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'integer', description: 'First operand' },
        b: { type: 'integer', description: 'Second operand' },
      },
      required: ['a', 'b'],
    },
  },
  {
    name: 'now',
    description: 'Returns the current date and time in ISO 8601.',
    inputSchema: { type: 'object', properties: {} },
  },
]

/** One JSON-RPC response line. */
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function textResult(text) {
  return { content: [{ type: 'text', text }], isError: false }
}

/** One tool call: returns the MCP `CallToolResult`. */
function callTool(name, args) {
  switch (name) {
    case 'echo': return textResult(String(args?.text ?? ''))
    case 'add': {
      const a = Number(args?.a)
      const b = Number(args?.b)
      if (!Number.isInteger(a) || !Number.isInteger(b)) {
        return { content: [{ type: 'text', text: 'a and b must be integers' }], isError: true }
      }
      return textResult(String(a + b))
    }
    case 'now': return textResult(new Date().toISOString())
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true }
  }
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  const { method, id, params } = message
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: NAME, version: VERSION },
      },
    })
    return
  }
  if (method === 'notifications/initialized') return
  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    return
  }
  if (method === 'tools/call') {
    send({ jsonrpc: '2.0', id, result: callTool(params?.name, params?.arguments) })
    return
  }
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} })
    return
  }
  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
})

rl.on('close', () => {
  process.exit(0)
})

process.stderr.write(`[loadout-test-server] ready (${NAME} ${VERSION})\n`)

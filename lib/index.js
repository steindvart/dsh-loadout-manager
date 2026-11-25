import { execFile } from "node:child_process";
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
// src/host/loadout.ts
const SKILL_STATES = Object.freeze([
	"on",
	"manual",
	"off"
]);
function isSkillState(value) {
	return SKILL_STATES.includes(value);
}
/**
* @param text - file contents, `undefined` when the file is absent
* @throws when the text is not a JSON object
*/
function parseLoadout(text) {
	if (text === void 0 || text.trim() === "") return {};
	let value;
	try {
		value = JSON.parse(text);
	} catch (error) {
		throw new Error(`loadout.json is not valid JSON: ${error.message}`);
	}
	if (!isRecord(value)) throw new Error("loadout.json must contain a JSON object");
	return value;
}
function skillState(loadout, name) {
	const value = section(loadout, "skills")[name];
	return isSkillState(value) ? value : "on";
}
function ruleEnabled(loadout, id) {
	return section(loadout, "rules")[id] !== false;
}
/** An MCP server is used unless its entry is `false`. */
function mcpEnabled(loadout, server) {
	return section(loadout, "mcp")[server] !== false;
}
function withMcpEnabled(loadout, server, enabled) {
	return withEntry(loadout, "mcp", server, enabled ? void 0 : false);
}
function withSkillState(loadout, name, state) {
	if (!isSkillState(state)) throw new Error(`unknown skill state "${state}"`);
	return withEntry(loadout, "skills", name, state === "on" ? void 0 : state);
}
function withRuleEnabled(loadout, id, enabled) {
	return withEntry(loadout, "rules", id, enabled ? void 0 : false);
}
/** Pretty JSON with a trailing newline; empty sections are dropped. */
function serializeLoadout(loadout) {
	const out = { ...loadout };
	for (const key of [
		"skills",
		"rules",
		"mcp"
	]) {
		const value = out[key];
		if (isRecord(value) && Object.keys(value).length === 0) delete out[key];
	}
	return `${JSON.stringify(out, null, 2)}\n`;
}
function withEntry(loadout, key, id, value) {
	const entries = { ...section(loadout, key) };
	if (value === void 0) delete entries[id];
	else entries[id] = value;
	return {
		...loadout,
		[key]: entries
	};
}
function section(loadout, key) {
	const value = loadout[key];
	return isRecord(value) ? value : {};
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
// src/host/frontmatter.ts
/**
* @param raw - file text
* @returns `undefined` when the file has no frontmatter fence.
*/
function parseFrontmatter(raw) {
	const lines = raw.split("\n");
	if (stripCr(lines[0] ?? "") !== "---") return void 0;
	const closing = lines.findIndex((line, index) => index > 0 && stripCr(line) === "---");
	if (closing < 0) return void 0;
	return {
		data: parseMapping(lines.slice(1, closing).map(stripCr), 0),
		body: lines.slice(closing + 1).join("\n")
	};
}
/** `key: value` lines at column zero; indented and blank lines continue the previous key. */
function parseMapping(yaml, depth) {
	const data = {};
	let index = 0;
	while (index < yaml.length) {
		const match = /^([A-Za-z0-9_-]+):(?:\s+(.*))?$/.exec(yaml[index] ?? "");
		index += 1;
		if (!match?.[1]) continue;
		const head = (match[2] ?? "").trim();
		const continuation = [];
		for (let line = yaml[index]; line !== void 0 && (line.trim() === "" || /^\s/.test(line)); line = yaml[index]) {
			continuation.push(line);
			index += 1;
		}
		data[match[1]] = parseValue(head, continuation, depth);
	}
	return data;
}
function parseValue(head, continuation, depth) {
	const block = /^([|>])([+-]?)\s*(?:#.*)?$/.exec(head);
	if (block) return parseBlockScalar(block[1] === "|" ? "|" : ">", block[2] ?? "", continuation);
	const nested = continuation.filter((line) => line.trim() !== "");
	if (head === "" && nested.length > 0) {
		if (depth > 0 || nested[0]?.trim().startsWith("-")) return null;
		const indent = Math.min(...nested.map((line) => /^\s*/.exec(line)?.[0].length ?? 0));
		return parseMapping(continuation.map((line) => line.slice(indent)), depth + 1);
	}
	const more = continuation.map((line) => line.trim()).filter(Boolean);
	if (more.length > 0 && !head.startsWith("\"") && !head.startsWith("'")) return parseScalar([head, ...more].join(" "));
	return parseScalar(head);
}
function parseBlockScalar(style, chomp, lines) {
	const indents = lines.filter((line) => line.trim() !== "").map((line) => /^\s*/.exec(line)?.[0].length ?? 0);
	const indent = indents.length === 0 ? 0 : Math.min(...indents);
	const content = lines.map((line) => line.slice(indent));
	while (content.length > 0 && content.at(-1)?.trim() === "" && chomp !== "+") content.pop();
	let text = "";
	if (style === "|") text = content.join("\n");
	else content.forEach((line, i) => {
		if (i === 0) text = line;
		else if (line === "") text += "\n";
		else if (content[i - 1] === "" || /^\s/.test(line)) text += line;
		else text += ` ${line}`;
	});
	return chomp === "-" ? text : `${text}\n`;
}
function parseScalar(text) {
	const value = text.trim();
	if (value.startsWith("\"")) return JSON.parse(value.slice(0, closingDoubleQuote(value) + 1));
	if (value.startsWith("'")) {
		const end = closingSingleQuote(value);
		return value.slice(1, end).replaceAll("''", "'");
	}
	const plain = value.replace(/\s+#.*$/, "");
	if (plain === "true") return true;
	if (plain === "false") return false;
	if (plain === "" || plain === "~" || plain === "null") return null;
	if (/^-?\d+(\.\d+)?$/.test(plain)) return Number(plain);
	return plain;
}
function closingDoubleQuote(value) {
	for (let index = 1; index < value.length; index += 1) if (value[index] === "\\") index += 1;
	else if (value[index] === "\"") return index;
	return value.length - 1;
}
function closingSingleQuote(value) {
	for (let index = 1; index < value.length; index += 1) {
		if (value[index] !== "'") continue;
		if (value[index + 1] === "'") index += 1;
		else return index;
	}
	return value.length;
}
function stripCr(line) {
	return line.replace(/\r$/, "");
}
// src/host/inventory.ts
/**
* Inventory of skills and rules visible to DSH for one workspace: scans the
* same skill roots as `dsh-skill-filesystem`, the rule roots, and both
* `loadout.json` files, and resolves each item's effective state. Also lists
* the instruction files `dsh-agent-instructions` loads (read-only).
*/
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
async function scanInventory(options) {
	const levels = await readLevels(options);
	const skills = [];
	for (const root of skillRoots(options)) skills.push(...await scanSkillRoot(root, levelLoadout(levels, root.level)));
	markOverridden(skills);
	return {
		levels,
		skills,
		rules: await scanRules(options, levels),
		instructions: await scanInstructions(options)
	};
}
/** Defaults of `dsh-agent-instructions`: global roots hold `AGENTS.md` only; project directories hold these, base files first. */
const GLOBAL_INSTRUCTION_FILE = "AGENTS.md";
const PROJECT_INSTRUCTION_FILES = [
	"AGENTS.md",
	"CLAUDE.md",
	"AGENTS.local.md",
	"CLAUDE.local.md"
];
/**
* Instruction files in the order DSH loads them: `$DSH_HOME/AGENTS.md`,
* `$DSH_AGENTS_HOME/AGENTS.md`, then every candidate in each directory from
* the project root down to the workspace folder.
*/
async function scanInstructions({ dshHome, agentsHome, projectRoot, workspacePath }) {
	const found = [];
	for (const [location, home] of [["dsh", dshHome], ["agents", agentsHome]]) {
		const file = join(home, GLOBAL_INSTRUCTION_FILE);
		if (await isFile(file)) found.push({
			name: GLOBAL_INSTRUCTION_FILE,
			level: "global",
			location,
			file
		});
	}
	if (projectRoot === void 0) return found;
	for (const dir of directoryChain(projectRoot, workspacePath ?? projectRoot)) {
		const location = relative(projectRoot, dir).split(sep).join("/") || ".";
		for (const name of PROJECT_INSTRUCTION_FILES) {
			const file = join(dir, name);
			if (await isFile(file)) found.push({
				name,
				level: "project",
				location,
				file
			});
		}
	}
	return found;
}
/** Directories from `root` down to `leaf`, inclusive; `root` alone when `leaf` is outside it. */
function directoryChain(root, leaf) {
	const top = resolve(root);
	const tail = relative(top, resolve(leaf));
	if (tail === "" || tail.startsWith("..") || tail.startsWith(sep)) return [top];
	const chain = [top];
	for (const part of tail.split(sep)) chain.push(join(chain.at(-1) ?? top, part));
	return chain;
}
async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}
/**
* Rules alone, in context order (`dsh`, `agents`, then `project`).
* @param levels - result of {@link readLevels}; read when omitted
*/
async function scanRules(options, levels) {
	const known = levels ?? await readLevels(options);
	const rules = [];
	for (const root of ruleRoots(options)) rules.push(...await scanRuleRoot(root, levelLoadout(known, root.level)));
	return rules;
}
/** Rule roots in context order: the global chain first, then the project. */
function ruleRoots({ dshHome, agentsHome, projectRoot }) {
	const roots = [{
		path: join(dshHome, "rules"),
		source: "dsh",
		level: "global"
	}, {
		path: join(agentsHome, "rules"),
		source: "agents",
		level: "global"
	}];
	if (projectRoot !== void 0) roots.push({
		path: join(projectRoot, ".agents", "rules"),
		source: "project",
		level: "project"
	});
	return roots;
}
async function scanRuleRoot(root, loadout) {
	const rules = [];
	const files = (await listEntries(root.path)).filter((entry) => entry.kind === "file" && entry.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of files) {
		const text = await readText(entry.path);
		if (text === void 0) continue;
		const parsed = parseFrontmatter(text);
		const data = parsed?.data ?? {};
		const fileName = entry.name.slice(0, -3);
		const id = `${root.source}/${fileName}`;
		rules.push({
			id,
			name: nonEmptyString(data.name) ?? fileName,
			description: nonEmptyString(data.description),
			level: root.level,
			source: root.source,
			enabled: ruleEnabled(loadout, id),
			file: entry.path,
			body: (parsed?.body ?? text).trim()
		});
	}
	return rules;
}
/**
* Shadow candidates for the agent-layer provider: registry winners whose
* `loadout.json` state, read from the winner's own level, is narrower than
* the policy the winner already has. `project-*` sources use the project
* loadout; every other source is global.
* @returns shadow summaries sorted by name, with the narrowed `invocation`
*/
function shadowsFor(winners, loadouts) {
	const shadows = [];
	for (const winner of winners) {
		const loadout = winner.source.startsWith("project-") ? loadouts.project : loadouts.global;
		if (loadout === void 0) continue;
		const requested = POLICY[skillState(loadout, winner.name)];
		const invocation = {
			modelInvocable: winner.invocation.modelInvocable && requested.modelInvocable,
			userInvocable: winner.invocation.userInvocable && requested.userInvocable
		};
		if (samePolicy(invocation, winner.invocation)) continue;
		const { name, description, whenToUse, source, path, resourceBase } = winner;
		shadows.push({
			name,
			description,
			...whenToUse !== void 0 ? { whenToUse } : {},
			invocation,
			source,
			...path !== void 0 ? { path } : {},
			...resourceBase !== void 0 ? { resourceBase } : {}
		});
	}
	return shadows.sort((a, b) => a.name.localeCompare(b.name));
}
/** Same-named skills: the lowest rank wins, then root order, then entry order, as in `dsh-skill`. */
function markOverridden(skills) {
	const winners = /* @__PURE__ */ new Map();
	for (const item of [...skills].sort((a, b) => a.rank - b.rank)) {
		const winner = winners.get(item.name);
		if (winner === void 0) winners.set(item.name, item);
		else item.overriddenBy = winner.file;
	}
}
/** Absolute path of a level's `loadout.json`; the project level needs `projectRoot`. */
function loadoutPath({ agentsHome, projectRoot }, level) {
	if (level === "global") return join(agentsHome, "loadout.json");
	if (projectRoot === void 0) throw new Error("the project loadout.json needs a project root");
	return join(projectRoot, ".agents", "loadout.json");
}
/** Both `loadout.json` files. A malformed file reads as empty and carries `error`. */
async function readLevels(options) {
	const levels = { global: await readLevel(loadoutPath(options, "global")) };
	if (options.projectRoot !== void 0) levels.project = {
		projectRoot: options.projectRoot,
		...await readLevel(loadoutPath(options, "project"))
	};
	return levels;
}
function levelLoadout(levels, level) {
	return (level === "project" ? levels.project?.loadout : levels.global.loadout) ?? {};
}
async function readLevel(path) {
	try {
		return {
			loadoutPath: path,
			loadout: parseLoadout(await readText(path))
		};
	} catch (error) {
		return {
			loadoutPath: path,
			loadout: {},
			error: error.message
		};
	}
}
const POLICY = {
	on: {
		modelInvocable: true,
		userInvocable: true
	},
	manual: {
		modelInvocable: false,
		userInvocable: true
	},
	off: {
		modelInvocable: false,
		userInvocable: false
	}
};
function samePolicy(a, b) {
	return a.modelInvocable === b.modelInvocable && a.userInvocable === b.userInvocable;
}
function stateOf(policy) {
	if (policy.modelInvocable) return "on";
	return policy.userInvocable ? "manual" : "off";
}
/** Mirrors `dsh-skill-filesystem`: booleans, 1/0, and yes/no/on/off strings. */
function frontmatterBoolean(data, key) {
	if (!Object.hasOwn(data, key) || data[key] === null) return void 0;
	const value = data[key];
	if (typeof value === "boolean") return value;
	if (value === 1 || value === "1") return true;
	if (value === 0 || value === "0") return false;
	if (typeof value === "string") {
		const lower = value.toLowerCase();
		if ([
			"true",
			"yes",
			"on"
		].includes(lower)) return true;
		if ([
			"false",
			"no",
			"off"
		].includes(lower)) return false;
	}
	throw new TypeError(`frontmatter field "${key}" must be a boolean`);
}
function skillRoots({ dshHome, agentsHome, customSkillDirs = [], projectRoot }) {
	const roots = [];
	if (projectRoot !== void 0) roots.push({
		path: join(projectRoot, ".dsh/skills"),
		source: "project-dsh",
		rank: 100,
		level: "project"
	}, {
		path: join(projectRoot, ".agents/skills"),
		source: "project-agents",
		rank: 200,
		level: "project"
	});
	roots.push(...customSkillDirs.map((path) => ({
		path,
		source: "custom",
		rank: 300,
		level: "global"
	})));
	roots.push({
		path: join(dshHome, "skills"),
		source: "user-dsh",
		rank: 400,
		level: "global",
		skipSystem: true
	}, {
		path: join(agentsHome, "skills"),
		source: "user-agents",
		rank: 500,
		level: "global"
	});
	return roots;
}
async function scanSkillRoot(root, loadout) {
	const skills = [];
	for (const entry of (await listEntries(root.path)).sort((a, b) => a.name.localeCompare(b.name))) {
		if (root.skipSystem === true && entry.name === ".system") continue;
		const file = entry.kind === "directory" ? join(entry.path, "SKILL.md") : entry.kind === "file" && entry.name.endsWith(".md") ? entry.path : void 0;
		if (file === void 0) continue;
		const parsed = parseFrontmatter(await readText(file) ?? "");
		if (parsed === void 0) continue;
		const { name, description, whenToUse } = parsed.data;
		if (typeof name !== "string" || !SKILL_NAME.test(name)) continue;
		if (typeof description !== "string" || description === "") continue;
		let fileInvocation;
		try {
			fileInvocation = {
				modelInvocable: frontmatterBoolean(parsed.data, "disable-model-invocation") !== true,
				userInvocable: frontmatterBoolean(parsed.data, "user-invocable") !== false
			};
		} catch {
			continue;
		}
		const requested = POLICY[skillState(loadout, name)];
		const invocation = {
			modelInvocable: fileInvocation.modelInvocable && requested.modelInvocable,
			userInvocable: fileInvocation.userInvocable && requested.userInvocable
		};
		const hint = nonEmptyString(whenToUse);
		const version = versionOf(parsed.data);
		skills.push({
			name,
			description,
			...hint !== void 0 ? { whenToUse: hint } : {},
			...version !== void 0 ? { version } : {},
			level: root.level,
			source: root.source,
			rank: root.rank,
			state: stateOf(invocation),
			fileManual: !fileInvocation.modelInvocable,
			invocation,
			fileInvocation,
			file,
			entry: entry.path,
			readOnly: isInsideArchive(entry.path)
		});
	}
	return skills;
}
/** `metadata.version` first, as the Agent Skills format places it; a number such as `1.2` reads as `"1.2"`. */
function versionOf(data) {
	const metadata = data.metadata;
	const nested = typeof metadata === "object" && metadata !== null ? metadata.version : void 0;
	for (const value of [nested, data.version]) {
		if (typeof value === "number") return String(value);
		const text = nonEmptyString(value);
		if (text !== void 0) return text;
	}
}
function nonEmptyString(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
function isInsideArchive(path) {
	return /\.asar([\\/]|$)/.test(path);
}
async function listEntries(dir) {
	let names;
	try {
		names = await readdir(dir);
	} catch (error) {
		if (isAbsent(error)) return [];
		throw error;
	}
	const entries = [];
	for (const name of names) {
		const path = join(dir, name);
		try {
			const info = await stat(path);
			entries.push({
				name,
				path,
				kind: info.isDirectory() ? "directory" : info.isFile() ? "file" : "other"
			});
		} catch {}
	}
	return entries;
}
async function readText(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isAbsent(error)) return void 0;
		throw error;
	}
}
function isAbsent(error) {
	const code = error?.code;
	return code === "ENOENT" || code === "ENOTDIR";
}
// src/host/mcp.ts
const prefixOf = (server) => `mcp__${server}__`;
/**
* Global tools grouped by MCP server. A tool belongs to the longest server
* name whose `mcp__<server>__` prefix it carries, so `a__b` keeps its tools
* from `a`.
*/
function toolsByServer(servers, tools) {
	const byLength = [...servers].sort((a, b) => b.length - a.length);
	const grouped = /* @__PURE__ */ new Map();
	for (const tool of tools) {
		const server = byLength.find((name) => tool.name.startsWith(prefixOf(name)));
		if (server === void 0) continue;
		const list = grouped.get(server) ?? [];
		list.push({
			name: tool.name,
			title: tool.name.slice(prefixOf(server).length),
			description: tool.description
		});
		grouped.set(server, list);
	}
	return grouped;
}
/** Current tool names of the hidden servers, the deny list for `ctx.tools.restrict`. */
function deniedTools(hidden, servers, tools) {
	const grouped = toolsByServer(servers, tools);
	return hidden.flatMap((server) => grouped.get(server)?.map((item) => item.name) ?? []).sort();
}
function statusView(status) {
	switch (status.state) {
		case "connected": return {
			state: "connected",
			toolCount: status.toolCount
		};
		case "connecting": return {
			state: "connecting",
			attempt: status.attempt
		};
		case "reconnecting": return {
			state: "reconnecting",
			attempt: status.attempt,
			maxAttempts: status.maxAttempts,
			error: status.lastError
		};
		case "waiting-credentials": return {
			state: "waiting-credentials",
			error: status.lastError
		};
		case "disabled": return { state: "disabled" };
		case "closed": return { state: "closed" };
		case "failed": {
			const error = status.reason === "cleanup" ? status.result.cleanupError : status.lastError;
			return {
				state: "failed",
				reason: status.reason,
				...error !== void 0 ? { error } : {}
			};
		}
	}
}
// src/host/paths.ts
/**
* Filesystem locations as DSH resolves them: `$DSH_HOME`, `$DSH_AGENTS_HOME`,
* the project root of a working directory, and model-facing rule paths.
*/
/** `$DSH_HOME` from the root context when DSH provides it, `$DSH_AGENTS_HOME` resolved like `dsh-home-paths`. */
function resolveHomes(ctx, env = process.env) {
	const dshHomePath = ctx.get("dshHomePath");
	return {
		dshHome: typeof dshHomePath === "function" ? dshHomePath() : resolveHome(env.DSH_HOME, ".dsh"),
		agentsHome: resolveHome(env.DSH_AGENTS_HOME, ".agents")
	};
}
/** An empty or blank variable counts as unset; `~` expands to the home directory. */
function resolveHome(value, fallback) {
	const selected = typeof value === "string" && value.trim() !== "" ? value : join(homedir(), fallback);
	if (selected === "~") return homedir();
	if (selected.startsWith("~/")) return resolve(homedir(), selected.slice(2));
	return resolve(selected);
}
/** Nearest ancestor of `cwd` containing `.git` (file or directory), else `cwd`. Mirrors `dsh-skill-filesystem`. */
async function findProjectRoot(cwd) {
	const start = resolve(cwd);
	let current = start;
	for (;;) {
		try {
			await access(join(current, ".git"));
			return current;
		} catch {}
		const parent = dirname(current);
		if (parent === current) return start;
		current = parent;
	}
}
/**
* Model-facing path of a rule file: `~/.dsh/rules/x.md` (or `$DSH_HOME/...`
* when the home is relocated) for global rules, project-relative for
* project rules. Uses `/` separators.
*/
function ruleDisplayPath(rule, { dshHome, agentsHome, projectRoot }) {
	const base = rule.source === "dsh" ? dshHome : rule.source === "agents" ? agentsHome : projectRoot ?? dirname(rule.file);
	const tail = relative(base, rule.file).split(sep).join("/");
	if (rule.source === "project") return tail;
	const folder = rule.source === "dsh" ? ".dsh" : ".agents";
	if (base === join(homedir(), folder)) return `~/${folder}/${tail}`;
	return `$${rule.source === "dsh" ? "DSH_HOME" : "DSH_AGENTS_HOME"}/${tail}`;
}
// src/host/shadow.ts
/**
* Skill shadowing in each Agent's own registry layer. DSH mounts
* `skill-filesystem` inside every preset, and a nearer layer replaces a
* same-named skill outright, so the shadow must live in the Agent layer.
* Originals are read from the registry with the Agent's preset scope, whose
* chain excludes the Agent layer.
*
* Services come through `ctx.get()`: property access (`ctx.skills`) throws
* without an `inject` declaration, and a throwing `agent/created` listener
* fails agent creation.
*/
const PROVIDER_NAME = "dsh-loadout-manager";
/** Registers a shadow provider on every agent, current and future. */
function registerShadows(ctx, homes) {
	const providers = /* @__PURE__ */ new Map();
	const seen = /* @__PURE__ */ new Map();
	ctx.effect(() => () => {
		for (const entry of providers.values()) entry.dispose();
		providers.clear();
	}, "dsh-loadout-manager: shadow providers");
	function attach(agent) {
		if (ctx.get("skills") === void 0 || providers.has(agent)) return;
		const skills = agent.ctx.get("skills");
		if (skills === void 0) return;
		const entry = {
			control: void 0,
			dispose: () => {}
		};
		const disposer = skills.registerProvider((control) => {
			entry.control = control;
			return createProvider(ctx, agent, homes);
		});
		let disposed = false;
		entry.dispose = () => {
			if (disposed) return;
			disposed = true;
			providers.delete(agent);
			Promise.resolve(disposer()).catch(() => {});
		};
		providers.set(agent, entry);
	}
	function safeAttach(agent) {
		try {
			attach(agent);
		} catch (error) {
			ctx.logger.warn(`dsh-loadout-manager: skill states are not applied to this agent: ${messageOf(error)}`);
		}
	}
	ctx.on("agent/created", ({ agent }) => {
		safeAttach(agent);
	});
	for (const agent of ctx.get("agents")?.list() ?? []) safeAttach(agent);
	ctx.on("agent/disposed", ({ agent }) => {
		providers.get(agent)?.dispose();
	});
	ctx.on("agent/pre-step", async (event, next) => {
		if (providers.get(event.agent)?.control !== void 0) try {
			const cwd = await cwdOf(ctx, event.agent, event.signal);
			const projectRoot = cwd === void 0 ? void 0 : await findProjectRoot(cwd);
			const paths = [`${homes.agentsHome}/loadout.json`];
			if (projectRoot !== void 0) paths.push(`${projectRoot}/.agents/loadout.json`);
			for (const path of paths) {
				const mtime = await mtimeOf(path);
				if (seen.has(path) && seen.get(path) !== mtime) invalidateAll();
				seen.set(path, mtime);
			}
		} catch (error) {
			ctx.logger.warn(`dsh-loadout-manager: loadout.json check failed: ${messageOf(error)}`);
		}
		return next();
	});
	function invalidateAll() {
		for (const { control } of providers.values()) control?.invalidate();
	}
	return { invalidateAll };
}
function createProvider(ctx, agent, homes) {
	return {
		name: PROVIDER_NAME,
		async list(options) {
			const registry = ctx.get("skills");
			if (registry === void 0) return [];
			const cwd = options.cwd;
			const winners = await withPresetScope(ctx, agent, (scope) => registry.list({
				cwd,
				signal: options.signal,
				scope
			}));
			const projectRoot = cwd === void 0 ? void 0 : await findProjectRoot(cwd);
			const levels = await readLevels({
				...homes,
				projectRoot
			});
			return shadowsFor(winners.filter((summary) => summary.provider !== PROVIDER_NAME), {
				global: levels.global.loadout,
				project: levels.project?.loadout
			}).map((shadow) => ({
				...shadow,
				provider: PROVIDER_NAME,
				rank: 0,
				locator: { name: shadow.name }
			}));
		},
		async get(candidate, options) {
			if (!candidate.invocation.userInvocable && !candidate.invocation.modelInvocable) return void 0;
			const registry = ctx.get("skills");
			if (registry === void 0) return void 0;
			const original = await withPresetScope(ctx, agent, (scope) => registry.get(candidate.name, {
				cwd: options.cwd,
				signal: options.signal,
				scope
			}));
			if (original === void 0) return void 0;
			return {
				...original,
				invocation: candidate.invocation,
				provider: PROVIDER_NAME
			};
		}
	};
}
/** Run `read` with the registry scope of the Agent's preset revision; `undefined` scope reads the global layer. */
async function withPresetScope(ctx, agent, read) {
	const presets = ctx.get("agentPresets");
	const id = agent === void 0 ? void 0 : presets?.composedPreset(agent.ctx);
	if (presets === void 0 || agent !== void 0 && id === void 0) return read(void 0);
	const lease = await presets.acquireScope(id);
	try {
		return await read(lease.key);
	} finally {
		await lease[Symbol.asyncDispose]();
	}
}
async function cwdOf(ctx, agent, signal) {
	const workingDirectory = ctx.get("workingDirectory");
	if (workingDirectory === void 0) return void 0;
	return workingDirectory.ensure(agent, signal);
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
async function mtimeOf(path) {
	try {
		return (await stat(path)).mtimeMs;
	} catch {
		return 0;
	}
}
// src/host/mcp-host.ts
const MANAGER_PACKAGE = "@deepseek-ai/dsh-mcp-manager";
var McpUnavailableError = class extends Error {};
/** Servers in the manager's order, with their tools; `undefined` without an MCP manager. */
function readMcpServers(ctx, projectLoadout) {
	const manager = ctx.get("mcpManager");
	if (manager === void 0) return void 0;
	const configured = manager.config.servers.get();
	const views = manager.list().filter((view) => view.configured);
	const tools = (ctx.get("tools")?.definitions() ?? []).filter((tool) => tool.name.startsWith("mcp__"));
	const grouped = toolsByServer(views.map((view) => view.name), tools);
	return views.map((view) => {
		const entry = configured[view.name];
		const endpoint = entry === void 0 ? void 0 : entry.transport === "stdio" ? [entry.command, ...entry.args].join(" ") : entry.url;
		return {
			name: view.name,
			source: entry === void 0 ? "plugin" : "profile",
			...entry !== void 0 ? { transport: entry.transport } : {},
			...endpoint !== void 0 && endpoint !== "" ? { endpoint } : {},
			enabled: entry === void 0 ? true : entry.enabled,
			...projectLoadout !== void 0 ? { hidden: !mcpEnabled(projectLoadout, view.name) } : {},
			status: statusView(view.status),
			tools: view.status.state === "connected" ? grouped.get(view.name) ?? [] : []
		};
	});
}
/** Start or stop a profile server: the same write DSH Settings makes. */
async function setMcpEnabled(ctx, name, enabled) {
	const manager = ctx.get("mcpManager");
	const settings = ctx.get("settings");
	const entry = ctx.get("configEditor")?.entries().find((row) => row.options.name === MANAGER_PACKAGE);
	if (manager === void 0 || settings === void 0 || entry === void 0) throw new McpUnavailableError("MCP servers cannot be switched in this profile");
	if (!Object.hasOwn(manager.config.servers.get(), name)) throw new McpUnavailableError(`"${name}" is registered by a plugin; disable that plugin to stop it`);
	await settings.mutate(entry.options.id, [{
		op: "set",
		path: [
			"servers",
			name,
			"enabled"
		],
		value: enabled
	}]);
	return ctx.get("configEditor")?.documentPath ?? "profile settings";
}
async function restartMcp(ctx, name) {
	const manager = ctx.get("mcpManager");
	if (manager === void 0) throw new McpUnavailableError("this profile has no MCP manager");
	await manager.restart(name);
}
/** A separate test connection: lists the server's tools even while it is stopped. */
async function probeMcp(ctx, name) {
	const manager = ctx.get("mcpManager");
	if (manager === void 0) throw new McpUnavailableError("this profile has no MCP manager");
	const result = await manager.probe(name, { timeoutMs: 1e4 });
	if (!result.ok) return {
		ok: false,
		stage: result.stage,
		message: result.message,
		durationMs: result.durationMs
	};
	return {
		ok: true,
		...result.serverInfo !== void 0 ? {
			serverName: result.serverInfo.name,
			serverVersion: result.serverInfo.version
		} : {},
		tools: result.toolNames,
		truncated: result.truncated,
		durationMs: result.durationMs
	};
}
/**
* Hide the tools of servers the project `loadout.json` turns off from the
* agents working in that project. Re-evaluated before every step, because a
* server's tool list changes while it reconnects.
*/
function registerMcpRestrictions(ctx, homes) {
	const applied = /* @__PURE__ */ new Map();
	const lift = (agent) => {
		const current = applied.get(agent);
		applied.delete(agent);
		try {
			current?.dispose();
		} catch (error) {
			ctx.logger.warn(`dsh-loadout-manager: could not lift an MCP restriction: ${messageOf(error)}`);
		}
	};
	ctx.effect(() => () => {
		for (const agent of [...applied.keys()]) lift(agent);
	}, "dsh-loadout-manager: MCP restrictions");
	ctx.on("agent/disposed", ({ agent }) => {
		lift(agent);
	});
	ctx.on("agent/created", ({ agent, signal }) => {
		sync(agent, signal ?? new AbortController().signal).catch((error) => {
			ctx.logger.warn(`dsh-loadout-manager: MCP servers were not hidden for this agent: ${messageOf(error)}`);
		});
	});
	ctx.on("agent/pre-step", async (event, next) => {
		try {
			await sync(event.agent, event.signal);
		} catch (error) {
			ctx.logger.warn(`dsh-loadout-manager: MCP servers were not hidden for this step: ${messageOf(error)}`);
		}
		return next();
	});
	async function sync(agent, signal) {
		const manager = ctx.get("mcpManager");
		const cwd = manager === void 0 ? void 0 : await cwdOf(ctx, agent, signal);
		const projectRoot = cwd === void 0 ? void 0 : await findProjectRoot(cwd);
		const project = projectRoot === void 0 ? void 0 : (await readLevels({
			...homes,
			projectRoot
		})).project;
		const servers = manager?.list().map((view) => view.name) ?? [];
		const deny = deniedTools(project === void 0 ? [] : servers.filter((name) => !mcpEnabled(project.loadout, name)), servers, ctx.get("tools")?.definitions() ?? []);
		const key = deny.join("\n");
		if (applied.get(agent)?.key === key) return;
		lift(agent);
		if (deny.length === 0) return;
		const tools = agent.ctx.get("tools");
		if (tools === void 0) return;
		applied.set(agent, {
			key,
			dispose: tools.restrict({ deny })
		});
	}
}
// src/host/operations.ts
/**
* Operations shared by the Loadout page (Fetch routes) and the `loadout`
* tool. Every file operation re-scans and accepts only paths the scan
* returned, so a caller cannot reach arbitrary files.
*/
const READ_LIMIT = 262144;
var OperationError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.code = code;
	}
};
function createOperations(ctx, homes, { invalidate, trash = gioTrash }) {
	async function inventoryFor({ workspacePath, cwd }) {
		const projectRoot = cwd !== void 0 ? await findProjectRoot(cwd) : workspacePath === void 0 ? void 0 : await workspaceRoot(workspacePath);
		const customSkillDirs = await customRoots(ctx, projectRoot ?? homedir());
		return {
			projectRoot,
			inventory: await scanInventory({
				...homes,
				customSkillDirs,
				projectRoot,
				workspacePath: cwd ?? workspacePath
			})
		};
	}
	async function workspaceRoot(workspacePath) {
		if (workspacePath === "") throw new OperationError("bad-request", "workspace path is required");
		const registry = ctx.get("workspaceRegistry");
		if (registry !== void 0 && !registry.list().some((workspace) => resolve(workspace.path) === resolve(workspacePath))) throw new OperationError("unknown-workspace", `not a registered workspace: ${workspacePath}`);
		return findProjectRoot(workspacePath);
	}
	async function updateLoadout(level, projectRoot, change) {
		const path = loadoutPath({
			...homes,
			projectRoot
		}, level);
		let current;
		try {
			current = parseLoadout(await readOptional(path));
		} catch (error) {
			throw new OperationError("malformed-loadout", `${path}: ${messageOf(error)}. Fix the file by hand; it was not changed.`);
		}
		await writeAtomic(path, serializeLoadout(change(current)));
		invalidate();
		return path;
	}
	return {
		async state({ workspacePath, cwd } = {}) {
			const { projectRoot, inventory } = await inventoryFor({
				workspacePath,
				cwd
			});
			const group = (level) => {
				const state = level === "project" ? inventory.levels.project : inventory.levels.global;
				const mcp = readMcpServers(ctx, level === "project" ? state?.loadout ?? {} : void 0);
				return {
					...mcp !== void 0 ? { mcp } : {},
					loadoutPath: state?.loadoutPath ?? "",
					...state?.error !== void 0 ? { error: state.error } : {},
					skills: inventory.skills.filter((item) => item.level === level).map(skillView),
					rules: inventory.rules.filter((item) => item.level === level).map(ruleView),
					instructions: inventory.instructions.filter((item) => item.level === level).map(instructionView)
				};
			};
			return {
				global: group("global"),
				...projectRoot !== void 0 ? { workspace: {
					path: workspacePath ?? cwd ?? projectRoot,
					projectRoot,
					...group("project")
				} } : {}
			};
		},
		async setSkill({ workspacePath, cwd, name, state, level }) {
			if (!isSkillState(state)) throw new OperationError("bad-request", `state must be one of ${SKILL_STATES.join(", ")}`);
			const { projectRoot, inventory } = await inventoryFor({
				workspacePath,
				cwd
			});
			const named = inventory.skills.filter((skill) => skill.name === name && (level === void 0 || skill.level === level));
			const item = named.find((skill) => skill.overriddenBy === void 0) ?? named[0];
			if (item === void 0) throw new OperationError("not-found", `no skill named "${name}"`);
			const path = await updateLoadout(item.level, projectRoot, (loadout) => withSkillState(loadout, name, state));
			const note = item.fileManual && state === "on" ? { note: "the skill file sets disable-model-invocation, so it stays manual" } : {};
			return {
				name,
				level: item.level,
				state,
				loadoutPath: path,
				...note
			};
		},
		async setRule({ workspacePath, cwd, id, enabled }) {
			if (typeof enabled !== "boolean") throw new OperationError("bad-request", "enabled must be a boolean");
			const { projectRoot, inventory } = await inventoryFor({
				workspacePath,
				cwd
			});
			const item = inventory.rules.find((rule) => rule.id === id);
			if (item === void 0) throw new OperationError("not-found", `no rule with id "${id}"`);
			const path = await updateLoadout(item.level, projectRoot, (loadout) => withRuleEnabled(loadout, id, enabled));
			return {
				id,
				level: item.level,
				enabled,
				loadoutPath: path
			};
		},
		async setMcp({ workspacePath, cwd, name, enabled }) {
			if (typeof enabled !== "boolean") throw new OperationError("bad-request", "enabled must be a boolean");
			if (workspacePath === void 0 && cwd === void 0) try {
				return {
					name,
					level: "global",
					enabled,
					savedTo: await setMcpEnabled(ctx, name, enabled)
				};
			} catch (error) {
				throw new OperationError(error instanceof McpUnavailableError ? "mcp-unavailable" : "mcp-failed", messageOf(error));
			}
			const { projectRoot } = await inventoryFor({
				workspacePath,
				cwd
			});
			return {
				name,
				level: "project",
				enabled,
				savedTo: await updateLoadout("project", projectRoot, (loadout) => withMcpEnabled(loadout, name, enabled))
			};
		},
		async restartMcp({ name }) {
			try {
				await restartMcp(ctx, name);
			} catch (error) {
				throw new OperationError("mcp-failed", messageOf(error));
			}
			return { name };
		},
		async probeMcp({ name }) {
			try {
				return await probeMcp(ctx, name);
			} catch (error) {
				throw new OperationError("mcp-failed", messageOf(error));
			}
		},
		async remove({ workspacePath, path }) {
			const { inventory } = await inventoryFor({ workspacePath });
			const target = [...inventory.skills.map((skill) => ({
				path: skill.entry,
				readOnly: skill.readOnly
			})), ...inventory.rules.map((rule) => ({
				path: rule.file,
				readOnly: false
			}))].find((item) => item.path === path);
			if (target === void 0) throw new OperationError("not-found", `not a listed skill or rule: ${path}`);
			if (target.readOnly) throw new OperationError("read-only", `${path} is inside the application archive and cannot be deleted`);
			await trash(path);
			invalidate();
			return {
				path,
				trashed: true
			};
		},
		async read({ workspacePath, path }) {
			const { inventory } = await inventoryFor({ workspacePath });
			if (![
				...inventory.skills.map((s) => s.file),
				...inventory.rules.map((r) => r.file),
				...inventory.instructions.map((i) => i.file)
			].includes(path)) throw new OperationError("not-found", `not a listed skill, rule, or instruction file: ${path}`);
			const text = await readFile(path, "utf8");
			return text.length > READ_LIMIT ? {
				path,
				text: text.slice(0, READ_LIMIT),
				truncated: true
			} : {
				path,
				text,
				truncated: false
			};
		}
	};
}
function skillView(item) {
	return {
		name: item.name,
		description: item.description,
		...item.version !== void 0 ? { version: item.version } : {},
		source: item.source,
		state: item.state,
		fileManual: item.fileManual,
		readOnly: item.readOnly,
		file: item.file,
		entry: item.entry,
		...item.overriddenBy !== void 0 ? { overriddenBy: item.overriddenBy } : {}
	};
}
/** Instruction files are read-only: DSH loads every one it finds, `loadout.json` does not switch them. */
function instructionView(item) {
	return {
		name: item.name,
		location: item.location,
		file: item.file
	};
}
function ruleView(item) {
	return {
		id: item.id,
		name: item.name,
		...item.description !== void 0 ? { description: item.description } : {},
		source: item.source,
		enabled: item.enabled,
		file: item.file
	};
}
/** Custom skill roots, derived from registry winners with `source: 'custom'` (default preset scope). */
async function customRoots(ctx, cwd) {
	const registry = ctx.get("skills");
	if (registry === void 0) return [];
	try {
		const winners = await withPresetScope(ctx, void 0, (scope) => registry.list({
			cwd,
			scope
		}));
		const roots = /* @__PURE__ */ new Set();
		for (const winner of winners) {
			if (winner.source !== "custom" || typeof winner.path !== "string") continue;
			roots.add(basename(winner.path) === "SKILL.md" ? dirname(dirname(winner.path)) : dirname(winner.path));
		}
		return [...roots];
	} catch (error) {
		ctx.logger.warn(`dsh-loadout-manager: custom skill roots unavailable: ${messageOf(error)}`);
		return [];
	}
}
async function readOptional(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return void 0;
		throw error;
	}
}
async function writeAtomic(path, text) {
	await mkdir(dirname(path), { recursive: true });
	const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, text);
	await rename(temporary, path);
}
/** `gio trash`; on any failure the file stays where it is. */
function gioTrash(path) {
	return new Promise((resolvePromise, reject) => {
		execFile("gio", [
			"trash",
			"--",
			path
		], { timeout: 15e3 }, (error, _stdout, stderr) => {
			if (error === null) {
				resolvePromise();
				return;
			}
			reject(new OperationError("trash-unavailable", `could not move ${path} to the trash: ${error.code === "ENOENT" ? "gio is not installed" : stderr.trim() || error.message}. Nothing was deleted.`));
		});
	});
}
// src/shared/api.ts
/** Absolute route path of an operation. */
const routePath = (op) => `/api/dsh-loadout-manager/${op}`;
// src/host/routes.ts
function registerRoutes(ctx, operations) {
	const handlers = {
		"state": (body) => operations.state({ workspacePath: optionalString(body.workspacePath) }),
		"set-skill": (body) => operations.setSkill({
			workspacePath: optionalString(body.workspacePath),
			name: requiredString(body.name, "name"),
			state: requiredString(body.state, "state"),
			level: body.level === "global" || body.level === "project" ? body.level : void 0
		}),
		"set-rule": (body) => operations.setRule({
			workspacePath: optionalString(body.workspacePath),
			id: requiredString(body.id, "id"),
			enabled: body.enabled
		}),
		"remove": (body) => operations.remove({
			...workspaceOf(body),
			path: requiredString(body.path, "path")
		}),
		"read": (body) => operations.read({
			...workspaceOf(body),
			path: requiredString(body.path, "path")
		}),
		"mcp-set": (body) => operations.setMcp({
			workspacePath: optionalString(body.workspacePath),
			name: requiredString(body.name, "name"),
			enabled: body.enabled
		}),
		"mcp-restart": (body) => operations.restartMcp({ name: requiredString(body.name, "name") }),
		"mcp-probe": (body) => operations.probeMcp({ name: requiredString(body.name, "name") })
	};
	ctx.inject(["connection"], (scoped) => {
		for (const op of Object.keys(handlers)) {
			const handler = handlers[op];
			scoped.effect(() => scoped.connection.fetch.register({
				path: routePath(op),
				methods: ["POST"],
				requestBody: "buffered",
				fetch: (request) => respond(request, handler)
			}), `dsh-loadout-manager: ${routePath(op)}`);
		}
	});
}
async function respond(request, handler) {
	let body;
	try {
		const text = await request.text();
		const parsed = text === "" ? {} : JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("body must be a JSON object");
		body = parsed;
	} catch (error) {
		return json({
			ok: false,
			error: {
				code: "dsh-loadout-manager/bad-request",
				message: messageOf(error)
			}
		});
	}
	try {
		return json({
			ok: true,
			value: await handler(body)
		});
	} catch (error) {
		return json({
			ok: false,
			error: {
				code: error instanceof OperationError ? `dsh-loadout-manager/${error.code}` : "dsh-loadout-manager/failed",
				message: messageOf(error)
			}
		});
	}
}
function json(value) {
	return Response.json(value, { headers: { "cache-control": "no-store" } });
}
function workspaceOf(body) {
	const workspacePath = optionalString(body.workspacePath);
	return workspacePath === void 0 ? {} : { workspacePath };
}
function optionalString(value) {
	return typeof value === "string" && value !== "" ? value : void 0;
}
function requiredString(value, name) {
	if (typeof value !== "string" || value === "") throw new OperationError("bad-request", `${name} is required`);
	return value;
}
// src/host/rules.ts
/**
* Model-facing rule messages. Mirrors `dsh-agent-instructions`: one baseline
* `<system-reminder>` with every enabled rule, then append-only change
* messages. A snapshot `{ displayPath: digest }` records what the model has
* seen, so state can be rebuilt from the session log. Rules dropped by the
* byte budget are recorded as `omitted:<digest>` so they are not retried
* until their content changes.
*/
const OPEN = "<system-reminder>";
const CLOSE = "</system-reminder>";
const INTRO = "The following rules apply to your work. Treat them like workspace instructions: more specific rules take precedence over broader ones, and they do not override system, developer, or direct user instructions.";
const UPDATED = "This rule changed after it was loaded. Use the following content instead of the previously loaded rule from this file.";
const REMOVED = "The previously loaded rule from this file no longer applies.";
const OMITTED = "omitted:";
/** @param rules - enabled rules, broadest first */
function renderBaseline(rules, { maxBytes }) {
	if (rules.length === 0) return {
		text: "",
		snapshot: {}
	};
	const { text, omitted } = fit(rules.map((rule) => ({
		displayPath: rule.displayPath,
		head: `Rule from: ${rule.displayPath}`,
		body: rule.body
	})), INTRO, maxBytes);
	const snapshot = {};
	for (const rule of rules) snapshot[rule.displayPath] = (omitted.has(rule.displayPath) ? OMITTED : "") + ruleDigest(rule.body);
	return {
		text,
		snapshot
	};
}
/**
* @param previous - snapshot the model has seen
* @param rules - current enabled rules, broadest first
* @returns empty text when nothing changed
*/
function renderChanges(previous, rules, { maxBytes }) {
	const items = [];
	const snapshot = {};
	for (const rule of rules) {
		const digest = ruleDigest(rule.body);
		const seen = previous[rule.displayPath];
		snapshot[rule.displayPath] = seen ?? digest;
		if (seen === digest || seen === OMITTED + digest) continue;
		snapshot[rule.displayPath] = digest;
		const visible = seen !== void 0 && !seen.startsWith(OMITTED);
		items.push(visible ? {
			displayPath: rule.displayPath,
			head: `Updated rule from: ${rule.displayPath}\n\n${UPDATED}`,
			body: rule.body
		} : {
			displayPath: rule.displayPath,
			head: `Additional rule from: ${rule.displayPath}`,
			body: rule.body
		});
	}
	const current = new Set(rules.map((rule) => rule.displayPath));
	for (const [displayPath, seen] of Object.entries(previous)) {
		if (current.has(displayPath) || seen.startsWith(OMITTED)) continue;
		items.push({
			displayPath,
			head: `Rule removed: ${displayPath}`,
			body: REMOVED,
			removal: true
		});
	}
	if (items.length === 0) return {
		text: "",
		snapshot: previous
	};
	const { text, omitted } = fit(items, void 0, maxBytes);
	for (const item of items) {
		if (!omitted.has(item.displayPath)) continue;
		if (item.removal) snapshot[item.displayPath] = previous[item.displayPath] ?? "";
		else snapshot[item.displayPath] = OMITTED + (snapshot[item.displayPath] ?? "");
	}
	return {
		text,
		snapshot
	};
}
/** Digest of a rule body as the model saw it. */
function ruleDigest(body) {
	return createHash("sha256").update(body).digest("hex").slice(0, 16);
}
/**
* Fit sections into `maxBytes`: drop the broadest (earliest) first, then
* truncate the last one. Returns the text and the omitted display paths.
*/
function fit(items, intro, maxBytes) {
	const build = (included, omitted, truncated) => {
		const notes = [];
		if (omitted.length > 0) notes.push(`omitted ${omitted.map((item) => item.displayPath).join(", ")}`);
		if (truncated) notes.push(`truncated ${truncated.displayPath} from ${bytes(truncated.full)} to ${bytes(truncated.body)} bytes`);
		const marker = notes.length > 0 ? [`Rule budget ${maxBytes} bytes: ${notes.join("; ")}`] : [];
		const introBlock = intro === void 0 ? [] : [intro];
		return frame([
			...marker,
			...introBlock,
			...included.map((item) => `${item.head}\n\n${item.body}`)
		]);
	};
	for (let start = 0; start < items.length; start += 1) {
		const text = build(items.slice(start), items.slice(0, start), void 0);
		if (bytes(text) <= maxBytes) return {
			text,
			omitted: new Set(items.slice(0, start).map((item) => item.displayPath))
		};
	}
	const last = items.at(-1);
	if (last === void 0) return {
		text: "",
		omitted: /* @__PURE__ */ new Set()
	};
	const omittedItems = items.slice(0, -1);
	const omitted = new Set(omittedItems.map((item) => item.displayPath));
	let low = 0;
	let high = bytes(last.body);
	let best;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const body = truncateUtf8(last.body, mid);
		const text = build([{
			...last,
			body
		}], omittedItems, {
			displayPath: last.displayPath,
			full: last.body,
			body
		});
		if (bytes(text) <= maxBytes) {
			best = text;
			low = mid + 1;
		} else high = mid - 1;
	}
	if (best === void 0) {
		omitted.add(last.displayPath);
		return {
			text: "",
			omitted
		};
	}
	return {
		text: best,
		omitted
	};
}
function frame(blocks) {
	return [
		OPEN,
		blocks.join("\n\n").replaceAll(CLOSE, "<\\/system-reminder>"),
		CLOSE
	].join("\n");
}
function bytes(text) {
	return Buffer.byteLength(text, "utf8");
}
function truncateUtf8(text, maxBytes) {
	const buffer = Buffer.from(text, "utf8");
	if (buffer.length <= maxBytes) return text;
	let end = maxBytes;
	while (end > 0 && ((buffer[end] ?? 0) & 192) === 128) end -= 1;
	return buffer.subarray(0, end).toString("utf8");
}
// src/host/rules-context.ts
/**
* Rule messages on `agent/pre-step`, next to the AGENTS.md baseline of
* `dsh-agent-instructions`. State lives in the session log: the latest
* `dsh-loadout-manager-rules` message carries the snapshot the model has seen.
*/
const SOURCE_KIND = "dsh-loadout-manager-rules";
const INSTRUCTIONS_MODULE = "@deepseek-ai/dsh-agent-instructions";
/** Adds enabled rules to the context of agents whose preset loads AGENTS.md. */
function registerRuleContext(ctx, homes, { maxBytes }) {
	const eligible = /* @__PURE__ */ new WeakMap();
	ctx.on("agent/pre-step", async (event, next) => {
		const decision = await next();
		const { agent, messages, step, signal } = event;
		if (decision.kind !== "enter") return decision;
		if (step === 1 && decision.messages.length === 0) return decision;
		try {
			if (!hasInstructions(ctx, agent, eligible)) return decision;
			const cwd = await cwdOf(ctx, agent, signal);
			const projectRoot = cwd === void 0 ? void 0 : await findProjectRoot(cwd);
			const rules = (await scanRules({
				...homes,
				projectRoot
			})).filter((rule) => rule.enabled).map((rule) => ({
				displayPath: ruleDisplayPath(rule, {
					...homes,
					projectRoot
				}),
				body: rule.body
			}));
			const previous = lastRulesSource(agent, decision.messages);
			const rendered = previous === void 0 ? renderBaseline(rules, { maxBytes }) : renderChanges(previous.snapshot, rules, { maxBytes });
			if (rendered.text === "") return decision;
			const message = rulesMessage(rendered, previous === void 0);
			return {
				...decision,
				messages: insertAfterInstructions(decision.messages, messages, message)
			};
		} catch (error) {
			ctx.logger.warn(`dsh-loadout-manager: rules were not added to this step: ${messageOf(error)}`);
			return decision;
		}
	});
}
function hasInstructions(ctx, agent, cache) {
	const known = cache.get(agent);
	if (known !== void 0) return known;
	const result = (ctx.get("agentPresets")?.inspectCompositions(agent.ctx) ?? []).some((inspection) => inspection.modules.some((module) => module.moduleName === INSTRUCTIONS_MODULE));
	cache.set(agent, result);
	return result;
}
function isRulesSource(source) {
	return source.kind === SOURCE_KIND;
}
/** Latest rules source among this step's messages, then on the session surface. */
function lastRulesSource(agent, stepMessages) {
	for (const message of stepMessages.toReversed()) if (isRulesSource(message.source)) return message.source;
	for (const message of agent.session.deriveMessages().toReversed()) if (message.role === "user" && isRulesSource(message.source)) return message.source;
}
function rulesMessage({ text, snapshot }, baseline) {
	const source = {
		kind: SOURCE_KIND,
		form: "instructions",
		...baseline ? { baseline: true } : {},
		snapshot: Object.freeze({ ...snapshot })
	};
	return Object.freeze({
		id: randomUUID(),
		role: "user",
		content: Object.freeze([Object.freeze({
			type: "text",
			text
		})]),
		source: Object.freeze(source)
	});
}
/** After the last AGENTS.md message of this step, else after the last claimed message. */
function insertAfterInstructions(entered, claimed, message) {
	let index = entered.findLastIndex((item) => item.source.kind === "agent-instructions");
	if (index < 0) index = entered.findLastIndex((item) => claimed.includes(item));
	return entered.toSpliced(index + 1, 0, message);
}
// src/host/tool.ts
const DESCRIPTION = [
	"List or switch the skills and rules the agent carries (the Loadout plugin).",
	"Skill states: \"on\" (in the model catalog and /name), \"manual\" (hidden from the model, still /name), \"off\" (hidden everywhere).",
	"Rules are .md files from ~/.dsh/rules, ~/.agents/rules, and <project>/.agents/rules; enabled rules are added to context next to AGENTS.md.",
	"MCP servers: kind \"mcp\" with name and enabled hides or shows that server's tools in the current workspace (the project loadout.json); starting and stopping servers stays with the user.",
	"action \"list\" returns global and current-workspace items, MCP servers included. action \"set\" with kind \"skill\" takes name and state; with kind \"rule\" takes name (the rule id, such as \"agents/commit-style\") and enabled.",
	"Changes are written to loadout.json of the item's level and apply from the next step. Only change the loadout when the user asks for it."
].join(" ");
function loadoutTool(ctx, operations) {
	return {
		name: "loadout",
		description: DESCRIPTION,
		parameters: {
			type: "object",
			additionalProperties: false,
			required: ["action"],
			properties: {
				action: {
					type: "string",
					enum: ["list", "set"],
					description: "list, or set one item"
				},
				kind: {
					type: "string",
					enum: [
						"skill",
						"rule",
						"mcp"
					],
					description: "Item kind for action \"set\"."
				},
				name: {
					type: "string",
					description: "Skill name, rule id such as \"agents/commit-style\", or MCP server name, for action \"set\"."
				},
				state: {
					type: "string",
					enum: [
						"on",
						"manual",
						"off"
					],
					description: "New skill state."
				},
				enabled: {
					type: "boolean",
					description: "New rule or MCP switch."
				}
			}
		},
		output: {
			schema: {
				type: "object",
				description: "Listing or the applied change."
			},
			render(_args, value) {
				return [{
					type: "text",
					text: JSON.stringify(value, null, 2)
				}];
			}
		},
		async execute(rawArgs, exec) {
			exec.signal.throwIfAborted();
			const args = typeof rawArgs === "object" && rawArgs !== null ? rawArgs : {};
			const cwd = exec.agent === void 0 ? void 0 : await cwdOf(ctx, exec.agent, exec.signal);
			if (args.action === "list") return compactListing(await operations.state({ cwd }));
			if (args.action !== "set") throw new Error("action must be \"list\" or \"set\"");
			if (typeof args.name !== "string" || args.name === "") throw new Error("name is required for action \"set\"");
			if (args.kind === "skill") {
				if (typeof args.state !== "string") throw new Error("state is required for a skill");
				return operations.setSkill({
					cwd,
					name: args.name,
					state: args.state
				});
			}
			if (args.kind === "rule") {
				if (typeof args.enabled !== "boolean") throw new Error("enabled is required for a rule");
				return operations.setRule({
					cwd,
					id: args.name,
					enabled: args.enabled
				});
			}
			if (args.kind === "mcp") {
				if (typeof args.enabled !== "boolean") throw new Error("enabled is required for an MCP server");
				if (cwd === void 0) throw new Error("MCP servers are hidden per workspace, and this agent has no working directory");
				return operations.setMcp({
					cwd,
					name: args.name,
					enabled: args.enabled
				});
			}
			throw new Error("kind must be \"skill\", \"rule\", or \"mcp\" for action \"set\"");
		}
	};
}
function compactLevel(level) {
	return {
		loadoutPath: level.loadoutPath,
		...level.error !== void 0 ? { error: level.error } : {},
		skills: level.skills.map((skill) => ({
			name: skill.name,
			state: skill.state,
			source: skill.source,
			...skill.fileManual ? { fileManual: true } : {},
			...skill.overriddenBy !== void 0 ? { overriddenBy: skill.overriddenBy } : {}
		})),
		rules: level.rules.map((rule) => ({
			id: rule.id,
			enabled: rule.enabled
		})),
		instructions: level.instructions.map((item) => item.file),
		...level.mcp !== void 0 ? { mcp: level.mcp.map((server) => ({
			name: server.name,
			state: server.status.state,
			enabled: server.enabled,
			...server.hidden === true ? { hiddenInWorkspace: true } : {},
			tools: server.tools.map((tool) => tool.name)
		})) } : {}
	};
}
function compactListing(state) {
	return {
		global: compactLevel(state.global),
		...state.workspace !== void 0 ? { workspace: {
			projectRoot: state.workspace.projectRoot,
			...compactLevel(state.workspace)
		} } : {}
	};
}
// src/index.ts
const name = "dsh-loadout-manager";
const DEFAULT_MAX_BYTES = 65536;
function apply(ctx, config = {}) {
	const maxBytes = readMaxBytes(config);
	const homes = resolveHomes(ctx);
	const shadows = registerShadows(ctx, homes);
	if (maxBytes > 0) registerRuleContext(ctx, homes, { maxBytes });
	registerMcpRestrictions(ctx, homes);
	const operations = createOperations(ctx, homes, { invalidate: () => shadows.invalidateAll() });
	registerRoutes(ctx, operations);
	ctx.inject(["tools"], (scoped) => {
		scoped.effect(() => scoped.tools.register(loadoutTool(ctx, operations)), "dsh-loadout-manager: loadout tool");
	});
}
function readMaxBytes(config) {
	const value = config.maxBytes;
	if (value === void 0) return DEFAULT_MAX_BYTES;
	if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("dsh-loadout-manager: config.maxBytes must be a finite number");
	return Math.trunc(value);
}
export { apply, name };

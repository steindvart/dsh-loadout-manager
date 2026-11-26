# Skill and rule indexes

An index is a JSON document that lists skills and rules a source publishes. The same format covers both kinds, so one repository can publish both. This file covers where indexes come from, their format, and how the Host reads and caches them. What the plugin does with the entries is in [catalog.md](catalog.md).

## Sources

The source list is global: `~/.agents/loadout-indexes.json` (`$DSH_AGENTS_HOME/loadout-indexes.json` when the home is relocated). It is a plain JSON file, editable by hand and from the Catalog subpage:

```json
{
  "format": 1,
  "indexes": [
    "https://github.com/example/team-skills",
    "https://nexus.example/repository/skills/loadout-index.json",
    "/srv/shared/skills"
  ]
}
```

A bare array is also accepted. A source is classified by its string:

| Source | Kind | How it is read |
| --- | --- | --- |
| `/absolute/path` or `~/path` | local | `<path>/loadout-index.json`, files copied from the directory |
| `https://…/index.json` (path ends in `.json`) | HTTP | the URL itself; relative entry paths resolve against it |
| `https://github.com/owner/repo`, `ssh://…`, `git@host:path` | git | shallow clone into the cache |
| `owner/repo` | git | GitHub shorthand for `https://github.com/owner/repo.git` |

Relative local paths are not accepted: the Host process working directory is the DSH profile, not the project, so `./skills` would point somewhere unexpected. A string such as `skills/mine` is read as GitHub shorthand, so a local source needs an absolute path. A local source has no git history; updates use a content digest.

An http(s) source cannot have a `#` fragment: neither `fetch` nor git sends it, so the source would be read by its path alone. A link copied from the Nexus web UI, such as `https://nexus.example/#preview/browse/skills/loadout-index.json`, is refused with the file URL it stands for, `https://nexus.example/repository/skills/loadout-index.json`.

The list is global, while installs target the scope chosen on the page.

## `loadout-index.json`

A git or local source keeps the document at its root. An HTTP source is the document URL, whatever its file name.

```json
{
  "format": 1,
  "title": "Team skills",
  "description": "Shared by the platform team",
  "skills": [
    {
      "name": "tdd",
      "description": "Test-first workflow",
      "version": "1.2.0",
      "tags": ["testing"],
      "path": "skills/tdd"
    },
    {
      "name": "release",
      "path": ".",
      "files": ["SKILL.md", "references/checklist.md"]
    }
  ],
  "rules": [
    {
      "name": "russian-docs",
      "description": "Write user-facing docs in Russian",
      "path": "rules/russian-docs.md"
    }
  ]
}
```

`format` is optional and defaults to `1`; [format 2](#format-2-npm-packages) lists npm packages instead of paths. `title` and `description` are optional strings. `skills` and `rules` are optional arrays. Each entry needs a unique `name` within its kind:

- skill names are kebab-case, as DSH requires;
- rule names use lowercase letters, digits, `-`, and `_`; the installed file is `<name>.md`.

`path` is relative to the source root. For a skill it names a directory with `SKILL.md`; `.` means the source root, which suits a repository that holds one skill. For a rule it names a `.md` file. Paths cannot start with `/`, contain `..` segments, or point into `.git`.

A skill entry may carry `files`, used only by HTTP sources: the files fetched under `path`. Without it, an HTTP source fetches `SKILL.md` alone. Instead of a directory, an HTTP skill path may name an archive with `.tar.gz`, `.tgz`, or `.zip`; the archive must hold `SKILL.md` at its root or inside one top-level directory.

Rules are single files. They may have frontmatter, but it is optional, as it is for rule files the user writes by hand.

## Format 2: npm packages

A format 2 index lists, for every skill and rule, the npm package versions it can be installed from, as a DSH plugin market index lists plugin versions. Any source kind can serve it: the document says where the content lives, the source only where the document lives.

```json
{
  "format": 2,
  "title": "ai-agent-loadout",
  "skills": [
    {
      "name": "tdd",
      "description": "Test first.",
      "tags": ["testing"],
      "repository": { "url": "https://git.example/team/loadout", "directory": "skills/tdd" },
      "dist-tags": { "latest": "1.1.0" },
      "versions": [
        {
          "version": "1.1.0",
          "publishTimestamp": 1795699930,
          "source": { "type": "npm", "package": "@team-skills/tdd", "registry": "https://nexus.example/repository/npm-group/" }
        }
      ]
    }
  ],
  "rules": []
}
```

`name`, `description`, and `tags` follow format 1. `versions` is a non-empty array; each `version` is an exact SemVer string, unique in the entry, with an integer `publishTimestamp` in Unix seconds. `source.type` must be `npm`; any other type is refused. `source.package` is a valid npm package name, and `source.registry` an http(s) URL without credentials, query, or fragment. Each version carries its own source, so a package that moved to another name or registry keeps its older versions listed. `dist-tags` is optional and maps a tag to a listed version. Other members, such as `repository`, are ignored.

The Host pins one version per entry: the `latest` dist-tag, else the highest release, else the highest prerelease. It installs that exact version, never `<package>@latest`, so the copy matches what the index showed. The entry reports the pinned version, and the provenance stores `<package>@<version>` as the entry path.

The package is an ordinary npm tarball whose `package.json` has a `loadout` field:

```json
{ "name": "@team-skills/tdd", "version": "1.1.0", "loadout": { "kind": "skill", "name": "tdd", "path": "skill" } }
```

`kind` and `name` match the index entry. `path` names the payload inside the package: the skill directory or the rule `.md` file, with the same safety rules as an entry `path`. Only the payload is installed; `package.json`, the README, and other package files stay out of the copy.

## Requirements for entries

The Host refuses an entry that breaks one of these rules. The document shape and links are checked when the source is read, the content when the entry is installed.

- The index file is at most 2 MiB and is not a symbolic link.
- A skill directory holds a regular `SKILL.md` with YAML frontmatter; its `name` equals the entry `name`, and its `description` is not empty.
- A skill is at most 20 MiB and 2000 files, with no symbolic links anywhere inside. An archive has the same limits once unpacked, and its members cannot have absolute paths or `..` segments.
- A rule is a regular, non-empty `.md` file of at most 1 MiB.
- An entry is not a symbolic link and does not lead outside its source through a linked parent directory.
- An HTTP entry and its `files` stay on the origin of the index.
- An npm package tarball stays on the origin of its registry and matches the sha512 `integrity` the registry publishes, or its sha1 `shasum` when that is all the registry has. Its `package.json` names the pinned package and version and declares a `loadout` field that matches the entry.

## Cache and refresh

The Host caches each source under `$DSH_HOME/loadout-manager/indexes/<hash>/`: a `cache.json` with the validated entries, a `repo/` working clone for git, and temporary space for archives. The cache is reused for ten minutes. Removing a source deletes its directory.

Opening the Catalog subpage refreshes sources whose last attempt is older than ten minutes. The buttons refresh one source or all of them. A failed read keeps the previous entries and records the error on the source, so one broken repository does not empty the rest of the catalog. A failed read also counts as an attempt, which keeps the page from retrying it on every open.

Each entry gets an update marker when its source is read:

- git sources are cloned with depth 1 and read at a pinned commit. A refresh fetches `origin HEAD`, resets the clone, and takes each entry's git tree or blob id;
- local sources are hashed with SHA-256 over relative file names, sorted by code unit so the locale does not matter, and file contents;
- HTTP sources have no cheap content marker, so their marker is the entry's `version`.
- npm entries are marked by their pinned version: a published npm version never changes its content.

How the markers decide an update is in [catalog.md](catalog.md#installing-and-updating).

## Reading a source

Index content is third-party content. While reading a source, the Host:

- validates the document shape, names, paths, and duplicates, and reports the JSON path of the first invalid value;
- checks git entries by their mode in the tree, so a symbolic link is refused before it is used;
- resolves the real path of a local or checked-out entry and refuses it when that path leaves the source.

A git source runs with prompts disabled, repository hooks off, and only the https, http, and ssh transports allowed. The user's git configuration and credentials still apply. An HTTP source uses the Host `fetch`, follows redirects, and sends no credentials. Entry and file URLs must keep the origin of the index after its redirects, so a path such as `https:other.example/x` or `data:…` is refused before anything is fetched.

An npm entry is read at install time, not at refresh. The Host asks the pinned registry for the package document (`<registry><package>`, the scope's `/` written as `%2f`), takes the version's `dist.tarball` and `dist.integrity`, and fetches the tarball without credentials. The tarball is checked against the integrity, then unpacked through the archive limits. npm, pnpm, and `.npmrc` take no part. The registry is the index's claim: an index can point a package name at any registry, so the Catalog subpage shows which source listed the entry.

## Limits of this version

- HTTP indexes detect updates by `version` only; a source that changes content without changing the version looks current.
- HTTP directories need a `files` list unless they are archives.
- Git sources read the default branch; there is no branch, tag, or commit pin in the source string.
- No index authentication, signatures, or checksums beyond the transport and the local digest. An index behind HTTP authentication cannot be read.
- A source can list a skill and a rule with the same name; they are separate entries.
- npm entries install the pinned version only; there is no version picker. Registries that require authentication cannot be read, and a format 2 index serves only `npm` sources.

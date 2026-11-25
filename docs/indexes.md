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

`format` is optional and must be `1` when present. `title` and `description` are optional strings. `skills` and `rules` are optional arrays. Each entry needs a unique `name` within its kind:

- skill names are kebab-case, as DSH requires;
- rule names use lowercase letters, digits, `-`, and `_`; the installed file is `<name>.md`.

`path` is relative to the source root. For a skill it names a directory with `SKILL.md`; `.` means the source root, which suits a repository that holds one skill. For a rule it names a `.md` file. Paths cannot start with `/`, contain `..` segments, or point into `.git`.

A skill entry may carry `files`, used only by HTTP sources: the files fetched under `path`. Without it, an HTTP source fetches `SKILL.md` alone. Instead of a directory, an HTTP skill path may name an archive with `.tar.gz`, `.tgz`, or `.zip`; the archive must hold `SKILL.md` at its root or inside one top-level directory.

Rules are single files. They may have frontmatter, but it is optional, as it is for rule files the user writes by hand.

## Requirements for entries

The Host refuses an entry that breaks one of these rules. The document shape and links are checked when the source is read, the content when the entry is installed.

- The index file is at most 2 MiB and is not a symbolic link.
- A skill directory holds a regular `SKILL.md` with YAML frontmatter; its `name` equals the entry `name`, and its `description` is not empty.
- A skill is at most 20 MiB and 2000 files, with no symbolic links anywhere inside. An archive has the same limits once unpacked, and its members cannot have absolute paths or `..` segments.
- A rule is a regular, non-empty `.md` file of at most 1 MiB.
- An entry is not a symbolic link and does not lead outside its source through a linked parent directory.
- An HTTP entry and its `files` stay on the origin of the index.

## Cache and refresh

The Host caches each source under `$DSH_HOME/loadout-manager/indexes/<hash>/`: a `cache.json` with the validated entries, a `repo/` working clone for git, and temporary space for archives. The cache is reused for ten minutes. Removing a source deletes its directory.

Opening the Catalog subpage refreshes sources whose last attempt is older than ten minutes. The buttons refresh one source or all of them. A failed read keeps the previous entries and records the error on the source, so one broken repository does not empty the rest of the catalog. A failed read also counts as an attempt, which keeps the page from retrying it on every open.

Each entry gets an update marker when its source is read:

- git sources are cloned with depth 1 and read at a pinned commit. A refresh fetches `origin HEAD`, resets the clone, and takes each entry's git tree or blob id;
- local sources are hashed with SHA-256 over relative file names, sorted by code unit so the locale does not matter, and file contents;
- HTTP sources have no cheap content marker, so their marker is the entry's `version`.

How the markers decide an update is in [catalog.md](catalog.md#installing-and-updating).

## Reading a source

Index content is third-party content. While reading a source, the Host:

- validates the document shape, names, paths, and duplicates, and reports the JSON path of the first invalid value;
- checks git entries by their mode in the tree, so a symbolic link is refused before it is used;
- resolves the real path of a local or checked-out entry and refuses it when that path leaves the source.

A git source runs with prompts disabled, repository hooks off, and only the https, http, and ssh transports allowed. The user's git configuration and credentials still apply. An HTTP source uses the Host `fetch`, follows redirects, and sends no credentials. Entry and file URLs must keep the origin of the index after its redirects, so a path such as `https:other.example/x` or `data:…` is refused before anything is fetched.

## Limits of this version

- HTTP indexes detect updates by `version` only; a source that changes content without changing the version looks current.
- HTTP directories need a `files` list unless they are archives.
- Git sources read the default branch; there is no branch, tag, or commit pin in the source string.
- No index authentication, signatures, or checksums beyond the transport and the local digest. An index behind HTTP authentication cannot be read.
- A source can list a skill and a rule with the same name; they are separate entries.

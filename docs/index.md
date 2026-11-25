# Skill and rule indexes

The Catalog tab installs skills and rules from indexes the user configures. An index is a JSON document that lists entries; the same format covers both kinds, so one repository can publish both. Installing copies the entry into the selected scope. The plugin does not run anything from an index, and the entry files stay ordinary skill and rule files afterwards.

## Sources

The source list is global: `~/.agents/loadout-indexes.json` (`$DSH_AGENTS_HOME/loadout-indexes.json` when the home is relocated). It is a plain JSON file, editable by hand and through the tab:

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

The list is global. Installing still targets the chosen scope: Global writes under `~/.agents`, a workspace writes under `<project>/.agents`.

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

## Cache and refresh

The Host caches each source under `$DSH_HOME/loadout-manager/indexes/<hash>/`: a `cache.json` with the validated entries, a `repo/` working clone for git, and temporary space for archives. The cache is reused for ten minutes.

Opening the Catalog tab refreshes sources whose last attempt is older than ten minutes. The buttons refresh one source or all of them. A failed read keeps the previous entries and records the error on the source, so one broken repository does not empty the rest of the catalog. A failed read also counts as an attempt, which keeps the tab from retrying it on every open.

Git sources are cloned with depth 1 and read at a pinned commit. A refresh fetches `origin HEAD`, resets the clone, and computes each entry's git tree or blob id, which is the update marker. Local sources are hashed with SHA-256 over sorted relative file names and contents. HTTP sources have no cheap content marker; their update marker is the entry's `version`.

## Installing and updating

| Level | Skills | Rules | Provenance |
| --- | --- | --- | --- |
| Global | `~/.agents/skills/<name>/` | `~/.agents/rules/<name>.md` | `~/.agents/.loadout-manager/installed.json` |
| Workspace | `<project>/.agents/skills/<name>/` | `<project>/.agents/rules/<name>.md` | `<project>/.agents/.loadout-manager/installed.json` |

The provenance file records the source, entry path, version, git revision or digest, and the digest of the installed content. The Catalog tab uses it to show where a copy came from and whether the source has newer content.

An install refuses to overwrite:

- a file or directory that exists without provenance (`unmanaged`);
- a copy installed from another index (`conflict`);
- a copy whose content no longer matches its recorded digest, unless the user confirms a replacement (`modified`).

A replacement is staged next to the target, the old copy is renamed aside, and only then does the new copy take its name. After a successful rename the old copy goes to the trash through `gio trash`. If the trash is unavailable, the new copy stays and the row names the leftover backup; nothing is deleted permanently.

Updates compare the source revision: a git tree or blob id, a local digest, or, for HTTP, the entry version. An HTTP entry without a version has no update detection.

Deleting an installed skill or rule through the Skills or Instructions tab also removes its provenance record, so the Catalog tab stops treating the path as managed.

## Validation and limits

Index content is third-party content. Before anything is installed, the plugin:

- validates the document shape, names, paths, and duplicates, and reports the JSON path of the first invalid value;
- reads the index through a size limit of 2 MiB, a rule through 1 MiB, and a skill or archive through 20 MiB and 2000 files;
- refuses symbolic links inside a skill;
- checks archive member names before extraction and refuses absolute paths and `..`;
- reads `SKILL.md` after staging and requires its `name` to match the entry and its `description` to be non-empty;
- writes files atomically and never leaves a partially replaced skill.

A git source runs with prompts disabled, repository hooks off, and only the https, http, and ssh transports allowed. The user's git configuration and credentials still apply. An HTTP source uses the Host `fetch`, follows redirects, and sends no credentials; an index behind authentication is not supported in this version.

## Agent access

The `loadout` tool gains `action: "search"`: it searches the cached catalog, with an optional `query`, `kind`, and `limit`, and reports installed copies and available updates. It never fetches a source and cannot install. Installation stays with the user on the page.

## Limits of this version

- HTTP indexes detect updates by `version` only; a source that changes content without changing the version looks current.
- HTTP directories need a `files` list unless they are archives.
- Git sources read the default branch; there is no branch, tag, or commit pin in the source string.
- No index authentication, signatures, or checksums beyond the transport and the local digest.
- A source can list a skill and a rule with the same name; they are separate entries.

The UI shares the scope picker with the rest of the page. Its strings live in `src/client/locale.ts` next to the other page copy.

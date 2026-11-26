# Catalog

The Catalog subpage installs skills and rules from the [indexes](indexes.md) the user configures. Installing copies an entry into the selected scope. The plugin does not run anything from an index, and the installed files stay ordinary skill and rule files: the Skills and Instructions tabs list them and switch them like any other. The page layout is in [panel.md](panel.md); its strings live in `src/client/locale.ts` next to the other page copy.

## Where copies go

| Level | Skills | Rules | Provenance |
| --- | --- | --- | --- |
| Global | `~/.agents/skills/<name>/` | `~/.agents/rules/<name>.md` | `~/.agents/.loadout-manager/installed.json` |
| Workspace | `<project>/.agents/skills/<name>/` | `<project>/.agents/rules/<name>.md` | `<project>/.agents/.loadout-manager/installed.json` |

The provenance file records the source, entry path (`<package>@<version>` for an npm entry), version, git revision or digest, and the digest of the installed content. The Catalog subpage uses it to show where a copy came from and whether the source has newer content.

## Installing and updating

An install refuses to overwrite:

- a file or directory that exists without provenance (`unmanaged`);
- a copy installed from another index (`conflict`);
- a copy whose content no longer matches its recorded digest, unless the user confirms a replacement (`modified`).

A replacement is staged under `.loadout-manager/work`, outside the roots DSH scans, the old copy is renamed into `.loadout-manager/backups`, and only then does the new copy take its name. The first install writes `.loadout-manager/.gitignore` with `work/` and `backups/`, unless the file exists, so these never land in a project commit. After a successful rename the old copy goes to the trash through `gio trash`. If the trash is unavailable, the new copy stays and the row names the leftover backup; nothing is deleted permanently.

An update is available when the source content changed (a git tree or blob id, a local digest) or when the index declares a newer `version` than the installed copy. Versions compare as SemVer when both parse, so `1.10.0` is newer than `1.9.0`; an unreadable pair falls back to plain inequality. A copy with no recorded version updates once the index gains one. HTTP and npm entries have no digest, so their `version` is the only signal; for an npm entry it is the version the index pins. The version stored for a copy is the index `version`, else the one in the skill's frontmatter.

Installs and refreshes of one source run one at a time, so a refresh never resets a git clone while an install copies from it.

## Auto-update

The plugin config has an `autoUpdate` switch, off by default. It is a volatile field, so it is the one control the plugin's configuration page on the Plugins page renders, and it starts or stops the timer without remounting the plugin; `maxBytes` stays an ordinary field edited through the profile patch. While the switch is on, the Host refreshes every index source and updates the installed copies whose source published newer content, once when the switch turns on and then every 30 minutes. A pass updates only the global level: the Host does not enumerate projects, so project installs stay manual. Copies with local changes (`modified`) and copies installed from another index (`foreign`) are left alone; a copy whose update fails mid-pass is also skipped, and nothing is deleted on failure.

The pass reuses the ordinary install path, so its guarantees hold: an update refuses to overwrite a modified copy, stages the new content outside the roots DSH scans, and moves the old copy to the trash after a successful rename.

## Deleting

Deleting an installed skill or rule from a Catalog row, or through the Skills or Instructions tab, also removes the provenance record of that path, so the Catalog subpage stops treating it as managed. A same-named skill or rule in another root, such as `~/.dsh/skills`, keeps the record of the managed copy. The Catalog button acts on the copy of the current scope; a copy installed in the other scope is removed from that scope's page.

## Checks before installing

An install enforces the [requirements for entries](indexes.md#requirements-for-entries) on the copy it is about to write:

- a skill is copied into staging first, and `SKILL.md` is read from there, so the check sees exactly the files that will be installed;
- an archive's member names, unpacked size, and file count are checked before extraction: a gzip stream is inflated in memory through the limit, and a zip is measured from its central directory;
- files are written atomically, and a skill is never left partially replaced.

## Agent access

The `loadout` tool gains `action: "search"`: it searches the cached catalog, with an optional `query`, `kind`, and `limit`, and reports installed copies and available updates. It never fetches a source and cannot install. Installation stays with the user on the page.

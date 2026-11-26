# Catalog fixture

A format 1 index used by `test/index-fixture.test.ts` and by a manual Catalog check.
It lists two skills (`index-demo` 1.0.0, `index-versioned` 2.4.0) and two rules
(`index-demo-rule` 1.0.0, `index-versioned-rule` 2.1.0). The same entries as npm
packages are in [`../index-npm`](../index-npm/README.md).

## Trying it in DSH

On the Catalog page (open it from the Loadout Manager header), add one of these
sources:

- the absolute path to this directory;
- the raw URL of `loadout-index.json` in a repository, for example
  `https://raw.githubusercontent.com/steindvart/dsh-loadout-manager/main/test/fixtures/index/loadout-index.json`.
  On GitLab the raw URL has the form `https://<host>/<group>/<project>/-/raw/<branch>/test/fixtures/index/loadout-index.json`.

Over HTTP the plugin fetches only the files a skill's `files` lists, so a new file
in a skill directory goes into that list too.

## Testing an update

Change the file and its index version, then press Refresh on the source. For a
skill, keep `metadata.version` in `SKILL.md` and `version` in `loadout-index.json`
in step; for a rule, the index `version` is the only version field. An HTTP source
notices an update by `version` only.

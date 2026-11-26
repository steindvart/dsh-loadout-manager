# npm Catalog fixture

A format 2 index used by `test/index-fixture.test.ts` and by a manual Catalog check
against a local Nexus. It lists the same two skills (`index-demo` 1.0.0, `index-versioned` 2.4.0) and two rules
(`index-demo-rule` 1.0.0, `index-versioned-rule` 2.1.0) as [`../index`](../index/README.md). Each of them is an npm
package in `packages/<name>/` under the `@dsh-loadout-fixtures` scope. Its
`package.json` carries the `loadout` field, and the skill or rule itself sits in
`skill/` or `<name>.md`.

The index points at the local Nexus stand, `http://127.0.0.1:8081/repository/npm-group/`.
The test does not need the stand: it serves the same packages from a registry of its own.

## Trying it in DSH

1. Publish the packages to the stand. A version the registry already has is skipped.

   ```sh
   NPM_REGISTRY=http://127.0.0.1:8081/repository/npm-hosted/ NEXUS_LOGIN=… NEXUS_PASSWORD=… node scripts/publish-fixture.mjs
   ```

2. On the Catalog page (open it from the Loadout Manager header), add this
   directory as a source by its absolute path.

## Testing an update

A published npm version never changes, so an update is a new version:

1. Change the files and raise `version` in the package's `package.json`. For a
   skill, raise `metadata.version` in `SKILL.md` to match.
2. Publish with the command above.
3. In `loadout-index.json`, add the version to the entry's `versions` and move
   `dist-tags.latest` to it.
4. Press Refresh on the source.

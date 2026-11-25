# Catalog fixture

A local index used by `test/index-fixture.test.ts` and by a manual Catalog check.
It lists two skills (`index-demo` 1.0.0, `index-versioned` 2.4.0) and two rules
(`index-demo-rule` 1.0.0, `index-versioned-rule` 2.1.0).

To try it in the running DSH, add this directory as a source on the Catalog tab.

To test an update, change the file and its index version, then press Refresh on
the source. For a skill, keep `metadata.version` in `SKILL.md` and `version` in
`loadout-index.json` in step; for a rule, the index `version` is the only version
field.

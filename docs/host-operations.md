# Host operations

Operations are implemented once in the Host and reached in two ways:

- the panel – `POST /api/dsh-loadout-manager/<op>` through `ctx.connection.fetch.register` (owner only), responding with `{ ok: true, value } | { ok: false, error: { code, message } }`;
- the agent – the `loadout` tool with `action: 'list' | 'set' | 'search'`: lists skills and rules with their states and switches them; search reads the cached catalog and never installs. Moving to the trash and installing from an index stay with the user.

The catalog adds operations with the same envelope:

| Operation | Request | Answer |
| --- | --- | --- |
| `index-state` | `workspacePath?` | cached sources and entries with installed copies; never fetches |
| `index-refresh` | `workspacePath?`, `source?`, `ifStale?` | reads one source or all, then returns the same view |
| `index-add-source` | `workspacePath?`, `source` | saves the source list and reads the new source |
| `index-remove-source` | `workspacePath?`, `source` | drops the source from the list; installed items stay |
| `index-install` | `workspacePath?`, `source`, `kind`, `name`, `force?` | installs or replaces one entry in the selected scope |

`workspacePath` selects the project level, as elsewhere: without it the target is global. `force` replaces a copy whose content changed after installation. The source string rules, the JSON format, and the cache layout are in [index.md](index.md).

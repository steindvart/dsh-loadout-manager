# Host operations

Operations are implemented once in the Host and reached in two ways:

- the panel – `POST /api/dsh-loadout-manager/<op>` through `ctx.connection.fetch.register` (owner only), responding with `{ ok: true, value } | { ok: false, error: { code, message } }`;
- the agent – the `loadout` tool with `action: 'list' | 'set'`: lists skills and rules with their states and switches them. Moving to the trash stays with the user.

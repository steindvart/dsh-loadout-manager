# Loadout Manager (dev)

A development clone of `dsh-loadout-manager`. It builds the same source under the `dsh-loadout-manager-dev` identity — distinct providers, routes, tools, slots, and locale namespaces — so it can be installed and enabled next to the shipped plugin without replacing it.

## Build

```sh
npm run build:dev
```

This compiles `src/` into `dev/lib/` with the dev identity and leaves the shipped `lib/` untouched.

## Install

In DSH: **Plugins** → **Add plugin**, and enter the absolute path to this `dev/` directory. Installing a local directory links the checkout, so each `npm run build:dev` is picked up on the next plugin reload (or DSH restart).

## Notes

- Enable only the dev clone **or** the shipped plugin at a time while testing; both write skills and rules to the same `~/.agents` and project roots, so running them together changes the same loadout.
- Host changes take effect after the bundle is reloaded (turned off and on) or DSH restarts; the page picks up `dev/lib/client.js` on a page reload.

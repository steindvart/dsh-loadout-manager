## Problem

<!-- Describe the problem these changes solve. Link issues as "Fixes #1, fixes #2" (one keyword per issue, so each closes on merge). -->

## Solution

<!-- Describe your changes in detail. If a design decision in docs/ changes, say which one and why. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Refactoring
- [ ] Documentation
- [ ] Other (please describe)

## Checklist

- [ ] `npm run check` passes (ESLint, `tsc`, and all tests)
- [ ] The rebuilt `lib/` is committed
- [ ] New or changed pure modules in `src/host/` have tests
- [ ] Changes to the `ctx` adapters are checked on a live DSH
- [ ] New UI strings are added to `en`, `ru`, and `zh` in `src/client/locale.ts`
- [ ] The docs (`docs/`, `docs_ru/`, and the READMEs) are updated where the behavior changed
- [ ] My commit messages follow the conventional commits format (`type(scope): description`)

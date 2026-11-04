# Contributing to Uplink

Thanks for helping. Uplink is a small project with one maintainer, so a short issue before a big change saves us both time.

## Getting started

```sh
bun install
bun run demo   # every page filled with a sample car, no Tesla account or database needed
```

See the [README](README.md) for running against a real Tesla account.

## Before you open a pull request

All three pass:

```sh
bunx tsc --noEmit -p .   # run `bunx next typegen` first if it reports missing PageProps
bun run test
bun run build
```

- **Logic changes** (server code, data, Tesla answers, alerts, setup) come with a test that fails without the change.
- **Page or copy changes** come with screenshots from demo mode, desktop and a 375px phone.
- **Migrations** are additive only. The code has to work with and without the new column.

## Writing for owners

Most people who read Uplink own a Tesla and have never seen code. Every label, tooltip and error follows `.claude/skills/uplink-copy/SKILL.md`: plain words, short sentences, Indian/British spelling (kilometres, colour).

## Docs

Each area has a doc in `docs/` that records the decisions behind it. Read it before changing that area. `AGENTS.md` holds the full rules for coding agents and people alike.

## Licence

By contributing, you agree that your contribution is licensed under the [GNU AGPL v3.0](LICENSE), the same as the rest of Uplink.

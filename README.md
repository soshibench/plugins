# Workbench plugin registry

The plugin index that [Workbench](https://github.com/soshibench/workbench)
reads to show its Plugins → Browse tab.

- [`registry.json`](registry.json) — the index the app fetches.
- [`schema/registry.schema.json`](schema/registry.schema.json) — the JSON
  Schema it must satisfy, generated from the app's own validation schema by
  `bun scripts/emit-registry-schema.ts` in the Workbench repository.
- [`KEYS.md`](KEYS.md) — the signing key artifacts are verified against.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to get a plugin listed.

## Status

Open for listings. The signing key is published in
[`registry.pub`](registry.pub); no plugin is listed yet.

The app fetches the index from:

```
https://raw.githubusercontent.com/soshibench/plugins/main/registry.json
```

Every listed artifact carries a sha256 digest and a detached minisign
signature. The app refuses any download whose digest or signature does not
match, and CI on this repository checks the same two things for every listing
on every pull request.

## Checking the index locally

```bash
bun install
bun scripts/validate.ts           # downloads and verifies every artifact
bun scripts/validate.ts --offline # schema and structure only
```

Artifact verification needs the `minisign` binary on PATH.

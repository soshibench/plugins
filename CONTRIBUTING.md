# Contributing a plugin

Listing is curated: a plugin appears in the registry only after the owner
signs its artifacts, so a pull request that edits `registry.json` by hand will
be closed. What you send is a listing request; the signature is added here.

## What a plugin needs first

- A public repository with a build that produces a `.dbxplugin` package per
  platform it supports, via `bun scripts/pack-plugin.ts` from the Workbench
  repository.
- A published release whose artifacts are downloadable over https at stable
  URLs — a GitHub release asset URL is ideal, since it never changes.
- A manifest declaring the `pluginApi` level it targets and the Workbench
  version range it supports.

## Requesting a listing

Open an issue titled `List <plugin id>@<version>` with:

- the plugin id, display name, one-line description and publisher
- the homepage, if there is one
- the version being listed
- the Workbench version range and `pluginApi` level the build targets
- one download URL per platform, as `<platform>=<url>` pairs

Platforms are `macos-arm64`, `macos-x64`, `linux-x64`, `win-x64`, or
`universal` for a build with no native code.

## What happens next

1. The owner reviews the plugin: what it does, what it reads, and whether the
   package matches its source.
2. The owner runs the **Sign and list a release** workflow with the values
   from the issue. It downloads each artifact, records its sha256, signs it
   with the registry key, updates `registry.json`, and opens a pull request.
3. CI on that pull request re-downloads every artifact and checks both the
   digest and the signature.
4. The owner merges. The app picks the new listing up on its next refresh.

## Rules that keep the index trustworthy

- A published version is never replaced. Ship a new version instead — the app
  compares versions and offers an update.
- One artifact per platform per version.
- `latest` is maintained by the tooling, not by hand.
- An artifact URL must keep serving the exact bytes that were signed. If the
  bytes change, the signature stops verifying and the app refuses the install.

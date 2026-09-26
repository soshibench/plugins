# Signing keys

Every plugin artifact listed in `registry.json` is signed with the registry's
minisign key. Workbench verifies that signature before it installs anything,
using the public key configured for this registry source. A listing whose
signature does not verify is refused by the app and by this repository's CI.

## Current key

The public key lives in [`registry.pub`](registry.pub) and is reproduced here:

```
untrusted comment: minisign public key 6371E3A31987F5E9
RWRjceOjGYf16TjzO/O7Lj6kjDH48IjSXavBSUiL5BvN7jbrmrTRmkoc
```

Key id: `6371E3A31987F5E9`

## Where the private key lives

- The owner's offline backup.
- The `MINISIGN_SECRET_KEY` and `MINISIGN_SECRET_KEY_PASSWORD` secrets on this
  repository, used only by the "Sign and list a release" workflow.

It is never committed to this repository or to the Workbench repository, and
it is never written anywhere a git working tree can reach it — the generator
refuses to do so.

## Rotating the key

Rotation is a breaking change for every installed plugin, because the app
verifies against the key it has configured. To rotate:

1. Generate the new key offline.
2. Ship a Workbench release whose `default-registry.ts` carries the new public
   key, and wait for it to become the version most users run.
3. Re-sign every listed artifact with the new key and open the index PR.
4. Replace `registry.pub` and this document in the same PR.

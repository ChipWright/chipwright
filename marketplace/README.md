# Marketplace

Package registry for OpenHome device definitions (branch 13, Phase 6): publish, discover,
and install device packages with `openhome install <device>`. Built on the Node standard
library, with Ed25519 signatures and SHA-256 from `node:crypto`; it depends only on the
device engine so it can validate a package's manifest at publish and install time.

## What a package is

A package bundles a device definition with everything that ships alongside it:

- `device.yaml` (required) — the DDL manifest, the single source of truth for the device
- drivers, tests, documentation — any additional text files the package chooses to carry
- metadata — name, version, category, author, license, and keywords

Every package has a deterministic content hash over its metadata and files, so the same
package always hashes to the same value regardless of construction order. That hash is
what a publisher signs and what an installer re-checks.

## Trust model

A publisher signs a package's content hash with an Ed25519 key, reusing the supply-chain
model of the cloud firmware signer. The registry refuses to store a malformed package or
one whose signature does not verify. An installer independently re-verifies the signature,
re-validates the manifest through the device engine, enforces the caller's set of trusted
publisher keys, and refuses any file path that would escape the target directory before
writing anything.

## Conformance gate

A registry can require that every published device conform to its class. Construct it with
`new PackageRegistry(store, { requireConformance: true })` and publish runs the conformance
engine over the package's `device.yaml`, rejecting a device that is nonconformant to its
Matter device type. The gate is off by default, so a registry accepts any well formed,
correctly signed package unless it opts in. `packageConformance(pkg)` returns the full
report for a registry that prefers to record the verdict rather than block on it.

## Command line

```sh
openhome publish [dir]                     pack, sign, and publish a project (default .)
openhome install <name[@version]> --dir .  install a package into a directory
openhome search [query]                    list packages matching a query
openhome info <name[@version]>             show a package's metadata, versions, and files
openhome list                              list every published package
```

The registry home defaults to `$OPENHOME_REGISTRY` or `~/.openhome`; pass `--registry
<dir>` to use another. A project may include an `openhome.package.json` descriptor to set
metadata and list the extra files to ship; without one, the manifest alone is packed and
its metadata is derived from the device.

## Remote registry

The same commands work against a networked registry: pass `--registry-url <url>` (or set
`$OPENHOME_REGISTRY_URL`) and publish, install, search, and info go over HTTP instead of
the local directory. Installs re-verify a fetched package exactly as they do a local one,
so trust does not depend on transport. The server is a thin HTTP layer over the registry:

```
GET  /packages[?q=]            list or search packages
GET  /packages/:name           a name's versions and its latest version
GET  /packages/:name/:version  a signed package (version may be "latest")
POST /packages                 publish a signed package (rejected unless it verifies)
```

## Running

```sh
pnpm --filter @openhome/marketplace test
PORT=8080 pnpm --filter @openhome/marketplace serve
pnpm --filter @openhome/marketplace cli -- search --registry-url http://localhost:8080
```

## Not yet implemented

- Durable, replicated registry storage; the server backs onto a local directory
- Semantic-version ranges; a specifier is either a bare name (latest) or an exact version
- Publisher identity beyond a local key file (no key distribution or revocation yet)
- Authentication of the publishers and installers talking to the server

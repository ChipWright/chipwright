# Licensing

OpenHome Studio is **free to use** and split across two licenses along a deliberate line:
the **service** you build on, and the **silicon** the community extends.

## The service: Elastic License 2.0

Everything except the firmware tree is the OpenHome service: the Device Definition Language
and its compiler, the generators, the digital twin, the cloud, the marketplace, the AI
assistant, and the IDE. It is licensed under the [Elastic License 2.0](LICENSE).

In plain terms, you may freely use, copy, modify, and self-host it. You may **not** offer it
to third parties as a hosted or managed service that exposes its features, circumvent any
license functionality, or strip its licensing notices. Building real devices and running your
own instance are exactly what it is for; reselling the platform itself as a competing service
is not.

## The hardware layer: Apache-2.0

The firmware tree, [`sdk/firmware/`](sdk/firmware/), is licensed under
[Apache-2.0](sdk/firmware/LICENSE). This is the permissive, openly contributable layer:

- the **Hardware Abstraction Layer interface** device code is written against,
- the **board support packages** (BSPs) that implement it for a given chip, and
- the **device SDK** and firmware targets that run on hardware.

This is intentional. Adding support for a new chip (a new BSP) should be as frictionless as
possible, and code that ships on a physical device should carry a permissive license. Vendors
and hobbyists can implement, ship, and relicense their board support without restriction. This
is the layer we most want the community to grow. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Which license applies to a file

| Path | License |
|------|---------|
| `sdk/firmware/**` | Apache-2.0 |
| everything else | Elastic License 2.0 |

The nearest `LICENSE` file up the directory tree governs. When in doubt, `sdk/firmware/` is
Apache-2.0 and the rest of the repository is Elastic License 2.0.

## Your device definitions are yours

A device definition (a DDL manifest) that you write is **your** content, not a derivative of
the platform. You own what you describe and build, and you choose how to share it, including
through the marketplace.

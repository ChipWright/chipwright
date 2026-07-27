# Architecture: the three layers

Chipwright is designed around three layers, which is also how the licensing and the
contribution model divide up:

| Layer | What it is | Who owns it | License |
|-------|-----------|-------------|---------|
| **Service** | The platform you build on: the definition language and compiler, generators, twin, cloud, marketplace, assistant, and IDE | Developed by the maintainers, free to use | [Elastic License 2.0](../LICENSE) |
| **Silicon** | Board support: the HAL interface, the BSPs that implement it per chip, and the device SDK | Openly contributed by the community | [Apache-2.0](../sdk/firmware/LICENSE) |
| **Content** | Device definitions you write and share | You | Yours |

You use the service for free. You extend the silicon layer with new chips. You own and share
the device definitions you create. See [LICENSING.md](../LICENSING.md) for the full breakdown.

The critical path is `definition -> simulator -> SDK`: a manifest compiles to artifacts, the
simulator runs them as a digital twin, and the SDK plus a per-chip BSP carries the same code to
real silicon. The developer IDE ([`apps/ide`](../apps/ide)) is a thin VS Code adapter over a
shell-agnostic core ([`core/studio`](../core/studio)), so it can graduate into a standalone app
without a rewrite.

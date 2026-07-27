# Publishing the OpenHome Studio extension

The extension is published from this monorepo by the `Publish extension` GitHub Actions
workflow (`.github/workflows/publish-extension.yml`), triggered by a version tag. This guide
covers the one-time account setup and the per-release steps.

The extension identity is `openhome.openhome-studio` (publisher `openhome`, name
`openhome-studio`), set in `package.json`. Both names appear unclaimed as of this writing.

## One-time setup

### 1. Create the Marketplace publisher

1. Sign in to <https://marketplace.visualstudio.com/manage> with a Microsoft (Azure) account.
2. Create a publisher whose **ID is exactly `openhome`** (it must match the `publisher` field
   in `package.json`). The display name can be anything.

### 2. Create a Personal Access Token (PAT)

1. Go to <https://dev.azure.com> and sign in with the same account.
2. User settings (top right) > **Personal Access Tokens** > **New Token**.
3. **Organization:** `All accessible organizations`. **Scopes:** switch to custom-defined and
   grant **Marketplace > Manage**. Set an expiry you are comfortable with.
4. Copy the token now; it is shown only once.

### 3. Add the token as a repository secret

Never commit the PAT. Store it as an Actions secret. From this repo, run in your terminal
(the `!` prefix runs it in this session so the prompt stays out of the transcript):

```
! gh secret set VSCE_PAT
```

Paste the PAT when prompted. That is all the workflow needs to publish to the VS Code
Marketplace.

### 4. (Optional) Open VSX, for Cursor / VSCodium / other non-Microsoft editors

The Microsoft Marketplace is not available to those editors; they use Open VSX. To publish
there too:

1. Sign in at <https://open-vsx.org> with GitHub and create an access token
   (User Settings > Access Tokens).
2. Claim the namespace and add the secret:
   ```
   ! npx --yes ovsx create-namespace openhome -p <your-open-vsx-token>
   ! gh secret set OVSX_PAT
   ```
   When `OVSX_PAT` is set, the workflow publishes to Open VSX as well; when it is not, that
   step is skipped.

## Cutting a release

1. Bump the version in `apps/ide/package.json` (e.g. `0.1.0` -> `0.1.1`). Commit it.
2. Tag the commit `ide-v<version>` and push the tag. The tag suffix must equal the version
   in `package.json`, or the workflow fails the version check on purpose:
   ```
   git tag ide-v0.1.1
   git push origin ide-v0.1.1
   ```
3. The workflow builds the workspace, packages the `.vsix`, publishes it to the Marketplace
   (and Open VSX if configured), uploads the `.vsix` as a build artifact, and attaches it to
   a GitHub release for the tag.

### Rehearse without publishing

Run the workflow manually from the Actions tab (`Run workflow`) with **dry_run** checked. It
builds and packages the `.vsix` and uploads it as an artifact, but publishes nothing.

## Publishing locally instead of via CI

You can also publish from your machine. Log in once, then publish:

```
! npx --yes @vscode/vsce login openhome
pnpm -r build
cd apps/ide && npx --yes @vscode/vsce package --no-dependencies
npx --yes @vscode/vsce publish --no-dependencies
```

Or pass the token inline without a stored login: set `VSCE_PAT` in your environment and run
`npx @vscode/vsce publish --no-dependencies`.

## Notes

- Everything is bundled by esbuild into `dist/extension.js`, so `--no-dependencies` is correct:
  there are no runtime `node_modules` to include.
- A version can be published only once. Marketplace review is automated and usually quick; the
  listing can take a few minutes to appear after publish.

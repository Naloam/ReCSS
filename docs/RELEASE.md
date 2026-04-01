# Release Guide

This project uses Changesets for versioning and publish orchestration.

## Prerequisites

- Node.js 18+
- pnpm 10+
- GitHub repository with Actions enabled
- `NPM_TOKEN` secret configured in repository settings

## Local Flow

```bash
pnpm install
pnpm changeset
pnpm version-packages
pnpm build
pnpm test
```

## Automated Flow

- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release.yml`

On push to `master`, the release workflow uses Changesets Action to either:
- Create/update a release PR (when pending changesets exist)
- Publish to npm (after version PR merges)

## Notes

- Packages are configured with `publishConfig.access = public`.
- Internal dependency bumps follow `patch` policy per `.changeset/config.json`.

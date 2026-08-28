# VDL Experiment Readiness

A dependency-free, responsive dashboard for deciding whether proposed Visual Design Language changes are ready for experimentation and translating gaps into a prioritised capability backlog.

## Data status

The dashboard has two deliberately separate sources:

- **Verified strategy context:** Tina Zhang’s [Brief: Global Testing Capability Strategy](https://skyscanner.atlassian.net/wiki/spaces/UP1/pages/2754019336/Brief+Global+Testing+Capability+Strategy), page version 8, updated 19 August 2026. It supplies goals, scope, milestones, risks and dependencies.
- **Illustrative row-level data:** `data/sample-data.json` contains ten `SAMPLE-*` records. These are product examples, not verified readiness assessments. The interface labels them as sample data at all times.

The Confluence brief is not treated as a readiness matrix because it does not contain the required row-level fields.

## Run locally

Node.js 18 or later is sufficient; there are no packages to install.

```sh
node scripts/serve.mjs
```

Open `http://127.0.0.1:4173/`.

Validate and build the deployable output with:

```sh
node scripts/validate-data.mjs
node scripts/build.mjs
node scripts/serve.mjs --dist
```

Use a different port by setting `PORT`, for example `PORT=4180 node scripts/serve.mjs`.

## Main workflows

- Select any readiness card or portfolio breakdown to filter the underlying matrix.
- Search across changes, tokens, components, owners, dependencies and next actions.
- Use quick views, the full filter panel, grouping and sorting for stakeholder reviews.
- Open a row to see every core data field, its provenance, owner and next action.
- Use the capability backlog to prioritise non-ready enabling work.
- Import a local CSV or JSON file from **Import data**. Files are parsed in the browser and are not uploaded.
- Download `data/matrix-template.csv` for the accepted CSV shape.

## Recommended source strategy

Use a two-layer model:

1. Maintain the operational matrix in a shared Google Sheet if stakeholders already have one, or create a disciplined Confluence table if Confluence must remain the authoring surface.
2. Run a scheduled or manual secure sync that validates and normalises the source into a versioned JSON snapshot consumed by the dashboard.

This keeps private credentials out of the browser, gives the deployed dashboard deterministic data, and lets non-technical owners edit rows in a familiar tool.

| Source | Strength | Main trade-off | Recommended role |
| --- | --- | --- | --- |
| Confluence | Strong strategy and decision context | Tables and macros are brittle as structured data | Strategy reference; build-time input only if a disciplined table exists |
| Google Sheet | Best collaborative row editing | Private sheets require OAuth or a secure sync service | Preferred operational source of truth |
| Git-managed JSON | Versioned, reviewable and static-host friendly | Less friendly for direct stakeholder editing | Dashboard delivery snapshot |
| Local CSV/JSON import | Fast, private and credential-free | Manual refreshes can become stale | Bootstrap and review workflow |
| Database/API | Real-time workflow and auditing | Highest build and maintenance cost | Later phase if this becomes a durable operational product |

The checked-in `data/source-config.json` selects the current adapter:

```json
{
  "adapter": "bundled-json",
  "url": "./data/sample-data.json",
  "strict": true,
  "fallback": "none"
}
```

`fallback: "none"` is intentional. If a configured real source fails, the dashboard shows a source error instead of silently substituting sample rows.

## Canonical data model

The JSON envelope is:

```text
schemaVersion
source: kind, label, retrievedAt, version, isSample
strategySource: label, sourceUrl, pageVersion, updatedAt, verifiedAt
warnings[]
records[]
```

Each record contains the requested core fields:

```text
id
vdlChange
changeMechanism: token | component | component-variant | composition
existingDesignToken
existingCodeToken
connectedComponents[]
themeReady: yes | partial | no | unknown | not-applicable
surfacePlatformCoverage[]
requiredWork
readiness
owner: name, optional contactUrl
dependencies[]
targetMilestone
nextAction: label, optional url
```

Workflow and provenance extensions are `changeSummary`, `vertical`, `lifecycleStage`, `priority`, `blockerCategory` and `provenance`.

The five readiness slugs are:

- `ready-to-test`
- `needs-token-configuration`
- `needs-component-refactoring`
- `needs-provisional-composition`
- `out-of-scope`

CSV uses snake-case equivalents of the JSON fields and `|` to separate multiple values. Required CSV columns are `id`, `vdl_change`, `change_mechanism`, `readiness`, `owner_name` and `next_action`. Invalid enum values, missing required fields and duplicate IDs reject the entire import.

## Maintenance rules

- Keep IDs stable and independent from spreadsheet row numbers.
- Include a source URL or record ID for every real row where possible.
- Keep owner and next action populated; add URLs to make them directly navigable.
- Use `unknown` rather than guessing token or theme status.
- Split assessments by platform when readiness differs materially between platforms.
- Treat provisional compositions as experiments with graduation criteria, not automatic Backpack component requests.
- Update the snapshot’s source version and retrieved time on every sync.

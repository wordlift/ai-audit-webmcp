# WordLift AI Audit — Agent Capability Map

Pages give AI agents knowledge. Functions let them act.

WordLift AI Audit accepts a public website URL, classifies the site, compiles the actions an agent should be able to perform, compares those expectations with human- and agent-facing evidence, and produces implementation-ready action contracts. The WebMCP Challenge build adds a chat-first tool surface and a controlled sidecar proof to WordLift's established AI Audit foundation.

## Status

This repository is the new open-source application being built for the WebMCP Challenge. It is intentionally separate from the private [`wordlift/ai-audit`](https://github.com/wordlift/ai-audit) service.

- New public work: action model, deterministic compiler, evidence states, capability scoring, JSON-LD contracts, report UI, WebMCP tools, fixtures, sidecar, and tests.
- Optional private provider: the established WordLift AI Audit API supplies the broad technical audit in live WordLift mode.
- Open demo mode: contributors can run the complete deterministic fixture experience without WordLift or Google credentials.

## Quick start

Requirements: Node.js 22 and npm.

```bash
npm ci
npm run dev:demo
```

- Web app: `http://localhost:5173`
- API health: `http://localhost:3000/api/health`

## Verification

```bash
npm run typecheck
npm test -- --run
npm run build
```

Browser tests require Playwright's Chromium install:

```bash
npx playwright install chromium
npm run test:e2e
```

## Architecture and build decisions

The participant-shaped scope, PRD, technical specification, and build checklist live in [`docs/hackathon-build`](docs/hackathon-build/). The implementation is a single TypeScript package: React/Vite in the browser, Express on Cloud Run, and provider interfaces for live WordLift and open fixture modes.

## License

Apache-2.0. WordLift marks and branding remain the property of WordLift.

# WordLift AI Audit — WebMCP Context Engine

**Pages describe a site. Agents need an evidence-backed service map.**

WordLift AI Audit accepts any public URL, classifies the site, analyzes up to four representative pages, extracts its business entities and language, infers the actions an agent should be able to perform, and verifies which human and machine interfaces actually support them.

- Live application: [beta.audit.wordlift.io](https://beta.audit.wordlift.io)
- Stable reference report: [beta.audit.wordlift.io/demo/alpina](https://beta.audit.wordlift.io/demo/alpina)
- WordLift: [wordlift.io](https://wordlift.io)

## The context engine

The report is compiled from four separate layers. Classification is an input to the model—not the conclusion.

| Layer | What it contains | What it answers |
| --- | --- | --- |
| Classification | Google content categories plus observed business signals | What kind of site is this? |
| Domain graph | Organizations, products, services, places, articles, people, offers, and their provenance | What does this business know and offer? |
| Lexical graph | Categories, entity names, aliases, and page topics | How does the site describe those things? |
| Action layer | Expected actions, entity-action bindings, interfaces, evidence, and contracts | What should an agent be able to do, to which entity, and can it do it now? |

The compiler supports six operating archetypes: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and a conservative fallback for other sites. Archetype rules select the expected journey; page and API evidence determine the actual state.

## End-to-end flow

1. Collect the entry page and up to three complementary same-origin pages: detail, offer/action, and policy/contact.
2. Run the WordLift AI Audit foundation analysis in parallel, preserving its detailed sections and quick wins behind progressive disclosure.
3. Classify the content and infer the operating archetype deterministically.
4. Extract JSON-LD entities, offers, aliases, headings, forms, links, discovery documents, and declared agent tools.
5. Compile the expected action model for the archetype and bind each relevant action to its entity or provider.
6. Compare human and agent interfaces using typed, page-level evidence.
7. Return a concise WebMCP summary and a shareable visual report with the complete context map, readiness gaps, and implementation contracts.

An action is never marked agent-ready because a manifest exists. Only a successful invocation can raise verified readiness; declarations remain `unverified`.

## WebMCP tools

The browser registers current-spec tools through `document.modelContext`:

- `audit-website` — audits any safe public URL and returns a compact completed result plus the report URL.
- `explain-capability` — explains one action, the entities it applies to, supporting interfaces, evidence, and contract.
- `check-alpina-availability` — a controlled read-only reference adapter proving one safe sidecar pattern.

Alpina.travel is the pinned travel fixture and live adapter demonstration. It is not embedded in the classifier, entity model, action compiler, scoring system, or report UI. The same pipeline is covered by fixtures and tests for every supported archetype.

## Run locally

```bash
npm ci
npm run dev:demo
```

Demo mode needs no WordLift, Google, Firestore, or ScrapingBee credentials. It uses deterministic fixtures for all six archetypes.

For live mode, copy `.env.example`, configure the server-side providers, and run:

```bash
npm run dev
```

Useful verification commands:

```bash
npm run verify
npm run test:e2e
```

## Public report contract

Reports expose:

- the inferred archetype, category evidence, confidence, and model version;
- an account-free shareable URL;
- up to four audited pages and their roles;
- normalized domain entities, lexical entries, action interfaces, and entity-action bindings;
- a separate WordLift foundation score and verification-only agent-readiness score;
- three prioritized gaps;
- JSON-LD capability contracts with entity target, inputs, outputs, governance, and recommended delivery;
- bounded evidence and immutable child revisions for overrides or reverification.

Raw HTML, secrets, cookies, private identifiers, and unbounded provider responses are not stored.

## Extend the model

The versioned action model lives in `action-model/v0.1.0/`. Contributors can add or revise:

- Google-category and behavior mappings;
- archetype action journeys;
- action definitions and governance;
- evidence detectors;
- entity-to-action expectations;
- approved adapters and sidecars.

The user-facing result remains a capability map and implementation plan. The ontology is the internal discipline that keeps the graph consistent and ready for future publication as the action layer of a WordLift knowledge graph.

## Hackathon boundary

This public application, its schemas, context compiler, action model, evidence rules, UI, WebMCP tools, fixtures, security controls, and tests are new WebMCP Challenge work. The existing private WordLift AI Audit is an optional provider behind a public adapter boundary.

Licensed under [Apache-2.0](LICENSE).

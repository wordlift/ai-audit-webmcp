# Project Scope

## Project Name Candidates

- **WordLift AI Audit** — confirmed project name and continuity with the existing product.
- WordLift AI Audit: Agent Capability Map — descriptive demo title.
- Agentic Web Audit — possible future open-source product name.

Repository: [`wordlift/ai-audit-webmcp`](https://github.com/wordlift/ai-audit-webmcp)

## One-Line Summary

Enter a URL in ChatGPT to classify the site, see the actions an AI agent should be able to perform, compare them with the capabilities currently available to humans and agents, and receive machine-readable contracts plus a WebMCP sidecar path for closing the gap.

## Target User

- Primary: CMOs, SEOs, GEOs, and site owners responsible for making a website useful to AI agents.
- Secondary: developers and agencies implementing agent-facing functions.
- Interaction principle: the user wants a capability map and help getting there—not an ontology lesson. AOOE and the action ontology operate behind the product.

## Problem

Websites expose knowledge through pages and actions through human interfaces, but AI agents need explicit, discoverable functions. Existing audits can explain whether a site is technically accessible or well structured, yet they do not answer the more important questions:

- What kind of site is this?
- What should an agent be able to do here?
- Which actions already work for humans?
- Which actions are available as agent-callable functions?
- What contract and implementation path would close each gap?

The product reframes the website from a collection of pages into an action surface backed by knowledge.

## Core Workflow

1. The user gives ChatGPT a website URL through the WordLift WebMCP tool.
2. The system runs the existing AI Audit analysis and gathers page, structured-data, form, API, agent-file, and WebMCP evidence.
3. It assigns one or more Google Natural Language content categories with confidence scores.
4. It infers a site archetype from the content classification plus behavioral evidence: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, or other.
5. It instantiates the expected action graph for that archetype across four stages: discover, understand/decide, act, and manage.
6. It maps every expected action against human-facing support and agent-facing support.
7. It returns an executive summary, readiness score, capability graph, three priority improvements, and expandable evidence.
8. For each missing agent function, it produces a machine-readable action contract grounded in the internal ontology.
9. Where an approved endpoint or form handler can fulfill the contract, a sidecar adapter can expose the capability through WebMCP.

## What We Are Building

### 1. Automatic site understanding

- Multi-label content classification based on the Google Natural Language category taxonomy.
- A second-stage archetype classifier that combines content categories with structured data and behavioral signals.
- Six initial archetypes: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and other.
- Classification evidence and confidence visible to the user.

### 2. Expected action model

- A small, curated expected-action template for each archetype.
- A shared journey structure: discover → understand/decide → act → manage.
- AOOE-informed internal semantics for action type, dependencies, inputs, outputs, governance, evidence, and maturity.
- Alignment with the informational and transactional patterns in `wordlift/agentic-commerce`.

### 3. Human-versus-agent capability map

- A deterministic action graph rather than a force-directed visualization.
- Node states:
  - **Agent-ready:** machine-callable and verified.
  - **Human-only:** supported by a human interface but not exposed to agents.
  - **Missing:** expected but not found.
  - **Not expected:** irrelevant to the inferred site archetype.
  - **Sidecar-enabled:** supplied through a generated or configured proxy adapter.
- Evidence attached to every detected state.

### 4. Layered result experience

- Existing WordLift AI Audit visual language and branding.
- Executive summary and overall agent-readiness score.
- Site classification and confidence.
- Action graph as the main visual and conceptual focus.
- Three prioritized improvements.
- Expandable technical evidence and implementation details.
- Structured WebMCP result returned directly to ChatGPT, with the visual audit available for deeper exploration.

### 5. Action contract

For each missing or human-only agent capability, produce a JSON-LD contract containing:

- Stable action identifier and intent class.
- Description and position in the action journey.
- Input and output schemas.
- Preconditions and dependencies.
- Authentication and authorization requirements.
- Confirmation requirement and side-effect declaration.
- Evidence and provenance.
- Recommended delivery mechanism: native WebMCP, API adapter, or approved sidecar proxy.

The artifact is presented to the user as an implementation contract. Its ontological representation keeps it consistent and ready for future publication in a knowledge graph.

### 6. One working sidecar transformation

- Use Alpina.travel as the controlled reference implementation.
- Map its existing human availability functionality and approved availability endpoint into an action contract.
- Expose that contract as a working WebMCP capability through the public sidecar.
- Verify that ChatGPT can invoke it.
- Show the capability changing from human-only to agent-ready in the action graph.

### 7. Open-source foundation

- Public hackathon code in `wordlift/ai-audit-webmcp`.
- Clear separation between the public application and WordLift's private AI Audit API.
- Open contracts, archetype templates, adapters, tests, and contribution documentation.
- WordLift branding with extension points that allow others to add archetypes, actions, evidence detectors, and adapters.
- An approved open-source license before submission.

## What We Are Not Building

- A universal reverse proxy that can safely automate any website.
- Blind browser automation or scraping of arbitrary forms.
- Automatic activation of transactional capabilities without human approval.
- Booking completion, payment, cancellation, or other high-risk transactions in the required demo path.
- A full agentic storefront; that is the natural evolution after the capability map.
- A user-facing ontology editor or knowledge-graph management interface.
- Persistence of every audit into a production knowledge graph.
- A complete rewrite of the existing AI Audit backend or all of its scoring categories.
- Exhaustive action coverage for every Google content category.
- Production-grade adapters for all six archetypes during the hackathon.

## Inspiration And References

- **Existing WordLift AI Audit:** visual language, audit breadth, evidence framework, and private API/tool foundation.
- **WordLift Agentic Commerce:** informational/transactional action patterns, governance flags, sidecar architecture, and the future agentic-storefront path.
- **AOOE:** internal discipline for defining actions, constraints, dependencies, governance, and future KG integration.
- **Google Natural Language categories:** content classification vocabulary; V2 may return parent and child categories, supporting a multi-label model.
- **Lighthouse:** concise score followed by expandable diagnostics and evidence.
- **Wappalyzer/BuiltWith:** URL-first detection that turns hidden implementation details into a readable inventory.
- **Alpina.travel:** agent-proven travel/hospitality reference site with an approved availability surface.

## Demo Path

1. In ChatGPT, ask WordLift AI Audit to analyze Alpina.travel.
2. The WebMCP tool accepts the URL and initiates the audit.
3. The result identifies the site as travel/hospitality and explains the evidence.
4. The action graph shows the expected travel journey.
5. Availability appears as human-supported but not yet agent-ready.
6. Opening the node reveals its action contract, evidence, and recommended sidecar implementation.
7. The approved sidecar adapter exposes the existing availability endpoint through WebMCP.
8. ChatGPT invokes the capability and receives a structured availability result.
9. The graph shows availability as sidecar-enabled and agent-ready.

The wow moment is not merely detecting a problem. It is watching the system understand the site, explain what its agents need, produce the contract, and turn one human capability into a working agent function.

## Submission Story

**Pages are no longer enough. AI agents need functions in the same way they need knowledge.**

WordLift AI Audit uses WebMCP to analyze a website from inside ChatGPT, infer the action surface expected for its business, and show the gap between what humans can do and what agents can call. The action graph makes the transition visible; the contract makes it implementable; the sidecar proves that the gap can be closed without rebuilding the website.

The project is a meaningful new public layer built during the WebMCP Challenge. It extends WordLift's existing audit foundation with automatic archetype classification, an expected action graph, human/agent capability comparison, ontology-backed contracts, structured chat results, and a working sidecar reference implementation.

## Time Budget

- Six focused build days through 2026-09-02.
- Codex performs most implementation work.
- Andrea and the WordLift team provide product direction, private API access, architecture references, reviews, deployment support, and testing.
- The implementation should preserve a working vertical slice before adding archetype depth or secondary visual polish.

## Definition Of Done For Scope

The hackathon MVP is successful when a judge can enter a URL in ChatGPT, see how the system classified the site, understand the expected action graph, inspect the human-versus-agent gap with evidence, open a machine-readable contract, and invoke one newly sidecar-enabled capability on Alpina.travel.

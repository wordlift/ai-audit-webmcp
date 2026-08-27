# Product Requirements Document

## Product Summary

WordLift AI Audit is a chat-first product that helps a human understand a website from an AI agent's perspective. The user enters a public URL in ChatGPT. The product determines what kind of site it is, infers the actions an agent should be able to perform, compares those expectations with the site's human-facing and agent-facing capabilities, and explains how to close the most important gaps.

The primary visual is a deterministic action graph. It presents the site's expected journey from discovery through decision, action, and management. Every action is backed by evidence and receives a clear state: agent-ready, human-only, unverified, missing, not expected, or sidecar-enabled.

For missing or human-only agent capabilities, the product provides a plain-language implementation recommendation and a machine-readable action contract. The hackathon reference flow goes one step further: it uses an approved sidecar to expose Alpina.travel availability through WebMCP and verifies the capability from ChatGPT.

The ontology and AOOE model are internal product infrastructure. The user encounters a capability map, evidence, priorities, and implementation contracts—not an ontology editor or knowledge-engineering workflow.

## Product Principles

### Agent perspective, human comprehension

The report speaks from the perspective of an AI agent—what it can discover, understand, and do—while remaining concise and legible for a CMO, SEO, GEO, or site owner.

### Action-first, not page-first

Pages remain evidence and knowledge surfaces. The product's central question is what functions the site exposes to agents.

### Deterministic expectations

Given the same site evidence, category mapping, archetype, and action-model version, the expected action graph must be reproducible. The model can evolve over time, but each report must identify the assumptions and model version that shaped it.

### Evidence before assertion

The product must not claim that an action is supported without evidence. Uncertain or conflicting evidence is shown as unverified rather than promoted to agent-ready.

### Progressive disclosure

ChatGPT returns the essential result first. The full report reveals classification evidence, the action graph, action-level findings, contracts, and technical detail only as the user explores.

### Diagnosis that leads to enablement

Every important gap should end with an actionable next step. For at least one controlled capability, the product proves the path by enabling and invoking it.

## Target User

### Primary users

#### CMO or site owner

Needs to understand whether the website can serve agentic audiences, which business capabilities are missing, and which improvements matter first. Does not want to inspect an ontology or interpret raw protocols.

#### SEO or GEO practitioner

Needs evidence connecting content, structured data, agent discoverability, and callable actions. Wants a report that can support prioritization and stakeholder communication.

#### Developer or implementation partner

Needs an explicit contract for each missing function, including expected inputs, outputs, policy requirements, evidence, and the recommended delivery path.

### Secondary users

#### Open-source contributor

Wants to add or improve archetype mappings, action definitions, evidence detectors, or sidecar adapters without changing the product's core behavior.

#### Hackathon judge

Needs to understand the concept quickly, reproduce the WebMCP interaction, open a polished report without an account, and see a real before-and-after capability transformation.

## Core User Journey

### 1. Start in ChatGPT

The user asks WordLift AI Audit to analyze a URL. No account, project setup, or configuration is required.

### 2. See visible progress

The interaction shows three understandable phases:

1. Understanding the site.
2. Mapping expected actions.
3. Checking human and agent capabilities.

The user is not left with a generic “audit started” confirmation as the final result.

### 3. Receive the concise agent-perspective result

ChatGPT returns:

- The primary site archetype.
- Important secondary content categories.
- An agent-readiness score.
- The three highest-priority capability gaps.
- A compact summary of the action journey.
- A link to the complete shareable visual report.

### 4. Open the full report

The report opens without authentication and starts with an executive summary. It then shows how the site was classified and presents the deterministic action graph.

### 5. Explore the action graph

The user follows the expected journey across four ordered stages:

1. Discover.
2. Understand and decide.
3. Act.
4. Manage.

Color, label, and icon communicate each action state. Color alone must not carry the meaning.

### 6. Inspect an action

Selecting a node opens an action detail view showing:

- Why the action is expected.
- What humans can currently do.
- What agents can currently do.
- The evidence behind each conclusion.
- What is missing or uncertain.
- The recommended improvement.
- The action contract when agent support is incomplete.

### 7. Understand the implementation contract

The user first sees a plain-language explanation. A developer can expand or copy the machine-readable contract and review inputs, outputs, dependencies, authorization, confirmation, and side effects.

### 8. See a capability become agent-ready

In the reference demo, Alpina.travel availability begins as human-only. The approved sidecar exposes the existing availability functionality to WebMCP. ChatGPT invokes it, receives a structured result, and the reverified report shows the action as sidecar-enabled and agent-ready.

### 9. Share the result

The user can copy a stable report URL. The report remains available without an account for the duration of judging and clearly identifies WordLift as the creator.

## Epics And User Stories

### Epic 1: Start An Audit From ChatGPT

#### Story 1.1: Submit a URL

- As a site owner, I want to give ChatGPT a website URL so that the audit starts without setup.

Acceptance criteria:

- A user can enter a full public HTTP or HTTPS URL.
- A user can enter a bare domain and see the normalized URL that will be analyzed.
- The product rejects malformed URLs with a short explanation and an example of a valid URL.
- The product does not require sign-up, sign-in, API keys, or project creation from the end user.
- The product confirms which canonical site URL it is analyzing after redirects are resolved.
- Submitting the same URL again creates or refreshes a report rather than failing silently.

#### Story 1.2: Understand audit progress

- As a user, I want to see what the audit is doing so that I know the request is progressing.

Acceptance criteria:

- The interaction communicates the three product phases: understanding, mapping, and checking.
- A completed interaction returns findings, not only a start confirmation.
- If the audit cannot finish, the user sees which phase failed and whether a partial report is available.
- A failed request includes a clear retry action.

### Epic 2: Understand What Kind Of Site This Is

#### Story 2.1: See the inferred archetype

- As a CMO, SEO, or GEO, I want to see how the system understands the site so that I can judge whether the capability expectations are relevant.

Acceptance criteria:

- The report names one primary archetype: commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, or other.
- The report shows important secondary Google content categories without presenting the full taxonomy by default.
- The report displays classification confidence in understandable language.
- The report shows at least two pieces of human-readable classification evidence when available.
- The report distinguishes content category from site archetype.
- The report identifies the action-model version used to compile its expectations.

#### Story 2.2: Handle a provisional classification

- As a site owner, I want to understand when classification is uncertain so that I do not mistake an assumption for a fact.

Acceptance criteria:

- Low-confidence classification is visibly labeled provisional.
- The report explains which evidence is missing or contradictory.
- The user can select another available archetype and regenerate the expected graph.
- The report clearly shows when the graph reflects a user-selected archetype.
- Changing the archetype does not alter the underlying observed evidence.

#### Story 2.3: Produce deterministic expectations

- As a reviewer, I want the same classification inputs and model version to produce the same expected actions so that the audit is explainable and repeatable.

Acceptance criteria:

- Repeating an audit against unchanged stored evidence and the same model version produces the same primary archetype and expected action set.
- Each expected action identifies the archetype or category rule that introduced it.
- Changes caused by a newer action-model version are distinguishable from changes detected on the site.

### Epic 3: Receive A Concise Agent-Perspective Summary

#### Story 3.1: Get the essential result in chat

- As a site owner, I want a concise assessment in ChatGPT so that I can understand the result without opening a technical report.

Acceptance criteria:

- The ChatGPT response states the primary archetype and agent-readiness score.
- It identifies exactly three priority gaps when three or more gaps exist.
- When fewer than three gaps exist, it presents only real gaps and does not pad the list.
- Every priority names the affected action and why it matters to an agent.
- The response includes a compact summary of the four action stages.
- The response includes a working link to the full report.
- The response avoids unexplained ontology, RDF, JSON-LD, or AOOE terminology.

#### Story 3.2: Understand the score

- As a user, I want to know why the readiness score has its value so that it does not feel arbitrary.

Acceptance criteria:

- The report states what the readiness score measures.
- The score is supported by counts of expected, agent-ready, human-only, unverified, and missing actions.
- Opening the score explanation reveals how action importance and evidence affect the result.
- A score never increases solely because a capability is claimed without verification.

### Epic 4: Explore The Expected Action Graph

#### Story 4.1: See the complete expected journey

- As a CMO, SEO, or GEO, I want to see the site's expected action journey so that I can understand where agents are blocked.

Acceptance criteria:

- The graph is arranged deterministically across discover, understand/decide, act, and manage.
- Expected actions appear in the same order for the same archetype and model version.
- Each action node shows its name and state without requiring hover.
- The graph includes a visible legend.
- State meaning is communicated by text or icon in addition to color.
- The report remains understandable when no agent-ready capabilities are found.
- The report remains understandable when every expected capability is agent-ready.

#### Story 4.2: Compare human and agent support

- As a site owner, I want to distinguish what humans can do from what agents can do so that I can see the real migration gap.

Acceptance criteria:

- Every expected action separately reports human support and agent support.
- Human-only means that evidence of a human interface exists while verified agent execution does not.
- Agent-ready requires a discoverable machine interface and successful verification evidence.
- Unverified is used when a capability is declared or detected but cannot be validated.
- Missing means no adequate human or agent implementation was found for an expected action.
- Sidecar-enabled identifies the sidecar as the delivery path and does not imply a native site implementation.

#### Story 4.3: Open action details

- As a practitioner, I want to open an action and inspect its evidence so that I can trust or challenge the finding.

Acceptance criteria:

- Selecting a node opens a readable detail view without losing the graph context.
- The detail view explains why the action is expected.
- Human evidence and agent evidence appear in separate sections.
- Evidence identifies its source, such as a page, form, structured-data item, discovery file, API description, or tool result.
- Conflicting evidence is shown rather than silently resolved.
- A missing action still has a useful detail view containing expectations and recommendations.

### Epic 5: Turn A Gap Into An Implementation Contract

#### Story 5.1: Receive a plain-language recommendation

- As a site owner, I want a practical explanation of what to add so that I can prioritize implementation.

Acceptance criteria:

- Human-only, unverified, and missing actions include a recommended next step.
- The recommendation states the user value and agent value before technical detail.
- The recommendation identifies whether the preferred path is native WebMCP, an existing API adapter, or an approved sidecar.
- Transactional recommendations mention confirmation and authorization where relevant.
- The interface does not suggest automatic execution for a capability requiring human approval.

#### Story 5.2: Inspect the action contract

- As a developer, I want a machine-readable action contract so that I can implement the missing agent capability consistently.

Acceptance criteria:

- The contract has a stable action identifier and readable name.
- It states whether the action is informational or transactional.
- It defines expected inputs and outputs.
- It identifies dependencies and preconditions.
- It records authentication, authorization, and confirmation requirements.
- It declares whether the action has side effects.
- It includes the evidence and provenance that informed the contract.
- It identifies the recommended delivery mechanism.
- The user can copy or download the machine-readable representation.
- A human-readable explanation is visible before the raw representation.

### Epic 6: Prove The Sidecar Path

#### Story 6.1: Identify a sidecar candidate

- As a developer, I want to see when existing human functionality can support an agent contract so that I can avoid rebuilding the whole site.

Acceptance criteria:

- The Alpina.travel availability action is initially identified as human-supported.
- The report shows the approved availability source that can fulfill the contract.
- The action detail labels the capability as a sidecar candidate before enablement.
- No sidecar is activated without an explicit approved adapter.

#### Story 6.2: Invoke availability from ChatGPT

- As a user, I want ChatGPT to check Alpina.travel availability so that I can see a real agent function rather than a static audit claim.

Acceptance criteria:

- ChatGPT can invoke the availability action through WebMCP.
- The action requires the dates and other minimum information needed for a valid request.
- Missing required information produces a clarification request rather than a failed or fabricated result.
- A successful invocation returns structured availability information and identifies its source.
- The interaction does not attempt booking or payment.
- Failure at the upstream availability source is reported honestly.

#### Story 6.3: Verify the improved capability state

- As a judge, I want to see the audit reflect the enabled function so that the before-and-after transformation is credible.

Acceptance criteria:

- Reverification detects the WebMCP availability capability.
- The graph changes availability from human-only or sidecar-candidate to sidecar-enabled and agent-ready.
- The action evidence includes the successful verification.
- The readiness score and summary update consistently with the state change.
- The report retains enough context to explain what changed.

### Epic 7: Share A Polished WordLift Report

#### Story 7.1: Open and share without an account

- As a user or judge, I want a stable report link so that I can revisit and share the result.

Acceptance criteria:

- Every completed audit has a unique shareable URL.
- Anyone with the URL can open the report without signing in.
- Shared reports display the same findings and model version as the original completed audit.
- The demo report remains accessible throughout the judging period.
- A missing or expired report shows a clear message rather than an empty application.

#### Story 7.2: Recognize WordLift without distraction

- As a viewer, I want to know who created the product without the report becoming a sales page.

Acceptance criteria:

- WordLift branding is visible and consistent with the existing AI Audit visual language.
- The report contains one restrained link to `wordlift.io` with wording about building an agent-ready site.
- The call to action does not block, gate, or obscure the audit.
- The public project and open-source repository are discoverable from the report or its supporting documentation.

## Edge Cases

### URL and access

- **Malformed input:** explain the problem and show a valid example.
- **Bare domain:** normalize and display the resolved URL.
- **Redirect chain:** analyze the canonical destination and disclose it.
- **Unreachable or timed-out site:** allow retry and create a partial report only when evidence exists.
- **Robots, authentication, or bot protection:** disclose the access limitation and do not infer unavailable capabilities as facts.
- **JavaScript-dependent experience:** mark affected evidence as incomplete when the interaction cannot be observed.
- **Non-HTML destination:** explain the limitation and avoid producing an ordinary site action graph from insufficient evidence.

### Classification

- **Mixed-purpose site:** select a primary archetype, retain secondary categories, and explain the choice.
- **Low confidence:** mark the archetype provisional and allow user selection of another archetype.
- **Other archetype:** use a small common action baseline and avoid pretending that an industry-specific template applies.
- **Sensitive finance or insurance content:** mapping is allowed, but the MVP never performs applications, policy changes, payments, or claims.

### Capability evidence

- **No agent interfaces found:** show the complete expected graph and prioritize the largest human-to-agent opportunities.
- **No human interface found:** show the action as missing unless verified agent support exists independently.
- **Declared but unreachable tool:** mark unverified rather than agent-ready.
- **Conflicting evidence:** present the conflict and lower confidence.
- **Multiple interfaces for one action:** group them under one capability while preserving distinct evidence.
- **Action exists outside the audited domain:** disclose the external dependency.

### Contracts and execution

- **Missing required invocation input:** ask for clarification.
- **Transactional side effect:** require explicit confirmation and authorization in the contract even though the MVP does not execute the transaction.
- **Upstream service failure:** report the failure without converting it into “not available.”
- **Contract can be generated but not fulfilled:** present the contract and implementation path without claiming enablement.
- **Sidecar succeeds once but later fails:** retain declared support but show current verification as failed or stale.

### Reports

- **Audit refreshed after sharing:** preserve report identity or make the refreshed version clearly distinguishable.
- **Model evolves:** show the model version so different graphs can be explained.
- **Report unavailable:** show a branded recovery page with an option to run a new audit.
- **Very large action set:** preserve the four-stage overview and collapse secondary detail rather than overwhelming the first view.

## What We Are Building

- URL-first WebMCP audit initiated from ChatGPT.
- Visible understanding, mapping, and checking progress.
- Concise structured result in chat.
- Shareable no-account visual report.
- Multi-label Google content classification and one primary site archetype.
- Deterministic expected-action graph compiled from a versioned action model.
- Initial templates for commerce/retail, publisher/content, travel/hospitality, finance/insurance, SaaS, and other.
- Separate human and agent support assessment.
- Evidence-backed action states and readiness score.
- Plain-language recommendations and copyable machine-readable contracts.
- One approved Alpina.travel availability sidecar.
- WebMCP invocation and before/after reverification.
- WordLift branding, one restrained WordLift link, and open-source discoverability.

## What We Would Add With More Time

- Production-grade action coverage for every Google content category.
- Multiple or blended archetypes in one graph.
- A collaborative review workflow for approving or editing inferred capabilities.
- Saved user workspaces, audit history, and capability-change tracking.
- Native comparison between two report versions.
- A universal sidecar generator for approved APIs and form handlers.
- More sidecar adapters across all six archetypes.
- Governed transactional flows for booking, checkout, application, and claims.
- Full Agentic Commerce storefront generation.
- Publication of action contracts and capability state into the WordLift knowledge graph.
- A public action vocabulary and contribution governance process.
- Localization of the report and contracts.
- Organization-specific action models and policies.

## Product Success Criteria

The MVP is ready for submission when all of the following can be demonstrated:

1. A user starts an audit with a URL from ChatGPT without creating an account.
2. ChatGPT returns the archetype, score, three priority gaps, compact action summary, and full-report link.
3. The full report explains classification and shows the deterministic four-stage action graph.
4. Every expected action has a human state, agent state, evidence, and understandable detail view.
5. A missing or human-only action exposes a human-readable recommendation and machine-readable contract.
6. Representative fixtures demonstrate all six archetype templates without requiring six production adapters.
7. Alpina.travel availability is shown before enablement, invoked through WebMCP after sidecar enablement, and reverified as agent-ready.
8. A judge can open the report without authentication throughout judging.
9. Errors and incomplete evidence never produce fabricated capability claims.
10. The public repository and live application clearly distinguish the new hackathon work from the pre-existing private AI Audit backend.

## Submission Proof Points

- **WebMCP leverage:** the user initiates the audit and invokes the enabled availability function directly from ChatGPT.
- **Execution:** the chat response, visual graph, evidence, contract, sidecar, and reverification form one working product journey.
- **Impact:** the product gives non-technical website owners a concrete roadmap from pages to agent functions.
- **Creativity:** the audit infers an expected action surface instead of checking only whether known technical files exist.
- **Open-source value:** action templates, contracts, evidence states, and the sidecar reference can be extended by others.
- **Demo clarity:** the Alpina.travel before-and-after flow makes the concept visible in under three minutes.
- **Credibility:** every state is evidence-backed, uncertain findings remain unverified, and the report exposes how classification and expectations were derived.

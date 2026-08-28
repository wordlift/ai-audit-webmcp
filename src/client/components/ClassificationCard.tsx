import { ChevronDown, ScanSearch } from "lucide-react";
import { useState } from "react";
import { describeSignal, presentableSignals } from "../../shared/format/explainExpectation.js";
import type { Archetype, ClassificationResult } from "../../shared/types/index.js";

const MAX_SIGNAL_CHIPS = 14;

const archetypes: Archetype[] = ["commerce-retail", "publisher-content", "travel-hospitality", "finance-insurance", "saas", "other"];

export function ClassificationCard({ classification, onOverride }: { classification: ClassificationResult; onOverride: (archetype: Archetype) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Archetype>(classification.primaryArchetype);
  const [busy, setBusy] = useState(false);
  async function apply() {
    if (selected === classification.primaryArchetype) return;
    setBusy(true);
    await onOverride(selected);
  }
  return (
    <section className="classification-card">
      <button className="classification-toggle" type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <ScanSearch />
        <span><strong>How we read this site</strong><small>{classification.categories[0]?.name ?? "Behavior-only classification"} · {classification.confidence} confidence</small></span>
        <ChevronDown className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="classification-detail">
          <div><p>Content categories</p>{classification.categories.map((category) => <span className="category-chip" key={category.name}>{category.name} · {Math.round(category.confidence * 100)}%</span>)}</div>
          <RankedArchetypes classification={classification} />
          <BehaviorSignals signals={classification.signals ?? []} />
          {classification.provisional && (
            <p className="provisional-note" role="note">
              {classification.provisionalReason ?? "This classification is provisional."}
            </p>
          )}
          <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
            <label htmlFor="archetype-override">Correct the site type</label>
            <select id="archetype-override" value={selected} onChange={(event) => setSelected(event.target.value as Archetype)}>
              {archetypes.map((archetype) => <option key={archetype} value={archetype}>{archetype.replaceAll("-", " / ")}</option>)}
            </select>
            <button type="submit" disabled={busy || selected === classification.primaryArchetype}>{busy ? "Recompiling…" : "Recompile map"}</button>
          </form>
        </div>
      )}
    </section>
  );
}

/** The full ranking, so "why this archetype" is visible rather than asserted. */
function RankedArchetypes({ classification }: { classification: ClassificationResult }) {
  const ranked = classification.rankedArchetypes.filter((entry) => entry.score > 0);
  if (ranked.length === 0) return null;
  return (
    <div>
      <p>How the archetypes ranked</p>
      {ranked.map((entry) => (
        <span className="category-chip" key={entry.archetype}>
          {entry.archetype.replaceAll("-", " / ")} · {entry.score.toFixed(1)}
        </span>
      ))}
    </div>
  );
}

/** Observed behavior, in words: the second half of the classification's evidence. */
function BehaviorSignals({ signals }: { signals: string[] }) {
  const shown = presentableSignals(signals);
  if (shown.length === 0) return null;
  return (
    <div>
      <p>Behavior signals</p>
      {shown.slice(0, MAX_SIGNAL_CHIPS).map((signal) => (
        <span className="category-chip" key={signal} title={signal}>{describeSignal(signal)}</span>
      ))}
      {shown.length > MAX_SIGNAL_CHIPS && <span className="category-chip">+{shown.length - MAX_SIGNAL_CHIPS} more</span>}
    </div>
  );
}

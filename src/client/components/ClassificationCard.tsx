import { ChevronDown, ScanSearch } from "lucide-react";
import { useState } from "react";
import type { Archetype, ClassificationResult } from "../../shared/types/index.js";

const archetypes: Archetype[] = ["commerce-retail", "publisher-content", "travel-hospitality", "finance-insurance", "saas", "other"];

export function ClassificationCard({ classification, onOverride }: { classification: ClassificationResult; onOverride: (archetype: Archetype) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<Archetype>(classification.primaryArchetype);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function apply() {
    if (selected === classification.primaryArchetype) return;
    setBusy(true);
    setError(null);
    try {
      await onOverride(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The map could not be recompiled. Please try again.");
    } finally {
      // The button must never stay stuck on "Recompiling…": success navigates away, and both
      // outcomes hand the form back to the reader.
      setBusy(false);
    }
  }
  return (
    <section className="classification-card">
      <button className="classification-toggle" type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        <ScanSearch />
        <span><strong>How we understood the site</strong><small>{classification.categories[0]?.name ?? "Behavior-only classification"} · {classification.confidence} confidence</small></span>
        <ChevronDown className={expanded ? "rotated" : ""} />
      </button>
      {expanded && (
        <div className="classification-detail">
          <div><p>Content categories</p>{classification.categories.map((category) => <span className="category-chip" key={category.name}>{category.name} · {Math.round(category.confidence * 100)}%</span>)}</div>
          <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
            <label htmlFor="archetype-override">Correct the site type</label>
            <select id="archetype-override" value={selected} onChange={(event) => setSelected(event.target.value as Archetype)}>
              {archetypes.map((archetype) => <option key={archetype} value={archetype}>{archetype.replaceAll("-", " / ")}</option>)}
            </select>
            <button type="submit" disabled={busy || selected === classification.primaryArchetype}>{busy ? "Recompiling…" : "Recompile map"}</button>
          </form>
          {error && <p className="classification-error" role="alert">{error}</p>}
        </div>
      )}
    </section>
  );
}

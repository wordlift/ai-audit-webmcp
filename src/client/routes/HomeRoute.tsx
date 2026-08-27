import { ArrowRight, Bot, Network, ScanSearch, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createReport } from "../api/client";

const journey = [
  { label: "Understand the site", icon: ScanSearch },
  { label: "Map expected actions", icon: Network },
  { label: "Check agent readiness", icon: Bot },
];

/** Real phase durations for a live audit, which takes about a minute end to end. */
const PHASES = [
  { label: "Understanding the site", holdMs: 30_000 },
  { label: "Mapping expected actions", holdMs: 12_000 },
  { label: "Checking agent readiness", holdMs: Number.POSITIVE_INFINITY },
];

export function HomeRoute() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("https://alpina.travel");
  const [phaseIndex, setPhaseIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const phase = phaseIndex === null ? null : PHASES[phaseIndex].label;

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  function advanceThroughPhases() {
    let elapsed = 0;
    timers.current = PHASES.slice(0, -1).map((entry, index) => {
      elapsed += entry.holdMs;
      return window.setTimeout(() => setPhaseIndex(index + 1), elapsed);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPhaseIndex(0);
    advanceThroughPhases();
    try {
      const report = await createReport(url);
      navigate(`/reports/${report.id}`);
    } catch (caught) {
      setPhaseIndex(null);
      setError(caught instanceof Error ? caught.message : "The audit could not be completed");
    } finally {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current = [];
    }
  }

  return (
    <section className="home-page">
      <div className="hero" aria-labelledby="hero-title">
        <div className="eyebrow"><Sparkles size={16} /> Built for the agentic web</div>
        <h1 id="hero-title">Your website has pages. Agents need functions.</h1>
        <p className="hero-copy">
          Enter a URL. We identify the kind of site, map what an AI agent should be able to do,
          and turn every capability gap into an implementation-ready contract.
        </p>
        <form className="audit-form" onSubmit={submit}>
          <label htmlFor="site-url">Website URL</label>
          <div className="input-row">
            <input id="site-url" name="url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} required />
            <button type="submit" disabled={Boolean(phase)}>
              {phase ?? "Map capabilities"} <ArrowRight size={18} />
            </button>
          </div>
          <p>No account required. Public websites only.</p>
          {phase && <div className="progress-message" role="status"><span /> {phase}…</div>}
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      </div>
      <section className="journey-preview" aria-label="Audit stages">
        {journey.map(({ label, icon: Icon }, index) => (
          <article key={label}>
            <span>{index + 1}</span><Icon aria-hidden="true" /><h2>{label}</h2>
          </article>
        ))}
      </section>
      <p className="demo-note">Demo sites: alpina.travel · shop.example · publisher.example · insurance.example · saas.example</p>
    </section>
  );
}

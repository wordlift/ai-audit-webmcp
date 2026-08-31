import { ArrowRight, Bot, Braces, ScanSearch, Sparkles, Tags } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, getReport, startReport } from "../api/client";

const journey = [
  { label: "Analyze 4 useful pages", icon: ScanSearch },
  { label: "Extract entities & meaning", icon: Tags },
  { label: "Map actions & interfaces", icon: Braces },
  { label: "Verify agent readiness", icon: Bot },
];

/** Real phase durations for a live audit, which takes about a minute end to end. */
const PHASES = [
  { label: "Selecting representative pages", holdMs: 22_000 },
  { label: "Extracting entities and meaning", holdMs: 12_000 },
  { label: "Mapping actions and interfaces", holdMs: 12_000 },
  { label: "Checking agent readiness", holdMs: Number.POSITIVE_INFINITY },
];

/**
 * Cosmetic. A live audit fetches the page, its scripts, its discovery documents and any MCP
 * endpoint it advertises, which takes a while; these keep the wait feeling like work. The real
 * phase and the elapsed seconds are shown alongside, so nothing here overstates progress.
 */
const SCAN_WORDS = [
  "Sniffing",
  "Probing",
  "Parsing",
  "Crawling",
  "Enumerating",
  "Fingerprinting",
  "Triangulating",
  "Interrogating",
  "Disambiguating",
  "Cross-referencing",
  "Untangling",
  "Auscultating",
  "Sifting",
  "Divining",
  "Corroborating",
  "Distilling",
];

const WORD_MS = 2_200;

/** Real sites verified to complete on the live deployment; the sample hosts only resolve in demo mode. */
const LIVE_SITES = ["alpina.travel", "zurichna.com", "freedomdebtrelief.com"];
const DEMO_SITES = ["alpina.travel", "shop.example", "publisher.example", "insurance.example", "saas.example", "organization.example"];

async function waitUntilVisible(reportId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await getReport(reportId);
      return;
    } catch (caught) {
      if (!(caught instanceof ApiError) || caught.status !== 404) throw caught;
      await new Promise((resolve) => window.setTimeout(resolve, 600));
    }
  }
}

export function HomeRoute() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [phaseIndex, setPhaseIndex] = useState<number | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"demo" | "live" | null>(null);
  const timers = useRef<number[]>([]);
  const tickers = useRef<number[]>([]);
  const phase = phaseIndex === null ? null : PHASES[phaseIndex].label;
  const word = SCAN_WORDS[wordIndex % SCAN_WORDS.length];

  const stopClocks = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    tickers.current.forEach((ticker) => window.clearInterval(ticker));
    timers.current = [];
    tickers.current = [];
  };

  useEffect(() => stopClocks, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/health");
        const health = (await response.json()) as { mode?: string };
        if (!cancelled) setMode(health.mode === "demo" ? "demo" : "live");
      } catch {
        if (!cancelled) setMode("live");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function startClocks() {
    let elapsed = 0;
    timers.current = PHASES.slice(0, -1).map((entry, index) => {
      elapsed += entry.holdMs;
      return window.setTimeout(() => setPhaseIndex(index + 1), elapsed);
    });
    tickers.current = [
      window.setInterval(() => setWordIndex((index) => index + 1), WORD_MS),
      window.setInterval(() => setSeconds((value) => value + 1), 1_000),
    ];
  }

  async function run(target: string) {
    setUrl(target);
    setError(null);
    setPhaseIndex(0);
    setWordIndex(0);
    setSeconds(0);
    startClocks();
    try {
      const { reportId, ready } = startReport(target);
      // Leave for the report page as soon as the running record exists — it renders live
      // progress from there. A request refused outright still surfaces here.
      await Promise.race([ready, waitUntilVisible(reportId)]);
      ready.catch(() => undefined);
      navigate(`/reports/${reportId}`);
    } catch (caught) {
      setPhaseIndex(null);
      setError(caught instanceof Error ? caught.message : "The audit could not be completed");
    } finally {
      stopClocks();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(url);
  }

  const suggested = mode === "demo" ? DEMO_SITES : LIVE_SITES;

  return (
    <section className="home-page">
      <div className="hero" aria-labelledby="hero-title">
        <div className="eyebrow"><Sparkles size={16} /> Built for the agentic web</div>
        <h1 id="hero-title">Your website has pages. Agents need a <span>service map.</span></h1>
        <p className="hero-copy">
          Enter a URL. WordLift's Context Engine connects the site's entities and language to the
          actions agents need, then verifies which interfaces actually work.
        </p>
        <form className="audit-form" onSubmit={submit}>
          <label htmlFor="site-url">Website URL</label>
          <div className="input-row">
            <input
              id="site-url"
              name="url"
              type="url"
              value={url}
              placeholder="https://example.com"
              onChange={(event) => setUrl(event.target.value)}
              required
            />
            <button type="submit" disabled={Boolean(phase)}>
              {phase ? "Building the map" : "Build the service map"} <ArrowRight size={18} />
            </button>
          </div>
          <p>No account required. Public websites only.</p>
          {mode && (
            <div className="try-sites" aria-label="Suggested sites">
              <span className="try-sites-label">
                {mode === "demo" ? "Demo mode — pick a sample site:" : "No site handy? Try one of these:"}
              </span>
              {suggested.map((host) => (
                <button
                  key={host}
                  type="button"
                  className="try-site"
                  disabled={Boolean(phase)}
                  onClick={() => void run(`https://${host}`)}
                >
                  {host} <ArrowRight size={13} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
          {phase && (
            <div className="progress-message">
              {/* Only the real phase is announced: the rotating word would talk over a screen reader. */}
              <span className="sr-only" role="status">{phase}</span>
              <span className="progress-dot" aria-hidden="true" />
              <span className="progress-word" aria-hidden="true">{word}…</span>
              <span className="progress-detail" aria-hidden="true">
                {phase} · {seconds}s
              </span>
            </div>
          )}
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
    </section>
  );
}

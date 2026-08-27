import { ArrowRight, Network, ScanSearch, Sparkles } from "lucide-react";

const journey = ["Understand the site", "Map expected actions", "Check agent readiness"];

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordlift-brand" href="/" aria-label="WordLift AI Audit home">
          <span className="wordlift-mark" aria-hidden="true">W</span>
          <span>WordLift</span>
          <span className="product-name">AI Audit</span>
        </a>
        <span className="open-source-label">Open source · WebMCP</span>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="eyebrow"><Sparkles size={16} /> Built for the agentic web</div>
          <h1 id="hero-title">Your website has pages. Agents need functions.</h1>
          <p className="hero-copy">
            Enter a URL and see what an AI agent should be able to discover,
            understand, and do—then get an evidence-backed path to close the gaps.
          </p>

          <form className="audit-form" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="site-url">Website URL</label>
            <div className="input-row">
              <input id="site-url" name="url" type="url" placeholder="https://example.com" />
              <button type="submit">
                Map capabilities <ArrowRight size={18} />
              </button>
            </div>
            <p>No account required. Public websites only.</p>
          </form>
        </section>

        <section className="journey-preview" aria-label="Audit stages">
          {journey.map((label, index) => (
            <article key={label}>
              <span>{index + 1}</span>
              {index === 0 ? <ScanSearch aria-hidden="true" /> : <Network aria-hidden="true" />}
              <h2>{label}</h2>
            </article>
          ))}
        </section>
      </main>

      <footer>
        <p>Agent perspective. Human-readable evidence. Implementation-ready contracts.</p>
      </footer>
    </div>
  );
}

import { Link, Route, Routes } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ReportRoute } from "./routes/ReportRoute";

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordlift-brand" to="/" aria-label="WordLift AI Audit home">
          <span className="wordlift-mark" aria-hidden="true">W</span>
          <span>WordLift</span>
          <span className="product-name">AI Audit</span>
        </Link>
        <span className="open-source-label">Open source · WebMCP</span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/reports/:reportId" element={<ReportRoute />} />
        </Routes>
      </main>
      <footer>
        <p>Agent perspective. Human-readable evidence. Implementation-ready contracts.</p>
        <a href="https://wordlift.io" target="_blank" rel="noreferrer">Build your agent-ready site with WordLift</a>
      </footer>
    </div>
  );
}

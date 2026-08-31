import { Link, Route, Routes } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ReportRoute } from "./routes/ReportRoute";
import { PinnedAlpinaRoute } from "./routes/PinnedAlpinaRoute";
import { AuditWebsiteTool } from "./webmcp/AuditWebsiteTool";

export function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="wordlift-brand" to="/" aria-label="WordLift AI Audit home">
          <img className="wordlift-mark" src="/brand/wordmark-sky.svg" alt="WordLift" width={116} height={24} />
          <span className="product-name">AI Audit</span>
        </Link>
        <div className="header-status">
          <AuditWebsiteTool />
          <span className="open-source-label">Open source · WebMCP</span>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/demo/alpina" element={<PinnedAlpinaRoute />} />
          <Route path="/reports/:reportId" element={<ReportRoute />} />
        </Routes>
      </main>
      <footer>
        <p>Agent perspective. Human-readable evidence. Implementation-ready contracts.</p>
        <a href="https://wordlift.io" target="_blank" rel="noreferrer">Build your Context Engine with WordLift</a>
      </footer>
    </div>
  );
}

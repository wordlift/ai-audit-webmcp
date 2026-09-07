import { Link, Route, Routes } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ActivateRoute } from "./routes/ActivateRoute";
import { ReportRoute } from "./routes/ReportRoute";
import { PinnedAlpinaRoute } from "./routes/PinnedAlpinaRoute";
import { PitchRoute } from "./routes/PitchRoute";
import { AuditWebsiteTool } from "./webmcp/AuditWebsiteTool";
import { GetAuditReportTool } from "./webmcp/GetAuditReportTool";

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
          <GetAuditReportTool />
          <span className="open-source-label">Open source</span>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/demo/alpina" element={<PinnedAlpinaRoute />} />
          <Route path="/reports/:reportId" element={<ReportRoute />} />
          <Route path="/reports/:reportId/activate" element={<ActivateRoute />} />
          <Route path="/pitch" element={<PitchRoute />} />
          <Route path="/pitch/:ids" element={<PitchRoute />} />
        </Routes>
      </main>
      <footer>
        <p>Agent perspective. Human-readable evidence. Implementation-ready contracts.</p>
        <a href="https://wordlift.io" target="_blank" rel="noreferrer">Build your Context Engine with WordLift</a>
        <a className="footer-legal" href="/privacy">Privacy policy</a>
      </footer>
    </div>
  );
}

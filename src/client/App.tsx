import { Route, Routes } from "react-router-dom";
import { HomeRoute } from "./routes/HomeRoute";
import { ActivateRoute } from "./routes/ActivateRoute";
import { ReportRoute } from "./routes/ReportRoute";
import { PinnedAlpinaRoute } from "./routes/PinnedAlpinaRoute";
import { PitchRoute } from "./routes/PitchRoute";
import { SiteHeader } from "./surface/SiteHeader";

export function App() {
  return (
    <div className="app-shell">
      <SiteHeader />
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
        <p>Audit what agents can do on your site. Fix what they cannot. Activate what works.</p>
        <a href="https://wordlift.io" target="_blank" rel="noreferrer">Keep your business agent-ready with WordLift</a>
        <a className="footer-legal" href="/privacy">Privacy policy</a>
      </footer>
    </div>
  );
}

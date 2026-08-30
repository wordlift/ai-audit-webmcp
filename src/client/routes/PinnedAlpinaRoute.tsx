import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPinnedAlpinaReport } from "../api/client";
import { ReportErrorState } from "../components/ReportErrorState";

export function PinnedAlpinaRoute() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPinnedAlpinaReport()
      .then((report) => navigate(`/reports/${report.id}`, { replace: true }))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Pinned demo unavailable"));
  }, [navigate]);

  if (error) return <ReportErrorState title="Pinned demo unavailable" message={error} />;
  return <div className="report-loading" role="status">Opening the stable Alpina service map…</div>;
}

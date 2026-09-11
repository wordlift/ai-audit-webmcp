import { CheckCircle2, Play, ShieldCheck, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CapabilityResult, ReportRecord } from "../../shared/types/index.js";
import { checkAlpinaAvailability, prepareCapabilityTest, runCapabilityTest, type CapabilityTestOutcome, type TestableInterface } from "../api/client";
import { describeAvailability } from "../webmcp/AlpinaAvailabilityTool";
import { argumentsFrom, fieldsFrom, missingRequired, type TestField } from "./capabilityTestForm";

/**
 * Test it yourself: the call the audit makes to verify, with the inputs the audit would not
 * invent supplied by the person. Read-only tools only, one call per click, the outcome as it came,
 * and evidence only when the person says so, as a new version of the report.
 */
const SIDECAR_HOST = "alpina.travel";

export function testable(report: ReportRecord, capability: CapabilityResult): boolean {
  const host = (() => {
    try {
      return new URL(report.canonicalUrl ?? report.requestedUrl).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (capability.actionId === "availability.check" && host === SIDECAR_HOST) return true;
  return (report.contextGraph?.interfaces ?? []).some((item) => item.actionId === capability.actionId && item.protocol === "mcp" && item.id.startsWith("interface:mcp-tool-") && !/\/sse\/?$/.test(item.sourceUrl));
}

function initialValues(fields: TestField[]): Record<string, string | boolean> {
  return Object.fromEntries(fields.map((field) => [field.name, field.kind === "boolean" ? field.defaultValue === true : field.defaultValue === undefined ? "" : String(field.defaultValue)]));
}

export function CapabilityTest({ report, capability }: { report: ReportRecord; capability: CapabilityResult }) {
  const navigate = useNavigate();
  const [interfaces, setInterfaces] = useState<TestableInterface[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CapabilityTestOutcome | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    prepareCapabilityTest(report.id, capability.actionId)
      .then((answer) => {
        if (cancelled) return;
        setInterfaces(answer.interfaces);
        const first = answer.interfaces.find((item) => item.safe);
        if (first) {
          setChosen(first.id);
          setValues(initialValues(fieldsFrom(first.inputSchema)));
        }
      })
      .catch((caught) => {
        if (!cancelled) setLoadError(caught instanceof Error ? caught.message : "What can be called could not be read.");
      });
    return () => {
      cancelled = true;
    };
  }, [report.id, capability.actionId]);

  const current = interfaces?.find((item) => item.id === chosen) ?? null;
  const fields = current ? fieldsFrom(current.inputSchema) : [];

  function choose(id: string) {
    setChosen(id);
    setResult(null);
    setError(null);
    const next = interfaces?.find((item) => item.id === id);
    setValues(initialValues(fieldsFrom(next?.inputSchema)));
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!current) return;
    const missing = missingRequired(fields, values);
    if (missing) {
      setError(`${missing} is needed.`);
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    const args = argumentsFrom(fields, values);
    try {
      if (current.protocol === "sidecar") {
        // The approved sidecar records its own evidence and its own ledger line: one call, one new version.
        const started = Date.now();
        const answer = await checkAlpinaAvailability({ reportId: report.id, checkIn: String(args.checkIn), checkOut: String(args.checkOut), adults: Number(args.adults), surface: "web" });
        setResult({
          outcome: "answered",
          latencyMs: Date.now() - started,
          answer: describeAvailability(answer),
          request: { endpoint: current.endpoint, tool: "check-availability", arguments: args },
          testedAt: new Date().toISOString(),
          ...(answer.updatedReportId ? { updatedReportId: answer.updatedReportId, updatedReportUrl: answer.updatedReportUrl } : {}),
        });
      } else {
        setResult(await runCapabilityTest(report.id, capability.actionId, { interfaceId: current.id, arguments: args }));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The call could not be made.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!current || !result) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await runCapabilityTest(report.id, capability.actionId, { interfaceId: current.id, arguments: result.request.arguments, save: true });
      if (saved.updatedReportUrl) navigate(saved.updatedReportUrl);
      else setResult(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The evidence could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="capability-test" aria-labelledby="capability-test-title">
      <p className="section-kicker" id="capability-test-title"><Play size={15} /> Test it yourself</p>
      <p className="capability-test-lead">
        {capability.state === "agent-ready"
          ? "Call the interface again, with your own inputs, and see what it answers today."
          : "Call what the site declares, with the inputs the audit would not invent, and see what answers."}
      </p>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {interfaces && interfaces.length === 0 && <p className="capability-test-none">Nothing here can be called from outside the site's own page.</p>}
      {interfaces && interfaces.length > 1 && (
        <div className="capability-test-pick" role="radiogroup" aria-label="What to call">
          {interfaces.map((item) => (
            <label key={item.id} className={`own-it-option${chosen === item.id ? " is-chosen" : ""}${item.safe ? "" : " is-unsafe"}`}>
              <input type="radio" name="capability-test-interface" value={item.id} checked={chosen === item.id} disabled={!item.safe} onChange={() => choose(item.id)} />
              {item.name}
            </label>
          ))}
        </div>
      )}
      {interfaces?.filter((item) => !item.safe).map((item) => (
        <p key={item.id} className="capability-test-note">{item.name}: {item.note}</p>
      ))}
      {current && (
        <form className="capability-test-form" onSubmit={(event) => void run(event)}>
          <p className="capability-test-target">
            <code>{current.name}</code> at <code>{current.endpoint}</code>
            {current.description ? <span> · {current.description}</span> : null}
          </p>
          {fields.length > 0 && (
            <div className="capability-test-fields">
              {fields.map((field) => {
                const id = `test-${capability.actionId}-${field.name}`;
                const value = values[field.name];
                return (
                  <label key={field.name} htmlFor={id}>
                    {field.label}{field.required ? "" : " (optional)"}
                    {field.kind === "boolean" ? (
                      <input id={id} type="checkbox" checked={value === true} onChange={(event) => setValues((all) => ({ ...all, [field.name]: event.target.checked }))} />
                    ) : field.kind === "select" ? (
                      <select id={id} value={String(value ?? "")} onChange={(event) => setValues((all) => ({ ...all, [field.name]: event.target.value }))}>
                        <option value="">Choose</option>
                        {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        id={id}
                        type={field.kind === "date" ? "date" : field.kind === "number" ? "number" : "text"}
                        value={String(value ?? "")}
                        placeholder={field.description}
                        min={field.minimum}
                        max={field.maximum}
                        onChange={(event) => setValues((all) => ({ ...all, [field.name]: event.target.value }))}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <div className="capability-test-actions">
            <button type="submit" className="fix-publish" disabled={busy}>{busy ? "Calling…" : "Run the call"}</button>
            <span className="capability-test-guard"><ShieldCheck size={14} aria-hidden="true" /> Read-only tools only. One call per click. Nothing is booked or changed.</span>
          </div>
        </form>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {result && (
        <div className={`capability-test-result is-${result.outcome}`} role="status">
          <p className="capability-test-verdict">
            {result.outcome === "answered" ? <CheckCircle2 size={16} aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            {result.outcome === "answered" ? "It answered" : "It did not answer"} in {(result.latencyMs / 1000).toFixed(1)} s{result.error ? `: ${result.error}` : "."}
          </p>
          {result.answer && <pre className="capability-test-answer">{result.answer}</pre>}
          <details className="capability-test-request">
            <summary>What was sent</summary>
            <pre>{JSON.stringify(result.request, null, 2)}</pre>
          </details>
          {result.updatedReportUrl ? (
            <p className="capability-test-saved">Recorded as evidence in <a href={result.updatedReportUrl}>a new version of this report</a>.</p>
          ) : current?.protocol === "mcp" ? (
            <p className="capability-test-save">
              <button type="button" className="fix-publish" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save as evidence"}</button>
              <span>Creates a new version of this report. Readiness moves the way the evidence says.</span>
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

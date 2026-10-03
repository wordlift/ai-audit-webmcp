import { Bot, Check, LoaderCircle } from "lucide-react";
import type { EntityRelation, ReportRecord } from "../../shared/types/index.js";
import { businessModel } from "../../shared/format/businessModel.js";
import { modelView } from "../../shared/format/modelView.js";

/** How a relation reads in one line while the model forms: "AlpiNest → offers Samspitze 4". */
const RELATION_WORDS: Record<EntityRelation["kind"], string> = {
  offers: "offers",
  "located-in": "in",
  "provided-by": "provided by",
  "part-of": "part of",
  serves: "serves",
  brand: "brand",
};

const MAX_FOUND = 6;
const MAX_CONNECTED = 3;

interface ProgressStep {
  key: string;
  state: "done" | "active" | "waiting";
  /** A step that names something the audit found carries the name apart, so it can be set in bold. */
  label: string;
  name?: string;
}

/**
 * The steps the audit has walked, from what the running record already holds: the pages it chose,
 * each thing it found and each connection the site's markup declares, then the phase it is in.
 * Nothing is shown that has not landed, so the wait is the Context Engine forming, not a spinner.
 */
export function progressSteps(report: ReportRecord): ProgressStep[] {
  const graph = report.contextGraph;
  const pages = graph?.pages.length ?? 0;
  const steps: ProgressStep[] = [];
  if (pages === 0) {
    steps.push({ key: "pages", state: "active", label: "Selecting representative pages" });
  } else {
    steps.push({ key: "pages", state: "done", label: `Selected ${pages} representative ${pages === 1 ? "page" : "pages"}` });
    // Found as the first screen will show it: one product for its variants, the business not the website's name.
    const model = businessModel(report, "");
    for (const entity of modelView(report).preview.slice(0, MAX_FOUND)) {
      steps.push({ key: `entity-${entity.id}`, state: "done", label: "Found", name: entity.variants > 0 ? `${entity.name} (${entity.variants + 1} variants)` : entity.name });
    }
    for (const relation of model.relationships.slice(0, MAX_CONNECTED)) {
      steps.push({ key: `relation-${relation.from}-${relation.kind}-${relation.to}`, state: "done", label: "Connected", name: `${relation.fromName} → ${RELATION_WORDS[relation.kind]} ${relation.toName}` });
    }
  }
  const checking = report.phase === "checking";
  // The text is read page by page after the markup: said while it happens, with how far it got.
  const text = report.textRead;
  const reading = Boolean(text && text.read < text.of) || (pages > 0 && !text && !checking);
  if (pages > 0) {
    steps.push(
      text && text.read >= text.of
        ? { key: "text", state: "done", label: `Read the text of ${text.of} ${text.of === 1 ? "page" : "pages"}` }
        : { key: "text", state: "active", label: text ? `Reading the text of the pages · ${text.read} of ${text.of}` : "Reading the text of the pages" },
    );
  }
  if (pages > 0 || report.phase !== "understanding") {
    steps.push({ key: "mapping", state: checking ? "done" : reading ? "waiting" : "active", label: "Working out what agents should be able to do here" });
  }
  steps.push({ key: "checking", state: checking ? "active" : "waiting", label: "Calling what the site declares, to see what answers" });
  return steps;
}

/**
 * The report while it is being made: the Context Engine forming, step by step, from what has
 * already landed. The foundation score shows when it arrives, as a fact beside the model.
 */
export function ReportProgress({ report }: { report: ReportRecord }) {
  const host = hostOf(report.canonicalUrl ?? report.requestedUrl);
  const steps = progressSteps(report);

  return (
    <div className="report-page report-progress" aria-busy="true">
      <p className="eyebrow"><Bot size={16} /> Audit</p>
      <h1>Building a Context Engine for <span>{host}</span></h1>

      <ol className="progress-phases" aria-label="What the audit has done so far">
        {steps.map((step) => (
          <li key={step.key} className={step.state === "done" ? "done" : step.state === "active" ? "active" : ""}>
            {step.state === "done" ? <Check aria-hidden="true" /> : step.state === "active" ? <LoaderCircle className="spin" aria-hidden="true" /> : <i aria-hidden="true" />}
            <span>
              {step.label}
              {step.name && <> <strong>{step.name}</strong></>}
            </span>
          </li>
        ))}
      </ol>

      {/* One line, not a paragraph: the model forming is what the wait is for. */}
      {report.foundationAudit && (
        <p className="progress-foundation" aria-label="Foundation audit">
          Foundation score <strong>{report.foundationAudit.score}/100</strong>, already in.
        </p>
      )}

      <p className="progress-footnote" role="status">
        We read the text of every page and call what the site declares rather than counting it. This page
        updates itself as the model forms; the report appears when the audit lands, usually in one to two minutes.
      </p>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

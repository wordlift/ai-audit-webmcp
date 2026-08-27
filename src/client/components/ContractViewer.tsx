import { Check, Clipboard, Download } from "lucide-react";
import { useState } from "react";
import type { ActionContract } from "../../shared/types/index.js";

export function ContractViewer({ reportId, actionId, contract }: { reportId: string; actionId: string; contract: ActionContract }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(contract, null, 2);
  async function copy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }
  return (
    <details className="contract-viewer">
      <summary>Machine-readable capability contract</summary>
      <div className="contract-actions">
        <button type="button" onClick={copy}>{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy JSON-LD"}</button>
        <a href={`/api/reports/${reportId}/contracts/${actionId}`} download={`${actionId}.jsonld`}><Download /> Download</a>
      </div>
      <pre><code>{json}</code></pre>
    </details>
  );
}

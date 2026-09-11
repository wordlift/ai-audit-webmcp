import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Copy, X } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * One published document, read in full where it is offered: the JSON-LD as coloured tokens, the
 * Terms of Action as the page it is, never a wall of monospace. The card on the Activate screen
 * shows the first lines; this shows the whole file, with the raw file one click away.
 */
export type DocFormat = "json" | "markdown";

export interface PublishedDoc {
  kind: string;
  title: string;
  note: string;
  text: string;
  href: string;
  format: DocFormat;
}

export type JsonTokenKind = "key" | "string" | "number" | "literal" | "punct" | "space";

/** JSON as tokens, each its own span: keys, strings, numbers, literals, punctuation. The text is the text; nothing is parsed twice. */
export function jsonTokens(text: string): Array<{ kind: JsonTokenKind; text: string }> {
  const out: Array<{ kind: JsonTokenKind; text: string }> = [];
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],:])|(\s+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push({ kind: "punct", text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      if (match[2] !== undefined) {
        out.push({ kind: "key", text: match[1] });
        out.push({ kind: "punct", text: match[2] });
      } else {
        out.push({ kind: "string", text: match[1] });
      }
    } else if (match[3] !== undefined) out.push({ kind: "number", text: match[3] });
    else if (match[4] !== undefined) out.push({ kind: "literal", text: match[4] });
    else if (match[5] !== undefined) out.push({ kind: "punct", text: match[5] });
    else out.push({ kind: "space", text: match[6] ?? "" });
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push({ kind: "punct", text: text.slice(last) });
  return out;
}

export type MarkdownBlock =
  | { type: "meta"; entries: Array<[string, string]> }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; text: string };

/** The subset the generated documents use: headings, bullet lists and paragraphs. Anything else is a paragraph. */
export function markdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  // A leading front matter is the file's own metadata: shown as what it is, key by key, not as prose.
  const front = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (front) {
    const entries = front[1]!.split("\n").map((line) => /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)).filter((match): match is RegExpExecArray => Boolean(match)).map((match) => [match[1]!, match[2]!] as [string, string]);
    if (entries.length > 0) blocks.push({ type: "meta", entries });
    text = text.slice(front[0].length);
  }
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list.length > 0) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "heading", level: heading[1]!.length as 1 | 2 | 3, text: heading[2]! });
    } else if (/^[-*]\s+/.test(line)) {
      if (paragraph.length > 0) flush();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.trim() === "") {
      flush();
    } else {
      if (list.length > 0) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

/** Bold, code and links inside a line; the rest is text. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g).filter((part) => part !== "");
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>;
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="doc-markdown">
      {markdownBlocks(text).map((block, index) => {
        if (block.type === "meta") {
          return (
            <dl key={index} className="doc-meta">
              {block.entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
            </dl>
          );
        }
        if (block.type === "heading") {
          const Tag = (["h2", "h3", "h4"] as const)[block.level - 1];
          return <Tag key={index}><Inline text={block.text} /></Tag>;
        }
        if (block.type === "list") return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} /></li>)}</ul>;
        return <p key={index}><Inline text={block.text} /></p>;
      })}
    </div>
  );
}

export function JsonView({ text }: { text: string }) {
  return (
    <pre className="doc-json">
      <code>{jsonTokens(text).map((token, index) => <span key={index} className={`tok-${token.kind}`}>{token.text}</span>)}</code>
    </pre>
  );
}

function sizeLine(text: string): string {
  const lines = text.split("\n").length;
  const bytes = new TextEncoder().encode(text).length;
  return `${lines} ${lines === 1 ? "line" : "lines"} · ${bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`}`;
}

export function DocDialog({ doc, onOpenChange }: { doc: PublishedDoc | null; onOpenChange: (open: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!doc) return;
    await navigator.clipboard.writeText(doc.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }
  let body: ReactNode = null;
  if (doc) body = doc.format === "json" ? <JsonView text={doc.text} /> : <Markdown text={doc.text} />;

  return (
    <Dialog.Root open={Boolean(doc)} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content doc-dialog" aria-describedby={undefined}>
          {doc && (
            <>
              <header className="doc-dialog-head">
                <span className="doc-kind">{doc.kind}</span>
                <Dialog.Title>{doc.title}</Dialog.Title>
                <p>{doc.note}</p>
                <small>{sizeLine(doc.text)}</small>
              </header>
              <Dialog.Close className="dialog-close" aria-label="Close the document"><X /></Dialog.Close>
              <div className="doc-dialog-body">{body}</div>
              <footer className="doc-dialog-foot">
                <button type="button" onClick={() => void copy()}><Copy size={14} aria-hidden="true" /> {copied ? "Copied" : "Copy the whole file"}</button>
                <a href={doc.href} target="_blank" rel="noreferrer">Open the raw file <ArrowUpRight size={14} aria-hidden="true" /></a>
              </footer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

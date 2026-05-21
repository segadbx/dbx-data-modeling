import { useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui/Button";

const PLACEHOLDER = "-- (no DDL yet for this proposal)";

export default function DdlDiff({
  a,
  b,
  titleA,
  titleB,
}: {
  a: string | null;
  b: string | null;
  titleA: string;
  titleB: string;
}) {
  const [split, setSplit] = useState(true);
  const [hideUnchanged, setHideUnchanged] = useState(false);
  const [copied, setCopied] = useState<"A" | "B" | null>(null);

  const aText = a ?? PLACEHOLDER;
  const bText = b ?? PLACEHOLDER;

  async function copy(side: "A" | "B") {
    const text = side === "A" ? aText : bText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(side);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="ddl-diff">
      <div className="ddl-diff-toolbar">
        <div className="segmented">
          <button
            type="button"
            className={split ? "is-active" : ""}
            onClick={() => setSplit(true)}
          >
            Split
          </button>
          <button
            type="button"
            className={!split ? "is-active" : ""}
            onClick={() => setSplit(false)}
          >
            Unified
          </button>
        </div>
        <label className="ddl-diff-toggle">
          <input
            type="checkbox"
            checked={hideUnchanged}
            onChange={(e) => setHideUnchanged(e.target.checked)}
            style={{ accentColor: "var(--brand-500)" }}
          />
          Hide unchanged lines
        </label>
        <div className="ddl-diff-toolbar-right" style={{ display: "inline-flex", gap: 6 }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copy("A")}
            leadingIcon={copied === "A" ? <Check aria-hidden /> : <Copy aria-hidden />}
          >
            {copied === "A" ? "Copied" : "Copy A"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => copy("B")}
            leadingIcon={copied === "B" ? <Check aria-hidden /> : <Copy aria-hidden />}
          >
            {copied === "B" ? "Copied" : "Copy B"}
          </Button>
        </div>
      </div>
      <ReactDiffViewer
        oldValue={aText}
        newValue={bText}
        splitView={split}
        leftTitle={titleA}
        rightTitle={titleB}
        compareMethod={DiffMethod.LINES}
        showDiffOnly={hideUnchanged}
        useDarkTheme={false}
        styles={{
          variables: {
            light: {
              diffViewerBackground: "var(--bg-surface)",
              diffViewerTitleBackground: "var(--bg-sunken)",
              addedBackground: "#ecfdf5",
              addedColor: "var(--success-strong)",
              removedBackground: "#fef2f2",
              removedColor: "var(--danger-strong)",
              wordAddedBackground: "#bbf7d0",
              wordRemovedBackground: "#fecaca",
              addedGutterBackground: "#d1fae5",
              removedGutterBackground: "#fee2e2",
              gutterBackground: "var(--bg-sunken)",
              gutterColor: "var(--text-quaternary)",
            },
          },
          contentText: { fontFamily: "var(--font-mono)", fontSize: "12.5px" },
        }}
        renderContent={(value) => (
          <span
            // Prism returns HTML; we trust it because Prism only highlights, doesn't execute.
            dangerouslySetInnerHTML={{
              __html: Prism.highlight(value ?? "", Prism.languages.sql, "sql"),
            }}
          />
        )}
      />
    </div>
  );
}

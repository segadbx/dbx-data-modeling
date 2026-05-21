import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyChip({
  value,
  display,
  title,
}: {
  value: string;
  display?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      className="chip chip-copy"
      onClick={copy}
      title={title ?? `Copy ${value}`}
    >
      <code>{display ?? value}</code>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
    </button>
  );
}

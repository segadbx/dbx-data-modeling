import {
  CheckCircle2,
  Circle,
  CircleDashed,
  PlayCircle,
  XCircle,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";

type StatusKey =
  | "draft"
  | "ready"
  | "approved"
  | "applied"
  | "rejected"
  | "failed"
  | "running"
  | string;

const MAP: Record<string, { tone: BadgeTone; icon: LucideIcon; label: string }> = {
  draft: { tone: "neutral", icon: CircleDashed, label: "Draft" },
  ready: { tone: "info", icon: Circle, label: "Ready" },
  approved: { tone: "success", icon: CheckCircle2, label: "Approved" },
  applied: { tone: "brand", icon: PlayCircle, label: "Applied" },
  rejected: { tone: "danger", icon: XCircle, label: "Rejected" },
  failed: { tone: "danger", icon: AlertTriangle, label: "Failed" },
  running: { tone: "warning", icon: PlayCircle, label: "Running" },
};

export function StatusPill({ status }: { status: StatusKey }) {
  const norm = (status || "").toLowerCase();
  const cfg = MAP[norm] ?? { tone: "neutral" as BadgeTone, icon: Circle, label: status || "—" };
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone} icon={<Icon aria-hidden />}>
      {cfg.label}
    </Badge>
  );
}

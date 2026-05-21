import { NavLink } from "react-router-dom";
import {
  Database,
  MessageSquare,
  GitBranch,
  ShieldCheck,
  GitCompare,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { to: "/", label: "Catalog", icon: Database, end: true },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/canvas", label: "Model Canvas", icon: GitBranch },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck },
  { to: "/compare", label: "Compare", icon: GitCompare },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`} aria-label="Primary navigation">
      <div className="sidebar-section-label">Workspace</div>
      <nav className="sidebar-nav">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? " is-active" : ""}`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon aria-hidden />
              <span className="sidebar-nav-item-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <span className="sidebar-version">v0.1 · Phase 0</span>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
        </button>
      </div>
    </aside>
  );
}

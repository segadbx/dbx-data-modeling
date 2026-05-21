import { Link } from "react-router-dom";
import { ChevronRight, HelpCircle, Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "modeler.theme";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return { theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) };
}

export function Topbar() {
  const { theme, toggle } = useTheme();
  return (
    <header className="topbar" role="banner">
      <div className="topbar-left">
        <Link to="/" className="topbar-brand" aria-label="Dimensional Modeler — Home">
          <span className="topbar-logo" aria-hidden>M</span>
          <span className="topbar-title">
            <span className="topbar-title-name">Dimensional Modeler</span>
            <span className="topbar-title-product">Databricks · Lakehouse</span>
          </span>
        </Link>
        <span className="topbar-divider" aria-hidden />
        <nav className="topbar-breadcrumb" aria-label="Workspace">
          <span className="topbar-breadcrumb-segment">data_modeling</span>
          <ChevronRight aria-hidden />
          <span className="topbar-breadcrumb-segment is-strong">gold</span>
        </nav>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="topbar-iconbtn"
          onClick={toggle}
          aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
          title="Toggle theme"
        >
          {theme === "light" ? <Moon aria-hidden /> : <Sun aria-hidden />}
        </button>
        <a
          className="topbar-iconbtn"
          href="https://docs.databricks.com/en/data-modeling/index.html"
          target="_blank"
          rel="noreferrer noopener"
          aria-label="Help and docs"
          title="Documentation"
        >
          <HelpCircle aria-hidden />
        </a>
        <div className="topbar-avatar" aria-label="Signed in user" title="Signed in">
          ME
        </div>
      </div>
    </header>
  );
}

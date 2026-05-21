import { forwardRef, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg";

export interface LinkButtonProps {
  to: string;
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  iconOnly?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
  target?: string;
  rel?: string;
  children?: ReactNode;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Anchor element styled like `Button`. Use this for SPA navigation instead of
 * `<Link><Button/></Link>` — putting a <button> inside an <a> is invalid HTML
 * and produces React warnings.
 *
 * Falls through to a normal anchor for external URLs (target="_blank" or any
 * absolute URL) so the browser handles them natively.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(
  function LinkButton(
    {
      to,
      variant = "secondary",
      size = "md",
      leadingIcon,
      trailingIcon,
      loading = false,
      iconOnly = false,
      disabled = false,
      className,
      title,
      target,
      rel,
      children,
      onClick,
    },
    ref,
  ) {
    const navigate = useNavigate();
    const external = target === "_blank" || /^https?:/i.test(to);

    const classes = [
      "btn",
      `btn-${variant}`,
      size !== "md" ? `btn-${size}` : "",
      loading ? "btn-loading" : "",
      iconOnly ? "btn-icon-only" : "",
      disabled ? "is-disabled" : "",
      className ?? "",
    ]
      .filter(Boolean)
      .join(" ");

    function handleClick(e: MouseEvent<HTMLAnchorElement>) {
      onClick?.(e);
      if (disabled || loading) {
        e.preventDefault();
        return;
      }
      if (external) return; // let the browser handle it
      if (e.defaultPrevented) return;
      if (e.button !== 0) return; // only left-click
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // open-in-new etc.
      e.preventDefault();
      navigate(to);
    }

    return (
      <a
        ref={ref}
        href={to}
        target={target}
        rel={rel ?? (external ? "noreferrer noopener" : undefined)}
        className={classes}
        title={title}
        aria-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
        onClick={handleClick}
      >
        {loading ? <Loader2 aria-hidden /> : leadingIcon}
        {!iconOnly && children}
        {!loading && trailingIcon}
      </a>
    );
  },
);

import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  flush?: boolean;
}

export function Card({ children, flush, className, ...rest }: CardProps) {
  const classes = ["card", flush ? "" : "", className ?? ""].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function CardHeader({ title, subtitle, actions, children }: CardHeaderProps) {
  return (
    <div className="card-header">
      <div>
        {title && <div className="card-header-title">{title}</div>}
        {subtitle && <div className="card-header-subtitle">{subtitle}</div>}
        {children}
      </div>
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </div>
  );
}

export function CardBody({
  children,
  flush = false,
  className,
}: {
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  const classes = ["card-body", flush ? "card-body-flush" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="card-footer">{children}</div>;
}

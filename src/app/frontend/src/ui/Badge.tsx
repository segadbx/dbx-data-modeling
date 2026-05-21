import type { ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "brand"
  | "fact";

export function Badge({
  tone = "neutral",
  square = false,
  solid = false,
  icon,
  children,
}: {
  tone?: BadgeTone;
  square?: boolean;
  solid?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const classes = [
    "badge",
    `badge-${tone}`,
    square ? "badge-square" : "",
    solid ? "badge-solid" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes}>
      {icon}
      {children}
    </span>
  );
}

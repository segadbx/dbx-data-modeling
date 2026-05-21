import type { CSSProperties } from "react";

type SkeletonShape = "line" | "block" | "circle";

export function Skeleton({
  shape = "line",
  width,
  height,
  style,
}: {
  shape?: SkeletonShape;
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton skeleton-${shape}`}
      style={{ width, height, ...style }}
      aria-hidden
    />
  );
}

import { cn } from "@/lib/utils";

interface QuadrantChipProps {
  quadrant: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Unified quadrant chip — all quadrants share the same primary-toned
 * treatment. The label itself differentiates the quadrant; we don't use
 * semantic colors here because leadership reads them as data, not status.
 *
 * Variants are intentionally tiny: a primary-tinted background + primary
 * border + primary text. One visual register across all five quadrants.
 */
const SHORT_LABEL: Record<string, string> = {
  "Transformational Value": "Transformational",
  "Incremental Growth": "Incremental",
};

export const QuadrantChip = ({
  quadrant,
  size = "sm",
  className,
}: QuadrantChipProps) => {
  const label = SHORT_LABEL[quadrant] ?? quadrant;
  return (
    <span
      className={cn(
        "insights-q-chip",
        size === "md" && "insights-q-chip--md",
        className,
      )}
    >
      <span className="insights-q-chip__dot" aria-hidden />
      {label}
    </span>
  );
};

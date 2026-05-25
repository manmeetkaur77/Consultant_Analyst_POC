import type { CoverageArea, CoveragePayload } from "@/services/consultingAgentApi";

interface CoverageIndicatorProps {
  coverage: CoveragePayload | null;
  sheetNum?: string;
}

const AREAS: { key: CoverageArea; label: string }[] = [
  { key: "qualification", label: "Qualify" },
  { key: "value", label: "Value" },
  { key: "viability", label: "Viability" },
  { key: "drivers", label: "Drivers" },
  { key: "instinct", label: "Instinct" },
];

export const CoverageIndicator = ({
  coverage,
  sheetNum = "01",
}: CoverageIndicatorProps) => {
  const touched = coverage ? AREAS.filter((a) => coverage[a.key]?.touched).length : 0;
  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Discovery coverage</span>
        <span className="ml-auto text-[9px] font-mono tabular-nums text-muted-foreground tracking-[0.18em] uppercase">
          {touched}/{AREAS.length}
        </span>
      </div>
      <div className="joseph-coverage">
        {AREAS.map((a, i) => {
          const item = coverage?.[a.key];
          const isTouched = !!item?.touched;
          return (
            <div
              key={a.key}
              className={`joseph-cov ${isTouched ? "joseph-cov--touched" : ""}`}
              title={item?.note || (isTouched ? "Touched" : "Not yet explored")}
            >
              <span className="joseph-cov__dot" />
              <div className="joseph-cov__index">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="joseph-cov__label">{a.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

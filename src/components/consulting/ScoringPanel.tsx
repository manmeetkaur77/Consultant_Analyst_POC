import type { ScoresPayload, SubScoreKey } from "@/services/consultingAgentApi";

interface ScoringPanelProps {
  scores: ScoresPayload | null;
  sheetNum?: string;
  headless?: boolean;
}

const IMPACT_KEYS: { key: SubScoreKey; label: string; idx: string }[] = [
  { key: "financial",    label: "Financial impact",    idx: "i.1" },
  { key: "productivity", label: "Productivity scale",  idx: "i.2" },
  { key: "intent",       label: "Business intent",     idx: "i.3" },
];

const SPEED_KEYS: { key: SubScoreKey; label: string; idx: string }[] = [
  { key: "complexity",    label: "Implementation",     idx: "s.1" },
  { key: "data_platform", label: "Data & platform",    idx: "s.2" },
  { key: "measurement",   label: "Measurement",        idx: "s.3" },
];

const bandFor = (value: number | null): "high" | "med" | "low" | "empty" => {
  if (value === null) return "empty";
  if (value >= 3.67) return "high";
  if (value >= 2.34) return "med";
  return "low";
};

const bandLabel = (b: ReturnType<typeof bandFor>): string =>
  b === "high" ? "High" : b === "med" ? "Med" : b === "low" ? "Low" : "—";

/**
 * Hero card for an axis (Impact or Speed). Shows the rolled-up average,
 * band tag, and a 5-segment indicator so the magnitude is legible at a
 * glance without needing to read the number.
 */
const AxisHero = ({
  eyebrow,
  axisLetter,
  value,
  variant,
}: {
  eyebrow: string;
  axisLetter: "y" | "x";
  value: number | null;
  variant: "impact" | "speed";
}) => {
  const band = bandFor(value);
  const fill = value === null ? 0 : Math.max(0, Math.min(5, value));
  return (
    <div className={`joseph-axis-hero joseph-axis-hero--${variant}`}>
      <div className="joseph-axis-hero__eyebrow">
        <span>{eyebrow}</span>
        <span className="joseph-axis-hero__axis">{axisLetter}-axis</span>
      </div>
      <div className="joseph-axis-hero__num-row">
        <span className="joseph-axis-hero__num">
          {value !== null ? value.toFixed(1) : "—"}
        </span>
        <span className="joseph-axis-hero__suffix">/5</span>
        <span className={`joseph-axis-hero__band joseph-axis-hero__band--${band}`}>
          {bandLabel(band)}
        </span>
      </div>
      <div className="joseph-axis-hero__segs" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = fill >= n;
          const partial = !filled && fill > n - 1;
          return (
            <span
              key={n}
              className={[
                "joseph-axis-hero__seg",
                filled ? "joseph-axis-hero__seg--on" : "",
                partial ? "joseph-axis-hero__seg--partial" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                partial ? { ["--joseph-seg-fill" as any]: `${(fill % 1) * 100}%` } : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
};

/**
 * Single sub-score row. Index monogram → label → 5-segment indicator → value → confidence pill.
 * Hover surfaces the rationale via the native title attribute.
 */
const ScoreRow = ({
  idx,
  label,
  value,
  confidence,
  rationale,
  variant,
}: {
  idx: string;
  label: string;
  value: number | null;
  confidence: "low" | "medium" | "high" | null;
  rationale: string | null;
  variant: "impact" | "speed";
}) => {
  const fill = value === null ? 0 : Math.max(0, Math.min(5, value));
  return (
    <div
      className={`joseph-score-row joseph-score-row--${variant} ${
        value === null ? "joseph-score-row--empty" : ""
      }`}
      title={rationale || undefined}
    >
      <span className="joseph-score-row__idx">{idx}</span>
      <span className="joseph-score-row__label">{label}</span>
      <span className="joseph-score-row__segs" aria-hidden>
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = fill >= n;
          const partial = !filled && fill > n - 1;
          return (
            <span
              key={n}
              className={[
                "joseph-score-row__seg",
                filled ? "joseph-score-row__seg--on" : "",
                partial ? "joseph-score-row__seg--partial" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={
                partial ? { ["--joseph-seg-fill" as any]: `${(fill % 1) * 100}%` } : undefined
              }
            />
          );
        })}
      </span>
      <span
        className={`joseph-score-row__val ${
          value === null ? "joseph-score-row__val--empty" : ""
        }`}
      >
        {value !== null ? value.toFixed(1) : "—"}
      </span>
      <span
        className={`joseph-conf joseph-conf--${confidence ?? "empty"}`}
        title={confidence ? `Confidence: ${confidence}` : "no confidence yet"}
      >
        <span className="joseph-conf__dot" aria-hidden />
        {confidence === "low"
          ? "L"
          : confidence === "medium"
            ? "M"
            : confidence === "high"
              ? "H"
              : "·"}
      </span>
    </div>
  );
};

export const ScoringPanel = ({ scores, sheetNum = "02", headless = false }: ScoringPanelProps) => {
  const sub = scores?.sub_scores;

  const Body = (
    <>
      <div className="joseph-axis-hero-grid">
        <AxisHero
          eyebrow="Business impact"
          axisLetter="y"
          value={scores?.axes?.impact ?? null}
          variant="impact"
        />
        <AxisHero
          eyebrow="Speed to value"
          axisLetter="x"
          value={scores?.axes?.speed ?? null}
          variant="speed"
        />
      </div>

      <div className="joseph-score-groups">
        <div className="joseph-score-group joseph-score-group--impact">
          <div className="joseph-score-group__heading">
            <span className="joseph-score-group__stripe" aria-hidden />
            <span className="joseph-score-group__title">Business impact</span>
            <span className="joseph-score-group__axis">y-axis</span>
          </div>
          {IMPACT_KEYS.map(({ key, label, idx }) => (
            <ScoreRow
              key={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              rationale={sub?.[key]?.rationale ?? null}
              variant="impact"
            />
          ))}
        </div>

        <div className="joseph-score-group joseph-score-group--speed">
          <div className="joseph-score-group__heading">
            <span className="joseph-score-group__stripe" aria-hidden />
            <span className="joseph-score-group__title">Speed to value</span>
            <span className="joseph-score-group__axis">x-axis</span>
          </div>
          {SPEED_KEYS.map(({ key, label, idx }) => (
            <ScoreRow
              key={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              rationale={sub?.[key]?.rationale ?? null}
              variant="speed"
            />
          ))}
        </div>
      </div>

      <div className="joseph-score-legend">
        <span className="joseph-score-legend__item">
          <span className="joseph-conf joseph-conf--low joseph-conf--legend">
            <span className="joseph-conf__dot" />L
          </span>
          low confidence
        </span>
        <span className="joseph-score-legend__item">
          <span className="joseph-conf joseph-conf--medium joseph-conf--legend">
            <span className="joseph-conf__dot" />M
          </span>
          medium
        </span>
        <span className="joseph-score-legend__item">
          <span className="joseph-conf joseph-conf--high joseph-conf--legend">
            <span className="joseph-conf__dot" />H
          </span>
          high
        </span>
      </div>
    </>
  );

  if (headless) return Body;

  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Scoring ledger</span>
        {scores?.quadrant && (
          <span className="ml-auto text-[9px] font-mono font-bold tracking-[0.18em] uppercase text-primary">
            → {scores.quadrant}
          </span>
        )}
      </div>
      {Body}
    </section>
  );
};

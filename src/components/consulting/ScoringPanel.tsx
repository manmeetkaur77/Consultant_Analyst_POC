import type { ScoresPayload, SubScoreKey } from "@/services/consultingAgentApi";

interface ScoringPanelProps {
  scores: ScoresPayload | null;
  sheetNum?: string;
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

const bandFor = (value: number | null): string => {
  if (value === null) return "—";
  if (value >= 3.67) return "High";
  if (value >= 2.34) return "Med";
  return "Low";
};

const AxisCard = ({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) => (
  <div className="joseph-axis-row">
    <span className="joseph-axis-row__label">{label}</span>
    <span className="joseph-axis-row__num">
      {value !== null ? value.toFixed(2) : "—"}
    </span>
    <span className="joseph-axis-row__band">{bandFor(value)}</span>
  </div>
);

const Line = ({
  idx,
  label,
  value,
  confidence,
  rationale,
}: {
  idx: string;
  label: string;
  value: number | null;
  confidence: "low" | "medium" | "high" | null;
  rationale: string | null;
}) => {
  const pct = value !== null ? (value / 5) * 100 : 0;
  return (
    <div className="joseph-line" title={rationale || undefined}>
      <span className="joseph-line__idx">{idx}</span>
      <span className="joseph-line__label">{label}</span>
      <span className="joseph-line__bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span
        className={`joseph-line__val ${value === null ? "joseph-line__val--empty" : ""}`}
      >
        {value !== null ? value.toFixed(1) : "—"}
      </span>
      <span
        className={`joseph-line__dot joseph-line__dot--${confidence ?? "empty"}`}
        title={confidence ? `Confidence: ${confidence}` : "no confidence yet"}
      />
    </div>
  );
};

export const ScoringPanel = ({ scores, sheetNum = "02" }: ScoringPanelProps) => {
  const sub = scores?.sub_scores;
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

      <div className="space-y-2">
        <AxisCard label="Impact" value={scores?.axes?.impact ?? null} />
        <AxisCard label="Speed" value={scores?.axes?.speed ?? null} />
      </div>

      <div className="joseph-ledger mt-3 pt-1">
        <div className="joseph-ledger__group">
          <div className="joseph-ledger__heading">Business impact · y-axis</div>
          {IMPACT_KEYS.map(({ key, label, idx }) => (
            <Line
              key={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              rationale={sub?.[key]?.rationale ?? null}
            />
          ))}
        </div>
        <div className="joseph-ledger__group">
          <div className="joseph-ledger__heading">Speed to value · x-axis</div>
          {SPEED_KEYS.map(({ key, label, idx }) => (
            <Line
              key={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              rationale={sub?.[key]?.rationale ?? null}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

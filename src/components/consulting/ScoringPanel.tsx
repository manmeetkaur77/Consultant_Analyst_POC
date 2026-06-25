import { useState } from "react";
import type { ScoresPayload, SubScoreKey } from "@/services/consultingAgentApi";

interface ScoringPanelProps {
  scores: ScoresPayload | null;
  sheetNum?: string;
  headless?: boolean;
  /**
   * Called when the user edits and saves a sub-score rationale. Should send
   * the edit to the agent and resolve once the panel `scores` have been
   * updated from the response. Resolve with the agent's short note (if any)
   * so the row can surface it. Omit to render the rationale read-only.
   */
  onRescore?: (key: SubScoreKey, rationale: string) => Promise<string | void>;
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

const QUADRANT_LABEL: Record<string, string> = {
  "Transformational Value": "Transformational",
  "Accelerator": "Transformational",
  "Quick Win": "Accelerators",
  "Incremental Growth": "Quick Wins",
  "Defer": "Incremental Growth",
};

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

const confLabel = (c: "low" | "medium" | "high" | null): string =>
  c === "low" ? "Low" : c === "medium" ? "Medium" : c === "high" ? "High" : "—";

/**
 * Single sub-score row. Index monogram → label → 5-segment indicator → value → confidence pill.
 * Clicking the row expands a description panel with two labeled sections —
 * "Consumed" (the facts/inputs the score was made from) and "Why this level"
 * (why those facts map to this band). When `onRescore` is provided, the
 * reasoning is editable — saving an edit asks the agent to re-evaluate the
 * score from the new information. Rows that are still empty (no value and no
 * rationale) are not expandable.
 */
const ScoreRow = ({
  scoreKey,
  idx,
  label,
  value,
  confidence,
  consumed,
  ranking,
  variant,
  onRescore,
}: {
  scoreKey: SubScoreKey;
  idx: string;
  label: string;
  value: number | null;
  confidence: "low" | "medium" | "high" | null;
  consumed: string | null;
  ranking: string | null;
  variant: "impact" | "speed";
  onRescore?: (key: SubScoreKey, rationale: string) => Promise<string | void>;
}) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fill = value === null ? 0 : Math.max(0, Math.min(5, value));
  const editable = Boolean(onRescore);
  // Two-part rationale: `consumed` (the facts used) and `ranking` (why this
  // level). Expandable if either section has content OR the row is editable
  // (so the user can add context even before a score exists).
  const hasConsumed = Boolean(consumed && consumed.trim());
  const hasRanking = Boolean(ranking && ranking.trim());
  const hasContent = hasConsumed || hasRanking;
  const canExpand = hasContent || editable;
  const expanded = open && canExpand;

  const startEdit = () => {
    // Seed the editor with the current "consumed" facts — the user corrects the
    // inputs, and the agent re-derives the "why this level" judgement from them.
    setDraft(consumed ?? "");
    setError(null);
    setNote(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const saveEdit = async () => {
    if (!onRescore) return;
    const text = draft.trim();
    if (!text) {
      setError("Rationale can't be empty.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const msg = await onRescore(scoreKey, text);
      setEditing(false);
      setNote(typeof msg === "string" && msg.trim() ? msg.trim() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the score. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`joseph-score-rowblock joseph-score-rowblock--${variant} ${
        expanded ? "joseph-score-rowblock--open" : ""
      }`}
    >
      <button
        type="button"
        className={`joseph-score-row joseph-score-row--${variant} ${
          value === null ? "joseph-score-row--empty" : ""
        } ${canExpand ? "joseph-score-row--clickable" : ""}`}
        onClick={() => canExpand && setOpen((v) => !v)}
        aria-expanded={canExpand ? expanded : undefined}
        aria-label={canExpand ? `${label} — show rationale` : label}
        disabled={!canExpand}
      >
        <span className="joseph-score-row__idx">{idx}</span>
        <span className="joseph-score-row__label">
          {label}
          {canExpand && (
            <span
              className={`joseph-score-row__caret ${expanded ? "joseph-score-row__caret--open" : ""}`}
              aria-hidden
            >
              ›
            </span>
          )}
        </span>
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
      </button>

      {expanded && (
        <div className="joseph-score-row__desc" role="region" aria-label={`${label} rationale`}>
          <div className="joseph-score-row__desc-head">
            <span className="joseph-score-row__desc-eyebrow">
              {editing ? "Edit consumed facts" : "Why this score"}
            </span>
            <span className="joseph-score-row__desc-meta">
              {value !== null ? `${value.toFixed(1)}/5` : "—"} · {confLabel(confidence)} confidence
            </span>
          </div>

          {editing ? (
            <div className="joseph-score-row__edit">
              <p className="joseph-score-row__edit-label">
                <span className="joseph-score-row__edit-label-tag">Consumed</span>
                The facts this score is built from. Edit them and the agent
                re-derives “Why this level”.
              </p>
              <textarea
                className="joseph-score-row__edit-area"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={5}
                placeholder="Add or correct the facts — the agent will re-score and update the reasoning from this."
                disabled={saving}
                autoFocus
              />
              {error && <p className="joseph-score-row__edit-error">{error}</p>}
              <div className="joseph-score-row__edit-actions">
                <span className="joseph-score-row__edit-hint">
                  {saving ? "Re-scoring…" : "Saving re-evaluates this score and the overall placement."}
                </span>
                <button
                  type="button"
                  className="joseph-score-row__btn joseph-score-row__btn--ghost"
                  onClick={cancelEdit}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="joseph-score-row__btn joseph-score-row__btn--primary"
                  onClick={saveEdit}
                  disabled={saving || !draft.trim()}
                >
                  {saving ? "Saving…" : "Save & re-score"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {hasContent ? (
                <div className="joseph-score-row__desc-sections">
                  <div className="joseph-score-row__desc-section joseph-score-row__desc-section--consumed">
                    <div className="joseph-score-row__desc-section-head">
                      <span className="joseph-score-row__desc-section-dot" aria-hidden />
                      <span className="joseph-score-row__desc-section-label">
                        Consumed
                      </span>
                      <span className="joseph-score-row__desc-section-tag">
                        inputs used
                      </span>
                    </div>
                    {hasConsumed ? (
                      <p className="joseph-score-row__desc-body">{consumed}</p>
                    ) : (
                      <p className="joseph-score-row__desc-body joseph-score-row__desc-body--empty">
                        No inputs recorded yet.
                      </p>
                    )}
                  </div>
                  <div className="joseph-score-row__desc-section joseph-score-row__desc-section--ranking">
                    <div className="joseph-score-row__desc-section-head">
                      <span className="joseph-score-row__desc-section-dot" aria-hidden />
                      <span className="joseph-score-row__desc-section-label">
                        Why this level
                      </span>
                      {value !== null && (
                        <span className="joseph-score-row__desc-section-tag">
                          {value.toFixed(1)} · {bandLabel(bandFor(value))}
                        </span>
                      )}
                    </div>
                    {hasRanking ? (
                      <p className="joseph-score-row__desc-body">{ranking}</p>
                    ) : (
                      <p className="joseph-score-row__desc-body joseph-score-row__desc-body--empty">
                        No placement reasoning yet.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="joseph-score-row__desc-body joseph-score-row__desc-body--empty">
                  No rationale yet. Add context and the agent will score this from it.
                </p>
              )}
              {note && (
                <p className="joseph-score-row__desc-note">
                  <span className="joseph-score-row__desc-note-tag">Updated</span>
                  {note}
                </p>
              )}
              {editable && (
                <div className="joseph-score-row__desc-foot">
                  <button
                    type="button"
                    className="joseph-score-row__btn joseph-score-row__btn--edit"
                    onClick={startEdit}
                  >
                    {hasContent ? "Edit facts" : "Add facts"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const ScoringPanel = ({
  scores,
  sheetNum = "02",
  headless = false,
  onRescore,
}: ScoringPanelProps) => {
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
              scoreKey={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              consumed={sub?.[key]?.consumed ?? null}
              ranking={sub?.[key]?.ranking ?? null}
              variant="impact"
              onRescore={onRescore}
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
              scoreKey={key}
              idx={idx}
              label={label}
              value={sub?.[key]?.value ?? null}
              confidence={sub?.[key]?.confidence ?? null}
              consumed={sub?.[key]?.consumed ?? null}
              ranking={sub?.[key]?.ranking ?? null}
              variant="speed"
              onRescore={onRescore}
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
            → {QUADRANT_LABEL[scores.quadrant] ?? scores.quadrant}
          </span>
        )}
      </div>
      {Body}
    </section>
  );
};

import type { InsightAssessment } from "@/services/consultingAgentApi";
import { QuadrantChip } from "./QuadrantChip";

interface AssessmentCardProps {
  assessment: InsightAssessment;
  index: number;
  active?: boolean;
  onOpen: (a: InsightAssessment) => void;
}

const initials = (name?: string) => {
  if (!name) return "—";
  const parts = name.replace(/\([^)]*\)/g, "").trim().split(/\s+/);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const bandFor = (n: number) => {
  if (n >= 3.67) return "High";
  if (n >= 2.34) return "Med";
  return "Low";
};

// Kept the export name AssessmentRow for backward compatibility with the
// page, but the component is now a vertical card.
export const AssessmentRow = ({
  assessment,
  index,
  active = false,
  onOpen,
}: AssessmentCardProps) => {
  return (
    <button
      type="button"
      onClick={() => onOpen(assessment)}
      className={[
        "insights-card",
        active ? "insights-card--active" : "",
        assessment.is_fresh ? "insights-card--fresh" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="insights-card__head">
        <span className="insights-card__idx">
          {String(index).padStart(2, "0")}
        </span>
        <QuadrantChip quadrant={assessment.quadrant} />
        {assessment.is_fresh && (
          <span className="insights-card__fresh">Just added</span>
        )}
      </div>

      <h3 className="insights-card__title">{assessment.title}</h3>

      <div className="insights-card__sponsor">
        <span className="insights-card__avatar">{initials(assessment.sponsor)}</span>
        <span className="insights-card__sponsor-text">{assessment.sponsor}</span>
      </div>

      <div className="insights-card__rule" />

      <div className="insights-card__metrics">
        <div className="insights-card__metric">
          <div className="insights-card__metric-label">Impact</div>
          <div className="insights-card__metric-value">
            {assessment.axes.impact.toFixed(1)}
          </div>
          <div className="insights-card__metric-band">
            {bandFor(assessment.axes.impact)}
          </div>
        </div>
        <div className="insights-card__metric-sep" aria-hidden />
        <div className="insights-card__metric">
          <div className="insights-card__metric-label">Speed</div>
          <div className="insights-card__metric-value">
            {assessment.axes.speed.toFixed(1)}
          </div>
          <div className="insights-card__metric-band">
            {bandFor(assessment.axes.speed)}
          </div>
        </div>
      </div>

      <div className="insights-card__foot">
        <span className="insights-card__status">{assessment.status}</span>
        <span className="insights-card__cta">Open report →</span>
      </div>
    </button>
  );
};

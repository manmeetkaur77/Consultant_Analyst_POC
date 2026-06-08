import { useState } from "react";
import type { CoverageArea, CoveragePayload } from "@/services/consultingAgentApi";

interface CoverageIndicatorProps {
  coverage: CoveragePayload | null;
  sheetNum?: string;
  headless?: boolean;
}

const AREAS: { key: CoverageArea; label: string }[] = [
  { key: "qualification", label: "Qualify" },
  { key: "value", label: "Value" },
  { key: "viability", label: "Viability" },
  { key: "drivers", label: "Drivers" },
  { key: "instinct", label: "Instinct" },
];

/**
 * Sub-sections per discovery area, mirrored from the DISCOVERY INTELLIGENCE
 * framework in Joseph's system prompt. `key` matches the slugs the agent emits
 * in coverage `findings`; `hint` is the framework descriptor shown until a real
 * finding has been gathered.
 */
const SUBSECTIONS: Record<
  CoverageArea,
  { key: string; label: string; hint: string }[]
> = {
  qualification: [
    { key: "solution_fit", label: "Solution fit", hint: "Needs to learn or recognize something new — not over-engineered" },
    { key: "sponsor", label: "Sponsor & ownership", hint: "Real decision owner; who would defend it in a steering committee" },
    { key: "duplication", label: "Duplication", hint: "Not already in flight under another initiative" },
    { key: "scope", label: "Scope", hint: "A single use case, not a portfolio" },
  ],
  value: [
    { key: "quantitative", label: "Quantitative", hint: "Named numerator & denominator, baseline, delta, basis, confidence" },
    { key: "qualitative", label: "Qualitative", hint: "DX, CX, regulatory posture, brand, learning, optionality" },
  ],
  viability: [
    { key: "data", label: "Data", hint: "Exists? volume, quality, labelled, access, privacy/rights" },
    { key: "platform", label: "Platform", hint: "Stack support, integration points, MLOps maturity" },
    { key: "resources", label: "Resources & skills", hint: "Who builds, internal vs vendor, headroom" },
    { key: "money", label: "Money", hint: "Order of magnitude, funded vs ask, TCO incl. run cost" },
    { key: "time", label: "Time", hint: "Time to a credible pilot; hard external deadlines" },
  ],
  drivers: [
    { key: "monetary", label: "Monetary", hint: "Upside captured / downside avoided" },
    { key: "regulatory", label: "Regulatory", hint: "Compliance pressure, deadline-driven" },
    { key: "strategic", label: "Strategic alignment", hint: "Fit with stated org priorities" },
    { key: "ease", label: "Ease of implementation", hint: "Quick win vs transformational" },
    { key: "dependencies", label: "Dependencies", hint: "Sequencing — what must be true first" },
    { key: "reversibility", label: "Reversibility", hint: "One-way vs two-way door" },
    { key: "cost_of_delay", label: "Cost of delay", hint: "What waiting a quarter costs" },
  ],
  instinct: [
    { key: "politics", label: "Org politics", hint: "Sponsor strength, resistors, business pull vs tech push" },
    { key: "track_record", label: "Track record", hint: "Has this team shipped similar before" },
    { key: "adoption", label: "Adoption risk", hint: "Will users actually use it; the change story" },
    { key: "failure_mode", label: "Failure mode", hint: "Cost if it fails publicly" },
    { key: "build_buy", label: "Build vs buy", hint: "Credible vendor today; cost of waiting two quarters" },
    { key: "constraints", label: "Hidden constraints", hint: "Union, contractual, IP, licensing" },
  ],
};

const countFound = (
  area: CoverageArea,
  findings: Record<string, string> | undefined,
): number =>
  SUBSECTIONS[area].filter((s) => findings?.[s.key]?.trim()).length;

export const CoverageIndicator = ({
  coverage,
  sheetNum = "01",
  headless = false,
}: CoverageIndicatorProps) => {
  const [openArea, setOpenArea] = useState<CoverageArea | null>(null);
  const touched = coverage ? AREAS.filter((a) => coverage[a.key]?.touched).length : 0;

  const activeArea =
    openArea && AREAS.some((a) => a.key === openArea) ? openArea : null;
  const detail = activeArea ? coverage?.[activeArea] : null;
  const detailMeta = activeArea ? AREAS.find((a) => a.key === activeArea)! : null;
  const detailSubs = activeArea ? SUBSECTIONS[activeArea] : [];
  const detailFindings = detail?.findings ?? {};
  const gathered = activeArea ? countFound(activeArea, detailFindings) : 0;

  const Body = (
    <>
      <div className="joseph-coverage">
        {AREAS.map((a, i) => {
          const item = coverage?.[a.key];
          const isTouched = !!item?.touched;
          const isOpen = activeArea === a.key;
          const found = countFound(a.key, item?.findings);
          return (
            <button
              key={a.key}
              type="button"
              className={`joseph-cov ${isTouched ? "joseph-cov--touched" : ""} ${
                isOpen ? "joseph-cov--open" : ""
              }`}
              onClick={() => setOpenArea((cur) => (cur === a.key ? null : a.key))}
              aria-expanded={isOpen}
              aria-label={`${a.label} — ${found}/${SUBSECTIONS[a.key].length} sub-sections gathered`}
              title={item?.note || (isTouched ? "Touched" : "Not yet explored")}
            >
              <span className="joseph-cov__dot" />
              <div className="joseph-cov__index">{String(i + 1).padStart(2, "0")}</div>
              <div className="joseph-cov__label">{a.label}</div>
              <div className="joseph-cov__count">
                {found}/{SUBSECTIONS[a.key].length}
              </div>
            </button>
          );
        })}
      </div>

      {activeArea && detailMeta && (
        <div
          className="joseph-cov-detail"
          role="region"
          aria-label={`${detailMeta.label} sub-sections`}
        >
          <div className="joseph-cov-detail__head">
            <span className="joseph-cov-detail__title">{detailMeta.label}</span>
            <span className="joseph-cov-detail__count">
              {gathered}/{detailSubs.length} gathered
            </span>
          </div>
          {detail?.note && <p className="joseph-cov-detail__note">{detail.note}</p>}
          <ul className="joseph-cov-detail__list">
            {detailSubs.map((s) => {
              const finding = detailFindings[s.key]?.trim();
              return (
                <li
                  key={s.key}
                  className={`joseph-cov-sub ${finding ? "joseph-cov-sub--found" : ""}`}
                >
                  <div className="joseph-cov-sub__head">
                    <span className="joseph-cov-sub__dot" aria-hidden />
                    <span className="joseph-cov-sub__label">{s.label}</span>
                  </div>
                  {finding ? (
                    <p className="joseph-cov-sub__finding">{finding}</p>
                  ) : (
                    <p className="joseph-cov-sub__finding joseph-cov-sub__finding--empty">
                      {s.hint} · not yet explored
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );

  if (headless) return Body;

  return (
    <section className="joseph-sheet">
      <span className="joseph-sheet__num">{sheetNum}</span>
      <div className="joseph-sheet__title">
        <span className="joseph-sheet__title-text">Discovery coverage</span>
        <span className="ml-auto text-[9px] font-mono tabular-nums text-muted-foreground tracking-[0.18em] uppercase">
          {touched}/{AREAS.length}
        </span>
      </div>
      {Body}
    </section>
  );
};

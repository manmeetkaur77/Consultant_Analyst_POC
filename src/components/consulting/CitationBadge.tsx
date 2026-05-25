import { ShieldCheck, ShieldAlert, ShieldQuestion, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CitationBadgeProps {
  tier: "primary" | "secondary" | "directional";
  valid?: boolean;
  className?: string;
}

const TIER_CONFIG = {
  primary: {
    label: "Primary",
    icon: ShieldCheck,
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  secondary: {
    label: "Secondary",
    icon: ShieldAlert,
    classes: "bg-amber-50 text-amber-800 border-amber-200",
  },
  directional: {
    label: "Directional",
    icon: ShieldQuestion,
    classes: "bg-slate-100 text-slate-700 border-slate-200",
  },
} as const;

export const CitationBadge = ({ tier, valid = true, className }: CitationBadgeProps) => {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-bold tracking-[0.14em] uppercase",
        config.classes,
        !valid && "ring-1 ring-red-300",
        className,
      )}
      title={!valid ? "Citation URL did not return HTTP 200" : config.label}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.label}
      {!valid && <AlertCircle className="w-2.5 h-2.5 text-red-600" />}
    </span>
  );
};

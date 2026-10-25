import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  companyCategories,
  leadCategory,
  type CategorizedLead,
  type LeadCategory,
  type LeadCategoryFilterValue,
} from "@/lib/lead-categories";
import { cn } from "@/lib/utils";

const styles = {
  boxing: {
    label: "Boksen",
    dot: "bg-orange-500",
    badge: "border-orange-200 bg-orange-50 text-orange-800",
    selected:
      "border-orange-400 bg-orange-50 text-orange-900 hover:bg-orange-100 hover:text-orange-900",
  },
  gym: {
    label: "Gym",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
    selected:
      "border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 hover:text-emerald-900",
  },
  unknown: {
    label: "Nog onbekend",
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-600",
    selected:
      "border-slate-400 bg-slate-100 text-slate-900 hover:bg-slate-200 hover:text-slate-900",
  },
  agency: {
    label: "Verkoop Studio",
    dot: "bg-blue-600",
    badge: "border-blue-200 bg-blue-50 text-blue-800",
    selected: "border-blue-400 bg-blue-50 text-blue-900 hover:bg-blue-100 hover:text-blue-900",
  },
  academy: {
    label: "Academy",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-800",
    selected:
      "border-violet-400 bg-violet-50 text-violet-900 hover:bg-violet-100 hover:text-violet-900",
  },
} satisfies Record<LeadCategory, { label: string; dot: string; badge: string; selected: string }>;

export function LeadCategoryBadge({
  lead,
  className,
}: {
  lead: CategorizedLead;
  className?: string;
}) {
  const category = leadCategory(lead);
  if (!category) return null;
  const style = styles[category];
  return (
    <Badge variant="outline" className={cn("w-fit gap-1.5", style.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </Badge>
  );
}

export function LeadCategoryFilter({
  companyId,
  leads,
  value,
  onChange,
}: {
  companyId: string;
  leads: CategorizedLead[];
  value: LeadCategoryFilterValue;
  onChange: (value: LeadCategoryFilterValue) => void;
}) {
  const config = companyCategories(companyId);
  if (!config) return null;
  const counts: Record<LeadCategoryFilterValue, number> = {
    all: 0,
    boxing: 0,
    gym: 0,
    unknown: 0,
    agency: 0,
    academy: 0,
  };
  for (const lead of leads) {
    const category = leadCategory(lead);
    if (category) {
      counts.all++;
      counts[category]++;
    }
  }
  return (
    <fieldset className="min-w-0 rounded-xl border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">{config.legend}</legend>
      <div className="flex flex-wrap gap-2">
        {(["all", ...config.categories] as const).map((category) => {
          const style = category === "all" ? null : styles[category];
          const selected = value === category;
          return (
            <Button
              key={category}
              type="button"
              variant="outline"
              aria-pressed={selected}
              onClick={() => onChange(category)}
              className={cn(
                "min-h-10 rounded-lg shadow-none",
                selected &&
                  (style?.selected ??
                    "border-primary bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"),
              )}
            >
              {style && (
                <span aria-hidden="true" className={cn("size-2 rounded-full", style.dot)} />
              )}
              {style?.label ?? "Alles"}
              <span className="rounded-md bg-black/5 px-1.5 py-0.5 text-xs tabular-nums">
                {counts[category]}
              </span>
            </Button>
          );
        })}
      </div>
    </fieldset>
  );
}

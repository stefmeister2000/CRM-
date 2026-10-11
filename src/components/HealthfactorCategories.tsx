import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  healthfactorCategory,
  isHealthfactorCompany,
  type CategorizedLead,
  type HealthfactorCategory,
  type HealthfactorFilter,
} from "@/lib/healthfactor-categories";
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
} satisfies Record<
  HealthfactorCategory,
  { label: string; dot: string; badge: string; selected: string }
>;

export function HealthfactorCategoryBadge({
  lead,
  className,
}: {
  lead: CategorizedLead;
  className?: string;
}) {
  const category = healthfactorCategory(lead);
  if (!category) return null;
  const style = styles[category];
  return (
    <Badge variant="outline" className={cn("w-fit gap-1.5", style.badge, className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </Badge>
  );
}

export function HealthfactorCategoryFilter({
  companyId,
  leads,
  value,
  onChange,
}: {
  companyId: string;
  leads: CategorizedLead[];
  value: HealthfactorFilter;
  onChange: (value: HealthfactorFilter) => void;
}) {
  if (!isHealthfactorCompany(companyId)) return null;
  const counts = { all: 0, boxing: 0, gym: 0, unknown: 0 };
  for (const lead of leads) {
    const category = healthfactorCategory(lead);
    if (category) {
      counts.all++;
      counts[category]++;
    }
  }
  return (
    <fieldset className="min-w-0 rounded-xl border bg-card p-4">
      <legend className="px-1 text-sm font-semibold">Interesse</legend>
      <div className="flex flex-wrap gap-2">
        {(["all", "boxing", "gym", "unknown"] as const).map((category) => {
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

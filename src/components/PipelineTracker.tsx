import { useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PIPELINE_STEPS, STAGE_META, stageStep, type Stage } from "@/lib/sales";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Asks for confirmation before a stage change is applied. */
function StageConfirm({
  pending,
  currentStage,
  onCancel,
  onConfirm,
}: {
  pending: Stage | null;
  currentStage: string;
  onCancel: () => void;
  onConfirm: (stage: Stage) => void;
}) {
  return (
    <AlertDialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Stap wijzigen?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? `Deze lead gaat van "${STAGE_META[currentStage as Stage]?.short ?? currentStage}" naar "${STAGE_META[pending].short}". Bevestig om de stap te wijzigen.`
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Annuleren</AlertDialogCancel>
          <AlertDialogAction onClick={() => pending && onConfirm(pending)}>
            Ja, wijzig stap
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Big, clickable step-by-step pipeline for one lead. */
export function PipelineTracker({
  stage,
  canEdit,
  onStageChange,
}: {
  stage: string;
  canEdit?: boolean;
  onStageChange?: (stage: Stage) => void;
}) {
  const current = stageStep(stage);
  const closed = stage === "won" || stage === "lost";
  const [pending, setPending] = useState<Stage | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-stretch gap-1.5">
        {PIPELINE_STEPS.map((step, index) => {
          const done = current != null && index + 1 < current;
          const active = current === index + 1;
          return (
            <button
              key={step}
              type="button"
              disabled={!canEdit}
              onClick={() => step !== stage && setPending(step)}
              className={cn(
                "flex-1 rounded-md border px-2 py-2 text-left transition-colors",
                canEdit && "hover:border-primary",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-secondary/40 text-muted-foreground",
              )}
            >
              <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="block text-xs font-medium leading-tight">
                {STAGE_META[step].short}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["won", "lost"] as Stage[]).map((outcome) => (
          <button
            key={outcome}
            type="button"
            disabled={!canEdit}
            onClick={() => outcome !== stage && setPending(outcome)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              canEdit && "hover:border-primary",
              stage === outcome
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {outcome === "won" ? <Check className="size-3" /> : <X className="size-3" />}
            {STAGE_META[outcome].short}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-border bg-secondary/40 p-3 text-sm">
        <p className="font-medium">
          {closed
            ? STAGE_META[stage as Stage].label
            : `Step ${current ?? 1} of 5 — ${STAGE_META[stage as Stage]?.short}`}
        </p>
        <p className="text-muted-foreground">{STAGE_META[stage as Stage]?.meaning}</p>
      </div>

      <StageConfirm
        pending={pending}
        currentStage={stage}
        onCancel={() => setPending(null)}
        onConfirm={(next) => {
          setPending(null);
          onStageChange?.(next);
        }}
      />
    </div>
  );
}

/** Compact inline pipeline badge for table rows. Steps are clickable when editable. */
export function StageChip({
  stage,
  canEdit,
  onStageChange,
}: {
  stage: string;
  canEdit?: boolean;
  onStageChange?: (stage: Stage) => void;
}) {
  const step = stageStep(stage);
  const meta = STAGE_META[stage as Stage];
  const isWon = stage === "won";
  const isLost = stage === "lost";
  const [pending, setPending] = useState<Stage | null>(null);

  return (
    <div className="w-36 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wide",
            isLost ? "text-muted-foreground" : "text-primary",
          )}
        >
          {meta?.short ?? stage}
        </span>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {isWon ? "Won" : isLost ? "Closed" : `Step ${step ?? 1}/5`}
        </span>
      </div>

      <div className="flex gap-1">
        {PIPELINE_STEPS.map((s, i) => {
          const filled = isWon || (step != null && i < step);
          const current = step != null && i === step - 1 && !isWon && !isLost;
          const common = cn(
            "h-1.5 flex-1 rounded-full transition-colors",
            filled ? "bg-primary" : "bg-border",
            current && "ring-2 ring-primary/25",
          );
          if (!canEdit) return <span key={s} className={common} />;
          return (
            <button
              key={s}
              type="button"
              title={`Move to ${STAGE_META[s].label}`}
              aria-label={`Move to ${STAGE_META[s].label}`}
              onClick={(event) => {
                event.stopPropagation();
                if (s !== stage) setPending(s);
              }}
              className={cn(common, "cursor-pointer hover:bg-primary/70")}
            />
          );
        })}
      </div>

      <div onClick={(event) => event.stopPropagation()}>
        <StageConfirm
          pending={pending}
          currentStage={stage}
          onCancel={() => setPending(null)}
          onConfirm={(next) => {
            setPending(null);
            onStageChange?.(next);
          }}
        />
      </div>
    </div>
  );
}

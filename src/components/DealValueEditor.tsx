import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DealValueEditor({
  id,
  company,
  value,
  disabled = false,
}: {
  id: string;
  company: string;
  value: number | null;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const nl = language === "nl";
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [validation, setValidation] = useState("");
  const money = new Intl.NumberFormat(nl ? "nl-BE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
  const save = useMutation({
    mutationFn: async (amount: number | null) => {
      const { error } = await supabase
        .from("leads")
        .update({ value_estimate: amount })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["leads"] });
      setOpen(false);
      toast.success(nl ? "Geschatte waarde opgeslagen" : "Estimated value saved");
    },
    onError: () =>
      toast.error(nl ? "Opslaan mislukt. Probeer opnieuw." : "Save failed. Please try again."),
  });
  function submit() {
    const text = draft.trim().replace(",", ".");
    if (text && (!/^\d+(\.\d{1,2})?$/.test(text) || Number(text) > 9999999999.99)) {
      setValidation(
        nl
          ? "Vul 0 of een positief bedrag in met maximaal 2 decimalen, zonder duizendtalscheiding."
          : "Enter a non-negative amount with up to 2 decimals, without thousands separators.",
      );
      return;
    }
    setValidation("");
    save.mutate(text === "" ? null : Number(text));
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={() => {
          setDraft(value == null ? "" : String(value));
          setValidation("");
          setOpen(true);
        }}
        aria-label={`${nl ? "Waarde bewerken voor" : "Edit value for"} ${company}`}
        className="my-3 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-left hover:bg-secondary disabled:opacity-50"
      >
        <span>
          <span className="block text-[10px] font-normal text-muted-foreground">
            {nl ? "Geschatte dealwaarde" : "Estimated deal value"}
          </span>
          <span className="text-sm font-semibold">
            {value == null
              ? nl
                ? "Nog niet ingeschat"
                : "Not estimated yet"
              : money.format(value)}
          </span>
        </span>
        <Pencil className="size-3 shrink-0 text-muted-foreground" />
      </button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!save.isPending) setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{nl ? "Geschatte dealwaarde" : "Estimated deal value"}</DialogTitle>
            <DialogDescription>
              {company} ·{" "}
              {nl
                ? "Wat kan deze prospect opleveren? Laat leeg zolang er alleen interesse is. Dit is een schatting, geen omzet."
                : "What could this prospect be worth? Leave blank while there is only interest. This is an estimate, not revenue."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor={`value-${id}`}>
                {nl ? "Bedrag in euro (optioneel)" : "Amount in euros (optional)"}
              </Label>
              <Input
                id={`value-${id}`}
                inputMode="decimal"
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setValidation("");
                }}
                placeholder={nl ? "Bijvoorbeeld 2500,00" : "For example 2500.00"}
                disabled={save.isPending}
                aria-invalid={!!validation}
                aria-describedby={validation ? `value-error-${id}` : undefined}
              />
              {validation && (
                <p role="alert" id={`value-error-${id}`} className="text-sm text-destructive">
                  {validation}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => setOpen(false)}
              >
                {nl ? "Annuleren" : "Cancel"}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? (nl ? "Opslaan…" : "Saving…") : nl ? "Opslaan" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";

/** Keep typing local; save a complete value on blur instead of racing per-keystroke writes. */
export function LeadTextField({
  value,
  onSave,
  disabled,
  label,
  multiline = false,
  required = false,
  placeholder,
}: {
  value: string;
  onSave: (value: string) => Promise<unknown>;
  disabled?: boolean;
  label: string;
  multiline?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  const { language } = useLanguage();
  const nl = language === "nl";
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function commit() {
    if (draft === null || saving) return;
    if (required && !draft.trim()) {
      setError(nl ? "Dit veld is verplicht." : "This field is required.");
      return;
    }
    if (draft === value) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      setDraft(null);
    } catch {
      setError(
        nl
          ? "Niet opgeslagen. Klik opnieuw in het veld en verlaat het om te proberen."
          : "Not saved. Focus and leave the field to retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  const Component = multiline ? Textarea : Input;
  return (
    <div className="space-y-1">
      <Component
        aria-label={label}
        value={draft ?? value}
        disabled={disabled || saving}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          setError("");
        }}
        onBlur={() => void commit()}
        aria-invalid={!!error}
      />
      {saving && (
        <p role="status" className="text-xs text-muted-foreground">
          {nl ? "Opslaan…" : "Saving…"}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { useLang } from "@/lib/i18n";

// A <select> of common options plus an "Other / enter manually" escape that
// reveals a free-text input. The stored value is either a chosen option value
// or whatever the user types.
export default function SelectOrCustom({ value, onChange, options, className, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  const { t } = useLang();
  const known = options.some((o) => o.value === value);
  const [manual, setManual] = useState(value !== "" && !known);
  const asOther = manual || (value !== "" && !known);

  return (
    <div>
      <select
        className={className}
        value={asOther ? "__other__" : value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__other__") { setManual(true); onChange(""); }
          else { setManual(false); onChange(v); }
        }}
      >
        <option value="">{placeholder || t("Choose…", "Choisir…")}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value="__other__">{t("Other / enter manually…", "Autre / saisir…")}</option>
      </select>
      {asOther && (
        <input
          className={className}
          style={{ marginTop: 8 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("Enter manually", "Saisir manuellement")}
          autoFocus
        />
      )}
    </div>
  );
}

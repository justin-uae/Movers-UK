"use client";

import { useEffect, useState } from "react";
import PhoneInput, { type Country } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { SearchableCountrySelect } from "./SearchableCountrySelect";
import { detectVisitorCountry } from "@/lib/detectCountry";
import { BRAND } from "@/lib/brandConfig";

const FALLBACK_COUNTRY: Country = BRAND.defaultPhoneCountry;

/** react-phone-number-input requires E.164 or throws — some legacy records predate that format. */
function isE164(value?: string | null): value is string {
  return !!value && /^\+[1-9]\d{1,14}$/.test(value);
}

/**
 * Dial-code phone input used everywhere a phone/WhatsApp number is
 * collected. Wraps react-phone-number-input with a searchable country
 * dropdown (the library's own selector is a plain <select>) and defaults
 * the dial code to the visitor's IP-detected country the first time it
 * renders with no value.
 *
 * Works both as a controlled input (pass `value`/`onChange`) and inside a
 * plain `<form action={...}>` (pass `name`, read a hidden input's value from
 * FormData) since several forms in this app use uncontrolled native
 * submission rather than React state.
 */
export function PhoneNumberField({
  name,
  value,
  defaultValue,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  name?: string;
  value?: string;
  defaultValue?: string | null;
  onChange?: (value: string | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string | undefined>(isE164(defaultValue) ? defaultValue : undefined);
  const [defaultCountry, setDefaultCountry] = useState<Country>(FALLBACK_COUNTRY);

  const rawCurrent = isControlled ? value : internalValue;
  // react-phone-number-input throws if handed a non-E.164 value no matter
  // which path it came from (a legacy record's `defaultValue`, or a
  // controlled `value` from e.g. AI-extracted or otherwise loosely-formatted
  // data) — never pass it through directly.
  const current = isE164(rawCurrent) ? rawCurrent : undefined;
  const legacyValueHint = rawCurrent && !isE164(rawCurrent) ? `Current: ${rawCurrent}` : undefined;

  useEffect(() => {
    if (current) return;
    let cancelled = false;
    detectVisitorCountry().then((code) => {
      if (!cancelled && code) setDefaultCountry(code as Country);
    });
    return () => {
      cancelled = true;
    };
    // Only ever needs to run once per mount — re-detecting on every
    // keystroke would fight the user's own country selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleChange(next: string | undefined) {
    if (!isControlled) setInternalValue(next);
    onChange?.(next);
  }

  return (
    <div className={className}>
      <PhoneInput
        international
        defaultCountry={defaultCountry}
        value={current}
        onChange={handleChange}
        disabled={disabled}
        placeholder={placeholder ?? legacyValueHint}
        countrySelectComponent={SearchableCountrySelect}
        flags={flags}
        className="PhoneNumberField"
      />
      {/* Falls back to the raw legacy value (rather than "") so saving other
          fields on this form doesn't wipe out a phone number the user never
          touched, just because it predates E.164 formatting. */}
      {name && <input type="hidden" name={name} value={current ?? rawCurrent ?? ""} />}
    </div>
  );
}

"use client";

/** Digits-only international number for wa.me ("+44 7700 900123" / "0044…" -> "447700900123"); null when it can't be a real number. */
export function whatsAppDigits(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "").replace(/^00/, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/**
 * Green WhatsApp icon that opens a chat with the number in WhatsApp
 * (app on mobile, WhatsApp Web on desktop). Renders nothing when there's no
 * usable number, so it can sit next to any phone field unconditionally.
 */
export function WhatsAppLink({ number, className = "" }: { number: string | null | undefined; className?: string }) {
  const digits = whatsAppDigits(number);
  if (!digits) return null;
  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Message on WhatsApp"
      aria-label="Message on WhatsApp"
      onClick={(e) => e.stopPropagation()}
      className={
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white align-middle hover:bg-[#1ebe5b] " +
        className
      }
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
        <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.4 9.4 0 0 1-1.44-5.01c0-5.2 4.23-9.43 9.44-9.43 2.52 0 4.89.98 6.67 2.77a9.37 9.37 0 0 1 2.76 6.67c0 5.2-4.24 9.43-9.44 9.43m8.03-17.46A11.27 11.27 0 0 0 12.05.7C5.79.7.7 5.79.7 12.05c0 2 .52 3.95 1.52 5.67L.6 23.3l5.72-1.5a11.33 11.33 0 0 0 5.73 1.46h.01c6.25 0 11.34-5.09 11.35-11.35 0-3.03-1.18-5.88-3.33-8.03" />
      </svg>
    </a>
  );
}

// Small inline brand-adjacent glyphs — lucide-react deliberately ships no
// brand/logo icons, so WhatsApp and the 4 AI providers get simple hand-drawn
// SVGs here instead of an exact trademarked logo reproduction. Each is sized
// and typed the same way as a lucide icon component so it drops into the
// same <Icon size={..} /> usage in AiModelsForm.tsx.

import type { AiProvider } from "@/lib/aiProviderRegistry";

interface IconProps {
  size?: number;
  className?: string;
}

export function WhatsAppIcon({ size = 20, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.09-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Z"
        fill="#25D366"
      />
      <path
        d="M16.9 14.3c-.3-.15-1.73-.85-2-.95-.27-.1-.47-.15-.67.15-.2.3-.77.95-.95 1.15-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.48-1.77-1.66-2.07-.17-.3-.02-.46.13-.62.15-.15.3-.4.45-.6.15-.2.2-.35.3-.55.1-.2.05-.37-.03-.52-.08-.15-.6-1.45-.83-1.98-.2-.47-.4-.4-.55-.4-.14 0-.3-.02-.47-.02-.17 0-.44.06-.67.3-.23.25-.9.88-.9 2.13 0 1.26.92 2.48 1.05 2.65.13.17 1.78 2.72 4.33 3.7 2.55.98 2.55.65 3.01.6.46-.04 1.5-.6 1.72-1.2.22-.6.22-1.1.15-1.2-.06-.1-.26-.17-.56-.31Z"
        fill="#fff"
      />
    </svg>
  );
}

function OpenAiIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#000" />
      <path
        d="M12 6.5a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Zm4.33 2.5a1.8 1.8 0 1 1 -1.8 3.12 1.8 1.8 0 0 1 1.8-3.12Zm0 5a1.8 1.8 0 1 1 -1.8 3.12 1.8 1.8 0 0 1 1.8-3.12ZM12 14a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Zm-4.33-2.5a1.8 1.8 0 1 1 1.8-3.12 1.8 1.8 0 0 1 -1.8 3.12Zm0 5a1.8 1.8 0 1 1 1.8-3.12 1.8 1.8 0 0 1 -1.8 3.12Z"
        fill="#fff"
      />
    </svg>
  );
}

function AnthropicIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#D97757" />
      <path d="M12 6.5 7.5 17.5h1.8l1-2.6h3.4l1 2.6h1.8L12 6.5Zm-1.1 7 1.1-2.9 1.1 2.9h-2.2Z" fill="#fff" />
    </svg>
  );
}

function GeminiIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="gemini-grad" x1="0" y1="0" x2="24" y2="24">
          <stop offset="0" stopColor="#4C8DF6" />
          <stop offset="0.5" stopColor="#B06AB3" />
          <stop offset="1" stopColor="#F6685E" />
        </linearGradient>
      </defs>
      <path d="M12 2c0 5.52 4.48 10 10 10-5.52 0-10 4.48-10 10 0-5.52-4.48-10-10-10 5.52 0 10-4.48 10-10Z" fill="url(#gemini-grad)" />
    </svg>
  );
}

function GrokIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" />
      <path d="M7 6.5h2.6l2.4 3.4 2.4-3.4H17l-3.6 5 3.8 6h-2.6l-2.6-3.7-2.6 3.7H6.8l3.8-6-3.6-5Z" fill="#fff" />
    </svg>
  );
}

/** Which glyph to show next to the model selector — swaps with whichever
    provider is currently chosen on that card (see AiModelsForm.tsx), not a
    single static "AI" icon, per the ask that the AI-model icon itself
    reflects the selected provider. */
export const PROVIDER_ICONS: Record<AiProvider, (props: IconProps) => React.JSX.Element> = {
  openai: OpenAiIcon,
  anthropic: AnthropicIcon,
  gemini: GeminiIcon,
  grok: GrokIcon,
};

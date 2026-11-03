import "server-only";
import mammoth from "mammoth";
import { createClient } from "@/lib/supabase/server";
import { runAiStructuredTask, AI_PROVIDER_REGISTRY, type AiContentPart, type AiModelChoice } from "@/lib/aiProviders";

export interface ComplexBookingExtraction {
  customer: {
    name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
  };
  legs: Array<{
    journey_type: "one_way" | "return" | "disposal" | "multi_day";
    pickup_address: string;
    destination_address: string;
    pickup_date: string | null;
    pickup_time: string | null;
    return_date: string | null;
    return_time: string | null;
    passenger_count: number | null;
    luggage_count: number | null;
    vehicle_notes: string | null;
    special_requirements: string | null;
  }>;
  internal_notes: string | null;
  /**
   * Dot/bracket paths (e.g. "customer.email", "legs[0].pickup_date") the
   * model guessed, inferred, or was otherwise unsure about — surfaced in the
   * review UI as a highlight so staff know exactly what to double-check
   * rather than treating every field as equally reliable.
   */
  uncertain_fields: string[];
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    customer: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        company: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
      },
      required: ["name", "company", "email", "phone"],
      additionalProperties: false,
    },
    legs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          journey_type: { type: "string", enum: ["one_way", "return", "disposal", "multi_day"] },
          pickup_address: { type: "string" },
          destination_address: { type: "string" },
          pickup_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
          pickup_time: { type: ["string", "null"], description: "24-hour HH:MM" },
          return_date: { type: ["string", "null"], description: "YYYY-MM-DD, only for a return journey" },
          return_time: { type: ["string", "null"], description: "24-hour HH:MM, only for a return journey" },
          passenger_count: { type: ["integer", "null"] },
          luggage_count: { type: ["integer", "null"] },
          vehicle_notes: { type: ["string", "null"], description: "Free-text vehicle hint, e.g. '45-seat coach' — do not invent one if not mentioned" },
          special_requirements: {
            type: ["string", "null"],
            description:
              "If there's more than one distinct requirement, put each on its own line starting with \"- \" rather than running them together in one sentence.",
          },
        },
        required: [
          "journey_type",
          "pickup_address",
          "destination_address",
          "pickup_date",
          "pickup_time",
          "return_date",
          "return_time",
          "passenger_count",
          "luggage_count",
          "vehicle_notes",
          "special_requirements",
        ],
        additionalProperties: false,
      },
    },
    internal_notes: {
      type: ["string", "null"],
      description:
        "Anything relevant that didn't fit a leg or customer field. If listing more than one distinct item, put each on its own line starting with \"- \" rather than running them together in one sentence.",
    },
    uncertain_fields: {
      type: "array",
      items: { type: "string" },
      description:
        "Dot/bracket paths for fields you guessed, inferred from ambiguous wording, or are only partially " +
        "confident about — e.g. \"customer.email\", \"legs[0].pickup_date\". Do not list fields you left null " +
        "because nothing was said — only fields you filled in but aren't sure are correct.",
    },
  },
  required: ["customer", "legs", "internal_notes", "uncertain_fields"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You extract structured travel itinerary data for a transport/coach-hire CRM from a pasted message, email, or an " +
  "uploaded quote/itinerary document. The trip may span multiple days and multiple pickup/destination pairs — " +
  "create one entry in `legs` per distinct journey segment (e.g. Day 1 airport transfer, Day 2 city tour, Day 3 " +
  "return transfer are three separate legs), in chronological order. Only extract information that is actually " +
  "present — never invent dates, times, passenger counts, or vehicle types that aren't stated. Use null for " +
  "anything not mentioned. If you have to guess or infer a value from ambiguous wording rather than reading it " +
  "directly, still fill it in but list its field path in `uncertain_fields` so a human can double-check it.";

async function downloadFileBuffer(storagePath: string): Promise<Buffer> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "Could not read the uploaded file.");
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function extractComplexBooking(input: {
  pastedText: string | null;
  file: { storagePath: string; mimeType: string; fileName: string } | null;
  aiModel: AiModelChoice;
}): Promise<ComplexBookingExtraction> {
  if (!input.pastedText && !input.file) {
    throw new Error("Paste itinerary text or upload a file first.");
  }

  const content: AiContentPart[] = [];
  if (input.pastedText) {
    content.push({ type: "text", text: input.pastedText });
  }

  if (input.file) {
    const { mimeType, fileName, storagePath } = input.file;
    if (mimeType.startsWith("image/")) {
      const buffer = await downloadFileBuffer(storagePath);
      content.push({ type: "image", data: buffer, mimeType });
    } else if (mimeType === "application/pdf") {
      if (!AI_PROVIDER_REGISTRY[input.aiModel.provider].supportsPdf) {
        throw new Error("The selected AI provider (Settings -> AI Models -> Complex Booking) doesn't support PDF uploads — switch provider, or upload an image/paste the itinerary text instead.");
      }
      const buffer = await downloadFileBuffer(storagePath);
      content.push({ type: "pdf", data: buffer, fileName });
    } else if (mimeType === DOCX_MIME || fileName.toLowerCase().endsWith(".docx")) {
      const buffer = await downloadFileBuffer(storagePath);
      const { value: text } = await mammoth.extractRawText({ buffer });
      if (!text.trim()) throw new Error("Could not read any text from this Word document.");
      content.push({ type: "text", text });
    } else {
      throw new Error("Unsupported file type — upload a PDF, Word (.docx) document, or an image, or paste the itinerary text instead.");
    }
  }

  const parsed = await runAiStructuredTask<ComplexBookingExtraction>({
    provider: input.aiModel.provider,
    model: input.aiModel.model,
    instructions: SYSTEM_PROMPT,
    content,
    schema: EXTRACTION_SCHEMA,
    schemaName: "complex_booking_extraction",
    // No timeout/maxRetries here before — a vendor SDK's own defaults (e.g.
    // OpenAI's: 10min timeout, 2 retries) mean a single slow/failed call
    // could silently stack into a very long wait with no feedback, the same
    // bug fixed in lib/aiAutoQuote.ts. A document upload can be a
    // multi-page PDF, so this gets more headroom than the short text-only
    // classification calls elsewhere.
    timeoutMs: 90000,
  });

  if (!Array.isArray(parsed.uncertain_fields)) parsed.uncertain_fields = [];
  return parsed;
}

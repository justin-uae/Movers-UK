import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { generateInvoicePdf } from "@/lib/invoicePdf";

/**
 * Streams the invoice PDF for a paid quote — Preview opens it inline,
 * Download forces a save (?download=1). Generated fresh on every request
 * rather than read back from Storage, same "always current, never stale"
 * choice as generateQuotePdf's callers; a copy still gets persisted into
 * Documents whenever resendInvoiceEmailAction actually emails it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireProfile();
  const allowed = await hasPermission(actor, PERMISSIONS.QUOTES_RESEND);
  if (!allowed) return NextResponse.json({ error: "You do not have permission to view invoices." }, { status: 403 });

  const supabase = await createClient();
  const { data: quote } = await supabase.from("quotes").select("invoice_number").eq("id", id).maybeSingle();
  if (!quote) return NextResponse.json({ error: "Quote not found." }, { status: 404 });

  const pdf = await generateInvoicePdf(supabase, id);
  if (!pdf) return NextResponse.json({ error: "This quote has not been invoiced yet." }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const fileName = `${quote.invoice_number ?? id}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    },
  });
}

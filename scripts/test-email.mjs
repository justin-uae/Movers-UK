#!/usr/bin/env node
// Sends one real test email through whatever SMTP_* is set in your env —
// use this to verify a SendGrid (or any SMTP) config works before wiring it
// into Render/Supabase. Mirrors lib/email.ts's transport exactly, but as a
// plain script since that file is server-only and can't be imported here.
//
//   node --env-file=.env.local scripts/test-email.mjs --to you@example.com
//
// Nothing is written to the database — this only sends a single email and
// exits. Safe to run against production SMTP credentials.

import nodemailer from "nodemailer";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
    console.error("Set SMTP_HOST/PORT/USER/PASS/FROM first (use --env-file=.env.local).");
    process.exit(1);
  }

  const to = arg("to");
  if (!to) {
    console.error("Usage: node --env-file=.env.local scripts/test-email.mjs --to you@example.com");
    process.exit(1);
  }

  const port = Number(SMTP_PORT);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  console.log(`Sending a test email via ${SMTP_HOST}:${port} from ${SMTP_FROM} to ${to}...`);

  const info = await transporter.sendMail({
    from: SMTP_FROM,
    to,
    subject: "Transport CRM — SMTP test email",
    html: `<p>This is a test email sent directly via <code>scripts/test-email.mjs</code> to confirm the SMTP_* configuration works.</p>
           <p>Host: ${SMTP_HOST}<br>Sent at: ${new Date().toISOString()}</p>`,
  });

  console.log(`Sent. Message ID: ${info.messageId}`);
  console.log("Check the recipient's inbox (and spam folder), and your provider's activity/delivery log, to confirm it actually arrived.");
}

main().catch((err) => {
  console.error("Send failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

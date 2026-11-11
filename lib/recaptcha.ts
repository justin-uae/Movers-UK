import "server-only";

/**
 * Verifies a Google reCAPTCHA (v2 checkbox) token from the website's quote
 * form. Opt-in: with RECAPTCHA_SECRET_KEY unset this always passes, so the
 * website lead API keeps working before reCAPTCHA is configured. Once it is
 * set, a missing or rejected token fails.
 */
export async function verifyRecaptcha(token: string | undefined): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Minimal email-send abstraction. V1 wires Resend via their REST API so
 * we avoid a runtime SDK dependency. When `RESEND_API_KEY` (and
 * `EMAIL_FROM`) are set, real email is sent; otherwise we log the
 * message to stdout — keeps dev frictionless and gives admins a
 * fallback when delivery fails.
 *
 * Always returns a result; never throws to a caller. Invite creation
 * succeeds even if email delivery fails — the admin can copy the link.
 */

export type EmailSendResult =
  | { delivered: true; provider: "resend"; messageId?: string }
  | { delivered: false; provider: "console" }
  | { delivered: false; provider: "resend"; error: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    // Dev / no-provider fallback — logged but not sent.
    console.info(
      `[email/console] to=${args.to} subject=${JSON.stringify(args.subject)}\n${args.text}`,
    );
    return { delivered: false, provider: "console" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      return {
        delivered: false,
        provider: "resend",
        error: errText.slice(0, 200),
      };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, provider: "resend", messageId: data.id };
  } catch (e) {
    return {
      delivered: false,
      provider: "resend",
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    };
  }
}

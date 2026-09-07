import { Resend } from 'resend';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  console.warn('[EmailClient] ⚠️ RESEND_API_KEY is not defined in environment variables. Email sending will be simulated or skipped.');
}

export const resend = apiKey ? new Resend(apiKey) : null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust wrapper for sending emails via Resend with exponential backoff retry logic.
 * Supports inline HTML, text, and binary attachments (Buffer or base64).
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject line
 * @param {string} [options.html] - HTML body
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.from] - Sender email
 * @param {string} [options.replyTo] - Reply-to email
 * @param {Array<{ filename: string, content: Buffer|string }>} [options.attachments] - Array of attachments
 * @param {number} [maxRetries=2] - Maximum retry attempts on transient network or 5xx/429 errors
 * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
 */
export async function sendWithRetry({
  to,
  subject,
  html,
  text,
  from = process.env.EMAIL_FROM || 'onboarding@resend.dev',
  replyTo,
  attachments,
}, maxRetries = 2) {
  if (!resend) {
    const warning = `[EmailClient] Email suppressed for "${subject}": No RESEND_API_KEY configured.`;
    console.warn(warning);
    return { success: false, error: 'RESEND_API_KEY missing in server environment.' };
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!recipients.length) {
    return { success: false, error: 'No valid recipient email provided.' };
  }

  let attempt = 0;
  let delay = 1000;

  while (attempt <= maxRetries) {
    try {
      const payload = {
        from,
        to: recipients,
        subject,
        html,
        text,
        reply_to: replyTo,
      };

      if (Array.isArray(attachments) && attachments.length > 0) {
        payload.attachments = attachments.map((att) => ({
          filename: att.filename,
          content: Buffer.isBuffer(att.content) ? att.content : Buffer.from(att.content),
        }));
      }

      const response = await resend.emails.send(payload);

      if (response.error) {
        const errMsg = response.error.message || JSON.stringify(response.error);
        throw new Error(errMsg);
      }

      return { success: true, id: response.data?.id };
    } catch (err) {
      attempt++;
      const isLastAttempt = attempt > maxRetries;
      console.error(
        `[EmailClient] Attempt ${attempt}/${maxRetries + 1} failed for "${subject}" -> ${recipients.join(', ')}: ${err.message}`
      );

      if (isLastAttempt) {
        return { success: false, error: err.message };
      }

      await sleep(delay);
      delay *= 2; // Exponential backoff (1s -> 2s)
    }
  }

  return { success: false, error: 'Exceeded maximum retry attempts.' };
}

import { getRecord, runQuery } from '../../database.js';

/**
 * Checks if a low-stock alert has already been sent recently for this product
 * to prevent spamming the administrator inbox on consecutive sales.
 *
 * @param {number|string} productId
 * @param {number} [cooldownHours=12]
 * @returns {Promise<boolean>} Returns true if alert should proceed, false if throttled.
 */
export async function shouldSendLowStockAlert(productId, cooldownHours = 12) {
  try {
    const recentAlert = await getRecord(
      `SELECT id, created_at FROM email_logs 
       WHERE email_type = 'low_stock' 
         AND reference_id = ? 
         AND status = 'sent' 
         AND created_at > NOW() - INTERVAL '${Number(cooldownHours)} hours' 
       ORDER BY created_at DESC LIMIT 1`,
      [String(productId)]
    );

    return !recentAlert;
  } catch (err) {
    console.warn(`[AlertThrottler] Error checking cooldown for product ${productId}:`, err.message);
    return true; // Fail-open so critical alerts are not lost if DB check errors
  }
}

/**
 * Logs an email sending attempt (success or failure) to the audit trail table.
 *
 * @param {Object} entry
 * @param {string} entry.recipient
 * @param {string} entry.emailType
 * @param {string|number} [entry.referenceId]
 * @param {string} [entry.resendId]
 * @param {string} entry.status - 'sent' | 'failed' | 'skipped'
 * @param {string} [entry.errorMessage]
 * @param {Object} [entry.metadata]
 */
export async function logEmailAttempt({
  recipient,
  emailType,
  referenceId = null,
  resendId = null,
  status,
  errorMessage = null,
  metadata = {},
}) {
  try {
    await runQuery(
      `INSERT INTO email_logs (recipient, email_type, reference_id, resend_id, status, error_message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        recipient,
        emailType,
        referenceId ? String(referenceId) : null,
        resendId,
        status,
        errorMessage,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (err) {
    console.error('[AlertThrottler] Failed to log email audit record:', err.message);
  }
}

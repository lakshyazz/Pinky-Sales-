/**
 * Production HTML Template for Low-Stock Administrative Alerts.
 */
export function renderLowStockAlertHtml({
  productName,
  brand,
  colour,
  shopName,
  remainingStock,
  minThreshold,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Low Stock Warning: ${productName}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #FEF2F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #FEF2F2; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 10px; overflow: hidden; border: 1px solid #FCA5A5; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
            <!-- Alert Header -->
            <tr>
              <td style="background-color: #DC2626; padding: 22px 30px;">
                <table width="100%">
                  <tr>
                    <td>
                      <span style="display: inline-block; background-color: #991B1B; color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; margin-bottom: 6px;">
                        URGENT INVENTORY NOTICE
                      </span>
                      <h2 style="color: #FFFFFF; margin: 0; font-size: 20px; font-weight: 700;">⚠️ Low Stock Alert</h2>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 28px 30px;">
                <p style="margin: 0 0 16px 0; font-size: 14.5px; color: #374151; line-height: 1.5;">
                  The following product has dropped below its configured minimum stock safety threshold following recent sales:
                </p>

                <!-- Product Box -->
                <div style="background-color: #FFF1F2; border-left: 4px solid #E11D48; padding: 16px; border-radius: 6px; margin-bottom: 24px;">
                  <div style="font-size: 17px; font-weight: 700; color: #9F1239;">${productName}</div>
                  <table width="100%" style="font-size: 12.5px; color: #881337; margin-top: 6px;">
                    <tr>
                      <td width="50%">Brand: <strong>${brand || 'General'}</strong></td>
                      <td width="50%" align="right">Variant/Color: <strong>${colour || 'Standard'}</strong></td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding-top: 4px;">Location: <strong>${shopName || 'Main Store'}</strong></td>
                    </tr>
                  </table>
                </div>

                <!-- Stock Metrics Comparison -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
                  <tr>
                    <td width="50%" style="text-align: center; border-right: 1px solid #CBD5E1;">
                      <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Units Remaining</div>
                      <div style="font-size: 30px; font-weight: 800; color: #DC2626; margin-top: 4px;">${remainingStock}</div>
                    </td>
                    <td width="50%" style="text-align: center;">
                      <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Min Safety Threshold</div>
                      <div style="font-size: 30px; font-weight: 800; color: #475569; margin-top: 4px;">${minThreshold}</div>
                    </td>
                  </tr>
                </table>

                <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.5;">
                  <em>Action required:</em> Please initiate a supplier purchase order or branch stock transfer to avoid store stockout.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #F8FAFC; padding: 14px 30px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8;">
                AS Store Premium Automated Watchdog | Cooldown protection active (max 1 alert per 12 hrs per product).
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

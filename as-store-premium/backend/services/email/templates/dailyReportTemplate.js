/**
 * Production HTML Template for the End-of-Day Performance Digest (23:59 IST).
 */
export function renderDailyReportHtml({
  reportDate,
  totalSalesRevenue = 0,
  totalOrders = 0,
  totalStockInward = 0,
  topSellingProducts = [],
  lowStockList = [],
}) {
  const topRows = topSellingProducts.length
    ? topSellingProducts
        .map(
          (p, idx) => `
        <tr style="border-bottom: 1px solid #E2E8F0; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
          <td style="padding: 10px 12px; font-size: 13px; color: #1E293B;">
            <span style="display: inline-block; width: 20px; font-weight: 700; color: #64748B;">#${idx + 1}</span>
            <strong>${p.name || 'Product'}</strong>
          </td>
          <td align="center" style="padding: 10px 8px; font-size: 13px; font-weight: 700; color: #0F172A;">
            ${p.total_qty || p.quantity || 0} pcs
          </td>
          <td align="right" style="padding: 10px 12px; font-size: 13px; font-weight: 600; color: #16A34A;">
            ₹${Number(p.total_revenue || 0).toFixed(2)}
          </td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="3" style="padding: 16px; color: #94A3B8; text-align: center; font-size: 13px;">No sales recorded today</td></tr>';

  const lowStockRows = lowStockList.length
    ? lowStockList
        .map(
          (item) => `
        <tr style="border-bottom: 1px solid #FEE2E2;">
          <td style="padding: 8px 12px; font-size: 13px; color: #991B1B; font-weight: 600;">
            ${item.name || 'Product'}
            ${item.shop_name ? `<span style="font-size: 11px; color: #7F1D1D; font-weight: normal;"> (${item.shop_name})</span>` : ''}
          </td>
          <td align="right" style="padding: 8px 12px; font-size: 13px; font-weight: 800; color: #DC2626;">
            ${item.current_qty ?? item.quantity ?? 0} left
          </td>
        </tr>`
        )
        .join('')
    : '<tr><td colspan="2" style="padding: 14px; color: #16A34A; text-align: center; font-size: 13px; font-weight: 600;">✓ All inventory items are at safe stock levels!</td></tr>';

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>End-of-Day Store Summary</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="620" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 10px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 26px 32px;">
                <span style="display: inline-block; background-color: #38BDF8; color: #0F172A; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; margin-bottom: 6px;">
                  CLOSING DIGEST
                </span>
                <h2 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 700;">📈 End-of-Day Performance Summary</h2>
                <div style="color: #94A3B8; font-size: 13px; margin-top: 4px;">Report Date: ${reportDate}</div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 28px 32px;">
                <!-- Key KPI Cards -->
                <table width="100%" cellpadding="6" cellspacing="0" style="margin-bottom: 26px;">
                  <tr>
                    <td width="33%" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px; text-align: center;">
                      <div style="font-size: 11px; color: #1D4ED8; font-weight: 700; text-transform: uppercase;">Gross Sales</div>
                      <div style="font-size: 20px; font-weight: 800; color: #1E3A8A; margin-top: 4px;">₹${Number(totalSalesRevenue).toFixed(2)}</div>
                    </td>
                    <td width="33%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 14px; text-align: center;">
                      <div style="font-size: 11px; color: #15803D; font-weight: 700; text-transform: uppercase;">Orders Completed</div>
                      <div style="font-size: 20px; font-weight: 800; color: #166534; margin-top: 4px;">${totalOrders}</div>
                    </td>
                    <td width="33%" style="background-color: #FAF5FF; border: 1px solid #E9D5FF; border-radius: 8px; padding: 14px; text-align: center;">
                      <div style="font-size: 11px; color: #7E22CE; font-weight: 700; text-transform: uppercase;">Inward Units</div>
                      <div style="font-size: 20px; font-weight: 800; color: #581C87; margin-top: 4px;">${totalStockInward} pcs</div>
                    </td>
                  </tr>
                </table>

                <!-- Top 5 Selling Products -->
                <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #0F172A;">🏆 Top 5 Selling Products Today</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; margin-bottom: 26px;">
                  <thead>
                    <tr style="background-color: #F1F5F9;">
                      <th style="padding: 8px 12px; font-size: 11px; color: #475569; text-transform: uppercase; text-align: left;">Product</th>
                      <th style="padding: 8px 8px; font-size: 11px; color: #475569; text-transform: uppercase; text-align: center;">Units Sold</th>
                      <th style="padding: 8px 12px; font-size: 11px; color: #475569; text-transform: uppercase; text-align: right;">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${topRows}
                  </tbody>
                </table>

                <!-- Items on Critical Stock -->
                <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #DC2626;">⚠️ Critical Stock Items (Requiring Attention)</h3>
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; border: 1px solid #FECACA; background-color: #FFF1F2; border-radius: 6px; overflow: hidden; margin-bottom: 20px;">
                  <tbody>
                    ${lowStockRows}
                  </tbody>
                </table>

                <div style="font-size: 11.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 16px;">
                  Daily summary generated automatically by AS Store Premium Automation Suite.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

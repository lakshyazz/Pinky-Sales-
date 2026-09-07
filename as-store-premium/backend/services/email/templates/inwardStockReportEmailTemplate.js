/**
 * Production HTML Template for the 10:00 PM Master Product & Stock Inventory Report with Excel Attachment.
 */
export function renderInwardStockReportEmailHtml({
  reportDate,
  totalProductsCount = 0,
  totalInStockUnits = 0,
  totalQuantityInward = 0,
  totalValuation = 0,
  attachmentFilename = 'Master_Product_Stock_Report.xlsx',
  isEmpty = false,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Product & Stock Report - ${reportDate}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="620" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 10px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
            <!-- Header -->
            <tr>
              <td style="background: linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%); padding: 26px 32px;">
                <span style="display: inline-block; background-color: #3B82F6; color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; margin-bottom: 6px;">
                  SCHEDULED 10:00 PM IST REPORT
                </span>
                <h2 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 700;">📊 Master Product & Stock Inventory Report</h2>
                <div style="color: #94A3B8; font-size: 13px; margin-top: 4px;">Date: ${reportDate} | All Catalog Products & Live Stock Levels</div>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 20px 0; font-size: 14.5px; color: #334155; line-height: 1.5;">
                  Please find below the complete inventory report containing <strong>all ${totalProductsCount} products</strong> in the database. 
                  The complete master spreadsheet is attached to this email.
                </p>

                <!-- Metric Cards -->
                <table width="100%" cellpadding="6" cellspacing="0" style="margin-bottom: 24px;">
                  <tr>
                    <td width="25%" style="background-color: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 12px; text-align: center;">
                      <div style="font-size: 10px; color: #1D4ED8; font-weight: 700; text-transform: uppercase;">Total Products</div>
                      <div style="font-size: 20px; font-weight: 800; color: #1E3A8A; margin-top: 4px;">${totalProductsCount}</div>
                    </td>
                    <td width="25%" style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 12px; text-align: center;">
                      <div style="font-size: 10px; color: #15803D; font-weight: 700; text-transform: uppercase;">Total Stock</div>
                      <div style="font-size: 20px; font-weight: 800; color: #166534; margin-top: 4px;">${totalInStockUnits} pcs</div>
                    </td>
                    <td width="25%" style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px; text-align: center;">
                      <div style="font-size: 10px; color: #B45309; font-weight: 700; text-transform: uppercase;">Added Today</div>
                      <div style="font-size: 20px; font-weight: 800; color: #92400E; margin-top: 4px;">+${totalQuantityInward}</div>
                    </td>
                    <td width="25%" style="background-color: #FAF5FF; border: 1px solid #E9D5FF; border-radius: 8px; padding: 12px; text-align: center;">
                      <div style="font-size: 10px; color: #7E22CE; font-weight: 700; text-transform: uppercase;">Valuation</div>
                      <div style="font-size: 17px; font-weight: 800; color: #581C87; margin-top: 6px;">₹${Number(totalValuation).toFixed(2)}</div>
                    </td>
                  </tr>
                </table>

                <!-- Attachment Notice Box -->
                <div style="background-color: #F8FAFC; border: 1px dashed #94A3B8; border-radius: 8px; padding: 18px 20px; text-align: center; margin-bottom: 24px;">
                  <div style="font-size: 26px; margin-bottom: 6px;">📎</div>
                  <div style="font-size: 14.5px; font-weight: 700; color: #0F172A;">Attached Master Spreadsheet</div>
                  <div style="font-size: 13px; color: #2563EB; font-family: monospace; font-weight: 600; margin-top: 3px;">${attachmentFilename}</div>
                  <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748B;">
                    Includes all <strong>${totalProductsCount} items</strong> with title, brand, supplier, color, current stock, added today, cost/wholesale/retail prices, stock status, and valuation.
                  </p>
                </div>

                <div style="font-size: 11.5px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 16px;">
                  Automated nightly by Pinky Saless Management Suite (10:00 PM Asia/Kolkata IST).
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

/**
 * Production HTML Template for Real-Time Inward Stock / Restock Notification.
 */
export function renderStockAddedHtml({
  productName,
  brand,
  colour,
  supplierName,
  quantityAdded,
  currentStock,
  purchasePrice,
  wholesalePrice,
  retailPrice,
  shopName,
  loggedByName,
  timestamp,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inward Stock Received</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F0FDF4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F0FDF4; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="580" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 10px; overflow: hidden; border: 1px solid #BBF7D0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);">
            <!-- Header -->
            <tr>
              <td style="background-color: #059669; padding: 22px 30px;">
                <span style="display: inline-block; background-color: #065F46; color: #FFFFFF; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; margin-bottom: 6px;">
                  INVENTORY INWARD
                </span>
                <h2 style="color: #FFFFFF; margin: 0; font-size: 20px; font-weight: 700;">📦 Stock Restocked / Added</h2>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding: 26px 30px;">
                <p style="margin: 0 0 16px 0; font-size: 14.5px; color: #374151;">
                  A new inward inventory batch has been registered in the system:
                </p>

                <!-- Inward Details Card -->
                <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
                  <div style="font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 8px;">${productName}</div>
                  <table width="100%" cellpadding="4" style="font-size: 13px; color: #475569;">
                    <tr>
                      <td width="50%">Brand: <strong>${brand || '-'}</strong></td>
                      <td width="50%" align="right">Variant/Color: <strong>${colour || 'Default'}</strong></td>
                    </tr>
                    <tr>
                      <td>Supplier: <strong>${supplierName || 'Direct / General'}</strong></td>
                      <td align="right">Destination: <strong>${shopName || 'Main Store'}</strong></td>
                    </tr>
                  </table>
                </div>

                <!-- Quantities & Prices -->
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                  <tr>
                    <td width="50%" style="text-align: center; border-right: 1px solid #6EE7B7;">
                      <div style="font-size: 11px; color: #047857; text-transform: uppercase; font-weight: 600;">Qty Received Now</div>
                      <div style="font-size: 28px; font-weight: 800; color: #059669; margin-top: 2px;">+${quantityAdded}</div>
                    </td>
                    <td width="50%" style="text-align: center;">
                      <div style="font-size: 11px; color: #047857; text-transform: uppercase; font-weight: 600;">New Total In-Stock</div>
                      <div style="font-size: 28px; font-weight: 800; color: #0F172A; margin-top: 2px;">${currentStock}</div>
                    </td>
                  </tr>
                </table>

                <!-- Pricing Breakdown -->
                <table width="100%" cellpadding="6" style="font-size: 13px; color: #334155; border-collapse: collapse; margin-bottom: 20px;">
                  ${purchasePrice ? `
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="color: #64748B;">Purchase Cost:</td>
                    <td align="right" style="font-weight: 600;">₹${Number(purchasePrice).toFixed(2)}</td>
                  </tr>` : ''}
                  ${wholesalePrice ? `
                  <tr style="border-bottom: 1px solid #F1F5F9;">
                    <td style="color: #64748B;">Wholesale Price:</td>
                    <td align="right" style="font-weight: 600;">₹${Number(wholesalePrice).toFixed(2)}</td>
                  </tr>` : ''}
                  ${retailPrice ? `
                  <tr>
                    <td style="color: #64748B;">Retail / Selling Price:</td>
                    <td align="right" style="font-weight: 600;">₹${Number(retailPrice).toFixed(2)}</td>
                  </tr>` : ''}
                </table>

                <!-- Audit info -->
                <div style="font-size: 12px; color: #94A3B8; border-top: 1px solid #E2E8F0; padding-top: 12px;">
                  Recorded by <strong>${loggedByName || 'System'}</strong> on ${timestamp || new Date().toLocaleString('en-IN')}.
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

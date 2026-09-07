/**
 * Production HTML Template for Order Confirmation & Invoice.
 * Compatible with Gmail, Apple Mail, and Outlook.
 */
export function renderOrderInvoiceHtml({
  orderId,
  invoiceNumber,
  customerName,
  customerMobile,
  saleDate,
  items = [],
  subtotal = 0,
  extraExpenses = 0,
  discountAmount = 0,
  discountPercentage = 0,
  totalAmount = 0,
  paymentMode = 'cash',
  paidAmount = 0,
  pendingAmount = 0,
  publicInvoiceUrl = null,
}) {
  const itemRows = items
    .map((item, idx) => {
      const name = item.name || item.custom_product_name || item.product_name || 'Product Item';
      const colour = item.colour || item.selected_colour || item.color || '';
      const brand = item.brand || item.custom_brand_name || '';
      const qty = Number(item.quantity || item.saleQuantity || 1);
      const unitPrice = Number(item.unit_price || item.unitPrice || item.selling_price || 0);
      const lineTotal = Number(item.total_price || item.saleTotal || qty * unitPrice);

      return `
      <tr style="border-bottom: 1px solid #E5E7EB; background-color: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
        <td style="padding: 12px 14px; font-size: 13px; color: #111827; text-align: left;">
          <div style="font-weight: 600;">${name}</div>
          <div style="font-size: 11px; color: #6B7280; margin-top: 2px;">
            ${brand ? `Brand: ${brand}` : ''} ${brand && colour ? '|' : ''} ${colour ? `Color: ${colour}` : ''}
          </div>
        </td>
        <td style="padding: 12px 10px; font-size: 13px; color: #374151; text-align: center;">${qty}</td>
        <td style="padding: 12px 10px; font-size: 13px; color: #374151; text-align: right;">₹${unitPrice.toFixed(2)}</td>
        <td style="padding: 12px 14px; font-size: 13px; font-weight: 600; color: #111827; text-align: right;">₹${lineTotal.toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  const invNum = invoiceNumber || `INV-${String(orderId).padStart(6, '0')}`;
  const isFullyPaid = Number(pendingAmount) <= 0;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt: ${invNum}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; padding: 30px 15px;">
      <tr>
        <td align="center">
          <table width="620" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);">
            <!-- Header Banner -->
            <tr>
              <td style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 26px 32px;">
                <table width="100%">
                  <tr>
                    <td>
                      <h1 style="color: #FFFFFF; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">AS Store Premium</h1>
                      <div style="color: #94A3B8; font-size: 12px; margin-top: 4px;">Electronic Invoice & Order Confirmation</div>
                    </td>
                    <td align="right" valign="top">
                      <span style="display: inline-block; background-color: #334155; color: #F8FAFC; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 600;">
                        ${invNum}
                      </span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Content Area -->
            <tr>
              <td style="padding: 28px 32px;">
                <p style="margin: 0 0 10px 0; font-size: 16px; color: #0F172A;">
                  Dear <strong>${customerName || 'Valued Customer'}</strong>,
                </p>
                <p style="margin: 0 0 22px 0; font-size: 13.5px; color: #475569; line-height: 1.5;">
                  Thank you for shopping with us. Your purchase has been confirmed and registered in our system.
                </p>

                <!-- Metadata Grid -->
                <table width="100%" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; color: #334155;">
                  <tr>
                    <td width="50%">
                      <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Date</div>
                      <div style="font-weight: 600; margin-top: 2px;">${saleDate || new Date().toLocaleDateString('en-IN')}</div>
                    </td>
                    <td width="50%" align="right">
                      <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Payment Mode</div>
                      <div style="font-weight: 600; margin-top: 2px;">${String(paymentMode).toUpperCase()}</div>
                    </td>
                  </tr>
                  ${customerMobile ? `
                  <tr>
                    <td colspan="2" style="padding-top: 8px; border-top: 1px dashed #CBD5E1; margin-top: 8px;">
                      <span style="font-size: 11px; color: #64748B;">Contact:</span> <strong>${customerMobile}</strong>
                    </td>
                  </tr>` : ''}
                </table>

                <!-- Line Items Table -->
                <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px;">
                  <thead>
                    <tr style="background-color: #0F172A;">
                      <th style="padding: 10px 14px; font-size: 11.5px; color: #F8FAFC; text-transform: uppercase; text-align: left; border-top-left-radius: 4px;">Item Details</th>
                      <th style="padding: 10px 10px; font-size: 11.5px; color: #F8FAFC; text-transform: uppercase; text-align: center;">Qty</th>
                      <th style="padding: 10px 10px; font-size: 11.5px; color: #F8FAFC; text-transform: uppercase; text-align: right;">Unit Price</th>
                      <th style="padding: 10px 14px; font-size: 11.5px; color: #F8FAFC; text-transform: uppercase; text-align: right; border-top-right-radius: 4px;">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itemRows}
                  </tbody>
                </table>

                <!-- Financial Breakdown -->
                <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 13.5px; color: #334155; margin-bottom: 24px;">
                  <tr>
                    <td style="color: #64748B;">Subtotal:</td>
                    <td align="right">₹${Number(subtotal).toFixed(2)}</td>
                  </tr>
                  ${Number(extraExpenses) > 0 ? `
                  <tr>
                    <td style="color: #64748B;">Packaging / Delivery Expenses:</td>
                    <td align="right">₹${Number(extraExpenses).toFixed(2)}</td>
                  </tr>` : ''}
                  ${Number(discountAmount) > 0 ? `
                  <tr>
                    <td style="color: #16A34A;">Discount Applied (${discountPercentage}%):</td>
                    <td align="right" style="color: #16A34A; font-weight: 600;">-₹${Number(discountAmount).toFixed(2)}</td>
                  </tr>` : ''}
                  <tr style="border-top: 2px solid #0F172A; font-size: 16px; font-weight: 700; color: #0F172A;">
                    <td style="padding-top: 10px;">Grand Total:</td>
                    <td align="right" style="padding-top: 10px;">₹${Number(totalAmount).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding-top: 6px; color: #16A34A; font-weight: 600;">Amount Paid:</td>
                    <td align="right" style="padding-top: 6px; color: #16A34A; font-weight: 600;">₹${Number(paidAmount).toFixed(2)}</td>
                  </tr>
                  ${Number(pendingAmount) > 0 ? `
                  <tr>
                    <td style="padding-top: 6px; color: #DC2626; font-weight: 700;">Remaining Balance Due:</td>
                    <td align="right" style="padding-top: 6px; color: #DC2626; font-weight: 700;">₹${Number(pendingAmount).toFixed(2)}</td>
                  </tr>` : `
                  <tr>
                    <td colspan="2" style="padding-top: 8px;">
                      <span style="display: inline-block; background-color: #DCFCE7; color: #166534; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                        ✓ PAID IN FULL
                      </span>
                    </td>
                  </tr>`}
                </table>

                ${publicInvoiceUrl ? `
                <!-- View Online CTA Button -->
                <div style="text-align: center; margin: 28px 0 10px 0;">
                  <a href="${publicInvoiceUrl}" target="_blank" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 13.5px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px;">
                    View & Print Invoice Online
                  </a>
                </div>` : ''}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background-color: #F8FAFC; padding: 18px 32px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 11.5px; color: #94A3B8;">
                AS Store Premium Management Suite | Thank you for your business.<br>
                For questions regarding this invoice, please reach out with your Invoice ID.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}

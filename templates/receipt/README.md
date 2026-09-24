# Receipt

A paper-style receipt with the total first, line items, and the order reference.

<img src="preview.webp" width="420" alt="Receipt preview">

- **Its job:** Confirm a payment so clearly that nobody opens a ticket or disputes the charge.
- **Send it:** Immediately after a successful charge.
- **Why it works:** Looks like a receipt: total first, then items, then the reference people search their inbox for.
- **Measure:** Billing tickets and chargebacks per 1,000 payments
- **Keep:** the total in the subject; order reference; how to get help
- **Avoid:** promotions; more than one button

**Subject lines to test**

- Receipt from {{company_name}} · {{total}}
- Your {{company_name}} receipt
- Thanks for your payment

Slots: `preheader`, `total`, `paid_on`, `payment_method`, `item_1`, `item_1_amount`, `item_2`, `item_2_amount`, `order_id`, `billing_note`, `cta_label`, `cta_url`

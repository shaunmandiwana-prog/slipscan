const text = `
KFC
**KSA340**
CNR C R SWART AND ONTDEKKERS
TELL:015 004 1207
RGM:078 600 7476
91 JEANETTE

CHK: 3 1828.00 05/03/2026 18:20
GST: 1
DRIVE THRU

1 @ 42.90
STREETWISE BUCKET FOR 1 42.90
>> 1x NO SWAP
>> 1x NO DRINK
>> 1x NO LARGE CHIPS
>> 1x NO BUDDY
>> 1x NO MINI LOAF
1 @ 49.90
SNACK - 4 DUNKED WINGS 49.90
>> 1x SNACK ONLY
>> 1x NO COKE BUDDY
1 @ 0.00
CHICKEN SELECTION 0.00
>> 1x THIGH

3 Item(s)

SUBTOTAL(DRIVE THRU) 92.80
CARD 92.80

STORED2
TAX INVOICE
TAX EXCLUSIVE TOTAL 80.70
TAX INCLUDED @ 15.00% 12.10
Tax Number:
TRAN# 765935  Doc# IND026T004721776
`;

function parseReceiptData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const items = [];
    let subtotal = '', tax = '', total = '';

    const priceRegex = /R?\s*(\d+[.,]\d{2})(?:[^\dA-Za-z]*)$/;
    const totalRegex = /(?:total|amount\s*due|balance\s*due|totaal)/i;
    const subtotalRegex = /(?:sub\s*total|subtotal|sub-total)/i;
    const taxRegex = /(?:vat|tax|btw)/i;
    const qtyPriceRegex = /(\d+)\s*[xX@]\s*R?\s*(\d+[.,]?\d{2})/;
    const skipRegex = /(?:change|cash|card|visa|mastercard|eft|debit|credit|rounding|tender|payment|receipt|invoice|tel|phone|fax|vat\s*no|reg\s*no|date|time|cashier|operator|thank|welcome|visit)/i;

    function formatPrice(val) {
        let p = val.replace(/[^0-9.,]/g, '').replace(',', '.');
        if (!p.includes('.')) {
            if (p.length > 2) p = p.slice(0, -2) + '.' + p.slice(-2);
            else p = p + '.00';
        }
        return parseFloat(p).toFixed(2);
    }

    let previousLine = '';

    for (const line of lines) {
        // KFC Specific Skip
        if (/^\d+\s*@\s*\d+[.,]\d{2}$/.test(line)) continue;

        let isSkip = skipRegex.test(line);
        let handledAsTotal = false;

        if (totalRegex.test(line)) {
            const m = line.match(priceRegex);
            if (m) {
                if (!total || !line.toLowerCase().includes('exclusive')) {
                    total = formatPrice(m[1]);
                }
            }
            handledAsTotal = true;
        }
        if (subtotalRegex.test(line)) {
            const m = line.match(priceRegex);
            if (m) subtotal = formatPrice(m[1]);
            handledAsTotal = true;
        }
        if (taxRegex.test(line)) {
            const m = line.match(priceRegex);
            if (m) tax = formatPrice(m[1]);
            handledAsTotal = true;
        }

        if (handledAsTotal) continue;

        if (isSkip && !totalRegex.test(line) && !subtotalRegex.test(line) && !taxRegex.test(line)) {
            previousLine = line;
            continue;
        }

        const priceMatch = line.match(priceRegex);
        if (priceMatch) {
            const price = formatPrice(priceMatch[1]);
            let itemName = line.substring(0, priceMatch.index).trim();
            let qty = '1';

            const qtyMatch = line.match(qtyPriceRegex);
            if (qtyMatch) qty = qtyMatch[1];

            const leadingQty = itemName.match(/^(\d+)\s+/);
            if (leadingQty && parseInt(leadingQty[1]) < 100) {
                qty = leadingQty[1];
                itemName = itemName.substring(leadingQty[0].length);
            }

            itemName = itemName.replace(/^[\-\*\s]+/, '').replace(/[\-\*\s]+$/, '').replace(/\s*R\s*$/, '').trim();

            if (/^(price|amount|item|qty)[:\s]*$/i.test(itemName) || itemName.length < 2) {
                if (previousLine.length > 3) {
                    itemName = previousLine.replace(/^[\-\*\s]+/, '').trim();
                } else {
                    itemName = "Item";
                }
            }

            if (itemName.length > 1 && !itemName.toLowerCase().includes('total')) {
                items.push({ name: itemName, qty, price });
            }
        }
        previousLine = line;
    }

    if (!total && subtotal) total = subtotal;

    console.log(JSON.stringify({ items, subtotal, tax, total }, null, 2));
}

parseReceiptData(text);

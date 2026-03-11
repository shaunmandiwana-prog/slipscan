const text = `Hide Raw Text
2
{iS
RY CFC
\\3
KGASAUEE ae FES
ONR bo qq] M9; ONTDERKERS
LL-015 (04 La
. RGM: 076 £00 1470 }
—— IEANEY 1
CHR 3.1828 10 (5/03/2026 13:20
DRIVE THRU
18 42.495
: STREETWISE BUCKET FOR 1 42.90
Yo 1X RO SWAP
>> 1x KO DRINK
: - > Ix NO LARGE CHIPS
>> 1x Ng BUDDY
os 27 AX NI MING LOAF
18 49.9;
SKACK - 8 QUNKED WINGS 44.9G
: 23 Tx SHACK ONLY
>» 1x NO COKE BUDDY
= 6 0.00
eo CHICKEN SELECT HOR 0.00
or >u Ix THIGH
3 [tem(s)
# SUBTOTAL LDRIVE THRU) 92.80
o
3 | CARD 92.80
“1 (3d [3
Tax INVOICE _.
5 TAX EXCLUSIVE TOTAL oil. 0
TU LHCLUDED 1h 00% 12.10
od fax Numoer :
[RANE 765935 (gop INOOZOTO0ATZNITD`;

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

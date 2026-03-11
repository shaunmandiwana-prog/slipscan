/* ============================================================
   SlipScan — Customer App Logic
   Multi-step form, OCR, receipt parsing, server API
   ============================================================ */

(function () {
    'use strict';

    // ========================
    // State
    // ========================
    let currentStep = 1;
    let capturedImage = null;
    let cameraStream = null;
    let selectedCategory = 'Groceries';

    // ========================
    // DOM References
    // ========================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const steps = [null, $('#step1'), $('#step2'), $('#step3'), $('#step4'), $('#step5')];

    const customerNameInput = $('#customerName');
    const storeNameInput = $('#storeName');
    const customStoreNameInput = $('#customStoreName');
    const customStoreGroup = $('#customStoreGroup');
    const storeBranchInput = $('#storeBranch');
    const fileInput = $('#fileInput');
    const cameraInput = $('#cameraInput');

    const uploadArea = $('#uploadArea');
    const uploadContent = $('#uploadContent');
    const imagePreview = $('#imagePreview');
    const previewImg = $('#previewImg');

    const cameraPreview = $('#cameraPreview');
    const cameraVideo = $('#cameraVideo');
    const cameraCanvas = $('#cameraCanvas');

    const ocrProgress = $('#ocrProgress');
    const ocrProgressFill = $('#ocrProgressFill');
    const ocrStatus = $('#ocrStatus');
    const extractedData = $('#extractedData');
    const rawText = $('#rawText');
    const rawTextBox = $('#rawTextBox');
    const itemsBody = $('#itemsBody');

    const subtotalInput = $('#subtotalInput');
    const taxInput = $('#taxInput');
    const totalInput = $('#totalInput');

    // ========================
    // Background Particles
    // ========================
    function createParticles() {
        const container = $('#bgParticles');
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 4 + 2;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (Math.random() * 15 + 10) + 's';
            p.style.animationDelay = (Math.random() * 10) + 's';
            container.appendChild(p);
        }
    }
    createParticles();

    // ========================
    // Progress Bar
    // ========================
    function updateProgress(step) {
        $$('.progress-step').forEach((el, i) => {
            const s = i + 1;
            el.classList.toggle('active', s === step);
            el.classList.toggle('completed', s < step);
        });
        for (let i = 1; i <= 4; i++) {
            const fill = $(`#line${i}`);
            if (fill) fill.style.width = (i < step) ? '100%' : '0%';
        }
    }

    // ========================
    // Step Navigation
    // ========================
    function goToStep(step) {
        steps[currentStep].classList.remove('active');
        currentStep = step;
        steps[currentStep].classList.add('active');
        updateProgress(currentStep);
        $('.form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ========================
    // Validation
    // ========================
    function validateStep(step) {
        if (step === 1) {
            const name = customerNameInput.value.trim();
            if (!name) { shakeInput(customerNameInput); return false; }
            return true;
        }
        if (step === 2) {
            let store = storeNameInput.value;
            if (!store) { shakeInput(storeNameInput); return false; }
            if (store === 'Other') {
                store = customStoreNameInput.value.trim();
                if (!store) { shakeInput(customStoreNameInput); return false; }
            }
            return true;
        }
        if (step === 3) return capturedImage !== null;
        return true;
    }

    function shakeInput(el) {
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = 'shake 0.4s ease';
        el.focus();
        setTimeout(() => { el.style.animation = ''; }, 500);
    }

    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }`;
    document.head.appendChild(shakeStyle);

    // ========================
    // Category Selection
    // ========================
    $$('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCategory = btn.dataset.category;
        });
    });

    // ========================
    // Button Handlers & Form Logic
    // ========================

    // Store Dropdown Logic
    storeNameInput.addEventListener('change', () => {
        if (storeNameInput.value === 'Other') {
            customStoreGroup.style.display = 'block';
            customStoreNameInput.required = true;
        } else {
            customStoreGroup.style.display = 'none';
            customStoreNameInput.required = false;
            customStoreNameInput.value = '';
        }
    });

    $('#btnNext1').addEventListener('click', () => {
        if (validateStep(1)) {
            goToStep(2);
            loadMySlips(customerNameInput.value.trim());
        }
    });

    // Auto-load history when they type their name
    let typingTimer;
    customerNameInput.addEventListener('input', () => {
        clearTimeout(typingTimer);
        const name = customerNameInput.value.trim();
        if (name.length > 2) {
            typingTimer = setTimeout(() => loadMySlips(name), 800);
        } else {
            $('#mySlipsSection').style.display = 'none';
        }
    });
    customerNameInput.addEventListener('blur', () => {
        const name = customerNameInput.value.trim();
        if (name) loadMySlips(name);
    });

    $('#btnNext2').addEventListener('click', () => {
        if (validateStep(2)) goToStep(3);
    });
    $('#btnBack2').addEventListener('click', () => goToStep(1));

    $('#btnNext3').addEventListener('click', () => {
        if (validateStep(3)) { goToStep(4); runOCR(); }
    });
    $('#btnBack3').addEventListener('click', () => goToStep(2));

    $('#btnNext4').addEventListener('click', () => {
        saveTransaction();
    });
    $('#btnBack4').addEventListener('click', () => {
        resetOCRState();
        goToStep(3);
    });

    $('#btnNewScan').addEventListener('click', () => {
        resetForm();
        goToStep(1);
    });

    customerNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNext1').click(); });
    storeNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNext2').click(); });

    // ========================
    // File Upload
    // ========================
    $('#btnBrowse').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    uploadArea.addEventListener('click', (e) => { if (!e.target.closest('.btn')) fileInput.click(); });

    fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleImageFile(e.target.files[0]); });
    cameraInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleImageFile(e.target.files[0]); });

    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('dragover'); });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleImageFile(e.dataTransfer.files[0]);
    });

    function handleImageFile(file) {
        // Accept image/* types AND files with no MIME (iPhone HEIC often has empty type)
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|heic|heif|tiff?)$/i.test(file.name || '');
        if (!isImage && file.type) { alert('Please select a valid image file.'); return; }
        capturedImage = file;
        const url = URL.createObjectURL(file);
        previewImg.onload = () => { URL.revokeObjectURL(url); };
        previewImg.onerror = () => {
            // If native preview fails (HEIC), still allow proceeding
            console.warn('Preview failed, but image may still be processable.');
        };
        previewImg.src = url;
        imagePreview.style.display = 'block';
        uploadContent.style.display = 'none';
        cameraPreview.style.display = 'none';
        $('#btnNext3').disabled = false;
    }

    $('#btnRemoveImage').addEventListener('click', () => {
        capturedImage = null;
        imagePreview.style.display = 'none';
        uploadContent.style.display = '';
        previewImg.src = '';
        fileInput.value = '';
        cameraInput.value = '';
        $('#btnNext3').disabled = true;
    });

    // ========================
    // Camera
    // ========================
    $('#btnCamera').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (/Mobi|Android/i.test(navigator.userAgent)) { cameraInput.click(); return; }
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            cameraVideo.srcObject = cameraStream;
            cameraPreview.style.display = 'block';
            uploadContent.style.display = 'none';
        } catch (err) { cameraInput.click(); }
    });

    $('#btnCancelCamera').addEventListener('click', stopCamera);

    $('#btnCapture').addEventListener('click', () => {
        const ctx = cameraCanvas.getContext('2d');
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        ctx.drawImage(cameraVideo, 0, 0);
        cameraCanvas.toBlob((blob) => { handleImageFile(blob); stopCamera(); }, 'image/jpeg', 0.92);
    });

    function stopCamera() {
        if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
        cameraPreview.style.display = 'none';
        if (!capturedImage) uploadContent.style.display = '';
    }

    // ========================
    // Convert image to a canvas-based JPEG blob for maximum compatibility
    // ========================
    function convertImageToJpeg(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Limit max dimension to 2048 for faster OCR on mobile
                    const maxDim = 2048;
                    let w = img.naturalWidth;
                    let h = img.naturalHeight;
                    if (w > maxDim || h > maxDim) {
                        const scale = maxDim / Math.max(w, h);
                        w = Math.round(w * scale);
                        h = Math.round(h * scale);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);

                    // --- Image Pre-processing for better OCR ---
                    const imageData = ctx.getImageData(0, 0, w, h);
                    const data = imageData.data;
                    for (let i = 0; i < data.length; i += 4) {
                        // 1. Grayscale
                        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                        // 2. High Contrast / Threshold (makes text pop)
                        const contrast = 128;
                        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
                        let color = factor * (avg - 128) + 128;

                        // Clamp
                        if (color > 255) color = 255;
                        else if (color < 0) color = 0;

                        data[i] = color;     // red
                        data[i + 1] = color; // green
                        data[i + 2] = color; // blue
                    }
                    ctx.putImageData(imageData, 0, 0);
                    // ------------------------------------------

                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Failed to convert image'));
                    }, 'image/jpeg', 0.9);
                } catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error('Could not load image. Try a different photo.'));
            img.src = URL.createObjectURL(file);
        });
    }

    // ========================
    // OCR with Tesseract.js
    // ========================
    async function runOCR() {
        ocrProgress.style.display = '';
        extractedData.style.display = 'none';
        $('#step4Actions').style.display = 'none';
        ocrProgressFill.style.width = '0%';
        ocrStatus.textContent = 'Preparing image...';
        $('#step4Title').textContent = 'Scanning Receipt...';
        $('#step4Desc').textContent = 'Extracting data from your slip';
        $('#scanIcon').classList.add('scanning');

        let imageBlob;
        try {
            // Convert to JPEG for max browser/OCR compatibility
            imageBlob = await convertImageToJpeg(capturedImage);
            ocrStatus.textContent = 'Initializing OCR engine...';
            ocrProgressFill.style.width = '5%';
        } catch (convErr) {
            console.error('Image conversion error:', convErr);
            ocrStatus.textContent = 'Could not read this image. Try a JPG or PNG photo.';
            ocrProgressFill.style.width = '100%';
            ocrProgressFill.style.background = 'var(--danger, #e74c3c)';
            $('#step4Actions').style.display = '';
            $('#scanIcon').classList.remove('scanning');
            return;
        }

        try {
            const imageUrl = URL.createObjectURL(imageBlob);

            // Add a timeout so users aren't stuck forever
            const ocrTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('OCR timed out after 90 seconds. Try a clearer photo.')), 90000)
            );

            const ocrWork = (async () => {
                const worker = await Tesseract.createWorker('eng', 1, {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            const pct = Math.round(m.progress * 100);
                            ocrProgressFill.style.width = pct + '%';
                            ocrStatus.textContent = `Recognizing text... ${pct}%`;
                        } else if (m.status === 'loading language traineddata') {
                            ocrProgressFill.style.width = '15%';
                            ocrStatus.textContent = 'Loading language data (first time may take a moment)...';
                        } else if (m.status === 'initializing api') {
                            ocrProgressFill.style.width = '30%';
                            ocrStatus.textContent = 'Starting OCR engine...';
                        } else {
                            ocrStatus.textContent = m.status || 'Processing...';
                        }
                    }
                });

                const { data } = await worker.recognize(imageUrl);
                await worker.terminate();
                return data;
            })();

            const data = await Promise.race([ocrWork, ocrTimeout]);
            URL.revokeObjectURL(imageUrl);

            // Show results even if text is empty
            ocrProgress.style.display = 'none';
            extractedData.style.display = '';
            $('#step4Actions').style.display = '';
            $('#scanIcon').classList.remove('scanning');

            if (!data.text || data.text.trim().length === 0) {
                $('#step4Title').textContent = 'No Text Found';
                $('#step4Desc').textContent = 'Could not read text from this image. You can add items manually below.';
                rawText.textContent = '(no text detected)';
                renderItemsTable([]);
            } else {
                $('#step4Title').textContent = 'Review Extracted Data';
                $('#step4Desc').textContent = 'Edit any incorrectly scanned items below';
                rawText.textContent = data.text;
                parseReceiptData(data.text);
            }
        } catch (err) {
            console.error('OCR Error:', err);
            ocrStatus.textContent = err.message || 'Error scanning receipt. Please try again.';
            ocrProgressFill.style.width = '100%';
            ocrProgressFill.style.background = 'var(--danger, #e74c3c)';
            $('#step4Actions').style.display = '';
            $('#scanIcon').classList.remove('scanning');
        }
    }

    // ========================
    // Receipt Parser
    // ========================
    function parseReceiptData(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const items = [];
        let subtotal = '', tax = '', total = '';

        // Matches R 12.00 or just 12.00, ignoring trailing letters like " y" or "\"
        const priceRegex = /R?\s*(\d+[.,]\d{2}|\d{3,6})(?:[^\d]*)$/;
        const totalRegex = /(?:total|amount\s*due|balance\s*due|totaal)/i;
        const subtotalRegex = /(?:sub\s*total|subtotal|sub-total)/i;
        const taxRegex = /(?:vat|tax|btw|included)/i;
        const qtyPriceRegex = /(\d+)\s*[xX@]\s*R?\s*(\d+[.,]?\d{2})/;
        const skipRegex = /(?:change|cash|card|visa|mastercard|eft|debit|credit|rounding|tender|payment|receipt|invoice|tel|phone|fax|vat\s*no|reg\s*no|date|time|cashier|operator|thank|welcome|visit)/i;

        function formatPrice(val) {
            let p = val.replace(/[^0-9.,]/g, '').replace(',', '.');
            if (!p.includes('.')) {
                // e.g. "2739" -> "27.39"
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

                itemName = itemName.replace(/^[\-\*\s:=]+/, '').replace(/[\-\*\s]+$/, '').replace(/\s*R\s*$/, '').trim();

                // If item name is just "Price:" or empty because it wrapped from the line above
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

        // If OCR returned text, but we couldn't find ANY prices/items
        if (items.length === 0) {
            $('#step4Title').textContent = 'Scan Unclear';
            $('#step4Desc').innerHTML = `
                <div style="color:var(--text-secondary);margin-bottom:10px;">
                    Could not read any prices from this photo.
                </div>
                <ul style="font-size:0.9rem;text-align:left;background:var(--bg-secondary);padding:10px 10px 10px 25px;border-radius:6px;">
                    <li>Ensure the receipt is flat (not crumpled)</li>
                    <li>Take the photo from directly above</li>
                    <li>Avoid dark shadows over the text</li>
                </ul>
                <div style="margin-top:10px;">You can enter items manually below, or try taking a new photo.</div>
            `;
        }

        renderItemsTable(items);
        subtotalInput.value = subtotal;
        taxInput.value = tax;
        totalInput.value = total;

        if (!total && items.length > 0) {
            const calc = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.qty) || 1), 0);
            totalInput.value = calc.toFixed(2);
        }
    }

    function renderItemsTable(items) {
        itemsBody.innerHTML = '';
        if (items.length === 0) addItemRow('', '1', '0.00');
        else items.forEach(item => addItemRow(item.name, item.qty, item.price));
    }

    function addItemRow(name = '', qty = '1', price = '0.00') {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${escapeHtml(name)}" placeholder="Item name" class="item-name"></td>
            <td><input type="text" value="${qty}" placeholder="1" class="item-qty"></td>
            <td><input type="text" value="${price}" placeholder="0.00" class="item-price"></td>
            <td><button class="btn-row-delete" title="Remove"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></td>
        `;
        tr.querySelector('.btn-row-delete').addEventListener('click', () => { tr.remove(); recalcTotal(); });
        tr.querySelector('.item-price').addEventListener('input', recalcTotal);
        tr.querySelector('.item-qty').addEventListener('input', recalcTotal);
        itemsBody.appendChild(tr);
    }

    function recalcTotal() {
        let sum = 0;
        itemsBody.querySelectorAll('tr').forEach(row => {
            const price = parseFloat(row.querySelector('.item-price').value) || 0;
            const qty = parseInt(row.querySelector('.item-qty').value) || 1;
            sum += price * qty;
        });
        totalInput.value = sum.toFixed(2);
    }

    $('#btnAddItem').addEventListener('click', () => addItemRow());

    $('#btnToggleRaw').addEventListener('click', () => {
        const hidden = rawTextBox.style.display === 'none';
        rawTextBox.style.display = hidden ? '' : 'none';
        $('#btnToggleRaw').innerHTML = (hidden ? '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Hide Raw Text' : '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Show Raw Text');
    });

    // ========================
    // Save Transaction to Server
    // ========================
    async function saveTransaction() {
        const items = [];
        itemsBody.querySelectorAll('tr').forEach(row => {
            const name = row.querySelector('.item-name').value.trim();
            const qty = row.querySelector('.item-qty').value.trim();
            const price = row.querySelector('.item-price').value.trim();
            if (name) items.push({ name, qty, price });
        });

        const transaction = {
            customer: customerNameInput.value.trim(),
            store: storeNameInput.value === 'Other' ? customStoreNameInput.value.trim() : storeNameInput.value,
            branch: storeBranchInput.value.trim(),
            category: selectedCategory,
            items,
            subtotal: subtotalInput.value,
            tax: taxInput.value,
            total: totalInput.value,
            rawText: rawText.textContent
        };

        // Show saving state
        const btn = $('#btnNext4');
        const origText = btn.innerHTML;
        btn.innerHTML = '<span class="saving-spinner"></span> Saving...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });

            if (!res.ok) throw new Error('Failed to save');

            const data = await res.json();
            transaction.id = data.id;
            transaction.date = new Date().toISOString();

            renderSummary(transaction);
            goToStep(5);
            loadMySlips(transaction.customer);
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save transaction. Please try again.');
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    function renderSummary(t) {
        const categoryEmojis = {
            'Groceries': '🛒', 'Food & Dining': '🍽️', 'Outing': '🎭', 'Recreation': '⚽',
            'Transport': '🚗', 'Health': '💊', 'Shopping': '🛍️', 'Bills & Utilities': '📄', 'Other': '📦'
        };
        const itemsHtml = t.items.map(i => `${i.name} × ${i.qty} — R${i.price}`).join('<br>');
        $('#summaryCard').innerHTML = `
            <div class="summary-row">
                <span class="summary-label">Customer</span>
                <span class="summary-value">${escapeHtml(t.customer)}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Store</span>
                <span class="summary-value">${escapeHtml(t.store)}${t.branch ? ' – ' + escapeHtml(t.branch) : ''}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Category</span>
                <span class="summary-value">${categoryEmojis[t.category] || '📦'} ${t.category}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Items</span>
                <span class="summary-value summary-items">${itemsHtml || 'None'}</span>
            </div>
            <div class="summary-row">
                <span class="summary-label">Total</span>
                <span class="summary-value highlight">R ${t.total || '0.00'}</span>
            </div>
        `;
    }

    // ========================
    // My Slips (Customer's Own Data)
    // ========================
    async function loadMySlips(customerName) {
        if (!customerName) return;

        try {
            const res = await fetch(`/api/transactions/customer/${encodeURIComponent(customerName)}`);
            if (!res.ok) return;
            const data = await res.json();

            const section = $('#mySlipsSection');

            if (data.totalSlips === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = '';
            $('#slipCountBadge').textContent = data.totalSlips;

            // Category breakdown
            const categoryEmojis = {
                'Groceries': '🛒', 'Food & Dining': '🍽️', 'Outing': '🎭', 'Recreation': '⚽',
                'Transport': '🚗', 'Health': '💊', 'Shopping': '🛍️', 'Bills & Utilities': '📄', 'Other': '📦'
            };

            const breakdownEl = $('#categoryBreakdown');
            breakdownEl.innerHTML = data.categoryCounts.map(c => `
                <div class="cat-stat">
                    <span class="cat-stat-emoji">${categoryEmojis[c.category] || '📦'}</span>
                    <div class="cat-stat-info">
                        <span class="cat-stat-name">${c.category}</span>
                        <span class="cat-stat-detail">${c.count} slip${c.count !== 1 ? 's' : ''} · R ${(c.total_amount || 0).toFixed(2)}</span>
                    </div>
                </div>
            `).join('');

            // Recent slips list
            const listEl = $('#mySlipsList');
            listEl.innerHTML = '<h3>Recent Slips</h3>' + data.transactions.slice(0, 10).map(t => `
                <div class="slip-item">
                    <div class="slip-item-left">
                        <span class="slip-item-emoji">${categoryEmojis[t.category] || '📦'}</span>
                        <div>
                            <div class="slip-item-store">${escapeHtml(t.store)}</div>
                            <div class="slip-item-date">${formatDate(t.created_at)}</div>
                        </div>
                    </div>
                    <div class="slip-item-total">R ${t.total}</div>
                </div>
            `).join('');

        } catch (err) {
            console.error('Error loading my slips:', err);
        }
    }

    // ========================
    // Reset Helpers
    // ========================
    function resetForm() {
        customerNameInput.value = '';
        storeNameInput.value = '';
        customStoreNameInput.value = '';
        customStoreGroup.style.display = 'none';
        storeBranchInput.value = '';
        capturedImage = null;
        imagePreview.style.display = 'none';
        uploadContent.style.display = '';
        previewImg.src = '';
        fileInput.value = '';
        cameraInput.value = '';
        $('#btnNext3').disabled = true;
        selectedCategory = 'Groceries';
        $$('.category-btn').forEach(b => b.classList.remove('active'));
        $('.category-btn[data-category="Groceries"]').classList.add('active');
        $('#mySlipsSection').style.display = 'none';
        resetOCRState();
    }

    function resetOCRState() {
        ocrProgress.style.display = '';
        extractedData.style.display = 'none';
        $('#step4Actions').style.display = 'none';
        ocrProgressFill.style.width = '0%';
        ocrProgressFill.style.background = '';
        ocrStatus.textContent = 'Initializing OCR engine...';
        rawTextBox.style.display = 'none';
        itemsBody.innerHTML = '';
        subtotalInput.value = '';
        taxInput.value = '';
        totalInput.value = '';
    }

    // ========================
    // Utility
    // ========================
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return dateStr; }
    }

    // ========================
    // Initialize
    // ========================
    updateProgress(1);

    // Add saving spinner style
    const spinnerStyle = document.createElement('style');
    spinnerStyle.textContent = `.saving-spinner { display:inline-block; width:16px; height:16px; border:2px solid rgba(0,0,0,0.2); border-top-color:currentColor; border-radius:50%; animation:spin .6s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }`;
    document.head.appendChild(spinnerStyle);

})();

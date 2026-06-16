/* ============================================================
   SlipScan — Customer App Logic (v2 — Improved OCR & Scanning)
   Multi-step form, image preprocessing, OCR, receipt parsing
   ============================================================ */

(function () {
    'use strict';

    let currentStep = 1;
    let capturedImage = null;
    let cameraStream = null;
    let selectedCategory = 'Groceries';

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const steps = [null, $('#step1'), $('#step2'), $('#step3'), $('#step4'), $('#step5')];
    const customerNameInput = $('#customerName');
    const storeNameInput = $('#storeName');
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
        if (!container) return;
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
            const store = storeNameInput.value.trim();
            if (!store) { shakeInput(storeNameInput); return false; }
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
    shakeStyle.textContent = '@keyframes shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}';
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
    // Button Handlers
    // ========================
    $('#btnNext1').addEventListener('click', () => {
        if (validateStep(1)) { goToStep(2); loadMySlips(customerNameInput.value.trim()); }
    });
    $('#btnNext2').addEventListener('click', () => { if (validateStep(2)) goToStep(3); });
    $('#btnBack2').addEventListener('click', () => goToStep(1));
    $('#btnNext3').addEventListener('click', () => { if (validateStep(3)) { goToStep(4); runOCR(); } });
    $('#btnBack3').addEventListener('click', () => goToStep(2));
    $('#btnNext4').addEventListener('click', () => saveTransaction());
    $('#btnBack4').addEventListener('click', () => { resetOCRState(); goToStep(3); });
    $('#btnNewScan').addEventListener('click', () => { resetForm(); goToStep(1); });
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
        e.preventDefault(); uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleImageFile(e.dataTransfer.files[0]);
    });

    function handleImageFile(file) {
        if (!file.type.startsWith('image/') && !(file instanceof Blob)) {
            alert('Please select a valid image file.'); return;
        }
        capturedImage = file;
        previewImg.src = URL.createObjectURL(file);
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
    // Camera (improved for mobile)
    // ========================
    $('#btnCamera').addEventListener('click', async (e) => {
        e.stopPropagation();
        // On mobile, always use native camera picker (most reliable)
        if (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            cameraInput.click(); return;
        }
        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }
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
        cameraCanvas.toBlob((blob) => { handleImageFile(blob); stopCamera(); }, 'image/jpeg', 0.95);
    });

    function stopCamera() {
        if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
        cameraPreview.style.display = 'none';
        if (!capturedImage) uploadContent.style.display = '';
    }

    // ========================
    // IMAGE PREPROCESSING (key fix for OCR accuracy)
    // Converts to grayscale, enhances contrast, applies adaptive threshold
    // ========================
    function preprocessImage(imageSource) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let w = img.naturalWidth;
                let h = img.naturalHeight;

                // Scale up small images for better OCR accuracy
                const MIN_WIDTH = 1200;
                if (w < MIN_WIDTH) {
                    const scale = MIN_WIDTH / w;
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                // Cap to avoid memory issues
                const MAX_DIM = 3000;
                if (w > MAX_DIM || h > MAX_DIM) {
                    const ds = MAX_DIM / Math.max(w, h);
                    w = Math.round(w * ds);
                    h = Math.round(h * ds);
                }

                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);

                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                // 1. Convert to grayscale
                for (let i = 0; i < data.length; i += 4) {
                    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                    data[i] = data[i + 1] = data[i + 2] = gray;
                }

                // 2. Compute Otsu's threshold for adaptive binarization
                const histogram = new Array(256).fill(0);
                for (let i = 0; i < data.length; i += 4) histogram[data[i]]++;
                const totalPixels = w * h;
                let sum = 0;
                for (let i = 0; i < 256; i++) sum += i * histogram[i];
                let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
                for (let i = 0; i < 256; i++) {
                    wB += histogram[i];
                    if (wB === 0) continue;
                    const wF = totalPixels - wB;
                    if (wF === 0) break;
                    sumB += i * histogram[i];
                    const diff = sumB / wB - (sum - sumB) / wF;
                    const variance = wB * wF * diff * diff;
                    if (variance > maxVar) { maxVar = variance; threshold = i; }
                }

                // 3. Stretch contrast + apply soft threshold
                let minVal = 255, maxVal = 0;
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i] < minVal) minVal = data[i];
                    if (data[i] > maxVal) maxVal = data[i];
                }
                const range = maxVal - minVal || 1;
                for (let i = 0; i < data.length; i += 4) {
                    let val = ((data[i] - minVal) / range) * 255;
                    val = val < threshold ? Math.max(0, val * 0.6) : Math.min(255, val * 1.15 + 40);
                    data[i] = data[i + 1] = data[i + 2] = Math.round(val);
                }

                ctx.putImageData(imageData, 0, 0);
                canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
            };
            img.onerror = () => resolve(null);
            img.src = (typeof imageSource === 'string') ? imageSource : URL.createObjectURL(imageSource);
        });
    }

    // ========================
    // OCR with Tesseract.js (improved settings)
    // ========================
    async function runOCR() {
        ocrProgress.style.display = '';
        extractedData.style.display = 'none';
        $('#step4Actions').style.display = 'none';
        ocrProgressFill.style.width = '0%';
        ocrStatus.textContent = 'Preprocessing image...';
        $('#step4Title').textContent = 'Scanning Receipt...';
        $('#step4Desc').textContent = 'Enhancing image and extracting data';
        const scanIcon = $('#scanIcon');
        if (scanIcon) scanIcon.classList.add('scanning');

        try {
            ocrProgressFill.style.width = '5%';
            ocrStatus.textContent = 'Enhancing image for better accuracy...';

            const processedBlob = await preprocessImage(capturedImage);
            const imageToScan = processedBlob || capturedImage;
            const imageUrl = URL.createObjectURL(imageToScan);

            ocrProgressFill.style.width = '10%';
            ocrStatus.textContent = 'Loading OCR engine...';

            const worker = await Tesseract.createWorker('eng', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        const pct = 10 + Math.round(m.progress * 85);
                        ocrProgressFill.style.width = pct + '%';
                        ocrStatus.textContent = 'Recognizing text... ' + Math.round(m.progress * 100) + '%';
                    } else if (m.status === 'loading language traineddata') {
                        ocrProgressFill.style.width = '15%';
                        ocrStatus.textContent = 'Loading language data...';
                    } else if (m.status === 'initializing api') {
                        ocrProgressFill.style.width = '20%';
                        ocrStatus.textContent = 'Initializing OCR engine...';
                    }
                }
            });

            // Receipt-optimized Tesseract settings
            await worker.setParameters({
                tessedit_pageseg_mode: '6',
                preserve_interword_spaces: '1',
            });

            const { data } = await worker.recognize(imageUrl);
            await worker.terminate();
            URL.revokeObjectURL(imageUrl);

            ocrProgressFill.style.width = '100%';
            ocrStatus.textContent = 'Processing complete!';

            setTimeout(() => {
                ocrProgress.style.display = 'none';
                extractedData.style.display = '';
                $('#step4Actions').style.display = '';
                $('#step4Title').textContent = 'Review Extracted Data';
                $('#step4Desc').textContent = 'Edit any incorrectly scanned items below';
                if (scanIcon) scanIcon.classList.remove('scanning');
                rawText.textContent = data.text;
                parseReceiptData(data.text);
            }, 400);

        } catch (err) {
            console.error('OCR Error:', err);
            ocrStatus.textContent = 'Error scanning receipt. Please try again.';
            ocrProgressFill.style.width = '100%';
            ocrProgressFill.style.background = 'var(--danger)';
            $('#step4Actions').style.display = '';
            if (scanIcon) scanIcon.classList.remove('scanning');
        }
    }

    // ========================
    // RECEIPT PARSER (rewritten for SA receipts)
    // ========================
    function parseReceiptData(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1);
        const items = [];
        let subtotal = '', tax = '', total = '';

        const pricePatterns = [
            /R?\s*(\d{1,6}[.,]\d{2})\s*$/,
            /R\s*(\d{1,6}[.,]\d{2})/,
            /(\d{1,6}[.,]\d{2})\s*[A-Z]?\s*$/,
            /(\d{1,6}\.\d{2})/
        ];

        const totalLabels = /\b(total|totaal|amount\s*due|balance\s*due|nett?\s*total|grand\s*total|te\s*betaal)\b/i;
        const subtotalLabels = /\b(sub\s*total|subtotal|sub-total|sub\s*tot)\b/i;
        const taxLabels = /\b(vat|tax|btw|inclusive|incl\s*vat)\b/i;
        const changeLabels = /\b(change|wisselgeld)\b/i;
        const skipLine = /^(cash|card|visa|master\s*card|eft|debit|credit|rounding|tender|payment|receipt|invoice|tel|phone|fax|vat\s*no|vat\s*reg|reg\s*no|date|time|cashier|operator|thank|welcome|visit|address|branch|store|www\.|http|@|acc\s*no|ref|slip|trn|auth|approved|declined|saving|you\s*saved|loyalty|points|member|reward|discount\s*card|pos\s*id|terminal|merchant)/i;
        const discountPattern = /\b(discount|korting|less|minus|saving|promo)\b/i;

        for (let idx = 0; idx < lines.length; idx++) {
            const line = lines[idx];
            if (line.length < 3) continue;
            if (/^[\-=_*#]{3,}$/.test(line)) continue;
            if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(line)) continue;
            if (/^\d{1,2}:\d{2}/.test(line)) continue;

            if (skipLine.test(line) && !totalLabels.test(line) && !subtotalLabels.test(line) && !taxLabels.test(line)) {
                continue;
            }

            let priceMatch = null, price = '';
            for (const pattern of pricePatterns) {
                priceMatch = line.match(pattern);
                if (priceMatch) { price = priceMatch[1].replace(',', '.'); break; }
            }
            if (!price) continue;

            if (totalLabels.test(line) && !subtotalLabels.test(line)) { total = price; continue; }
            if (subtotalLabels.test(line)) { subtotal = price; continue; }
            if (taxLabels.test(line)) { tax = price; continue; }
            if (changeLabels.test(line)) continue;

            let itemName = line;
            if (priceMatch) {
                const priceIdx = line.lastIndexOf(priceMatch[0]);
                if (priceIdx > 0) itemName = line.substring(0, priceIdx);
            }

            itemName = itemName
                .replace(/^[\d]+\s*[xX@]\s*/, '')
                .replace(/R\s*$/, '')
                .replace(/\s*R\s*\d+[.,]\d{2}/, '')
                .replace(/^[\s\-\*\.,:;]+/, '')
                .replace(/[\s\-\*\.,:;]+$/, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            let qty = '1';
            const qtyPatterns = [/^(\d{1,3})\s*[xX@]\s*/, /\s+[xX@]\s*(\d{1,3})\s*$/, /^(\d{1,3})\s+(?=[A-Z])/];
            for (const qp of qtyPatterns) {
                const qm = itemName.match(qp);
                if (qm) {
                    const q = parseInt(qm[1]);
                    if (q > 0 && q < 100) { qty = qm[1]; itemName = itemName.replace(qm[0], '').trim(); }
                    break;
                }
            }

            if (itemName.length < 2) continue;
            if (/^\d+$/.test(itemName)) continue;
            if (discountPattern.test(itemName)) continue;

            items.push({ name: itemName, qty, price });
        }

        renderItemsTable(items);
        subtotalInput.value = subtotal;
        taxInput.value = tax;
        totalInput.value = total;

        if (!total && items.length > 0) {
            const calc = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);
            totalInput.value = calc.toFixed(2);
        }
    }

    function renderItemsTable(items) {
        itemsBody.innerHTML = '';
        if (items.length === 0) addItemRow('', '1', '0.00');
        else items.forEach(i => addItemRow(i.name, i.qty, i.price));
    }

    function addItemRow(name, qty, price) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><input type="text" value="' + escapeHtml(name || '') + '" placeholder="Item name" class="item-name"></td>' +
            '<td><input type="text" value="' + (qty || '1') + '" placeholder="1" class="item-qty"></td>' +
            '<td><input type="text" value="' + (price || '0.00') + '" placeholder="0.00" class="item-price"></td>' +
            '<td><button class="btn-row-delete" title="Remove"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></button></td>';
        tr.querySelector('.btn-row-delete').addEventListener('click', () => { tr.remove(); recalcTotal(); });
        tr.querySelector('.item-price').addEventListener('input', recalcTotal);
        tr.querySelector('.item-qty').addEventListener('input', recalcTotal);
        itemsBody.appendChild(tr);
    }

    function recalcTotal() {
        let sum = 0;
        itemsBody.querySelectorAll('tr').forEach(row => {
            const p = parseFloat(row.querySelector('.item-price').value) || 0;
            const q = parseInt(row.querySelector('.item-qty').value) || 1;
            sum += p * q;
        });
        totalInput.value = sum.toFixed(2);
    }

    $('#btnAddItem').addEventListener('click', () => addItemRow());
    $('#btnToggleRaw').addEventListener('click', () => {
        const hidden = rawTextBox.style.display === 'none';
        rawTextBox.style.display = hidden ? '' : 'none';
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
            store: storeNameInput.value.trim(),
            branch: storeBranchInput.value.trim(),
            category: selectedCategory,
            items: items,
            subtotal: subtotalInput.value,
            tax: taxInput.value,
            total: totalInput.value,
            rawText: rawText.textContent
        };

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
            renderSummary(transaction);
            goToStep(5);
            loadMySlips(transaction.customer);
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save transaction. Check the server is running.');
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    function renderSummary(t) {
        const emojis = { 'Groceries': '🛒', 'Food & Dining': '🍽️', 'Outing': '🎭', 'Recreation': '⚽', 'Transport': '🚗', 'Health': '💊', 'Shopping': '🛍️', 'Bills & Utilities': '📄', 'Other': '📦' };
        const itemsHtml = t.items.map(i => escapeHtml(i.name) + ' x' + i.qty + ' - R' + i.price).join('<br>');
        $('#summaryCard').innerHTML =
            '<div class="summary-row"><span class="summary-label">Customer</span><span class="summary-value">' + escapeHtml(t.customer) + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Store</span><span class="summary-value">' + escapeHtml(t.store) + (t.branch ? ' - ' + escapeHtml(t.branch) : '') + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Category</span><span class="summary-value">' + (emojis[t.category] || '📦') + ' ' + t.category + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Items</span><span class="summary-value summary-items">' + (itemsHtml || 'None') + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Total</span><span class="summary-value highlight">R ' + (t.total || '0.00') + '</span></div>';
    }

    // ========================
    // My Slips
    // ========================
    async function loadMySlips(customerName) {
        if (!customerName) return;
        try {
            const res = await fetch('/api/transactions/customer/' + encodeURIComponent(customerName));
            if (!res.ok) return;
            const data = await res.json();
            const section = $('#mySlipsSection');
            if (data.totalSlips === 0) { section.style.display = 'none'; return; }
            section.style.display = '';
            $('#slipCountBadge').textContent = data.totalSlips;
            const emojis = { 'Groceries': '🛒', 'Food & Dining': '🍽️', 'Outing': '🎭', 'Recreation': '⚽', 'Transport': '🚗', 'Health': '💊', 'Shopping': '🛍️', 'Bills & Utilities': '📄', 'Other': '📦' };

            $('#categoryBreakdown').innerHTML = data.categoryCounts.map(function(c) {
                return '<div class="cat-stat"><span class="cat-stat-emoji">' + (emojis[c.category] || '📦') + '</span><div class="cat-stat-info"><span class="cat-stat-name">' + c.category + '</span><span class="cat-stat-detail">' + c.count + ' slip' + (c.count !== 1 ? 's' : '') + ' - R ' + (c.total_amount || 0).toFixed(2) + '</span></div></div>';
            }).join('');

            $('#mySlipsList').innerHTML = '<h3>Recent Slips</h3>' + data.transactions.slice(0, 10).map(function(t) {
                return '<div class="slip-item"><div class="slip-item-left"><span class="slip-item-emoji">' + (emojis[t.category] || '📦') + '</span><div><div class="slip-item-store">' + escapeHtml(t.store) + '</div><div class="slip-item-date">' + formatDate(t.created_at) + '</div></div></div><div class="slip-item-total">R ' + t.total + '</div></div>';
            }).join('');
        } catch (err) { console.error('Error loading slips:', err); }
    }

    // ========================
    // Reset Helpers
    // ========================
    function resetForm() {
        customerNameInput.value = '';
        storeNameInput.value = '';
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
        var gb = $('.category-btn[data-category="Groceries"]');
        if (gb) gb.classList.add('active');
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

    function escapeHtml(str) {
        if (!str) return '';
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function formatDate(dateStr) {
        try {
            var d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch(e) { return dateStr; }
    }

    updateProgress(1);

    var spinnerStyle = document.createElement('style');
    spinnerStyle.textContent = '.saving-spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(0,0,0,0.2);border-top-color:currentColor;border-radius:50%;animation:spin .6s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(spinnerStyle);

})();

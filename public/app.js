/* ============================================================
   SlipScan - Customer App v3
   Photo capture + manual entry (no OCR)
   ============================================================ */

(function () {
    'use strict';

    let currentStep = 1;
    let capturedImage = null;
    let capturedImageBase64 = null;
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
        if (step === 4) {
            const total = totalInput.value.trim();
            if (!total || isNaN(parseFloat(total))) { shakeInput(totalInput); return false; }
            return true;
        }
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
    $('#btnNext3').addEventListener('click', () => {
        if (validateStep(3)) {
            compressAndStore(capturedImage).then(() => goToStep(4));
        }
    });
    $('#btnBack3').addEventListener('click', () => goToStep(2));
    $('#btnNext4').addEventListener('click', () => { if (validateStep(4)) saveTransaction(); });
    $('#btnBack4').addEventListener('click', () => goToStep(3));
    $('#btnNewScan').addEventListener('click', () => { resetForm(); goToStep(1); });
    customerNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNext1').click(); });
    storeNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNext2').click(); });
    totalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNext4').click(); });

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
        capturedImageBase64 = null;
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
    // Image Compression (for storage)
    // ========================
    function compressAndStore(imageSource) {
        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let w = img.naturalWidth;
                let h = img.naturalHeight;

                // Resize to max 1200px width for storage
                const MAX_W = 1200;
                if (w > MAX_W) {
                    h = Math.round(h * (MAX_W / w));
                    w = MAX_W;
                }
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(img, 0, 0, w, h);

                // Compress to JPEG quality 0.6 (~100-200KB)
                capturedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
                resolve();
            };
            img.onerror = () => { capturedImageBase64 = ''; resolve(); };
            img.src = (typeof imageSource === 'string') ? imageSource : URL.createObjectURL(imageSource);
        });
    }

    // ========================
    // Save Transaction
    // ========================
    async function saveTransaction() {
        const transaction = {
            customer: customerNameInput.value.trim(),
            store: storeNameInput.value.trim(),
            branch: storeBranchInput.value.trim(),
            category: selectedCategory,
            total: totalInput.value.trim(),
            subtotal: '',
            tax: '',
            slipImage: capturedImageBase64 || ''
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
            alert('Failed to save. Please check your connection and try again.');
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
        }
    }

    function renderSummary(t) {
        const emojis = { 'Groceries': '\uD83D\uDED2', 'Food & Dining': '\uD83C\uDF7D\uFE0F', 'Outing': '\uD83C\uDFAD', 'Recreation': '\u26BD', 'Transport': '\uD83D\uDE97', 'Health': '\uD83D\uDC8A', 'Shopping': '\uD83D\uDECD\uFE0F', 'Bills & Utilities': '\uD83D\uDCC4', 'Other': '\uD83D\uDCE6' };
        $('#summaryCard').innerHTML =
            '<div class="summary-row"><span class="summary-label">Customer</span><span class="summary-value">' + escapeHtml(t.customer) + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Store</span><span class="summary-value">' + escapeHtml(t.store) + (t.branch ? ' - ' + escapeHtml(t.branch) : '') + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Category</span><span class="summary-value">' + (emojis[t.category] || '\uD83D\uDCE6') + ' ' + t.category + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Total</span><span class="summary-value highlight">R ' + (t.total || '0.00') + '</span></div>' +
            '<div class="summary-row"><span class="summary-label">Slip Photo</span><span class="summary-value">\u2705 Saved</span></div>';
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
            const emojis = { 'Groceries': '\uD83D\uDED2', 'Food & Dining': '\uD83C\uDF7D\uFE0F', 'Outing': '\uD83C\uDFAD', 'Recreation': '\u26BD', 'Transport': '\uD83D\uDE97', 'Health': '\uD83D\uDC8A', 'Shopping': '\uD83D\uDECD\uFE0F', 'Bills & Utilities': '\uD83D\uDCC4', 'Other': '\uD83D\uDCE6' };

            $('#categoryBreakdown').innerHTML = data.categoryCounts.map(function(c) {
                return '<div class="cat-stat"><span class="cat-stat-emoji">' + (emojis[c.category] || '\uD83D\uDCE6') + '</span><div class="cat-stat-info"><span class="cat-stat-name">' + c.category + '</span><span class="cat-stat-detail">' + c.count + ' slip' + (c.count !== 1 ? 's' : '') + ' - R ' + (c.total_amount || 0).toFixed(2) + '</span></div></div>';
            }).join('');

            $('#mySlipsList').innerHTML = '<h3>Recent Slips</h3>' + data.transactions.slice(0, 10).map(function(t) {
                return '<div class="slip-item"><div class="slip-item-left"><span class="slip-item-emoji">' + (emojis[t.category] || '\uD83D\uDCE6') + '</span><div><div class="slip-item-store">' + escapeHtml(t.store) + '</div><div class="slip-item-date">' + formatDate(t.created_at) + '</div></div></div><div class="slip-item-total">R ' + t.total + '</div></div>';
            }).join('');
        } catch (err) { console.error('Error loading slips:', err); }
    }

    // ========================
    // Reset
    // ========================
    function resetForm() {
        customerNameInput.value = '';
        storeNameInput.value = '';
        storeBranchInput.value = '';
        totalInput.value = '';
        capturedImage = null;
        capturedImageBase64 = null;
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

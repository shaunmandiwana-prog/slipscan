/* ============================================================
   SlipScan — Dashboard Logic
   PIN auth, fetch stats, render Chart.js charts, transaction table
   ============================================================ */

(function () {
    'use strict';

    let adminPin = '';
    let allTransactions = [];
    let chartInstances = {};

    const $ = (sel) => document.querySelector(sel);

    // ========================
    // PIN Authentication
    // ========================
    const pinInput = $('#pinInput');
    const pinError = $('#pinError');

    $('#btnUnlock').addEventListener('click', attemptUnlock);
    pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptUnlock(); });

    async function attemptUnlock() {
        const pin = pinInput.value.trim();
        if (!pin) return;

        try {
            const res = await fetch('/api/stats', {
                headers: { 'X-Admin-Pin': pin }
            });

            if (res.status === 401) {
                pinError.style.display = '';
                pinInput.value = '';
                pinInput.focus();
                return;
            }

            if (!res.ok) throw new Error('Server error');

            adminPin = pin;
            $('#pinGate').style.display = 'none';
            $('#dashboard').style.display = '';
            loadDashboard();
        } catch (err) {
            console.error('Auth error:', err);
            pinError.textContent = 'Server error. Is the server running?';
            pinError.style.display = '';
        }
    }

    // ========================
    // Load Dashboard Data
    // ========================
    async function loadDashboard() {
        try {
            const [statsRes, txnRes] = await Promise.all([
                fetch('/api/stats', { headers: { 'X-Admin-Pin': adminPin } }),
                fetch('/api/transactions', { headers: { 'X-Admin-Pin': adminPin } })
            ]);

            const stats = await statsRes.json();
            allTransactions = await txnRes.json();

            renderKPIs(stats.overview);
            renderStoreChart(stats.byStore);
            renderCategoryChart(stats.byCategory);
            renderDailyChart(stats.dailyTrends);
            renderCustomerChart(stats.byCustomer);
            renderTopItems(stats.topItems);
            renderTransactionTable(allTransactions);
        } catch (err) {
            console.error('Load error:', err);
        }
    }

    // ========================
    // KPI Cards
    // ========================
    function renderKPIs(overview) {
        if (!overview) return;
        $('#kpiTransactions').textContent = overview.total_transactions;
        $('#kpiRevenue').textContent = 'R ' + formatNum(overview.total_revenue);
        $('#kpiCustomers').textContent = overview.unique_customers;
        $('#kpiAverage').textContent = 'R ' + formatNum(overview.avg_transaction);
    }

    // ========================
    // Chart Colors
    // ========================
    const chartColors = [
        '#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f87171',
        '#a78bfa', '#22d3ee', '#fb923c', '#f472b6', '#84cc16'
    ];

    const chartColorsBg = chartColors.map(c => c + '33');

    // ========================
    // Store Chart (Horizontal Bar)
    // ========================
    function renderStoreChart(data) {
        if (!data || data.length === 0) return;
        if (chartInstances.store) chartInstances.store.destroy();

        chartInstances.store = new Chart($('#chartStore'), {
            type: 'bar',
            data: {
                labels: data.map(d => d.store),
                datasets: [{
                    label: 'Total Spent (R)',
                    data: data.map(d => d.total_amount),
                    backgroundColor: chartColors.slice(0, data.length),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { color: 'rgba(148,163,184,0.08)' },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', weight: 600 } }
                    }
                }
            }
        });
    }

    // ========================
    // Category Chart (Doughnut)
    // ========================
    function renderCategoryChart(data) {
        if (!data || data.length === 0) return;
        if (chartInstances.category) chartInstances.category.destroy();

        chartInstances.category = new Chart($('#chartCategory'), {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.category),
                datasets: [{
                    data: data.map(d => d.total_amount),
                    backgroundColor: chartColors.slice(0, data.length),
                    borderWidth: 0,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#94a3b8',
                            font: { family: 'Inter', size: 11 },
                            padding: 12,
                            usePointStyle: true,
                            pointStyleWidth: 10
                        }
                    }
                }
            }
        });
    }

    // ========================
    // Daily Trends (Line Chart)
    // ========================
    function renderDailyChart(data) {
        if (!data || data.length === 0) return;
        if (chartInstances.daily) chartInstances.daily.destroy();

        chartInstances.daily = new Chart($('#chartDaily'), {
            type: 'line',
            data: {
                labels: data.map(d => {
                    const dt = new Date(d.date);
                    return dt.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
                }),
                datasets: [
                    {
                        label: 'Revenue (R)',
                        data: data.map(d => d.total_amount),
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#38bdf8'
                    },
                    {
                        label: 'Transactions',
                        data: data.map(d => d.count),
                        borderColor: '#818cf8',
                        backgroundColor: 'rgba(129, 140, 248, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: '#818cf8',
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(148,163,184,0.08)' },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(148,163,184,0.08)' },
                        ticks: { color: '#38bdf8', font: { family: 'Inter' } }
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        ticks: { color: '#818cf8', font: { family: 'Inter' } }
                    }
                }
            }
        });
    }

    // ========================
    // Top Customers (Bar)
    // ========================
    function renderCustomerChart(data) {
        if (!data || data.length === 0) return;
        if (chartInstances.customers) chartInstances.customers.destroy();

        chartInstances.customers = new Chart($('#chartCustomers'), {
            type: 'bar',
            data: {
                labels: data.map(d => d.customer),
                datasets: [{
                    label: 'Total Spent (R)',
                    data: data.map(d => d.total_amount),
                    backgroundColor: chartColors.slice(0, data.length),
                    borderRadius: 6,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', weight: 600 } }
                    },
                    y: {
                        grid: { color: 'rgba(148,163,184,0.08)' },
                        ticks: { color: '#64748b', font: { family: 'Inter' } }
                    }
                }
            }
        });
    }

    // ========================
    // Top Items List
    // ========================
    function renderTopItems(data) {
        const el = $('#topItemsList');
        if (!data || data.length === 0) {
            el.innerHTML = '<p class="empty-msg">No items yet</p>';
            return;
        }

        el.innerHTML = data.map((item, i) => `
            <div class="top-item">
                <span class="top-item-rank">${i + 1}</span>
                <span class="top-item-name">${escapeHtml(item.name)}</span>
                <span class="top-item-count">×${item.total_qty}</span>
            </div>
        `).join('');
    }

    // ========================
    // Transaction Table
    // ========================
    function renderTransactionTable(transactions) {
        const body = $('#txnBody');
        const noResults = $('#noResults');

        if (transactions.length === 0) {
            body.innerHTML = '';
            noResults.style.display = '';
            return;
        }

        noResults.style.display = 'none';
        body.innerHTML = transactions.map(t => `
            <tr data-id="${t.id}">
                <td>${formatDate(t.created_at)}</td>
                <td>${escapeHtml(t.customer)}</td>
                <td>${escapeHtml(t.store)}</td>
                <td><span class="cat-badge">${t.category || 'Other'}</span></td>
                <td>${t.items ? t.items.length : 0}</td>
                <td class="total-cell">R ${t.total}</td>
                <td><button class="btn-view" data-id="${t.id}">View</button></td>
            </tr>
        `).join('');

        // Attach view handlers
        body.querySelectorAll('.btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const txn = allTransactions.find(t => t.id === btn.dataset.id);
                if (txn) showDetail(txn);
            });
        });
    }

    // Search
    $('#searchInput').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        if (!q) {
            renderTransactionTable(allTransactions);
            return;
        }
        const filtered = allTransactions.filter(t =>
            t.customer.toLowerCase().includes(q) ||
            t.store.toLowerCase().includes(q) ||
            (t.category || '').toLowerCase().includes(q)
        );
        renderTransactionTable(filtered);
    });

    // ========================
    // Transaction Detail Modal
    // ========================
    function showDetail(t) {
        const itemsHtml = (t.items || []).map(i =>
            `<tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>R ${i.price}</td></tr>`
        ).join('');

        $('#modalContent').innerHTML = `
            <h3>Transaction Details</h3>
            <div class="modal-summary-row">
                <span class="modal-label">Customer</span>
                <span class="modal-value">${escapeHtml(t.customer)}</span>
            </div>
            <div class="modal-summary-row">
                <span class="modal-label">Store</span>
                <span class="modal-value">${escapeHtml(t.store)}${t.branch ? ' – ' + escapeHtml(t.branch) : ''}</span>
            </div>
            <div class="modal-summary-row">
                <span class="modal-label">Category</span>
                <span class="modal-value">${t.category || 'Other'}</span>
            </div>
            <div class="modal-summary-row">
                <span class="modal-label">Date</span>
                <span class="modal-value">${formatDate(t.created_at)}</span>
            </div>
            <table class="modal-items-table">
                <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
                <tbody>${itemsHtml || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No items</td></tr>'}</tbody>
            </table>
            ${t.subtotal ? `<div class="modal-summary-row"><span class="modal-label">Subtotal</span><span class="modal-value">R ${t.subtotal}</span></div>` : ''}
            ${t.tax ? `<div class="modal-summary-row"><span class="modal-label">Tax / VAT</span><span class="modal-value">R ${t.tax}</span></div>` : ''}
            <div class="modal-total">
                <span>Total</span>
                <span>R ${t.total || '0.00'}</span>
            </div>
        `;

        $('#modalOverlay').style.display = '';
    }

    $('#btnCloseModal').addEventListener('click', () => { $('#modalOverlay').style.display = 'none'; });
    $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) $('#modalOverlay').style.display = 'none'; });

    // ========================
    // Export CSV
    // ========================
    $('#btnExportCsv').addEventListener('click', () => {
        if (allTransactions.length === 0) return;

        let csv = 'Date,Customer,Store,Branch,Category,Items,Subtotal,Tax,Total\n';
        allTransactions.forEach(t => {
            const itemList = (t.items || []).map(i => `${i.name} x${i.qty}`).join('; ');
            csv += `"${formatDate(t.created_at)}","${t.customer}","${t.store}","${t.branch || ''}","${t.category || 'Other'}","${itemList}","${t.subtotal || ''}","${t.tax || ''}","${t.total || ''}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `slipscan_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    });

    // Refresh
    $('#btnRefresh').addEventListener('click', loadDashboard);

    // ========================
    // Utility
    // ========================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(dateStr) {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr || '';
            return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return dateStr || ''; }
    }

    function formatNum(n) {
        return (n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

})();

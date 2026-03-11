/* ============================================================
   SlipScan — Express Server
   SQLite database (sql.js), REST API, serves static files
   ============================================================ */

const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = '1234'; // Change this to your preferred PIN
const DB_PATH = path.join(__dirname, 'transactions.db');

let db;

// ========================
// Initialize Database
// ========================
async function initDB() {
    const SQL = await initSqlJs();

    // Load existing database if exists
    if (fs.existsSync(DB_PATH)) {
        const buffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    db.run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            customer TEXT NOT NULL,
            store TEXT NOT NULL,
            branch TEXT DEFAULT '',
            category TEXT DEFAULT 'Other',
            subtotal TEXT DEFAULT '0.00',
            tax TEXT DEFAULT '0.00',
            total TEXT DEFAULT '0.00',
            raw_text TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now', 'localtime'))
        )
    `);

    // Backwards compatibility for existing local database files
    try { db.run(`ALTER TABLE transactions ADD COLUMN age INTEGER DEFAULT 0`); } catch (e) { }
    try { db.run(`ALTER TABLE transactions ADD COLUMN purchase_date TEXT DEFAULT ''`); } catch (e) { }

    db.run(`
        CREATE TABLE IF NOT EXISTS transaction_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL,
            name TEXT NOT NULL,
            qty TEXT DEFAULT '1',
            price TEXT DEFAULT '0.00',
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        )
    `);

    // Create indexes
    try { db.run(`CREATE INDEX idx_transactions_customer ON transactions(customer)`); } catch (e) { }
    try { db.run(`CREATE INDEX idx_transactions_category ON transactions(category)`); } catch (e) { }
    try { db.run(`CREATE INDEX idx_transactions_created ON transactions(created_at)`); } catch (e) { }

    saveDB();
    console.log('  Database initialized.');
}

function saveDB() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Helper to run SELECT queries and get results as array of objects
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

function queryOne(sql, params = []) {
    const results = queryAll(sql, params);
    return results.length > 0 ? results[0] : null;
}

// ========================
// Middleware
// ========================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve dashboard at /dashboard
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ========================
// Admin PIN check middleware
// ========================
function requireAdmin(req, res, next) {
    const pin = req.headers['x-admin-pin'] || req.query.pin;
    if (pin !== ADMIN_PIN) {
        return res.status(401).json({ error: 'Invalid PIN' });
    }
    next();
}

// ========================
// API Routes
// ========================

// Save a new transaction
app.post('/api/transactions', (req, res) => {
    try {
        const { customer, age, store, branch, purchase_date, category, items, subtotal, tax, total, rawText } = req.body;

        if (!customer || !store) {
            return res.status(400).json({ error: 'Customer and store are required' });
        }

        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        db.run(
            `INSERT INTO transactions (id, customer, age, store, branch, purchase_date, category, subtotal, tax, total, raw_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, customer, parseInt(age) || 0, store, branch || '', purchase_date || '', category || 'Other', subtotal || '0.00', tax || '0.00', total || '0.00', rawText || '']
        );

        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (item.name) {
                    db.run(
                        `INSERT INTO transaction_items (transaction_id, name, qty, price) VALUES (?, ?, ?, ?)`,
                        [id, item.name, item.qty || '1', item.price || '0.00']
                    );
                }
            }
        }

        saveDB();
        res.json({ success: true, id });
    } catch (err) {
        console.error('Error saving transaction:', err);
        res.status(500).json({ error: 'Failed to save transaction' });
    }
});

// Get transactions for a specific customer (public)
app.get('/api/transactions/customer/:name', (req, res) => {
    try {
        const customerName = req.params.name;
        const transactions = queryAll(
            `SELECT * FROM transactions WHERE customer = ? ORDER BY created_at DESC`,
            [customerName]
        );

        for (const t of transactions) {
            t.items = queryAll(
                `SELECT name, qty, price FROM transaction_items WHERE transaction_id = ?`,
                [t.id]
            );
        }

        const categoryCounts = queryAll(
            `SELECT category, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
             FROM transactions WHERE customer = ?
             GROUP BY category ORDER BY count DESC`,
            [customerName]
        );

        res.json({ transactions, categoryCounts, totalSlips: transactions.length });
    } catch (err) {
        console.error('Error fetching customer transactions:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get all transactions (admin only)
app.get('/api/transactions', requireAdmin, (req, res) => {
    try {
        const transactions = queryAll(`SELECT * FROM transactions ORDER BY created_at DESC`);

        for (const t of transactions) {
            t.items = queryAll(
                `SELECT name, qty, price FROM transaction_items WHERE transaction_id = ?`,
                [t.id]
            );
        }

        res.json(transactions);
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get aggregated stats (admin only)
app.get('/api/stats', requireAdmin, (req, res) => {
    try {
        const overview = queryOne(`
            SELECT
                COUNT(*) as total_transactions,
                COALESCE(SUM(CAST(total AS REAL)), 0) as total_revenue,
                COUNT(DISTINCT customer) as unique_customers,
                COALESCE(AVG(CAST(total AS REAL)), 0) as avg_transaction
            FROM transactions
        `);

        const byStore = queryAll(`
            SELECT store, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY store ORDER BY total_amount DESC LIMIT 10
        `);

        const byCategory = queryAll(`
            SELECT category, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY category ORDER BY total_amount DESC
        `);

        const byCustomer = queryAll(`
            SELECT customer, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY customer ORDER BY total_amount DESC LIMIT 10
        `);

        const dailyTrends = queryAll(`
            SELECT DATE(created_at) as date, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
        `);

        const topItems = queryAll(`
            SELECT name, SUM(CAST(qty AS INTEGER)) as total_qty, SUM(CAST(price AS REAL) * CAST(qty AS INTEGER)) as total_value
            FROM transaction_items GROUP BY LOWER(name) ORDER BY total_qty DESC LIMIT 15
        `);

        const recentTransactions = queryAll(`
            SELECT id, customer, store, category, total, created_at
            FROM transactions ORDER BY created_at DESC LIMIT 20
        `);

        res.json({
            overview: overview || { total_transactions: 0, total_revenue: 0, unique_customers: 0, avg_transaction: 0 },
            byStore,
            byCategory,
            byCustomer,
            dailyTrends: dailyTrends.reverse(),
            topItems,
            recentTransactions
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Delete a transaction (admin only)
app.delete('/api/transactions/:id', requireAdmin, (req, res) => {
    try {
        db.run('DELETE FROM transaction_items WHERE transaction_id = ?', [req.params.id]);
        db.run('DELETE FROM transactions WHERE id = ?', [req.params.id]);
        saveDB();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete' });
    }
});

// ========================
// Start Server
// ========================
initDB().then(() => {
    app.listen(PORT, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════════╗');
        console.log('  ║          SlipScan Server Running         ║');
        console.log('  ╠══════════════════════════════════════════╣');
        console.log(`  ║  Customer:  http://localhost:${PORT}          ║`);
        console.log(`  ║  Dashboard: http://localhost:${PORT}/dashboard ║`);
        console.log(`  ║  Admin PIN: ${ADMIN_PIN}                        ║`);
        console.log('  ╚══════════════════════════════════════════╝');
        console.log('');
    });
}).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});

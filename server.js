/* ============================================================
   ZaData Express Server
   PostgreSQL database, REST API, serves static files
   ============================================================ */

const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// PostgreSQL connection — reads DATABASE_URL from environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// ========================
// Initialize Database Tables
// ========================
async function initDB() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                customer TEXT NOT NULL,
                age INTEGER DEFAULT 0,
                store TEXT NOT NULL,
                branch TEXT DEFAULT '',
                purchase_date TEXT DEFAULT '',
                payment_method TEXT DEFAULT 'Card (Debit/Credit)',
                category TEXT DEFAULT 'Other',
                subtotal TEXT DEFAULT '0.00',
                tax TEXT DEFAULT '0.00',
                total TEXT DEFAULT '0.00',
                raw_text TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS transaction_items (
                id SERIAL PRIMARY KEY,
                transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                qty TEXT DEFAULT '1',
                price TEXT DEFAULT '0.00'
            )
        `);
        await client.query('CREATE INDEX IF NOT EXISTS idx_txn_customer ON transactions(customer)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_txn_created ON transactions(created_at)');
        console.log('  Database initialized (PostgreSQL).');
    } finally {
        client.release();
    }
}

// ========================
// Middleware
// ========================
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

function requireAdmin(req, res, next) {
    const pin = req.headers['x-admin-pin'] || req.query.pin;
    if (pin !== ADMIN_PIN) return res.status(401).json({ error: 'Invalid PIN' });
    next();
}

// ========================
// API Routes
// ========================

// Save a new transaction
app.post('/api/transactions', async (req, res) => {
    try {
        const { customer, age, store, branch, purchase_date, payment_method, category, items, subtotal, tax, total, rawText } = req.body;
        if (!customer || !store) return res.status(400).json({ error: 'Customer and store are required' });

        const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        await pool.query(
            `INSERT INTO transactions (id, customer, age, store, branch, purchase_date, payment_method, category, subtotal, tax, total, raw_text)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [id, customer, parseInt(age)||0, store, branch||'', purchase_date||'', payment_method||'Card (Debit/Credit)', category||'Other', subtotal||'0.00', tax||'0.00', total||'0.00', rawText||'']
        );

        if (items && Array.isArray(items)) {
            for (const item of items) {
                if (item.name) {
                    await pool.query(
                        'INSERT INTO transaction_items (transaction_id, name, qty, price) VALUES ($1,$2,$3,$4)',
                        [id, item.name, item.qty||'1', item.price||'0.00']
                    );
                }
            }
        }
        res.json({ success: true, id });
    } catch (err) {
        console.error('Error saving transaction:', err);
        res.status(500).json({ error: 'Failed to save transaction' });
    }
});

// Get transactions for a specific customer (public - for user spending summary)
app.get('/api/transactions/customer/:name', async (req, res) => {
    try {
        const { rows: transactions } = await pool.query(
            'SELECT * FROM transactions WHERE LOWER(customer)=LOWER($1) ORDER BY created_at DESC',
            [req.params.name]
        );
        for (const t of transactions) {
            const { rows } = await pool.query(
                'SELECT name,qty,price FROM transaction_items WHERE transaction_id=$1', [t.id]
            );
            t.items = rows;
        }
        const { rows: categoryCounts } = await pool.query(
            `SELECT category, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
             FROM transactions WHERE LOWER(customer)=LOWER($1) GROUP BY category ORDER BY count DESC`,
            [req.params.name]
        );
        res.json({ transactions, categoryCounts, totalSlips: transactions.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

// Get all transactions (admin only)
app.get('/api/transactions', requireAdmin, async (req, res) => {
    try {
        const { rows: transactions } = await pool.query('SELECT * FROM transactions ORDER BY created_at DESC');
        for (const t of transactions) {
            const { rows } = await pool.query(
                'SELECT name,qty,price FROM transaction_items WHERE transaction_id=$1', [t.id]
            );
            t.items = rows;
        }
        res.json(transactions);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

// Get aggregated stats (admin only)
app.get('/api/stats', requireAdmin, async (req, res) => {
    try {
        const { rows: [overview] } = await pool.query(`
            SELECT COUNT(*) as total_transactions,
                COALESCE(SUM(CAST(total AS REAL)),0) as total_revenue,
                COUNT(DISTINCT customer) as unique_customers,
                COALESCE(AVG(CAST(total AS REAL)),0) as avg_transaction
            FROM transactions
        `);
        const { rows: byStore } = await pool.query(`
            SELECT store, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY store ORDER BY total_amount DESC LIMIT 10
        `);
        const { rows: byCategory } = await pool.query(`
            SELECT category, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY category ORDER BY total_amount DESC
        `);
        const { rows: byCustomer } = await pool.query(`
            SELECT customer, COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY customer ORDER BY total_amount DESC LIMIT 10
        `);
        const { rows: byPaymentMethod } = await pool.query(`
            SELECT payment_method, COUNT(*) as count FROM transactions GROUP BY payment_method ORDER BY count DESC
        `);
        const { rows: byAgeGroup } = await pool.query(`
            SELECT
                CASE WHEN age<18 THEN 'Under 18' WHEN age BETWEEN 18 AND 24 THEN '18-24'
                     WHEN age BETWEEN 25 AND 34 THEN '25-34' WHEN age BETWEEN 35 AND 44 THEN '35-44'
                     WHEN age BETWEEN 45 AND 54 THEN '45-54' ELSE '55+' END as age_group,
                COUNT(*) as count, SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY age_group ORDER BY count DESC
        `);
        const { rows: dailyTrends } = await pool.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count,
                SUM(CAST(total AS REAL)) as total_amount
            FROM transactions GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
        `);
        const { rows: topItems } = await pool.query(`
            SELECT name, SUM(CAST(qty AS INTEGER)) as total_qty,
                SUM(CAST(price AS REAL)*CAST(qty AS INTEGER)) as total_value
            FROM transaction_items GROUP BY LOWER(name) ORDER BY total_qty DESC LIMIT 15
        `);
        res.json({
            overview: overview || { total_transactions:0, total_revenue:0, unique_customers:0, avg_transaction:0 },
            byStore, byCategory, byCustomer, byPaymentMethod, byAgeGroup,
            dailyTrends: dailyTrends.reverse(), topItems
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// Delete a transaction (admin only)
app.delete('/api/transactions/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM transactions WHERE id=$1', [req.params.id]);
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
        console.log('  +==========================================+');
        console.log('  |        ZaData Server Running            |');
        console.log('  +==========================================+');
        console.log(`  |  Customer:  http://localhost:${PORT}         |`);
        console.log(`  |  Dashboard: http://localhost:${PORT}/dashboard|`);
        console.log('  +==========================================+');
        console.log('');
    });
}).catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});

# SlipScan 🧾

A receipt scanner & spending tracker with an admin analytics dashboard.

## Features

- 📱 **Mobile-friendly** — scan receipts from any phone
- 🏷️ **Spending categories** — Groceries, Food & Dining, Transport, Health, etc.
- 📊 **Admin Dashboard** — PIN-protected analytics with charts & export
- 👥 **Multi-user** — each customer sees only their own slips

## Quick Start

```bash
npm install
npm start
```

- **Customer page**: http://localhost:3000
- **Admin dashboard**: http://localhost:3000/dashboard (PIN: `1234`)

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (sql.js)
- **Frontend**: Vanilla HTML/CSS/JS
- **OCR**: Tesseract.js (client-side)

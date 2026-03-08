# InventoryApp

A **portable, offline-first** stock inventory desktop app built with Electron and SheetJS.  
All data is stored in `./data/inventory.xlsx` — no server, no cloud, no installation required.

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode
npm start

# 3. Create a manual backup
npm run backup
```

---

## Building a Portable Distribution

### Windows (portable .exe)
```bash
npm run build:portable
```

Clean previous portable output first:
```bash
npm run build:portable:clean
```

Build and create a share-ready zip:
```bash
npm run package:zip
```

Outputs:
- `dist/InventoryApp-win-portable.exe`
- `dist/InventoryApp-Portable/` (ready-to-copy portable folder)
- `dist/InventoryApp-Portable.zip` (send this to other users)

Copy and paste the whole folder below to another location/PC:
```
dist/InventoryApp-Portable/
  InventoryApp-win-portable.exe
  data/
    inventory.xlsx
    assets/
```

If `inventory.xlsx` is missing, the app creates it automatically on first launch.

### macOS (.app zipped)
```bash
npm run build:mac
```
Output: `dist/InventoryApp-mac.zip`

Unzip and place `InventoryApp.app` beside a `data/` folder:
```
InventoryApp-mac/
  InventoryApp.app
  data/
    inventory.xlsx
    assets/
```

> **macOS note on data location:** On macOS, the `.app` bundle contains the executable deep inside (`Contents/MacOS/`). The app looks for `data/` **three levels up** from the executable — i.e., in the same folder as the `.app` itself. If macOS Gatekeeper blocks writing there, move the entire `InventoryApp-mac/` folder out of `/Applications` and into your home directory or Desktop.

---

## File Structure

```
inventory-app/
├── src/
│   ├── main/          # Electron main process (main.js, menu.js, print.js)
│   ├── preload/       # Secure IPC bridge (preload.js)
│   ├── renderer/      # UI (index.html, styles.css, app.js, views/)
│   ├── domain/        # Business rules (inventory.js, reports.js)
│   ├── db/            # Excel I/O (excel.js, schema.js)
│   └── util/          # Helpers (id.js, date.js)
├── scripts/
│   └── backup.js      # Manual backup script
├── data/              # Created automatically on first run
│   ├── inventory.xlsx # THE database — back this up regularly!
│   └── assets/
│       └── logo.png   # Your company logo
└── README.md
```

---

## Features

| Feature | Details |
|---|---|
| **Add Stocks** | Record incoming inventory with optional employee attribution; multi-item per transaction |
| **Less Stocks** | Issue stock to employees; balance validated per line; prevents negative balances |
| **Reports** | Print or export PDF by date range, month, department, or employee |
| **Settings** | Company info, logo, signatories, and full CRUD for departments/employees/stocks |
| **History** | Right-panel timeline of all movements with date/type/employee filters |
| **Backup** | One-click backup to `data/backups/` or via `npm run backup` |
| **Offline** | 100% offline; no internet dependency |

---

## Data Model (inventory.xlsx sheets)

| Sheet | Description |
|---|---|
| `Settings` | Company name, address, phone, logo path, 3 signatories |
| `Departments` | department_id, department_name, is_active |
| `Employees` | employee_id, employee_name, department_id, is_active |
| `Stocks` | stock_id, stock_name, uom, is_active |
| `Movements` | Immutable history: movement_id, date, type (ADD/LESS), employee, department, stock, qty, note |
| `Balances_Employee_Stock` | Computed cache: employee_id, stock_id, balance_qty |

> **Movements are append-only.** Never delete rows from the Movements sheet — they are the audit trail.

---

## Backup & Restore

**Via the UI:** Settings → Data Tools → Create Backup  
**Via CLI:** `npm run backup` or `npm run backup -- --keep=20`  
Backups are saved to `data/backups/inventory-<timestamp>.xlsx` and old files are pruned (default keep last 10).

**Auto Backup:** Settings → Data Tools → Auto Backup  
Enable/disable automatic backups, set interval in hours, and choose how many backups to retain.

**Restore:** Settings → Data Tools → Restore from Backup → pick a `.xlsx` file.

---

## Future Extensions

- **Multi-user / server mode:** Replace SheetJS with SQLite (via `better-sqlite3`) or PostgreSQL. The domain layer (`inventory.js`, `reports.js`) needs no changes — only `db/excel.js` would be swapped.
- **Barcode scanning:** Add a barcode input field in Add/Less Stocks that maps to stock_id.
- **Email reports:** Add `nodemailer` in the main process to send PDF reports.
- **Audit log viewer:** Add a read-only History tab showing all Movements with full details.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| App opens but data doesn't save | Check that `data/` exists beside the executable and is writable |
| Logo not showing in reports | Re-upload logo via Settings → General; ensure `data/assets/logo.png` exists |
| macOS: "App is damaged" | Right-click → Open, or run `xattr -cr InventoryApp.app` in Terminal |
| Blank white screen on launch | Run in dev mode (`npm start`) and open DevTools (View → Toggle DevTools) |

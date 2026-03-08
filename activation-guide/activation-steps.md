# InventoryApp License Activation Guide

This guide explains how to request and activate a license token for your portable InventoryApp.

---

## For Users

### 1. Launch the App
- Plug the USB drive into your Windows PC.
- Double-click `InventoryApp_v1.0.0_Offline.exe`.

### 2. Find Your Machine ID
- The app will show a license activation screen.
- Copy the Machine ID shown (e.g., `A1B2C3D4E5F6G7H8I9J0`).

### 3. Request a License Token
- Send your Machine ID to your administrator (email, chat, etc.).

### 4. Receive Your License Token
- The administrator will send you a license token.

### 5. Activate Your App
- Paste the license token into the activation box in the app.
- Click Activate.
- If valid, your app is now ready to use!

---

## For Administrators

### 1. Generate a License Token
- Open a terminal in your InventoryApp project folder.
- Run the following command:

  **For 1 month license:**
  ```
  npm run license:issue -- --machine <MACHINE_ID> --duration 1m --customer "Branch Name"
  ```

  **For 1 year license:**
  ```
  npm run license:issue -- --machine <MACHINE_ID> --duration 1y --customer "Branch Name"
  ```

  **For short trial (e.g., 1 hour):**
  ```
  npm run license:issue -- --machine <MACHINE_ID> --duration 1h --customer "Branch Name"
  ```

  Replace `<MACHINE_ID>` and `"Branch Name"` as needed.

### 2. Send the Token to the User
- Copy the generated token and send it to the user.

---

## Troubleshooting
- If the app says "License expired" or "Invalid license," request a new token from your administrator.
- Make sure you are using the correct Machine ID for your PC.

---

**For any issues, contact your administrator.**

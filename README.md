# InventoryApp Portable

Welcome to your offline-first inventory management system. This application is designed to run entirely from this USB drive without requiring installation or an internet connection.

## How To Launch

1. Plug this USB drive into any Windows 10 or 11 computer.
2. Open the USB folder in File Explorer.
3. Double-click `InventoryApp_v1.0.0_Offline.exe`.

Note: If Windows SmartScreen appears, click `More Info` and then `Run Anyway`.

## Activating Your License

This application is hardware-locked to your specific PC for security.

1. Launch the app and go to the `Settings` tab.
2. Locate your Machine ID (example: `A1B2-C3D4-...`).
3. Send this ID to your administrator to receive your License Token.
4. Paste the token into the activation box in `Settings` and click `Activate`.

## Data And Backups

Data storage: All your records are saved in `app_data/inventory.xlsx` on this USB.

Automatic backups: The app creates timestamped copies of your data in `app_data/backups/` every 10 minutes while open.

Safety tip: Always close the application before unplugging the USB drive to prevent data corruption.

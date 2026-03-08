---
name: offline-portable-pc-architect
description: Design and implement offline-first Electron desktop apps packaged as Windows portable builds. Use when enforcing local-only persistence, portable data paths beside the executable, bundled local assets (no CDN/API), and electron-builder portable configuration and validation.
---

# Offline Portable PC Architect

Use this workflow when building or refactoring Electron apps that must run fully offline and remain portable across PCs.

## Apply Core Rules

1. Persist all runtime data locally inside the app folder (`SQLite` or local JSON files).
2. Avoid external API calls for required functionality.
3. Avoid CDN-hosted runtime dependencies; bundle assets and libraries locally.
4. Package Windows builds with `electron-builder` portable target.

## Set Portable Data Path

In main process startup, set `userData` beside the executable for packaged mode.

```js
const { app } = require('electron');
const path = require('path');

if (app.isPackaged) {
	const userDataPath = path.join(path.dirname(process.execPath), 'app_data');
	app.setPath('userData', userDataPath);
}
```

Keep development mode writable and separate.

## Enforce Local Resource Loading

- Load fonts/icons/assets from packaged files only.
- Resolve paths with `app.getAppPath()` or paths derived from `process.execPath` for portable runtime.
- Keep renderer-safe file resolution through preload or main IPC when needed.

## Apply Portable Build Config

Use `electron-builder` portable settings and explicit file inclusion.

```json
{
	"build": {
		"win": { "target": "portable" },
		"portable": {
			"artifactName": "${productName}_v${version}_Offline.${ext}",
			"requestExecutionLevel": "user"
		},
		"files": ["dist/**/*", "node_modules/**/*", "main.js", "preload.js"]
	}
}
```

Adapt `files` for real project structure.

## Validate Before Handoff

Run this checklist:

1. Disconnect network and confirm core workflows still work.
2. Launch portable `.exe` from a USB-like folder and confirm data writes into sibling `app_data`.
3. Move the portable folder to another path and relaunch; confirm data remains self-contained.
4. Confirm no runtime requests to remote hosts.
5. Confirm all UI assets load without internet.

## Guard Against Common Breaks

- Do not rely on `%AppData%` for required business data in packaged mode.
- Do not hardcode absolute machine-specific file paths.
- Do not import runtime CSS/fonts/scripts from remote URLs.
- Do not mix local and cloud persistence without an explicit offline fallback contract.


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run in development (hot reload)
cd InkNote && dotnet watch run

# Run normally
cd InkNote && dotnet run

# Build
cd InkNote && dotnet build

# Publish (output goes to repo root per .csproj config)
cd InkNote && dotnet publish -c Release
```

The app serves on `http://0.0.0.0:5000` (configured in `appsettings.json`). There are no tests.

## Architecture

**InkNote** is a self-hosted digital notebook app with a freehand drawing canvas. It's a single-project ASP.NET Core 10 app (minimal API style) that serves a vanilla JS SPA from `wwwroot/`.

### Backend (C#)

- `Program.cs` — wires up EF Core (SQLite), `IHttpClientFactory`, static files, and auto-creates the DB schema on startup via `EnsureCreated()`.
- `Data/AppDbContext.cs` — two tables: `Notebooks` and `Pages`, both indexed on `UpdatedAt`.
- `Models/Models.cs` — entity classes plus record DTOs/requests for all API surfaces.
- Three controllers under `Controllers/`:
  - `NotebooksController` — CRUD for notebooks + page listing/creation nested under `/api/notebooks/{id}/pages`.
  - `PagesController` — page title rename, delete, and drawing load/save under `/api/pages/{id}/...`.
  - `LinkPreviewController` — server-side scraper at `/api/linkpreview?url=...`; handles YouTube as a special case (returns embed ID without fetching), fetches OG/Twitter meta tags for all other URLs via `HtmlAgilityPack`.

Drawing data (`Page.DrawingData`) is stored as a raw `byte[]` — the client gzip-compresses JSON to base64 before sending and decompresses on load. The server stores the raw bytes decoded from base64.

### Frontend (Vanilla JS ES modules)

All JS lives in `wwwroot/js/` and is loaded as ES modules via `index.html`.

- `app.js` — application shell: initializes subsystems, manages sidebar state (notebooks/pages list), schedules auto-saves (2 s debounce), and wires toolbar buttons to the engine.
- `canvas-engine.js` (`CanvasEngine` class) — all drawing logic. Uses a two-canvas approach: `committed` (all finalized strokes) and `active` (current in-progress stroke). Handles pointer events, pinch-to-zoom gestures, pen/touch palm rejection, pan with spacebar or middle mouse, and undo/redo (stack of `{type, stroke|embed}` operations). Pen types: `pen`, `pencil`, `brush`, `marker`, `eraser`.
- `embeds.js` (`EmbedManager` class) — manages link/YouTube embed cards as absolutely-positioned DOM overlays on top of the canvas. Paste a URL to trigger a preview fetch and place a card; cards are draggable and tracked in `engine.embeds[]` so they persist with the drawing data.
- `api.js` — thin fetch wrappers for all REST endpoints plus `compressData`/`decompressData` using the browser's `CompressionStream` API (gzip).
- `color-picker.js` — standalone color picker component.

### Data flow for saving

`CanvasEngine.onChange` → `scheduleSave()` in `app.js` → debounce 2 s → `engine.getData()` returns `{version, strokes, embeds}` → `api.compressData()` (gzip → base64) → `PUT /api/pages/{id}/drawing` with `{compressedData}`.

On load: `GET /api/pages/{id}/drawing` → base64 → `api.decompressData()` → `engine.loadData()`.

### Key constraints

- The SQLite DB file (`inknote.db`) sits in the project directory and is excluded from static file serving by default. Release publish outputs to the repo root (`../`).
- No authentication — single-user local app.
- No bundler or build step for the frontend; plain ES modules loaded directly by the browser.

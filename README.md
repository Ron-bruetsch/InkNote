# InkNote

A self-hosted digital notebook app with a freehand drawing canvas. No accounts, no cloud — runs entirely on your machine and stores everything locally in SQLite.

## Features

- **Freehand drawing** with five pen types: pen, pencil, brush, marker, and eraser
- **Notebooks and pages** — organize your notes into notebooks with multiple pages each
- **Undo/redo** with full stroke history
- **Pan and zoom** — spacebar + drag, middle-mouse drag, or pinch-to-zoom on touch
- **Palm rejection** — ignores touch input when a stylus is detected
- **Link embeds** — paste a URL to generate a preview card on the canvas; YouTube links get an inline embed
- **Auto-save** — drawing changes are debounced and saved automatically every 2 seconds
- **Efficient storage** — drawing data is gzip-compressed in the browser before upload

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core 10 (minimal API style) |
| Database | SQLite via Entity Framework Core |
| Frontend | Vanilla JS ES modules (no bundler) |
| Link previews | HtmlAgilityPack (server-side OG/Twitter tag scraping) |

## Requirements

- [.NET 10 SDK](https://dotnet.microsoft.com/download)

## Running

```bash
# Development (hot reload)
cd InkNote && dotnet watch run

# Production
cd InkNote && dotnet run
```

The app is available at `http://localhost:5000`.

The SQLite database (`inknote.db`) is created automatically on first run in the project directory.

## Building

```bash
cd InkNote && dotnet build
```

## Publishing

```bash
cd InkNote && dotnet publish -c Release
```

Output is written to the repo root.

## Project Structure

```
InkNote/
├── Controllers/
│   ├── NotebooksController.cs   # CRUD for notebooks; page listing/creation
│   ├── PagesController.cs       # Page rename, delete, drawing load/save
│   └── LinkPreviewController.cs # Server-side URL scraper for embed cards
├── Data/
│   └── AppDbContext.cs          # EF Core context (Notebooks + Pages tables)
├── Models/
│   └── Models.cs                # Entity classes and DTOs
├── Program.cs                   # App bootstrap and middleware wiring
└── wwwroot/
    ├── index.html
    └── js/
        ├── app.js               # App shell: sidebar, toolbar, auto-save
        ├── canvas-engine.js     # All drawing logic (two-canvas architecture)
        ├── embeds.js            # URL/YouTube embed card management
        ├── api.js               # REST fetch wrappers + gzip compression
        └── color-picker.js      # Color picker component
```

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notebooks` | List all notebooks |
| `POST` | `/api/notebooks` | Create a notebook |
| `PUT` | `/api/notebooks/{id}` | Rename a notebook |
| `DELETE` | `/api/notebooks/{id}` | Delete a notebook and its pages |
| `GET` | `/api/notebooks/{id}/pages` | List pages in a notebook |
| `POST` | `/api/notebooks/{id}/pages` | Create a page |
| `PUT` | `/api/pages/{id}` | Rename a page |
| `DELETE` | `/api/pages/{id}` | Delete a page |
| `GET` | `/api/pages/{id}/drawing` | Load drawing data |
| `PUT` | `/api/pages/{id}/drawing` | Save drawing data |
| `GET` | `/api/linkpreview?url=...` | Fetch OG metadata for a URL |

## Notes

- Single-user only — no authentication.
- No build step for the frontend; ES modules are loaded directly by the browser.

# InkNote

A self-hosted digital notebook app with freehand drawing and OSINT investigation mindmaps. No accounts, no cloud — runs entirely on your machine and stores everything locally in SQLite.

## Features

### Freehand canvas
- Five pen types: pen, pencil, brush, marker, eraser
- Notebooks and pages — organize notes into notebooks with multiple pages
- Undo/redo with full stroke history
- Pan and zoom — spacebar + drag, middle-mouse, or pinch-to-zoom on touch
- Palm rejection — ignores touch input when a stylus is detected
- Embeds — paste a URL for a preview card; YouTube links get an inline embed; paste an image to place it on the canvas
- Text blocks, sticky notes, and syntax-highlighted code blocks
- Auto-save every 2 minutes; manual save with Ctrl+S

### OSINT investigations (mindmap mode)
- Create investigations alongside notebooks — each has its own graph and canvas
- Add entity nodes by type: **person, org, domain, IP, email, username, phone, URL**
- Connect nodes with labeled edges; right-click any node for enrichment and graph actions
- One-click OSINT enrichment per entity type:
  - **Domain** → DNS lookup (A/AAAA/MX/NS/TXT/CNAME via Cloudflare DoH), subdomain enumeration (crt.sh certificate transparency + common wordlist probe), WHOIS via RDAP
  - **IP** → geolocation / ASN / PTR via ipinfo.io; open ports, banners, CVEs via Shodan
  - **Email** → breach exposure via HaveIBeenPwned
  - **Username** → social platform correlation across 23 platforms (GitHub, Reddit, Telegram, TikTok, YouTube, Twitch, Instagram, Twitter/X, and more)
  - **Person** → LinkedIn profile analysis: fetch public profile by URL, or paste full profile text (copied while logged in) for complete skills/interests/experience analysis; generates a structured social engineering report with per-vulnerability attack vectors, example lures, recommended pretext approaches, and SE risk rating (low → critical)
- Enrichment results show suggested nodes; select which ones to add to the graph
- Raw OSINT data stored per entity; annotate with free-text notes
- Side-by-side layout: graph on the left, freehand canvas on the right for handwritten notes
- Node positions auto-saved; graph layout can be re-run at any time

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | ASP.NET Core 10 (minimal API style) |
| Database | SQLite via Entity Framework Core |
| Frontend | Vanilla JS ES modules (no bundler) |
| Graph | Cytoscape.js |
| Link previews | HtmlAgilityPack (server-side OG/Twitter tag scraping) |
| OSINT — DNS | Cloudflare DNS-over-HTTPS |
| OSINT — WHOIS | RDAP (rdap.org bootstrap) |
| OSINT — IP | ipinfo.io (free tier) |
| OSINT — subdomains | crt.sh certificate transparency API |
| OSINT — Shodan | Shodan API (API key required) |
| OSINT — HIBP | HaveIBeenPwned API v3 (API key required) |
| OSINT — LinkedIn | HtmlAgilityPack (SEO JSON-LD + OG parsing) + rule-based SE analysis |

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

The SQLite database (`inknote.db`) is created automatically on first run. Existing databases are upgraded in-place — notebook data is preserved.

## Configuration

API keys for premium OSINT sources are set in `appsettings.json`:

```json
"Osint": {
  "ShodanApiKey": "your-key-here",
  "HibpApiKey":   "your-key-here"
}
```

DNS, WHOIS, subdomain enumeration, IP info, and username correlation work without any API keys.

## Building & Publishing

```bash
cd InkNote && dotnet build
cd InkNote && dotnet publish -c Release   # output goes to repo root
```

## Project Structure

```
InkNote/
├── Controllers/
│   ├── NotebooksController.cs      # CRUD for notebooks; page listing/creation
│   ├── PagesController.cs          # Page rename, delete, drawing load/save
│   ├── InvestigationsController.cs # CRUD for investigations, entities, relations, canvas
│   ├── OsintController.cs          # OSINT enrichment endpoints
│   └── LinkPreviewController.cs    # Server-side URL scraper for embed cards
├── Services/
│   ├── OsintService.cs             # DNS, WHOIS, subdomains, IP, Shodan, HIBP, username probing
│   └── LinkedInService.cs          # LinkedIn public profile fetch + social engineering analysis
├── Data/
│   └── AppDbContext.cs             # EF Core context (5 tables)
├── Models/
│   └── Models.cs                   # Entity classes and DTOs
├── Program.cs                      # App bootstrap and middleware wiring
└── wwwroot/
    ├── index.html
    ├── lib/
    │   └── highlight.min.js
    └── js/
        ├── app.js               # App shell: sidebar, investigation/notebook switching, save
        ├── canvas-engine.js     # All drawing logic (two-canvas architecture)
        ├── embeds.js            # URL/YouTube/image/text/sticky/code embed management
        ├── mindmap.js           # Cytoscape.js graph: nodes, edges, OSINT results panel
        ├── osint-api.js         # REST wrappers for investigations + OSINT endpoints
        ├── api.js               # REST wrappers for notebooks/pages + gzip compression
        └── color-picker.js      # Color picker component
```

## API

### Notebooks
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/notebooks` | List all notebooks |
| `POST` | `/api/notebooks` | Create a notebook |
| `PUT` | `/api/notebooks/{id}` | Rename a notebook |
| `DELETE` | `/api/notebooks/{id}` | Delete a notebook and its pages |
| `GET` | `/api/notebooks/{id}/pages` | List pages |
| `POST` | `/api/notebooks/{id}/pages` | Create a page |
| `PUT` | `/api/pages/{id}/title` | Rename a page |
| `DELETE` | `/api/pages/{id}` | Delete a page |
| `GET` | `/api/pages/{id}/drawing` | Load drawing data |
| `PUT` | `/api/pages/{id}/drawing` | Save drawing data |

### Investigations
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/investigations` | List all investigations |
| `POST` | `/api/investigations` | Create an investigation |
| `GET` | `/api/investigations/{id}` | Get investigation with entities and relations |
| `PUT` | `/api/investigations/{id}` | Rename an investigation |
| `DELETE` | `/api/investigations/{id}` | Delete an investigation |
| `GET` | `/api/investigations/{id}/drawing` | Load investigation canvas |
| `PUT` | `/api/investigations/{id}/drawing` | Save investigation canvas |
| `POST` | `/api/investigations/{id}/entities` | Add an entity node |
| `PUT` | `/api/investigations/{id}/entities/{eid}` | Update entity (label, notes, position, OSINT data) |
| `DELETE` | `/api/investigations/{id}/entities/{eid}` | Delete entity and its relations |
| `POST` | `/api/investigations/{id}/relations` | Add a relation edge |
| `DELETE` | `/api/investigations/{id}/relations/{rid}` | Delete a relation |

### OSINT enrichment
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/osint/dns?target=` | DNS records (A, AAAA, MX, NS, TXT, CNAME) |
| `GET` | `/api/osint/subdomains?domain=` | Subdomain enumeration (crt.sh + wordlist) |
| `GET` | `/api/osint/whois?target=` | WHOIS / RDAP registration data |
| `GET` | `/api/osint/ip?target=` | IP geolocation, ASN, PTR (ipinfo.io) |
| `GET` | `/api/osint/shodan?target=` | Shodan host data (API key required) |
| `GET` | `/api/osint/hibp?email=` | HaveIBeenPwned breach check (API key required) |
| `GET` | `/api/osint/usernames?username=` | Social platform correlation (23 platforms) |
| `GET` | `/api/osint/linkedin?url=` | LinkedIn public profile analysis (best-effort fetch) |
| `POST` | `/api/osint/linkedin/text` | LinkedIn profile analysis from pasted text `{text}` |

## Notes

- Single-user only — no authentication.
- No build step for the frontend; ES modules are loaded directly by the browser.
- Username correlation and some platform checks may be unreliable due to bot-detection on Instagram, Twitter/X, and similar sites — results should be treated as leads, not confirmed findings.
- LinkedIn profile URL fetch is best-effort — LinkedIn actively blocks server-side requests. If it fails (HTTP 999 / login wall), use **Paste profile text**: while logged in to LinkedIn, open the target profile, select all text (Ctrl+A), copy, and paste it into the analysis form. This gives access to the full profile including skills, interests, certifications, and experience — the data that makes the social engineering report most useful.
- The LinkedIn social engineering analysis is rule-based pattern matching on profile content. It maps indicators (recent job changes, tech stack exposure, financial roles, certifications, languages, volunteer work, alumni networks) to concrete attack vectors with example lures and recommended pretext approaches. Use it as a starting point for a social engineering section in a pentest report.

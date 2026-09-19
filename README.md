# Sena-Music

A lightweight self-hosted music player that aggregates songs from multiple sources into a unified playlist (NetEase source as main source playlist). You can listen to songs that need VIP or banned in the mainland.

> **This project is under development and doesn't have a stable release yet.**

## Features

- Sync playlists from NetEase Cloud Music
- Add custom songs from Bilibili, YouTube, local files, or direct URLs
- Server-side caching and transcoding to MP3 for stable playback, and persistent playback progress and settings
- *Plan: supports Web, Windows and Android*

## Tech Stack

- **Runtime**: Bun / Node
- **Server**: Romi framework (built in `src/framework`)
- **Frontend**: TypeScript, lit-html, usignal, UnoCSS
- **Backend**: node-http
- **Build**: Parcel

## External Dependencies

| Tool | Required | Purpose |
| ------ | ---------- | --------- |
| Bun / Node | Yes | Runtime and package manager |
| ffmpeg | No | Transcoding audio streams to MP3 (Bilibili and YouTube sources need) |
| yt-dlp | No | Fetching YouTube audio (YouTube source needs) |

## Development

### Install

```bash
bun install
```

### Configure

Edit `music.toml` in the project root:

```toml
port = 3000
dataDirectory = "data"
playlistId = 123456789  # NetEase Cloud Music playlist ID
cacheDirectory = "cache"
cacheMaxSize = 512      # Cache size limit in MB

[db]
host = "localhost"
port = 3306
user = "root"
password = ""
database = "sena_music"
```

### Setup Git Hooks

```bash
bun run init
```

### Run

```bash
bun run dev
```

This starts both the server (with hot reload) and the Parcel dev server for the frontend.

### Build

```bash
bun run build
```

### Production

```bash
bun run src/server/app.ts
```

The server serves both the API and the built frontend from `dist/` and `public/`.

## Usage

1. Open `http://localhost:3000` (or your configured port)
2. Click "Sync Playlist" to pull songs from your NetEase Cloud Music playlist
3. Add custom songs via the "Add Song" button
4. Play songs directly from the playlist
5. Adjust settings in the Settings page

### Cookies

For better YouTube support, place a `cookies.txt` file in your `dataDirectory` with cookies exported in Netscape format (same format used by yt-dlp).

## Project Structure

```text
src/
  common/       Shared types
  framework/    Romi framework (web components, server, utils)
  server/       Backend server, fetchers, and actions
  web/          Frontend components, views, styles
```

## License

Under the GNU General Public License v3.0.

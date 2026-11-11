# Sena Music

<p align="center">
  <img src="./public/logo.png" alt="Sena Music" width="128">
</p>

[![License](https://img.shields.io/badge/License-GPL--3.0-blue.svg?style=flat-square)](https://github.com/biyuehu/sena-music/blob/master/LICENSE)
[![Runtime](https://img.shields.io/badge/Runtime-Bun-fbf0df?style=flat-square&logo=bun&logoColor=black)](https://bun.sh)
![Monadify](https://img.shields.io/badge/Core-Monadify-aa88ff?style=flat-square)
[![Style](https://img.shields.io/badge/Style-UnoCSS-333333?style=flat-square&logo=unocss&logoColor=white)](https://unocss.dev)
[![CI](https://github.com/biyuehu/sena-music/actions/workflows/ci.yml/badge.svg)](https://github.com/biyuehu/sena-music/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20Windows%20%7C%20Android-6366f1?style=flat-square)](https://github.com/biyuehu/sena-music)

轻量级自托管多源音乐聚合播放器，以网易云音乐歌单为主干，额外聚合 QQ 音乐、Bilibili、YouTube 及本地音源为统一播放体验。

## Features

- **多音源聚合**：支持网易云音乐、QQ 音乐、Bilibili 音频、YouTube 音频、本地音频文件及网络直链，可自由配置单曲音源替换。
- **限制歌曲随心畅听**：无论是 VIP 歌曲、网易云无版权歌曲、私人歌曲还是墙内禁曲，都可以通过多音源畅听。
- **三轨歌词同步**：支持日文原文、中文翻译与罗马音三轨歌词对齐滚动，支持点击歌词行直接跳转进度。
- **动态光影与律动背景**：基于音轨时序与当前角色主题色彩生成粒子谐波律动背景，支持全屏沉浸播放模式。
- **自托管与本地缓存**：服务端自动转码并持久化音频与歌词缓存，支持并发锁与 LRU 空间自动清理。
- **跨平台支持**：支持 Web 浏览器、Windows 桌面端（Electron）及 Android 移动端（Capacitor）。

## Stacks

- Runtime & Package manager: Bun
- Backend: Romi Framework based monadify types
- Frontend: TypeScript, lit-html, usignal, UnoCSS
- Builder: Vite
- Platform: Electron, Capacitor
- Utils(Optional): ffmpeg, yt-dlp

## Setup

在程序同级目录或运行根目录创建或编辑 `music.toml`：

```toml
port = 3000
dataDirectory = "data"
playlistId = 123456789 # Netease music playlist id
cacheDirectory = "cache"
cacheMaxSize = 512
```

如需解析 YouTube 音频，可在 `dataDirectory` 目录下放置 Netscape 格式的 `cookies.txt`。

## Development

```bash
# Install
bun install
bun run init

# Devserver

bun run dev
bun run dev:server
bun run dev:client

# Build & Pack
bun run build
bun run web:build
bun run desktop:dev
bun run desktop:build
bun run mobile:sync

# Test & Check
bun run check
bun test
bun run fix
```

## License

- [GNU General Public License v3.0](LICENSE)

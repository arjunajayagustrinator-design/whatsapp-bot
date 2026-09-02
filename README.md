# 🚨 Troubleshooting: Bot Already Running (bot.lock)

Jika Anda mendapatkan error:

```
ERROR: Bot already running! Remove bot.lock if not running.
```

Solusi:

1. Pastikan tidak ada proses bot lain yang sedang berjalan.
2. Hapus file `bot.lock` di folder project:
	 - Windows: Hapus file `bot.lock` secara manual, atau jalankan perintah berikut di terminal:
		 ```powershell
		 if (Test-Path "bot.lock") { Remove-Item "bot.lock" -Force }
		 ```
	 - Linux/Mac: Jalankan:
		 ```bash
		 rm -f bot.lock
		 ```
3. Jalankan kembali bot dengan `npm start`.

File `bot.lock` digunakan untuk mencegah bot berjalan ganda. File ini akan otomatis terhapus saat bot dimatikan dengan benar. Jika bot crash atau keluar paksa, Anda perlu menghapus file ini secara manual sebelum menjalankan ulang bot.

# WhatsApp Bot

Bot WhatsApp dengan fitur pembuatan sticker dan integrasi AI.

## Fitur

- Pembuatan sticker dari gambar
- Chat AI menggunakan OpenRouter
- Keep-alive server untuk mencegah sleep
- Auto chat setiap 10 menit untuk menjaga koneksi aktif
- Perintah `.tagall [pesan opsional]` untuk menandai semua anggota grup (hanya admin grup)
- Riwayat AI persisten di `data/conversation-history.json` dan rate limit per user
- `/reset`, `/clear`, `/ping`, `/translate`, dan `/stickerimage`
- Moderasi grup: `/kick`, `/promote`, `/demote`, `/mute`, `/antilink on|off`
- Welcome/goodbye message, anti-call, blacklist, broadcast, dan restart owner
- 🎮 **Game Center** dengan 12 mini-game dan papan skor persisten

## 🎮 Game Center

Ketik `/game` untuk melihat daftar lengkap. Semua game dimainkan langsung di chat,
satu sesi aktif per chat (pribadi maupun grup).

| Game | Perintah | Cara main |
| --- | --- | --- |
| 🧱 Tetris | `/tetris` | `a` kiri, `d` kanan, `w` putar, `s` turun, `x` jatuhkan. Bisa digabung: `ddw` |
| ❌⭕ Tic-Tac-Toe | `/xo [mudah\|normal\|sulit]` atau `/xo pvp` | Ketik angka 1-9 |
| 👻 Pac-Man | `/pacman` | `w` `a` `s` `d`, bisa digabung. Ambil ⭐ untuk memakan hantu |
| 🪢 Hangman | `/hangman` | Ketik satu huruf atau tebak seluruh kata |
| 🧠 Kuis | `/quiz [jumlah]` | Jawab `A`/`B`/`C`/`D`; di grup siapa cepat dia dapat |
| 🕵️ Mafia | `/mafia` | Grup, min. 4 pemain. `join` → host `mulai` → aksi malam via DM → `vote <nomor>` |
| 🔗 Sambung Kata | `/sambungkata` | Kirim kata berawalan huruf terakhir kata sebelumnya |
| 🐍 Snake | `/snake` | `w` `a` `s` `d`, bisa digabung |
| 🔢 2048 | `/2048` | `w` `a` `s` `d` untuk menggeser ubin |
| 💣 Minesweeper | `/ranjau` | Buka petak `c4`, pasang bendera `f c4` |
| 🔤 Tebak Kata | `/tebakkata` | Susun huruf acak; `bantuan` untuk hint, `lewat` untuk skip |
| 🧮 Kuis Matematika | `/matematika` | Ketik angka jawabannya, ada bonus kecepatan |

Perintah pendukung:

- `/skor` — papan skor keseluruhan, `/skor tetris` untuk per game
- `/statgame` — statistik pribadi
- `/stopgame` — hentikan game yang sedang berjalan

Catatan penting:

- Saat ada game aktif, chat biasa di chat itu diperlakukan sebagai gerakan game.
  Untuk tetap bertanya ke AI, awali pesan dengan titik: `.apa itu tetris`.
- Pesan yang bukan gerakan valid tetap diteruskan ke fitur bot lain, jadi
  perintah seperti `/sticker` dan `/menu` selalu bisa dipakai.
- Sesi yang menganggur lebih dari 15 menit ditutup otomatis.
- Mafia mengirim peran rahasia lewat chat pribadi, jadi tiap pemain harus pernah
  chat dengan bot minimal sekali sebelum ikut bermain.

Skor tersimpan di `data/game-scores.json`.

## Konfigurasi tambahan

- `AI_RATE_LIMIT` — jumlah chat AI per user (default 5)
- `AI_RATE_WINDOW_MS` — jendela rate limit dalam milidetik (default 1 jam)
- `AI_IN_GROUP=true` — izinkan pesan biasa di grup diproses AI; default hanya chat pribadi
- `GAME_IDLE_TIMEOUT_MS` — batas sesi game menganggur (default 15 menit)
- `MAFIA_NIGHT_MS` / `MAFIA_DAY_MS` — durasi fase malam/siang Mafia (default 90 dtk / 120 dtk)

Data runtime disimpan di folder `data/`. Sertakan folder ini dalam volume/deployment bila
ingin riwayat chat, model `/setmodel`, blacklist, dan pengaturan grup tetap ada setelah restart.

Downloader membutuhkan executable `yt-dlp` di `PATH`. Contoh Windows:

```powershell
winget install yt-dlp.yt-dlp
```

Setelah instalasi, restart bot. Perintah yang tersedia adalah `/download URL` untuk video
dan `/ytmp3 URL` untuk audio. Batas ukuran file adalah 30 MB.

## Instalasi

1. Clone repository ini
2. Install dependencies: `npm install`
3. Set environment variable: `OPENROUTER_API_KEY=your_api_key`
4. Jalankan bot: `npm start`

## Deploy

### Railway

1. Push ke GitHub
2. Connect ke Railway
3. Set environment variable `OPENROUTER_API_KEY` dan `RAILWAY_ENVIRONMENT=true`
4. Deploy

### Docker

1. Build image: `docker build -t whatsapp-bot .`
2. Run container: `docker run -p 3000:3000 whatsapp-bot`

## Menjaga Bot Tetap Aktif

Bot ini memiliki server Express di port 3000 untuk keep-alive.

### Ping Service Eksternal

Gunakan layanan seperti cron-job.org atau UptimeRobot untuk ping endpoint `/` atau `/status` setiap 5-10 menit.

Contoh URL: `https://your-app-url.com/` atau `https://your-app-url.com/status`

### Auto Chat

Bot secara otomatis mengirim pesan keep-alive ke diri sendiri setiap 10 menit untuk menjaga koneksi WebSocket aktif.

## Endpoint

- `/` : Keep-alive, mengembalikan "Bot aktif 🚀"
- `/status` : Status bot dalam JSON, termasuk uptime

## Troubleshooting

- Jika bot sering disconnect, pastikan ping service eksternal aktif
- Untuk Railway, pastikan environment variable `RAILWAY_ENVIRONMENT` diset
- Jika ada error ProtocolError, bot akan otomatis reinitialize

## Lisensi

MIT

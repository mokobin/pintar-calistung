# Pintar Calistung (PWA)

Aplikasi belajar Baca, Tulis, Hitung untuk anak 3–7 tahun. Bisa dipasang ke layar utama HP dan jalan offline.

## Cara online-kan (gratis)
Pilih salah satu, upload SEMUA file di folder ini (harus HTTPS agar bisa dipasang):
- **Netlify Drop**: buka app.netlify.com/drop, seret folder ini ke halaman.
- **GitHub Pages**: buat repo, upload file, aktifkan Settings → Pages.
- **Vercel / Cloudflare Pages**: deploy folder statis.

## Cara pasang di HP
- Android (Chrome): buka link → tombol "Pasang di layar utama" di beranda, atau menu ⋮ → Install app.
- iPhone (Safari): Share → Add to Home Screen.

## Isi
- index.html — seluruh aplikasi
- manifest.webmanifest — nama, warna, ikon aplikasi
- sw.js — mode offline
- icon-*.png — ikon

Suara memakai Text-to-Speech bawaan perangkat. Untuk hasil terbaik, pasang suara Bahasa Indonesia di pengaturan HP.
Ubah `CACHE = 'calistung-v1'` di sw.js (misal ke v2) setiap kali update index.html.

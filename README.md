# Tongki Calistung — versi komersial (jual sekali, buka semua)

Aplikasi dan server lisensi berjalan dalam **satu proyek Cloudflare Workers** (paket gratis cukup untuk mulai).

```
public/            aplikasi (index.html, sw.js, ikon, privasi.html, syarat.html)
worker/index.js    server: sajikan aplikasi + cek lisensi ke Mayar
wrangler.toml      pengaturan Cloudflare
```

## Cara kerjanya

1. Orang tua membeli produk **Software License** di Mayar. Mayar mengirim **kode lisensi** ke email pembeli.
2. Di aplikasi: **Ruang Orang Tua → Buka Tongki Lengkap → masukkan kode → Aktifkan**.
3. Server mengecek kode ke Mayar, mencatat perangkat (maksimal 3), lalu mengirim **token bertanda tangan**.
4. Aplikasi menyimpan token dan mengeceknya **tanpa internet** setiap kali dibuka. Aktivasi cukup sekali per perangkat.

Kunci tanda tangan dibuat otomatis oleh server saat pertama jalan dan disimpan di KV. Kamu tidak perlu mengurusnya.

## Yang gratis vs Tongki Lengkap

Diatur di `const GRATIS=` dalam `public/index.html` (cari teksnya), bawaan:

| Menu | Gratis |
|---|---|
| Baca | Huruf, Bunyi Awal |
| Tulis | Pola Garis |
| Hitung | Kenal Angka, Ayo Hitung |
| English | ABC |
| Main | Tangkap, Memori |
| Jam & Hari | Pagi Siang Malam |
| Toko | Kenal Uang |
| Kuis | 1 kali per hari |
| Cerita | 1 cerita pertama |
| Mewarnai | Tongki, Rumah, Gambar Bebas |
| Rutinitas | Semua (selalu gratis) |

---

## Langkah pemasangan

### 1. Mayar
1. Dashboard Mayar → **Produk → Software License**. Isi nama ("Tongki Calistung Lengkap"), harga, deskripsi.
2. **Activation Code Limit** biarkan *Unlimited* (batas 3 perangkat diatur server kita).
3. Catat **Product ID** produk tersebut dan **link halaman produk** (untuk tombol Beli).
4. Ambil **API Key** dari menu integrasi/API Mayar. Untuk uji coba bisa pakai akun sandbox (`https://api.mayar.io`).

### 2. Cloudflare
1. Daftar di dash.cloudflare.com (gratis).
2. **Storage & Databases → KV → Create**, beri nama `tongki-lisensi`. Salin **ID**-nya lalu tempel ke `wrangler.toml` di baris `id = "GANTI_DENGAN_ID_KV_NAMESPACE"` (atau kirim ID-nya ke Claude untuk dipasang).
3. **Workers & Pages → Create → Import a repository** → hubungkan GitHub → pilih repo ini, branch **`komersial`**. Perintah deploy: `npx wrangler deploy`.
4. Setelah proyek jadi: **Settings → Variables and Secrets**:
   - `MAYAR_PRODUCT_ID` (Text) = Product ID dari Mayar
   - `MAYAR_API_KEY` (**Secret**) = API key Mayar
   - `ADMIN_TOKEN` (**Secret**) = kata sandi panjang buatanmu (untuk alat admin di bawah)
   - opsional `MAYAR_BASE` = `https://api.mayar.io` saat uji sandbox
5. Deploy ulang. Buka `https://<nama-proyek>.<akun>.workers.dev/api/sehat`. Harus tampil `kv: true, mayar: true, admin: true`.
6. Opsional: pasang domain sendiri di **Settings → Domains & Routes**.

### 3. Lengkapi isi
- `public/index.html` → cari `const LIS={`, lalu isi `beli` (link produk Mayar), `harga` (mis. "Rp79.000"), `kontak` (email/WA bantuan). Atau kirim datanya ke Claude untuk dipasang.
- `public/privasi.html` dan `public/syarat.html` → isi semua bagian bertanda `[ ... ]`.

### 4. Matikan versi gratis lama
- GitHub repo → **Settings → Pages** → matikan (unpublish) GitHub Pages.
- **Settings → General → Change visibility → Private**. Cloudflare tetap bisa membaca repo private.

### 5. Uji sebelum jualan
1. Beli produkmu sendiri di sandbox / dengan harga uji.
2. Buka aplikasi di HP → Ruang Orang Tua (tahan 2 detik) → Buka Tongki Lengkap → masukkan kode → Aktifkan.
3. Tutup aplikasi, matikan internet, buka lagi: semua menu harus tetap terbuka.

---

## Alat admin (bantuan pelanggan)

Ganti `DOMAIN` dan `TOKEN`. Bisa dijalankan dari terminal, atau minta Claude menjalankannya.

```bash
# Buat 10 kode manual (untuk sekolah, hadiah, reviewer). Kode berbentuk TONGKI-XXXX-XXXX
curl -X POST https://DOMAIN/api/admin/buat-kode -H 'content-type: application/json' \
  -d '{"token":"TOKEN","jumlah":10,"catatan":"TK Melati","maxPerangkat":30}'

# Lihat perangkat yang memakai sebuah kode
curl -X POST https://DOMAIN/api/admin/cek -H 'content-type: application/json' -d '{"token":"TOKEN","kode":"KODE"}'

# Pembeli ganti HP & batas penuh: kosongkan daftar perangkat
curl -X POST https://DOMAIN/api/admin/reset -H 'content-type: application/json' -d '{"token":"TOKEN","kode":"KODE"}'

# Kode disebar / refund: nonaktifkan untuk aktivasi baru
curl -X POST https://DOMAIN/api/admin/nonaktifkan -H 'content-type: application/json' -d '{"token":"TOKEN","kode":"KODE"}'
```

## Catatan jujur soal keamanan

- Aplikasi web selalu bisa dibongkar oleh orang yang paham teknis. Sistem ini mencegah cara gampang (mengedit penyimpanan, menyebar kode tanpa batas, memakai token di perangkat lain), tapi bukan anti-bajakan mutlak. Untuk perlindungan lebih kuat nanti, materi premium bisa dipindah ke server, atau lewat Google Play (Jalur A).
- Kode yang sudah aktif di sebuah perangkat tetap jalan di perangkat itu walau kodenya dinonaktifkan belakangan (aplikasi bekerja offline).
- Batas paket gratis Cloudflare (cek angka terbaru di situs Cloudflare): request Worker harian dan jumlah tulis KV harian. Tiap aktivasi memakai 2 tulis KV.

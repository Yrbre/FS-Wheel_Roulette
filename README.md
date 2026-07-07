# Aplikasi Roda Undian (Wheel of Names + Database)

Aplikasi undian berbasis web: data peserta & hadiah diambil dari MySQL,
wheel-nya memakai [wheelofnames.com](https://wheelofnames.com) (di-embed via
iframe), dan dikontrol otomatis dari JavaScript lewat **postMessage API**
milik Wheel of Names. Fitur utama:

- ✅ Data peserta & hadiah dari database MySQL
- ✅ Pemenang otomatis dihapus dari roda → **tidak bisa menang 2x**
- ✅ Tombol **"Putar Otomatis 10x"** untuk menjalankan 10 ronde berturut-turut
  tanpa perlu klik satu-satu (mempersingkat proses undian)
- ✅ Stok hadiah otomatis berkurang, berhenti sendiri kalau stok habis
- ✅ Riwayat pemenang tersimpan di database

## Catatan penting soal "API Wheel of Names"

Wheel of Names sebenarnya punya **dua mekanisme** berbeda:

1. **REST API** (butuh API key, di `wheelofnames.com/api-doc`) — untuk
   membuat/mengubah/menghapus wheel yang tersimpan di akun Anda secara
   terprogram.
2. **postMessage API** (tidak butuh API key) — untuk mengendalikan wheel yang
   sedang tampil di iframe: memutar wheel, mengganti daftar entri, membaca
   siapa pemenangnya, dll.

Untuk kebutuhan Anda (ambil data dari DB, cegah menang ganda, spin 10x
otomatis), **postMessage API sudah cukup dan lebih sederhana** — itulah yang
dipakai di kode ini. Anda tidak wajib punya API key untuk menjalankan aplikasi
ini. API key baru diperlukan kalau nanti Anda ingin, misalnya, menyimpan
wheel bermerek/tersimpan permanen di akun Wheel of Names lewat REST API.

### Cara membuat API key (opsional, untuk pengembangan lanjutan)

1. Buka https://wheelofnames.com dan login/daftar akun.
2. Buka https://wheelofnames.com/api-doc.
3. Klik **"Create API Key"**, beri nama, lalu salin key & secret yang muncul
   (hanya ditampilkan sekali).
4. Simpan sebagai environment variable, jangan pernah hardcode di kode
   frontend karena akan terlihat publik.

## Struktur Proyek

```
wheel-app/
├── package.json
├── .env.example
├── sql/
│   └── schema.sql        # skema tabel + data contoh
├── server/
│   ├── db.js              # koneksi MySQL (pool)
│   └── index.js           # server Express + semua endpoint API
└── public/
    ├── index.html
    ├── style.css
    └── app.js              # logika kontrol wheel via postMessage
```

## Instalasi

### 1. Siapkan database

Buat database MySQL, lalu import skema:

```bash
mysql -u root -p -e "CREATE DATABASE wheel_app"
mysql -u root -p wheel_app < sql/schema.sql
```

`sql/schema.sql` sudah berisi data contoh (peserta & hadiah). Silakan ganti
`INSERT` di bagian bawah file itu dengan data Anda sendiri, atau isi tabel
`participants` dan `prizes` langsung lewat tool DB favorit Anda (phpMyAdmin,
TablePlus, dll).

Struktur tabel:

| Tabel        | Kolom penting                                    |
|--------------|---------------------------------------------------|
| participants | `id`, `name`, `has_won` (0/1)                     |
| prizes       | `id`, `name`, `stock`, `original_stock`           |
| winners      | `participant_id`, `prize_id`, `round_number`      |

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Edit `.env` sesuai kredensial MySQL Anda:

```
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=isi_password_anda
DB_NAME=wheel_app
```

### 3. Install dependency & jalankan

```bash
npm install
npm start
```

Buka http://localhost:3000 di browser.

## Cara pakai

1. Pilih hadiah di dropdown ("Hadiah untuk ronde ini").
2. Klik **Putar 1x** untuk satu kali undian, atau **Putar Otomatis 10x** untuk
   langsung menjalankan 10 ronde berturut-turut (berhenti otomatis kalau stok
   hadiah habis atau peserta habis).
3. Pemenang otomatis tercatat di database dan hilang dari roda, sehingga
   tidak mungkin terpilih lagi di ronde berikutnya.
4. Klik **Reset Undian** untuk mengembalikan semua peserta & stok hadiah ke
   kondisi semula (berguna untuk uji coba sebelum acara sungguhan).

## Cara kerja teknis (ringkas)

1. `app.js` mengambil daftar peserta yang `has_won = 0` dan hadiah yang
   `stock > 0` dari `/api/participants` & `/api/prizes`.
2. Wheel dibuat lewat URL publik `https://wheelofnames.com/view?entries=...`
   yang di-embed di `<iframe>` — tidak perlu API key untuk ini.
3. Saat tombol spin ditekan, `app.js` mengirim
   `postMessage({ name: 'spin' })` ke iframe.
4. Wheel of Names mengirim balik `{ spinResult: { text: 'NamaPemenang' } }`
   lewat event `message` setelah roda berhenti.
5. `app.js` mengirim nama pemenang ke `POST /api/spin-result`. Endpoint ini
   memakai **transaction + row lock** di MySQL supaya aman dari race
   condition (mencegah 1 peserta tercatat menang 2x atau stok hadiah minus).
6. Setelah tersimpan, `app.js` menghapus nama pemenang dari daftar entri
   lokal dan mengirim `postMessage({ name: 'setEntries', entries: [...] })`
   supaya wheel langsung ter-update tanpa reload halaman.
7. Untuk mode 10x, langkah 3–6 diulang otomatis dengan jeda singkat (±0.9
   detik) antar ronde agar animasi wheel sempat selesai.

## Kustomisasi lanjutan

- **Ubah jumlah ronde otomatis**: ganti `BATCH_SIZE` di `public/app.js`.
- **Ubah tampilan wheel** (warna, suara, kecepatan putar): tambahkan query
  parameter di `buildWheelUrl()` pada `app.js`, contoh `spinTime`, `colors`,
  `pageBackgroundColor` — daftar lengkap ada di
  https://wheelofnames.com/faq (bagian "Can I share a wheel with entries
  that I set on the fly?").
- **Multi hadiah dalam satu batch 10x**: saat ini satu batch 10x menggunakan
  satu hadiah yang sama untuk seluruh ronde (stok berkurang 1 tiap
  menang). Kalau Anda ingin tiap ronde mengambil hadiah berbeda secara
  bergilir, logikanya bisa ditambahkan di `spinBatch` (loop di `app.js`)
  dengan mengganti `prizeId` tiap ronde.

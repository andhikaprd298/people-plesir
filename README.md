# People Plesir

Platform perencanaan wisata Kabupaten Banyumas: AI Itinerary Planner, jelajah wisata dan kuliner, Open Trip, Private Trip, pemesanan, dashboard pengguna dan admin.

Stack: React + TypeScript (Vite), Express + TypeScript, SQLite (`node:sqlite`, Node 22+), Leaflet/OpenStreetMap, Zod.

## Menjalankan
```
npm install
npm run dev     # API :4000 + web :5173
npm run build && JWT_SECRET=... ADMIN_EMAIL=... ADMIN_PASSWORD=... NODE_ENV=production npm start   # satu server
npm test        # 36 tes server + 9 tes klien
```
Database dibuat dan diisi data contoh saat pertama jalan. Di mode pengembangan tanpa `ADMIN_*`, kata sandi admin sementara dicetak sekali di konsol. Di produksi `JWT_SECRET` dan `ADMIN_*` wajib (lihat `.env.example`).

## Sudah berfungsi
Beranda; AI Planner (wizard 4 langkah, validasi jadwal/jam buka/anggaran, ubah/ganti/tambah/hapus/urut ulang, simpan, bagikan, cetak PDF); Jelajahi (grid + peta, filter, lokasi); detail destinasi; Open Trip (kapasitas atomik, kursi nyata, pesanan kedaluwarsa melepas kursi); Private Trip (estimasi awal lalu penawaran final admin); checkout; pembayaran transfer manual dengan verifikasi admin; dashboard pengguna; dashboard admin (destinasi, trip, pesanan, mitra, pengeluaran, pengaturan, ekspor CSV); FAQ, Tentang, kebijakan.

## Belum aktif (perlu konfigurasi Anda)
- Model AI: tanpa `ANTHROPIC_API_KEY`, planner memakai aturan skor di server dan berlabel "Mode demo".
- Rute nyata: tanpa `OSRM_URL`, waktu dan jarak adalah estimasi garis lurus berlabel.
- Pembayaran online: belum ada gateway. Alurnya transfer manual; isi rekening di Admin > Pengaturan, tanpa itu pesanan belum bisa dibayar.
- Email: notifikasi tampil di dashboard; pengiriman email belum diimplementasikan.
- Foto: ilustrasi berlabel sampai admin mengunggah foto asli.
- Data destinasi (harga, jam, koordinat) adalah contoh dan berlabel "Perlu konfirmasi" sampai diverifikasi di Admin > Destinasi. Kebijakan privasi dan syarat adalah draf yang perlu ditinjau hukum.

import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { type Db, all, get, run, tx } from './db.js';

/**
 * DATA DEMO. Nama tempat adalah lokasi nyata di Banyumas, tetapi koordinat, harga, durasi, dan jam
 * operasional di bawah ini adalah PERKIRAAN untuk keperluan pengembangan. Semuanya ditandai
 * coords_verified / price_verified / hours_verified = 0 dan tampil sebagai "Perlu konfirmasi"
 * sampai admin memverifikasinya di Dashboard Admin. Foto belum disertakan (image_url kosong).
 */

export const CATEGORIES = [
  { id: 'alam-air-terjun', name: 'Alam dan air terjun', description: 'Curug, telaga, dan lanskap air di lereng Slamet.', sort_order: 1 },
  { id: 'pegunungan-hutan', name: 'Pegunungan dan hutan', description: 'Hutan pinus, kebun, dan udara dingin Baturraden.', sort_order: 2 },
  { id: 'keluarga', name: 'Wisata keluarga', description: 'Tempat yang nyaman untuk anak dan orang tua.', sort_order: 3 },
  { id: 'budaya-sejarah', name: 'Budaya dan sejarah', description: 'Museum, pendopo, dan jejak kota lama Banyumas.', sort_order: 4 },
  { id: 'kuliner-banyumasan', name: 'Kuliner Banyumasan', description: 'Sroto, mendoan, getuk goreng, dan jajanan khas.', sort_order: 5 },
  { id: 'kafe-santai', name: 'Kafe dan tempat bersantai', description: 'Tempat duduk lama dengan pemandangan.', sort_order: 6 },
] as const;

interface SeedDest {
  id: string; name: string; kind: 'wisata' | 'kuliner' | 'kafe'; category_id: string;
  summary: string; description: string; address_text: string; lat: number; lng: number;
  price_min: number | null; price_max: number | null; avg_duration_min: number;
  family_friendly: boolean; accessibility: string[]; facilities: string[]; tags: string[]; food_tags: string[];
}

const halal = ['halal'];

export const DESTINATIONS: SeedDest[] = [
  {
    id: 'lokawisata-baturraden', name: 'Lokawisata Baturraden', kind: 'wisata', category_id: 'pegunungan-hutan',
    summary: 'Kawasan wisata di kaki Gunung Slamet dengan udara sejuk, taman, dan jalur jalan santai.',
    description: 'Lokawisata Baturraden adalah kawasan wisata alam di lereng selatan Gunung Slamet. Cocok untuk keluarga yang ingin menikmati udara sejuk dan jalan santai. Detail fasilitas dan harga tiket perlu dikonfirmasi sebelum berangkat.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3086, lng: 109.2327,
    price_min: 15000, price_max: 25000, avg_duration_min: 150, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia'], facilities: ['Parkir', 'Toilet', 'Warung makan', 'Mushola'], tags: ['foto', 'santai'], food_tags: [],
  },
  {
    id: 'curug-jenggala', name: 'Curug Jenggala', kind: 'wisata', category_id: 'alam-air-terjun',
    summary: 'Air terjun di kawasan Baturraden dengan jalur berundak dan suasana hutan yang teduh.',
    description: 'Curug Jenggala berada di kawasan Baturraden. Jalur menuju air terjun berupa anak tangga, jadi siapkan alas kaki yang nyaman. Cek kondisi jalur dan cuaca sebelum berkunjung.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3207, lng: 109.2298,
    price_min: 15000, price_max: 20000, avg_duration_min: 90, family_friendly: true,
    accessibility: [], facilities: ['Parkir', 'Toilet', 'Warung'], tags: ['foto', 'hidden_gem'], food_tags: [],
  },
  {
    id: 'hutan-pinus-limpakuwus', name: 'Hutan Pinus Limpakuwus', kind: 'wisata', category_id: 'pegunungan-hutan',
    summary: 'Hutan pinus yang rapi dengan banyak spot foto dan area duduk di bawah pepohonan.',
    description: 'Hutan Pinus Limpakuwus berada di Kecamatan Sumbang. Tempat yang pas untuk bersantai, berfoto, dan piknik ringan. Fasilitas dan jam buka perlu dikonfirmasi.',
    address_text: 'Limpakuwus, Sumbang, Kabupaten Banyumas', lat: -7.3433, lng: 109.2013,
    price_min: 10000, price_max: 15000, avg_duration_min: 90, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia'], facilities: ['Parkir', 'Toilet', 'Warung'], tags: ['foto', 'santai', 'hidden_gem'], food_tags: [],
  },
  {
    id: 'telaga-sunyi', name: 'Telaga Sunyi', kind: 'wisata', category_id: 'alam-air-terjun',
    summary: 'Telaga kecil yang tenang di kawasan Baturraden, cocok untuk istirahat dan berfoto.',
    description: 'Telaga Sunyi menawarkan suasana tenang di tengah pepohonan. Cocok disinggahi bersama Curug Jenggala atau Lokawisata Baturraden. Detail akses perlu dikonfirmasi.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3166, lng: 109.2287,
    price_min: 10000, price_max: 15000, avg_duration_min: 60, family_friendly: true,
    accessibility: ['anak_kecil'], facilities: ['Parkir', 'Toilet'], tags: ['foto', 'santai', 'hidden_gem'], food_tags: [],
  },
  {
    id: 'curug-cipendok', name: 'Curug Cipendok', kind: 'wisata', category_id: 'alam-air-terjun',
    summary: 'Air terjun tinggi di Kecamatan Cilongok dengan jalur menuruni lembah.',
    description: 'Curug Cipendok termasuk air terjun yang cukup tinggi di Banyumas. Jalurnya menuntut stamina karena berundak, terutama saat kembali naik. Perlu konfirmasi kondisi jalur dan jam buka.',
    address_text: 'Karangtengah, Cilongok, Kabupaten Banyumas', lat: -7.3347, lng: 109.1214,
    price_min: 15000, price_max: 25000, avg_duration_min: 120, family_friendly: false,
    accessibility: [], facilities: ['Parkir', 'Toilet', 'Warung'], tags: ['foto', 'trek_berat'], food_tags: [],
  },
  {
    id: 'pancuran-pitu-baturraden', name: 'Pancuran Pitu Baturraden', kind: 'wisata', category_id: 'alam-air-terjun',
    summary: 'Tujuh pancuran air hangat alami di kawasan Baturraden.',
    description: 'Pancuran Pitu dikenal dengan pancuran air panas alaminya. Cocok untuk melepas lelah setelah menyusuri kawasan Baturraden. Detail tiket dan jam buka perlu dikonfirmasi.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3004, lng: 109.2345,
    price_min: 15000, price_max: 25000, avg_duration_min: 90, family_friendly: true,
    accessibility: ['lansia'], facilities: ['Parkir', 'Toilet', 'Mushola'], tags: ['santai'], food_tags: [],
  },
  {
    id: 'kebun-raya-baturraden', name: 'Kebun Raya Baturraden', kind: 'wisata', category_id: 'keluarga',
    summary: 'Kebun koleksi tanaman di lereng Slamet dengan taman dan jalur jalan yang luas.',
    description: 'Kebun Raya Baturraden cocok untuk keluarga yang ingin berjalan santai di antara koleksi tanaman. Ada area yang cukup luas, jadi siapkan waktu yang longgar. Harga dan jam buka perlu dikonfirmasi.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3076, lng: 109.2325,
    price_min: 20000, price_max: 30000, avg_duration_min: 120, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir', 'Toilet', 'Mushola', 'Kantin'], tags: ['santai', 'foto'], food_tags: [],
  },
  {
    id: 'alun-alun-purwokerto', name: 'Alun-alun Purwokerto', kind: 'wisata', category_id: 'keluarga',
    summary: 'Ruang terbuka di pusat kota Purwokerto, ramai dan mudah dijangkau.',
    description: 'Alun-alun Purwokerto adalah ruang publik di pusat kota. Mudah dijangkau dan cocok untuk singgah singkat di sore hari.',
    address_text: 'Purwokerto, Kabupaten Banyumas', lat: -7.4255, lng: 109.2396,
    price_min: 0, price_max: 0, avg_duration_min: 45, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Area duduk', 'Jajanan'], tags: ['santai'], food_tags: [],
  },
  {
    id: 'museum-bri-purwokerto', name: 'Museum BRI Purwokerto', kind: 'wisata', category_id: 'budaya-sejarah',
    summary: 'Museum perbankan di Purwokerto, tempat bank BRI bermula.',
    description: 'Museum BRI menyimpan koleksi yang menceritakan sejarah perbankan rakyat. Cocok untuk kunjungan singkat di pusat kota. Jam buka dan tiket perlu dikonfirmasi.',
    address_text: 'Purwokerto, Kabupaten Banyumas', lat: -7.4252, lng: 109.2381,
    price_min: 0, price_max: 10000, avg_duration_min: 60, family_friendly: true,
    accessibility: ['lansia', 'kursi_roda'], facilities: ['Toilet', 'Parkir'], tags: [], food_tags: [],
  },
  {
    id: 'pendopo-sipanji-banyumas', name: 'Pendopo Si Panji Banyumas', kind: 'wisata', category_id: 'budaya-sejarah',
    summary: 'Pendopo bersejarah di kota lama Banyumas, pusat pemerintahan masa lalu.',
    description: 'Pendopo Si Panji berada di kawasan kota lama Banyumas. Cocok untuk memahami sejarah pemerintahan setempat. Akses dan jam kunjungan perlu dikonfirmasi.',
    address_text: 'Banyumas, Kabupaten Banyumas', lat: -7.5153, lng: 109.2965,
    price_min: 0, price_max: 0, avg_duration_min: 45, family_friendly: true,
    accessibility: ['lansia'], facilities: ['Parkir'], tags: ['hidden_gem'], food_tags: [],
  },
  {
    id: 'museum-wayang-sendang-mas', name: 'Museum Wayang Sendang Mas', kind: 'wisata', category_id: 'budaya-sejarah',
    summary: 'Museum wayang di Banyumas, menampilkan koleksi wayang dari berbagai daerah.',
    description: 'Museum Wayang Sendang Mas menyimpan koleksi wayang. Cocok untuk wisatawan yang tertarik pada budaya Jawa. Jam buka dan tiket perlu dikonfirmasi.',
    address_text: 'Banyumas, Kabupaten Banyumas', lat: -7.5164, lng: 109.2999,
    price_min: 0, price_max: 10000, avg_duration_min: 60, family_friendly: true,
    accessibility: ['lansia'], facilities: ['Parkir', 'Toilet'], tags: ['hidden_gem'], food_tags: [],
  },
  {
    id: 'sroto-sokaraja', name: 'Sroto Sokaraja', kind: 'kuliner', category_id: 'kuliner-banyumasan',
    summary: 'Soto khas Sokaraja dengan kuah kacang dan sambal, wajib dicoba di Banyumas.',
    description: 'Sroto Sokaraja adalah kuliner khas Banyumas. Entri ini mewakili area Sokaraja; admin perlu menetapkan warung mitra dan memverifikasi harga serta jam buka.',
    address_text: 'Sokaraja, Kabupaten Banyumas', lat: -7.4608, lng: 109.2823,
    price_min: 15000, price_max: 30000, avg_duration_min: 50, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir', 'Toilet'], tags: [], food_tags: [...halal],
  },
  {
    id: 'getuk-goreng-sokaraja', name: 'Getuk Goreng Sokaraja', kind: 'kuliner', category_id: 'kuliner-banyumasan',
    summary: 'Camilan getuk yang digoreng, oleh-oleh khas Sokaraja.',
    description: 'Getuk goreng adalah camilan khas dari Sokaraja. Cocok untuk singgah singkat dan membeli oleh-oleh. Toko mitra perlu ditetapkan dan harga diverifikasi.',
    address_text: 'Sokaraja, Kabupaten Banyumas', lat: -7.4575, lng: 109.2790,
    price_min: 10000, price_max: 40000, avg_duration_min: 30, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir'], tags: ['camilan'], food_tags: [...halal, 'vegetarian_friendly', 'tidak_pedas'],
  },
  {
    id: 'mendoan-banyumas', name: 'Mendoan dan Jajanan Banyumasan', kind: 'kuliner', category_id: 'kuliner-banyumasan',
    summary: 'Mendoan hangat, tempe setengah matang yang digoreng tipis, dengan sambal kecap.',
    description: 'Mendoan adalah makanan ikonik Banyumas. Entri ini mewakili warung mendoan di Purwokerto; admin perlu menetapkan tempat mitra dan memverifikasi harga serta jam buka.',
    address_text: 'Purwokerto, Kabupaten Banyumas', lat: -7.4290, lng: 109.2350,
    price_min: 10000, price_max: 25000, avg_duration_min: 40, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir', 'Toilet'], tags: [], food_tags: [...halal, 'vegetarian_friendly'],
  },
  {
    id: 'nopia-mino-banyumas', name: 'Nopia dan Mino Banyumas', kind: 'kuliner', category_id: 'kuliner-banyumasan',
    summary: 'Kue nopia dan mino khas kota lama Banyumas, enak dibawa pulang.',
    description: 'Nopia dan mino adalah jajanan khas Banyumas. Toko mitra perlu ditetapkan dan harga diverifikasi.',
    address_text: 'Banyumas, Kabupaten Banyumas', lat: -7.5170, lng: 109.2950,
    price_min: 10000, price_max: 40000, avg_duration_min: 30, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir'], tags: ['camilan'], food_tags: [...halal, 'vegetarian_friendly', 'tidak_pedas'],
  },
  {
    id: 'kafe-lereng-baturraden', name: 'Kafe kawasan Baturraden (mitra belum ditetapkan)', kind: 'kafe', category_id: 'kafe-santai',
    summary: 'Tempat minum kopi atau wedang dengan udara sejuk kawasan Baturraden.',
    description: 'Entri contoh untuk kafe di kawasan Baturraden. Admin perlu mengganti dengan kafe mitra yang sebenarnya, lengkap dengan koordinat, harga, dan jam buka.',
    address_text: 'Baturraden, Kabupaten Banyumas', lat: -7.3150, lng: 109.2300,
    price_min: 20000, price_max: 50000, avg_duration_min: 60, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir', 'Toilet', 'Wi-Fi'], tags: ['santai', 'foto'], food_tags: [...halal],
  },
  {
    id: 'kafe-kota-purwokerto', name: 'Kafe di pusat Purwokerto (mitra belum ditetapkan)', kind: 'kafe', category_id: 'kafe-santai',
    summary: 'Tempat nongkrong santai di pusat kota Purwokerto.',
    description: 'Entri contoh untuk kafe di pusat kota. Admin perlu mengganti dengan kafe mitra yang sebenarnya.',
    address_text: 'Purwokerto, Kabupaten Banyumas', lat: -7.4270, lng: 109.2380,
    price_min: 20000, price_max: 55000, avg_duration_min: 60, family_friendly: true,
    accessibility: ['anak_kecil', 'lansia', 'kursi_roda'], facilities: ['Parkir', 'Toilet', 'Wi-Fi'], tags: ['santai'], food_tags: [...halal],
  },
];

export const DEFAULT_SETTINGS: { key: string; value: string; verified: number; note: string }[] = [
  // Kecepatan rata-rata (km/jam) untuk estimasi waktu tempuh. Asumsi; ganti dengan data lapangan.
  { key: 'speed.motor', value: '35', verified: 0, note: 'Asumsi kecepatan rata-rata (km/jam)' },
  { key: 'speed.mobil_pribadi', value: '30', verified: 0, note: 'Asumsi kecepatan rata-rata (km/jam)' },
  { key: 'speed.sewa', value: '30', verified: 0, note: 'Asumsi kecepatan rata-rata (km/jam)' },
  { key: 'speed.umum', value: '20', verified: 0, note: 'Asumsi kecepatan rata-rata termasuk menunggu (km/jam)' },
  { key: 'route.detour_factor', value: '1.4', verified: 0, note: 'Pengali jarak garis lurus menjadi jarak jalan (hanya mode estimasi)' },
  // Biaya transportasi untuk AI Planner (Rp). Asumsi demo.
  { key: 'cost.motor_per_km', value: '600', verified: 0, note: 'Bensin per motor per km' },
  { key: 'cost.mobil_pribadi_per_km', value: '1800', verified: 0, note: 'Bahan bakar per mobil per km' },
  { key: 'cost.sewa_per_day', value: '600000', verified: 0, note: 'Sewa kendaraan per hari (kapasitas 6)' },
  { key: 'cost.sewa_per_km', value: '1800', verified: 0, note: 'Bahan bakar kendaraan sewa per km' },
  { key: 'cost.umum_per_km', value: '1500', verified: 0, note: 'Angkutan umum/ojek per orang per km' },
  { key: 'cost.meal_per_person', value: '30000', verified: 0, note: 'Biaya makan per orang bila harga tempat makan belum ada' },
  // Estimasi Private Trip (Rp). Asumsi demo.
  { key: 'private.mobil_sopir_per_day', value: '800000', verified: 0, note: 'Mobil + sopir per hari (kapasitas 6)' },
  { key: 'private.minibus_per_day', value: '1500000', verified: 0, note: 'Minibus + sopir per hari (kapasitas 12)' },
  { key: 'private.motor_per_day', value: '120000', verified: 0, note: 'Sewa motor per hari (kapasitas 2)' },
  { key: 'private.guide_per_day', value: '350000', verified: 0, note: 'Pemandu per hari' },
  { key: 'private.meal_per_person', value: '35000', verified: 0, note: 'Makan per orang per kali' },
  { key: 'private.margin_pct', value: '10', verified: 0, note: 'Margin layanan (%)' },
  { key: 'private.range_pct', value: '15', verified: 0, note: 'Rentang estimasi awal (±%)' },
  // Pemesanan
  { key: 'booking.fee_flat', value: '0', verified: 0, note: 'Biaya layanan per pesanan (Rp)' },
  { key: 'booking.hold_hours', value: '24', verified: 0, note: 'Batas waktu pembayaran (jam) sebelum kursi dilepas' },
  { key: 'booking.max_per_order', value: '10', verified: 0, note: 'Maksimal peserta per pesanan Open Trip' },
  // Pembayaran manual (isi di Dashboard Admin)
  { key: 'payment.bank_name', value: '', verified: 0, note: 'Nama bank' },
  { key: 'payment.account_number', value: '', verified: 0, note: 'Nomor rekening' },
  { key: 'payment.account_holder', value: '', verified: 0, note: 'Atas nama' },
  // Kontak
  { key: 'contact.whatsapp', value: '', verified: 0, note: 'Nomor WhatsApp bantuan' },
  { key: 'contact.email', value: '', verified: 0, note: 'Email bantuan' },
  { key: 'contact.instagram', value: '', verified: 0, note: 'Akun Instagram' },
  { key: 'contact.business_info', value: '', verified: 0, note: 'Informasi bisnis (nama badan usaha, alamat, NIB)' },
  // Kebijakan (teks contoh)
  { key: 'policy.is_demo', value: '1', verified: 0, note: '1 = tampilkan label "kebijakan contoh"' },
  { key: 'policy.cancellation', value: 'Pembatalan oleh peserta paling lambat 3 hari sebelum keberangkatan: dana dikembalikan penuh. Pembatalan 1–2 hari sebelum keberangkatan: dikembalikan 50%. Pembatalan di hari keberangkatan: tidak dikembalikan.', verified: 0, note: 'Teks kebijakan pembatalan' },
  { key: 'policy.payment', value: 'Pembayaran melalui transfer manual. Kursi ditahan selama batas waktu pembayaran; jika belum dibayar, pesanan otomatis dibatalkan dan kursi dilepas. Pesanan dikonfirmasi setelah admin memverifikasi pembayaran.', verified: 0, note: 'Teks ketentuan pembayaran' },
  { key: 'policy.min_participants', value: 'Jika jumlah minimum peserta belum terpenuhi H-3, People Plesir menghubungi peserta untuk memilih jadwal ulang atau pengembalian dana penuh.', verified: 0, note: 'Teks kebijakan kuota minimum' },
];

export function seedReference(db: Db) {
  tx(db, () => {
    for (const c of CATEGORIES) {
      run(db, 'INSERT OR IGNORE INTO categories (id, name, description, sort_order) VALUES (?,?,?,?)', c.id, c.name, c.description, c.sort_order);
    }
    for (const d of DESTINATIONS) {
      run(
        db,
        `INSERT OR IGNORE INTO destinations
         (id,name,kind,category_id,summary,description,address_text,lat,lng,price_min,price_max,avg_duration_min,
          family_friendly,accessibility,facilities,tags,food_tags,data_status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'demo')`,
        d.id, d.name, d.kind, d.category_id, d.summary, d.description, d.address_text, d.lat, d.lng,
        d.price_min, d.price_max, d.avg_duration_min, d.family_friendly,
        JSON.stringify(d.accessibility), JSON.stringify(d.facilities), JSON.stringify(d.tags), JSON.stringify(d.food_tags),
      );
    }
    for (const s of DEFAULT_SETTINGS) {
      run(db, 'INSERT OR IGNORE INTO settings (key,value,verified,note) VALUES (?,?,?,?)', s.key, s.value, s.verified, s.note);
    }
  });
}

/** Sabtu terakhir pada bulan tertentu (UTC, format YYYY-MM-DD). */
export function lastSaturday(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const COMMON_INCLUDED = ['Transportasi pulang-pergi dari titik kumpul', 'Tiket masuk sesuai itinerary', 'Makan siang'];
const COMMON_EXCLUDED = ['Pengeluaran pribadi dan oleh-oleh', 'Makanan/minuman di luar paket', 'Asuransi perjalanan pribadi'];
const COMMON_SAFETY = [
  'Gunakan alas kaki yang nyaman untuk jalur berundak dan licin.',
  'Bawa air minum, jas hujan, dan obat pribadi.',
  'Ikuti arahan pemandu dan jangan berenang di area yang tidak diizinkan.',
];
const COMMON_FAQ = [
  { q: 'Apakah anak-anak boleh ikut?', a: 'Boleh, dengan pendampingan orang tua. Cek tingkat kesulitan jalur pada itinerary.' },
  { q: 'Bagaimana jika hujan?', a: 'Trip tetap berjalan selama kondisi aman. Jika ada perubahan rute karena cuaca, tim akan menginformasikan peserta.' },
];

interface TripSeed {
  slug: string; title: string; theme: string; summary: string; price: number; capacity: number; min: number;
  depart: string; end: string; stops: { time: string; title: string; dest?: string; note?: string }[];
}

const TRIP_SEEDS: TripSeed[] = [
  {
    slug: 'baturraden-sehari', title: 'Baturraden Sehari Penuh', theme: 'Alam dan air terjun',
    summary: 'Sehari menyusuri kawasan Baturraden: curug, telaga, dan makan siang khas Banyumas.',
    price: 125000, capacity: 24, min: 12, depart: '07:00', end: '17:30',
    stops: [
      { time: '07:00', title: 'Berkumpul dan berangkat dari titik kumpul' },
      { time: '08:30', title: 'Curug Jenggala', dest: 'curug-jenggala' },
      { time: '10:30', title: 'Telaga Sunyi', dest: 'telaga-sunyi' },
      { time: '12:00', title: 'Makan siang khas Banyumas', dest: 'sroto-sokaraja' },
      { time: '13:30', title: 'Lokawisata Baturraden', dest: 'lokawisata-baturraden' },
      { time: '16:00', title: 'Kembali ke titik kumpul' },
    ],
  },
  {
    slug: 'pinus-dan-kuliner', title: 'Pinus dan Kuliner Sokaraja', theme: 'Hutan pinus dan kuliner',
    summary: 'Santai di Hutan Pinus Limpakuwus, lalu berburu sroto dan getuk goreng Sokaraja.',
    price: 95000, capacity: 28, min: 12, depart: '08:00', end: '16:30',
    stops: [
      { time: '08:00', title: 'Berkumpul dan berangkat' },
      { time: '09:00', title: 'Hutan Pinus Limpakuwus', dest: 'hutan-pinus-limpakuwus' },
      { time: '11:30', title: 'Sroto Sokaraja', dest: 'sroto-sokaraja' },
      { time: '13:00', title: 'Getuk Goreng Sokaraja', dest: 'getuk-goreng-sokaraja' },
      { time: '14:00', title: 'Alun-alun Purwokerto', dest: 'alun-alun-purwokerto' },
      { time: '15:30', title: 'Kembali ke titik kumpul' },
    ],
  },
  {
    slug: 'kota-lama-banyumas', title: 'Jejak Kota Lama Banyumas', theme: 'Budaya dan sejarah',
    summary: 'Menelusuri pendopo, museum, dan jajanan di kota lama Banyumas.',
    price: 85000, capacity: 28, min: 12, depart: '08:00', end: '16:00',
    stops: [
      { time: '08:00', title: 'Berkumpul dan berangkat' },
      { time: '09:30', title: 'Pendopo Si Panji Banyumas', dest: 'pendopo-sipanji-banyumas' },
      { time: '11:00', title: 'Museum Wayang Sendang Mas', dest: 'museum-wayang-sendang-mas' },
      { time: '12:30', title: 'Makan siang dan Mendoan', dest: 'mendoan-banyumas' },
      { time: '14:00', title: 'Nopia dan Mino Banyumas', dest: 'nopia-mino-banyumas' },
      { time: '15:00', title: 'Kembali ke titik kumpul' },
    ],
  },
];

/** Membuat tiga Open Trip demo untuk tiga bulan ke depan (Sabtu terakhir tiap bulan, minimal 5 hari dari hari ini). */
export function seedDemoTrips(db: Db, today = new Date()) {
  if (get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM trips')!.n > 0) return;
  tx(db, () => {
    let monthOffset = 0;
    let created = 0;
    while (created < TRIP_SEEDS.length && monthOffset < 12) {
      const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
      const date = lastSaturday(base.getUTCFullYear(), base.getUTCMonth());
      monthOffset += 1;
      const diffDays = (Date.parse(date) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000;
      if (diffDays < 5) continue;
      const t = TRIP_SEEDS[created];
      const deadline = new Date(Date.parse(date) - 3 * 86400000).toISOString().slice(0, 10);
      const r = run(
        db,
        `INSERT INTO trips (slug,title,theme,summary,trip_date,depart_time,end_time,meeting_point,price,capacity,min_participants,
          registration_deadline,included,excluded,safety,faq,status,is_demo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'published', 1)`,
        t.slug, t.title, t.theme, t.summary, date, t.depart, t.end,
        'Titik kumpul di Purwokerto (contoh demo, perlu konfirmasi)',
        t.price, t.capacity, t.min, deadline,
        JSON.stringify(COMMON_INCLUDED), JSON.stringify(COMMON_EXCLUDED), JSON.stringify(COMMON_SAFETY), JSON.stringify(COMMON_FAQ),
      );
      t.stops.forEach((s, i) => {
        run(db, 'INSERT INTO trip_itineraries (trip_id,sort_order,time,title,destination_id,note) VALUES (?,?,?,?,?,?)',
          r.lastInsertRowid, i, s.time, s.title, s.dest ?? null, s.note ?? null);
      });
      created += 1;
    }
  });
}

export function seedPartners(db: Db) {
  if (get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM partners')!.n > 0) return;
  // Kosong dengan sengaja: mitra nyata diisi admin. Tidak ada nama mitra rekaan.
}

/** Membuat akun admin pertama. Kata sandi acak dicetak sekali ke konsol bila ADMIN_PASSWORD tidak diatur (hanya non-production). */
export async function ensureAdmin(db: Db, opts: { email?: string; password?: string; isProd: boolean; log?: (m: string) => void }) {
  const log = opts.log ?? console.log;
  if (get(db, "SELECT id FROM users WHERE role='admin' LIMIT 1")) return;
  let email = opts.email;
  let password = opts.password;
  if (!email || !password) {
    if (opts.isProd) {
      log('[seed] Belum ada admin. Atur ADMIN_EMAIL dan ADMIN_PASSWORD lalu jalankan ulang.');
      return;
    }
    email = email ?? 'admin@peopleplesir.local';
    password = password ?? crypto.randomBytes(9).toString('base64url');
    log(`[seed] Akun admin dibuat. Email: ${email}  Kata sandi sementara: ${password}  (simpan, tidak ditampilkan lagi)`);
  }
  const hash = await bcrypt.hash(password, 10);
  run(db, "INSERT INTO users (name,email,password_hash,role) VALUES ('Admin People Plesir', ?, ?, 'admin')", email, hash);
}

export function countDestinations(db: Db) {
  return all(db, 'SELECT id FROM destinations').length;
}

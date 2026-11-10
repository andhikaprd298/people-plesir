import { Link } from 'react-router-dom';
import { Note, useTitle } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { ReactNode } from 'react';

function Page({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="wrap" style={{ paddingBottom: 64 }}>
      <div className="page-head">
        <h1 style={{ fontSize: 'clamp(1.9rem,4.4vw,2.8rem)' }}>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      <div className="stack-lg" style={{ maxWidth: 780 }}>{children}</div>
    </div>
  );
}

export function About() {
  useTitle('Tentang People Plesir');
  const { meta } = useAuth();
  return (
    <Page title="Tentang People Plesir" lead="Platform perencanaan perjalanan untuk Kabupaten Banyumas, Jawa Tengah: wisata alam, kuliner, dan budaya dalam satu tempat.">
      <section className="stack">
        <h2>Apa yang kami kerjakan</h2>
        <p>People Plesir membantu wisatawan menyusun perjalanan sesuai cara mereka sendiri. Anda bisa menyusun itinerary dengan perencana berbasis data destinasi dan estimasi rute, ikut Open Trip bulanan, atau mengajukan Private Trip untuk rombongan sendiri.</p>
        <ul className="stack-sm" style={{ paddingLeft: 20 }}>
          <li><b>AI Itinerary Planner.</b> Urutan destinasi disusun dari data terstruktur, lalu jadwal, jam buka, waktu tempuh, dan anggaran diperiksa sistem.</li>
          <li><b>Open Trip.</b> Satu hari penuh setiap bulan dengan jadwal tetap dan harga per orang yang jelas.</li>
          <li><b>Private Trip.</b> Rute dan fasilitas mengikuti kelompok Anda. Estimasi awal ditinjau tim sebelum penawaran final.</li>
        </ul>
      </section>
      <section className="stack">
        <h2>Cara kami menjaga kejujuran informasi</h2>
        <p>Harga tiket, jam operasional, dan lokasi yang belum dicek langsung diberi label <b>Perlu konfirmasi</b>. Estimasi waktu dan biaya dapat berubah sesuai kondisi lapangan. Kursi Open Trip dihitung dari pemesanan nyata, dan pembayaran hanya dianggap berhasil setelah diverifikasi admin.</p>
        {meta?.demoData && <Note kind="sun"><b>Status saat ini:</b> sebagian data destinasi masih contoh dan belum diverifikasi tim. Label tersebut akan hilang setelah admin menandainya terverifikasi.</Note>}
      </section>
      <section className="stack">
        <h2>Mulai dari mana?</h2>
        <div className="row"><Link className="btn btn-primary" to="/planner">Rencanakan Trip</Link><Link className="btn btn-ghost" to="/open-trip">Lihat Open Trip</Link><Link className="btn btn-ghost" to="/bantuan">Pusat bantuan</Link></div>
      </section>
    </Page>
  );
}

const FAQ: { group: string; items: { q: string; a: ReactNode }[] }[] = [
  { group: 'AI Planner', items: [
    { q: 'Apakah saya perlu akun untuk memakai AI Planner?', a: 'Tidak. Anda bisa membuat dan mengubah itinerary tanpa akun. Akun hanya dibutuhkan untuk menyimpan itinerary atau memesan trip.' },
    { q: 'Seberapa akurat estimasi waktu dan biaya?', a: 'Estimasi memakai data destinasi dan perkiraan rute. Informasi yang belum diverifikasi ditandai "Perlu konfirmasi", dan angka dapat berubah sesuai kondisi lapangan, jam buka, serta lalu lintas.' },
    { q: 'Apakah rekomendasi memakai AI sungguhan?', a: 'Itu tergantung konfigurasi server. Jika model AI belum aktif, planner berjalan dalam mode demo dengan aturan penyusunan di server, dan hasilnya diberi label yang jelas.' },
  ] },
  { group: 'Open Trip', items: [
    { q: 'Apa yang termasuk dalam harga Open Trip?', a: 'Rincian termasuk dan tidak termasuk tertulis di halaman detail setiap trip, biasanya transportasi, tiket masuk, dan makan sesuai paket.' },
    { q: 'Bagaimana jika kuota minimum belum terpenuhi?', a: 'Statusnya terlihat di kartu trip. Jika kuota belum terpenuhi pada batas yang ditetapkan, kami menghubungi peserta untuk jadwal ulang atau pengembalian dana sesuai kebijakan di halaman trip.' },
    { q: 'Kapan pesanan saya terkonfirmasi?', a: 'Setelah pembayaran diverifikasi admin. Menekan tombol atau melaporkan pembayaran saja belum membuat pesanan terkonfirmasi.' },
    { q: 'Berapa lama kursi ditahan?', a: 'Kursi ditahan selama batas waktu pembayaran yang tertera di pesanan. Jika belum dibayar, pesanan dibatalkan otomatis dan kursi dilepas.' },
  ] },
  { group: 'Private Trip', items: [
    { q: 'Apakah harga di formulir Private Trip sudah final?', a: 'Belum. Itu estimasi awal. Tim meninjau ketersediaan mitra dan biaya aktual, lalu mengirim penawaran final. Pesanan terkonfirmasi setelah Anda menyetujui dan pembayaran diverifikasi.' },
  ] },
  { group: 'Akun dan data', items: [
    { q: 'Bagaimana data saya dipakai?', a: <>Dijelaskan di <Link to="/privasi">Kebijakan Privasi</Link>.</> },
  ] },
];

export function Help() {
  useTitle('FAQ dan pusat bantuan');
  const { meta } = useAuth();
  const c = meta?.settings.contact;
  return (
    <Page title="FAQ dan pusat bantuan" lead="Jawaban untuk pertanyaan yang paling sering muncul.">
      {FAQ.map((g) => (
        <section key={g.group}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: 12 }}>{g.group}</h2>
          {g.items.map((f) => <details className="faq" key={f.q}><summary>{f.q}</summary><div>{f.a}</div></details>)}
        </section>
      ))}
      <section className="card soft">
        <h2 style={{ fontSize: '1.3rem' }}>Masih butuh bantuan?</h2>
        <ul className="stack-sm" style={{ paddingLeft: 20, marginTop: 10 }}>
          <li>WhatsApp: {c?.whatsapp ? <a href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{c.whatsapp}</a> : <span className="muted">belum diatur admin</span>}</li>
          <li>Email: {c?.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="muted">belum diatur admin</span>}</li>
        </ul>
      </section>
    </Page>
  );
}

export function Privacy() {
  useTitle('Kebijakan privasi');
  return (
    <Page title="Kebijakan privasi" lead="Ringkasan data apa yang kami simpan dan untuk apa.">
      <Note kind="sun"><b>Draf awal.</b> Teks ini perlu ditinjau pemilik usaha dan penasihat hukum sebelum peluncuran publik.</Note>
      <section className="stack"><h2>Data yang kami simpan</h2><p>Nama, email, dan nomor WhatsApp yang Anda isi; kata sandi disimpan dalam bentuk hash; data pesanan, laporan pembayaran, dan itinerary yang Anda simpan.</p></section>
      <section className="stack"><h2>Tujuan penggunaan</h2><p>Memproses pemesanan, menghubungi Anda terkait perjalanan, memverifikasi pembayaran, dan menampilkan dashboard Anda. Itinerary yang dibagikan lewat tautan hanya memuat isi perjalanan, tanpa data kontak Anda.</p></section>
      <section className="stack"><h2>Lokasi</h2><p>Lokasi perangkat dipakai hanya jika Anda mengizinkan, untuk menampilkan tempat terdekat. Anda dapat menolak dan mengetik lokasi secara manual.</p></section>
      <section className="stack"><h2>Layanan pihak ketiga</h2><p>Peta memakai ubin OpenStreetMap. Jika model AI dan layanan rute diaktifkan di server, data perjalanan yang dikirim berupa preferensi dan daftar destinasi, tanpa data identitas.</p></section>
      <section className="stack"><h2>Hak Anda</h2><p>Hubungi kami lewat kontak di bagian Bantuan untuk meminta akses, koreksi, atau penghapusan data.</p></section>
    </Page>
  );
}

export function Terms() {
  useTitle('Syarat layanan');
  const { meta } = useAuth();
  const p = meta?.settings.policy;
  return (
    <Page title="Syarat layanan" lead="Ketentuan memakai People Plesir dan memesan perjalanan.">
      <Note kind="sun"><b>Draf awal.</b> Teks ini perlu ditinjau pemilik usaha dan penasihat hukum sebelum peluncuran publik.</Note>
      <section className="stack"><h2>Informasi dan estimasi</h2><p>Estimasi waktu, jarak, dan biaya bersifat perkiraan dan dapat berubah. Informasi berlabel "Perlu konfirmasi" belum diverifikasi.</p></section>
      {p && <>
        <section className="stack"><h2>Pembayaran</h2><p>{p.payment}</p></section>
        <section className="stack"><h2>Pembatalan</h2><p>{p.cancellation}</p></section>
        <section className="stack"><h2>Kuota minimum Open Trip</h2><p>{p.minParticipants}</p></section>
      </>}
      <section className="stack"><h2>Private Trip</h2><p>Estimasi awal bukan harga final. Pesanan Private Trip terkonfirmasi hanya setelah tim menyetujui jadwal, harga, dan ketersediaan layanan.</p></section>
      <section className="stack"><h2>Keselamatan</h2><p>Peserta wajib mengikuti arahan pemandu dan informasi keselamatan pada halaman trip. Kondisi cuaca dapat mengubah atau membatalkan rute.</p></section>
    </Page>
  );
}

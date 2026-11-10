import { useId } from 'react';

/**
 * Ilustrasi orisinal (bukan foto) yang dipakai sementara sampai admin mengunggah foto asli destinasi.
 * Semua komponen yang memakainya menampilkan label "Ilustrasi" agar tidak disangka foto lokasi.
 */
export type SceneKind = 'hero' | 'air' | 'pinus' | 'gunung' | 'budaya' | 'kuliner' | 'kafe' | 'keluarga';

export function sceneKindFor(opts: { categoryId?: string | null; id?: string | null; kind?: string | null; theme?: string | null }): SceneKind {
  const id = opts.id ?? '';
  if (/pinus/.test(id)) return 'pinus';
  switch (opts.categoryId) {
    case 'alam-air-terjun': return 'air';
    case 'pegunungan-hutan': return 'gunung';
    case 'keluarga': return 'keluarga';
    case 'budaya-sejarah': return 'budaya';
    case 'kuliner-banyumasan': return 'kuliner';
    case 'kafe-santai': return 'kafe';
  }
  const t = `${opts.theme ?? ''}`.toLowerCase();
  if (t.includes('air terjun') || t.includes('alam')) return 'air';
  if (t.includes('pinus') || t.includes('hutan')) return 'pinus';
  if (t.includes('budaya') || t.includes('sejarah')) return 'budaya';
  if (t.includes('kuliner')) return 'kuliner';
  return 'gunung';
}

const SKY: Record<SceneKind, [string, string]> = {
  hero: ['#cfe1c8', '#f6e6cf'], air: ['#d9e8d2', '#f3ecd9'], pinus: ['#e3ecd3', '#f7ead2'], gunung: ['#d5e4cf', '#f7e8cf'],
  budaya: ['#f1e3c8', '#f9efe0'], kuliner: ['#f7e1c6', '#fbf0e0'], kafe: ['#e6ecd8', '#f6eddc'], keluarga: ['#dce9d4', '#f5ecd8'],
};

function Hills({ y = 250 }: { y?: number }) {
  return (
    <>
      <path d={`M0 ${y} C 90 ${y - 70}, 170 ${y - 90}, 260 ${y - 40} S 430 ${y - 100}, 520 ${y - 50} S 620 ${y - 60}, 640 ${y - 40} V400 H0Z`} fill="#a8c3a0" />
      <path d={`M0 ${y + 40} C 110 ${y - 10}, 220 ${y + 10}, 320 ${y + 40} S 520 ${y + 10}, 640 ${y + 30} V400 H0Z`} fill="#5f8f72" />
      <path d={`M0 ${y + 90} C 140 ${y + 50}, 300 ${y + 80}, 640 ${y + 60} V400 H0Z`} fill="#245c45" />
    </>
  );
}

function Pines({ x, y, n = 5, s = 1 }: { x: number; y: number; n?: number; s?: number }) {
  return (
    <g fill="#17402f">
      {Array.from({ length: n }, (_, i) => {
        const px = x + i * 34 * s;
        const h = (70 + ((i * 17) % 28)) * s;
        return <path key={i} d={`M${px} ${y} l${-16 * s} ${h * 0.55} h${10 * s} l${-14 * s} ${h * 0.45} h${40 * s} l${-14 * s} ${-h * 0.45} h${10 * s} z`} transform={`translate(0 ${-h})`} />;
      })}
    </g>
  );
}

export function Scene({ kind, className }: { kind: SceneKind; className?: string }) {
  const gid = useId().replace(/:/g, '');
  const [a, b] = SKY[kind];
  return (
    <svg className={className} viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Ilustrasi, bukan foto lokasi">
      <defs>
        <linearGradient id={`sky-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="640" height="400" fill={`url(#sky-${gid})`} />
      <circle cx={kind === 'kafe' ? 520 : 480} cy="96" r="38" fill="#e99555" opacity="0.95" />

      {(kind === 'gunung' || kind === 'air' || kind === 'pinus' || kind === 'keluarga') && (
        <path d="M120 270 L300 70 L330 78 L520 270Z" fill="#7fa58c" opacity="0.55" />
      )}
      {kind !== 'kuliner' && kind !== 'kafe' && kind !== 'budaya' && <Hills y={kind === 'air' ? 240 : 255} />}

      {kind === 'air' && (
        <g>
          <path d="M300 168 h38 v150 h-38z" fill="#eaf3ee" opacity="0.95" />
          <path d="M308 168 v150 M320 168 v150 M330 168 v150" stroke="#cfe2d6" strokeWidth="3" />
          <ellipse cx="319" cy="322" rx="62" ry="12" fill="#cfe2d6" />
          <Pines x={170} y={330} n={3} s={0.9} />
          <Pines x={400} y={335} n={3} s={0.8} />
        </g>
      )}
      {kind === 'pinus' && (
        <g>
          <Pines x={40} y={360} n={6} s={1.05} />
          <Pines x={270} y={372} n={6} s={1.2} />
          <Pines x={470} y={355} n={4} s={0.95} />
        </g>
      )}
      {kind === 'gunung' && (
        <g>
          <path d="M60 300 q80 -40 170 -10 t200 -6 t150 8 v40 H60z" fill="#e7eee2" opacity="0.35" />
          <Pines x={60} y={345} n={3} s={0.9} />
          <Pines x={440} y={352} n={4} s={1} />
        </g>
      )}
      {kind === 'keluarga' && (
        <g>
          <circle cx="170" cy="300" r="34" fill="#245c45" />
          <rect x="166" y="320" width="8" height="40" fill="#17402f" />
          <circle cx="480" cy="296" r="40" fill="#1d4d3a" />
          <rect x="476" y="320" width="9" height="42" fill="#17402f" />
          <rect x="260" y="330" width="120" height="10" rx="5" fill="#e99555" />
          <rect x="270" y="340" width="6" height="22" fill="#17402f" />
          <rect x="364" y="340" width="6" height="22" fill="#17402f" />
        </g>
      )}
      {kind === 'budaya' && (
        <g>
          <rect x="0" y="300" width="640" height="100" fill="#a8c3a0" />
          <rect x="0" y="340" width="640" height="60" fill="#5f8f72" />
          <path d="M150 220 L320 120 L490 220 Z" fill="#a85a16" />
          <path d="M190 240 L320 168 L450 240 Z" fill="#245c45" />
          <rect x="205" y="240" width="230" height="86" fill="#f2efe3" />
          {[225, 275, 325, 375, 415].map((x) => <rect key={x} x={x} y="240" width="9" height="86" fill="#17402f" />)}
          <rect x="140" y="326" width="360" height="12" fill="#17402f" />
        </g>
      )}
      {kind === 'kuliner' && (
        <g>
          <rect x="0" y="300" width="640" height="100" fill="#f2efe3" />
          <ellipse cx="320" cy="300" rx="150" ry="22" fill="#e2dfd0" />
          <path d="M190 232 h260 a130 100 0 0 1 -260 0z" fill="#245c45" />
          <path d="M200 232 h240 a120 22 0 0 0 -240 0z" fill="#e99555" />
          <circle cx="270" cy="228" r="8" fill="#faf8f1" /><circle cx="330" cy="222" r="8" fill="#a8c3a0" /><circle cx="385" cy="229" r="8" fill="#faf8f1" />
          <path d="M270 190 q-10 -22 0 -40 M320 186 q-10 -22 0 -44 M370 190 q-10 -22 0 -40" stroke="#c9b99a" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {kind === 'kafe' && (
        <g>
          <rect x="0" y="300" width="640" height="100" fill="#e2dfd0" />
          <path d="M240 190 h150 v70 a75 60 0 0 1 -150 0z" fill="#245c45" />
          <path d="M390 205 h26 a26 26 0 0 1 0 52 h-26" stroke="#245c45" strokeWidth="14" fill="none" />
          <ellipse cx="315" cy="192" rx="75" ry="12" fill="#17402f" />
          <path d="M280 160 q-10 -20 0 -38 M315 156 q-10 -20 0 -42 M350 160 q-10 -20 0 -38" stroke="#b9a98b" strokeWidth="5" fill="none" strokeLinecap="round" />
          <ellipse cx="315" cy="330" rx="130" ry="14" fill="#cfd3c3" />
        </g>
      )}
    </svg>
  );
}

/** Ilustrasi lebar untuk hero beranda, dengan garis rute yang tergambar saat halaman dimuat. */
export function HeroScene() {
  return (
    <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d3e4cc" />
          <stop offset="0.65" stopColor="#f6e4c9" />
          <stop offset="1" stopColor="#f8d9b3" />
        </linearGradient>
      </defs>
      <rect width="1440" height="700" fill="url(#hs-sky)" />
      <circle cx="1130" cy="190" r="74" fill="#e99555" />
      <path d="M520 470 L930 120 L990 135 L1400 470Z" fill="#7fa58c" opacity="0.7" />
      <path d="M0 470 C 180 360, 330 330, 520 420 S 860 350, 1060 430 S 1330 380, 1440 410 V700 H0Z" fill="#a8c3a0" />
      <path d="M0 540 C 220 450, 460 470, 700 520 S 1180 470, 1440 520 V700 H0Z" fill="#5f8f72" />
      <path d="M0 610 C 300 550, 650 600, 960 590 S 1300 570, 1440 600 V700 H0Z" fill="#245c45" />
      <g fill="#17402f">
        {Array.from({ length: 16 }, (_, i) => {
          const x = 90 + i * 86 + (i % 3) * 14;
          const h = 90 + ((i * 29) % 70);
          const y = 640 + (i % 4) * 8;
          return <path key={i} d={`M${x} ${y - h} l-26 ${h * 0.55} h16 l-24 ${h * 0.45} h68 l-24 ${-h * 0.45} h16 z`} />;
        })}
      </g>
      <path className="route-draw" d="M120 640 C 300 560, 380 600, 520 520 S 760 440, 900 500 S 1120 430, 1290 330" fill="none" stroke="#faf8f1" strokeWidth="5" strokeDasharray="2 14" strokeLinecap="round" opacity="0.95" />
      {[[520, 520], [900, 500], [1290, 330]].map(([x, y]) => (
        <g key={x}><circle cx={x} cy={y} r="15" fill="#faf8f1" /><circle cx={x} cy={y} r="7" fill="#e99555" /></g>
      ))}
    </svg>
  );
}

export function DestImage({ src, alt, kind, label = true, className }: { src: string | null | undefined; alt: string; kind: SceneKind; label?: boolean; className?: string }) {
  if (src) return <img src={src} alt={alt} loading="lazy" className={className} />;
  return (
    <>
      <Scene kind={kind} className={className} />
      {label && <span className="chip paper chip-br xsmall">Ilustrasi</span>}
    </>
  );
}

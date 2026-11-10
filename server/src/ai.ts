import { z } from 'zod';

/**
 * Lapisan AI opsional. Model hanya boleh MEMILIH dari kandidat yang berasal dari database (berdasarkan id)
 * dan menulis judul, ringkasan, serta tips singkat. Jadwal, jarak, biaya, dan jam operasional tetap
 * dihitung dan divalidasi oleh kode (planner.ts), bukan oleh model.
 */

export interface AiCandidate {
  id: string;
  name: string;
  category: string;
  kind: string;
  tags: string[];
  familyFriendly: boolean;
  priceMid: number | null;
  durationMin: number;
  distFromOriginKm: number;
  score: number;
}

export interface AiRefineInput {
  days: number;
  participants: number;
  pace: string;
  interests: string[];
  vehicle: string;
  perDay: number;
  mustVisit: string[];
  candidates: AiCandidate[];
}

export interface AiRefineOutput {
  selectedIds: string[];
  title: string;
  summary: string;
  tips: Record<string, string>;
}

export interface AiProvider {
  readonly name: string;
  refine(input: AiRefineInput): Promise<AiRefineOutput>;
}

const outputSchema = z.object({
  selectedIds: z.array(z.string()).max(40),
  title: z.string().min(3).max(90),
  summary: z.string().min(10).max(400),
  tips: z.record(z.string().max(200)).default({}),
});

const SYSTEM_PROMPT = `Anda adalah perencana perjalanan untuk People Plesir di Kabupaten Banyumas, Jawa Tengah.
Tugas: dari daftar KANDIDAT, pilih destinasi yang paling cocok dengan preferensi wisatawan, lalu tulis judul, ringkasan singkat, dan tips pendek.
Aturan keras:
- Pilih HANYA id yang ada pada daftar kandidat. Jangan menambah tempat baru.
- Jangan menulis harga, jam buka, jarak, atau waktu tempuh; itu dihitung sistem.
- Sertakan semua id dalam mustVisit.
- Jumlah pilihan sebaiknya sekitar days x perDay, mengutamakan tempat yang berdekatan agar rute efisien.
- Judul dan ringkasan dalam bahasa Indonesia yang hangat, tanpa klaim yang tidak pasti.
Balas hanya dengan satu objek JSON: {"selectedIds":[...],"title":"...","summary":"...","tips":{"<id>":"tips singkat"}}`;

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  constructor(
    private apiKey: string,
    private model: string,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 25000,
  ) {}

  async refine(input: AiRefineInput): Promise<AiRefineOutput> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: JSON.stringify(input) }],
        }),
      });
      if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
      const match = /\{[\s\S]*\}/.exec(text);
      if (!match) throw new Error('AI: respons bukan JSON');
      return outputSchema.parse(JSON.parse(match[0]));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function makeAiProvider(apiKey: string | undefined, model: string): AiProvider | null {
  return apiKey ? new AnthropicProvider(apiKey, model) : null;
}

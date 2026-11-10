import { Router } from 'express';
import { z } from 'zod';
import { type AppCtx } from '../app.js';
import { bad, parse, wrap } from '../http.js';
import { generateItinerary, loadDests, plannerInputSchema, recomputeItinerary } from '../planner.js';
import { todayJakarta } from '../services.js';
import { readSettings } from '../settings.js';

const planSchema = z
  .array(z.array(z.object({ destinationId: z.string().max(80), role: z.enum(['visit', 'meal']) })).max(14))
  .max(5);

export function plannerRoutes(ctx: AppCtx) {
  const r = Router();
  const { db } = ctx;

  r.post('/generate', wrap(async (req, res) => {
    const input = parse(plannerInputSchema, req.body);
    if (input.startDate < todayJakarta()) throw bad('Tanggal perjalanan sudah lewat', { startDate: 'Pilih tanggal hari ini atau setelahnya' });
    const dests = new Map(loadDests(db).map((d) => [d.id, d]));
    if (dests.size === 0) throw bad('Belum ada data destinasi. Hubungi admin.');
    const itinerary = await generateItinerary({ input, dests, router: ctx.router, settings: readSettings(db) }, { ai: ctx.ai });
    res.json(itinerary);
  }));

  // Dipakai setelah pengguna mengganti, menambah, menghapus, atau mengurutkan ulang destinasi.
  r.post('/recompute', wrap(async (req, res) => {
    const body = parse(
      z.object({
        input: plannerInputSchema,
        plan: planSchema,
        meta: z.object({
          title: z.string().max(150),
          summary: z.string().max(500),
          engine: z.object({ mode: z.enum(['demo', 'ai']), routing: z.string().max(40), note: z.string().max(300) }),
        }),
      }),
      req.body,
    );
    const dests = new Map(loadDests(db).map((d) => [d.id, d]));
    const itinerary = await recomputeItinerary({ input: body.input, dests, router: ctx.router, settings: readSettings(db) }, body.plan, body.meta);
    res.json(itinerary);
  }));

  return r;
}

export interface Category { id: string; name: string; description: string | null }

export interface Dest {
  id: string; name: string; kind: 'wisata' | 'kuliner' | 'kafe'; categoryId: string; categoryName: string; summary: string;
  addressText: string | null; lat: number; lng: number;
  price: { min: number; max: number } | null;
  avgDurationMin: number;
  openHours: Partial<Record<DayKey, [string, string] | null>> | null;
  familyFriendly: boolean; accessibility: string[]; tags: string[]; foodTags: string[]; imageUrl: string | null;
  verified: { coords: boolean; price: boolean; hours: boolean };
  distanceKm: number | null;
}
export type DayKey = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';
export interface DestDetail extends Dest { description: string | null; facilities: string[]; gallery: string[]; dataStatus: 'demo' | 'verified'; nearby: Dest[] }
export interface AdminDest extends DestDetail { isPublished: boolean; updatedAt: string }

export interface PublicSettings {
  contact: { whatsapp: string | null; email: string | null; instagram: string | null; businessInfo: string | null };
  policy: { isDemo: boolean; cancellation: string; payment: string; minParticipants: string };
  payment: { configured: boolean; bankName: string | null; accountNumber: string | null; accountHolder: string | null };
  booking: { holdHours: number; maxPerOrder: number; feeFlat: number };
}
export interface Meta {
  categories: Category[]; settings: PublicSettings;
  engine: { ai: boolean; aiName: string | null; routing: string };
  origins: { label: string; lat: number; lng: number; approximate: boolean }[];
  today: string; demoData: boolean;
}

export type TripState = 'tersedia' | 'penuh' | 'ditutup' | 'dibatalkan' | 'selesai' | 'draft';
export interface Trip {
  id: number; slug: string; title: string; theme: string | null; summary: string | null; date: string; departTime: string; endTime: string;
  meetingPoint: string | null; price: number; capacity: number; minParticipants: number; registrationDeadline: string | null;
  imageUrl: string | null; status: string; isDemo: boolean;
  seats: { capacity: number; held: number; left: number; confirmed: number };
  state: TripState;
  minimum: { required: number; confirmed: number; met: boolean; label: string };
  places?: string[];
}
export interface TripStop { id: number; sortOrder: number; time: string; title: string; destinationId: string | null; note: string | null; destinationName: string | null; lat: number | null; lng: number | null; coordsVerified: number | null }
export interface TripDetail extends Trip { included: string[]; excluded: string[]; safety: string[]; faq: { q: string; a: string }[]; itinerary: TripStop[] }

export interface PaymentInfo { id: number; method: string; amount: number; status: string; payerName: string | null; reference: string | null; note: string | null; submittedAt: string | null; verifiedAt: string | null }
export interface EstimateLine { key: string; label: string; amount: number | null; basis: string; verified: boolean; included: boolean }
export interface PrivateEstimate { isFinal: false; lines: EstimateLine[]; subtotal: number; margin: number; estimate: number; range: { low: number; high: number }; perPerson: number; unknown: string[]; notes: string[] }
export interface Booking {
  id: number; code: string; type: 'open' | 'private'; status: string; statusLabel: string; participants: number; unitPrice: number; subtotal: number; fee: number; total: number;
  contact: { name: string; phone: string; email: string }; expiresAt: string | null; cancelReason: string | null; refundStatus: string; quoteNote: string | null;
  createdAt: string; updatedAt: string;
  trip: { id: number; slug: string; title: string; date: string; departTime: string; meetingPoint: string | null } | null;
  payment: PaymentInfo | null;
  details: (PrivateDetails & { quote?: { lines: { label: string; amount: number }[]; included: string[]; excluded: string[]; sentAt: string; validDays: number } }) | null;
  actions: { canPay: boolean; canCancel: boolean };
  userId?: number;
}
export interface PrivateDetails {
  desiredDate: string; flexibleDates: boolean; days: number; origin: string; destinationIds: string[]; tourTypes: string[]; vehicle: string;
  budget: { mode: 'per_person' | 'total'; amount: number | null }; facilities: { transport: boolean; tickets: boolean; meals: boolean; guide: boolean };
  mealsPerDay: number; notes: string; itineraryDraft: { title: string; days: { date: string; stops: { destinationId: string; name: string }[] }[] } | null;
  estimate: PrivateEstimate;
}

/* ---------- planner ---------- */
export type Interest = 'alam' | 'kuliner' | 'budaya' | 'keluarga' | 'hidden_gems' | 'foto' | 'kafe';
export type Pace = 'santai' | 'sedang' | 'padat';
export type Vehicle = 'motor' | 'mobil_pribadi' | 'sewa' | 'umum';
export interface PlannerInput {
  participants: number; startDate: string; days: number; dayStart: string; dayEnd: string;
  origin: { label: string; lat: number; lng: number };
  vehicle: Vehicle; budget: { mode: 'per_person' | 'total'; amount: number | null };
  interests: Interest[]; pace: Pace; foodPrefs: ('halal' | 'vegetarian' | 'tidak_pedas')[]; maxLegMinutes: number | null;
  mustVisit: string[]; avoid: string[]; accessibility: ('kursi_roda' | 'lansia' | 'anak_kecil')[];
}
export type Flag = 'harga_perlu_konfirmasi' | 'jam_perlu_konfirmasi' | 'lokasi_perkiraan';
export interface Money { low: number; mid: number; high: number }
export interface StopPlan {
  destinationId: string; role: 'visit' | 'meal';
  dest: { name: string; kind: string; categoryName: string; addressText: string | null; lat: number; lng: number; summary: string; imageUrl: string | null; familyFriendly: boolean };
  arrive: string; depart: string; durationMin: number; waitMin: number;
  travel: { from: string; distanceKm: number; minutes: number; source: string };
  pricePerPerson: { min: number; max: number } | null; costKind: 'tiket' | 'makan'; groupCost: Money | null;
  hours: { open: string; close: string } | null; flags: Flag[]; tip?: string;
}
export interface DayPlan {
  dayIndex: number; date: string; stops: StopPlan[];
  returnLeg: { distanceKm: number; minutes: number; source: string; backAt: string };
  totals: { distanceKm: number; travelMin: number; tickets: Money; food: Money; transport: number };
}
export interface Warning { level: 'info' | 'warn' | 'error'; code: string; message: string; day?: number; destinationId?: string }
export interface BudgetSummary {
  tickets: Money; food: Money; transport: number; total: Money; perPerson: Money; unknownPriceCount: number; allowedTotal: number | null;
  status: 'ok' | 'mungkin_lebih' | 'melebihi' | 'tidak_diatur'; note: string;
}
export interface Check { key: string; label: string; status: 'ok' | 'perhatian' | 'gagal' | 'belum_pasti'; detail: string }
export interface Itinerary {
  title: string; summary: string; input: PlannerInput; days: DayPlan[]; budget: BudgetSummary; warnings: Warning[]; checks: Check[];
  engine: { mode: 'demo' | 'ai'; routing: string; note: string }; generatedAt: string; disclaimer: string;
}
export interface PlanEntry { destinationId: string; role: 'visit' | 'meal' }
export interface SavedItinerary { id: number; title: string; shareToken: string | null; createdAt: string; updatedAt: string; itinerary: Itinerary; plan: PlanEntry[][] }
export interface SavedItem { id: number; title: string; shared: boolean; updatedAt: string; days: number; startDate: string; participants: number; stops: number }

export interface User { id: number; name: string; email: string; role: 'user' | 'admin' }
export interface Notice { id: number; bookingId: number | null; title: string; body: string; readAt: string | null; createdAt: string }

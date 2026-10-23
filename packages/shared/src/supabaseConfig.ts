// Supabase loyihasi (MIGRATION-PLAN.md): ommaviy manzil va publishable kalit — klientlarda bo'lishi mumkin,
// ma'lumotni RLS himoya qiladi. service_role kaliti hech qachon bu yerda bo'lmaydi.
// Panel/landing: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY; desktop: build vaqtida SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY.
export const SUPABASE_DEFAULTS = {
  url: "https://prkrhitgkjyuwyipqimw.supabase.co",
  publishableKey: "sb_publishable_SrliT3-Dc98IWucZ1Zt_hg_5AXtIOQf",
} as const;

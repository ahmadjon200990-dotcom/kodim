// event_types jadvali uchun SQL — manba: packages/shared/src/events.ts (EVENT_SEVERITY, SERVER_ONLY_EVENT_TYPES).
// Yangi tur qo'shilsa: `node --import ./packages/shared/test/ts-resolve.mjs supabase/scripts/gen-event-types.mjs`
// natijasini yangi migratsiyaga yozing. Moslik `supabase/tests/run.mjs` da tekshiriladi.
import { EVENT_SEVERITY, SERVER_ONLY_EVENT_TYPES } from "../../packages/shared/src/events.ts";

const rows = Object.entries(EVENT_SEVERITY).map(
  ([type, severity]) => `  ('${type}', '${severity}', ${!SERVER_ONLY_EVENT_TYPES.includes(type)})`,
);
console.log(`insert into public.event_types (type, severity, client_allowed) values
${rows.join(",\n")}
on conflict (type) do update set severity = excluded.severity, client_allowed = excluded.client_allowed;`);

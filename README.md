# EduPath

Tutor & mentor marketplace for Ethiopia — React 19 + TypeScript + Vite + Supabase (Auth, Postgres, RLS). Deployed on Vercel at https://edupath3h.vercel.app.

## What works (backend-connected)
- **Accounts**: sign-up (student / parent / tutor / mentor), email confirmation, log in/out, session restore, password reset and change, expired-session handling.
- **Discovery**: only *admin-verified* tutors/mentors are public. Search plus filters for subject, level, location, session type, weekday, price (ETB/h), sort.
- **Profiles**: qualifications, subjects, languages, price, weekly availability, real reviews (no review → shows "New", never a fake rating).
- **Booking**: slot picker built from availability minus booked time → `request_booking` RPC (re-validates everything server-side, exclusion constraints prevent double booking) → tutor accepts/declines → cancel / complete → review (completed bookings only, one per booking).
- **Favorites**, **in-app messaging** (one conversation per booking, 5 s polling), **in-app notifications** (30 s polling).
- **Tutor dashboard**: profile editor, availability editor, verification submission. **Admin**: verification queue.

**Not included (be aware):** payments (EduPath takes no money; users agree payment directly), email/SMS/push notifications beyond Supabase Auth emails, document upload for credentials (admins review the qualifications text), reports/moderation queue, UI translation (Amharic/Oromo). Admins can remove a review with SQL/RLS `delete` today.

## Configuration
Copy `.env.example` → `.env` (local) and set the same variables in **Vercel → Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://urtepxlegqmkgylneeup.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | publishable (anon) key from Supabase → Project Settings → API |
| `VITE_SITE_URL` | `https://edupath3h.vercel.app` (optional; used in email links) |

Never put a secret/service-role key in a `VITE_` variable.

### Supabase dashboard settings (required, done by you)
1. **Authentication → URL Configuration**: Site URL `https://edupath3h.vercel.app`; Redirect URLs: `https://edupath3h.vercel.app/auth/callback`, `https://edupath3h.vercel.app/reset-password` (add `http://localhost:5173/**` for local dev).
2. **Authentication → Providers → Email**: keep *Confirm email* **on** (the app handles both on/off). Supabase's built-in mailer is rate-limited and meant for testing; configure a custom SMTP provider before launch.
3. Apply the migrations (below).

## Database migrations (apply in order)
```
supabase/migrations/202610250001_initial_foundation.sql   (repo baseline; the hosted project was created from an earlier equivalent schema)
supabase/migrations/202610250002_marketplace.sql          (additive; works on the repo baseline AND the hosted project's original schema)
supabase/migrations/202610250003_hardening.sql            (revokes a trigger function from the API; moves btree_gist out of `public`)
```
**Status of the hosted project (`urtepxlegqmkgylneeup`, applied 2026-10-26 via Supabase MCP):** the marketplace and hardening migrations are applied; the original `edupath_initial_schema` was left untouched. The original schema allowed users to update their own `profiles.role` (including `admin`) and tutor verification fields; migration 2 closes both with column-level grants, a guard trigger, and no admin role in `user_roles` (admins live in a separate `admins` table).

Remaining advisor notes (all intentional): `public_tutors`, `public_reviews`, `booking_details`, `my_conversations` are owner-rights views that expose only public columns or rows filtered by `auth.uid()`; the booking/verification RPCs are signed-in-callable `SECURITY DEFINER` functions that re-check permissions internally; `tutor_busy_slots` is public on purpose (time ranges only). **Leaked-password protection** is a dashboard toggle (Authentication → Password security) that I cannot set from SQL.

### Create your first administrator
There is deliberately no admin signup. After registering normally, run once in the SQL editor:
```sql
insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
```
Admins then see **Admin** in the account menu to verify tutors.

## Security model
- Roles chosen at sign-up are only *requests*, whitelisted by a DB trigger (`student|parent|tutor|mentor`, never admin). Tutors are invisible until an admin verifies them. `admins` is a separate table with no client write access.
- All booking/verification/notification writes go through `SECURITY DEFINER` functions; clients have **no** direct INSERT/UPDATE on `bookings`, `notifications`, `user_roles`, `admins`, and only column-limited UPDATE on profiles/tutor profiles/reviews. Verification columns are additionally guarded by a trigger.
- Every table has RLS; `anon` has no access to private tables or write RPCs.
- Booking status changes are validated in the database (transition trigger) as well as in the RPCs.

## Develop / test
```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck && npm test && npm run build
npm run test:db      # needs local Postgres; runs migrations + RLS suite on a THROWAWAY db
BASELINE=live npm run test:db   # same suite, starting from a replica of the hosted project's original schema
```

## Deploy (Vercel)
Framework preset Vite; build `npm run build`; output `dist`. `vercel.json` rewrites all routes to `index.html` so deep links (e.g. `/tutors/<id>`) survive a refresh.

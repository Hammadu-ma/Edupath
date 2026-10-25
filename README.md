# EduPath

Mobile-first tutoring and mentorship discovery prototype built with React, TypeScript, Vite and Supabase.

## Requirements
- Node.js 20.19+ or 22.12+
- A Supabase project for real authentication/data
- npm

## Run locally
```bash
npm install
cp .env.example .env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Architecture
- `src/` contains the React client, UI and lightweight client-side validation.
- `src/lib/api.ts` is the client for a separate serverless API. Set `VITE_API_BASE_URL` to the deployed API base URL.
- `supabase/` contains database migration and Edge Function starting points.
- Frontend Supabase config uses only a publishable key. Never expose secret/service-role keys in `VITE_` variables or browser bundles.
- Privileged actions (tutor verification, booking state changes, payment confirmation, admin actions, matching rules) must be implemented in authenticated serverless endpoints. Do not treat UI checks as authorization.
- Any tables exposed through Supabase APIs need carefully designed RLS policies. Apply least privilege even when requests are routed through server functions.

## Current prototype status
- Responsive landing page and mobile navigation
- Tutor/mentor discovery UI, search and subject filter
- Demo tutor profiles and save interaction (sample content only)
- Sign-in and sign-up screens wired to Supabase Auth when configured
- Explicit API client placeholder for privileged backend operations

The sample tutor cards and reviews are fictional UI demo data. No real booking, messaging, tutor verification or payments are enabled yet.

## Next implementation steps
1. Create SQL migrations for profiles, role assignments, tutor profiles, credentials, subjects, goals and booking records.
2. Write RLS policies and storage policies; test user isolation.
3. Implement authenticated serverless API endpoints for profile completion, verification submissions, tutor search, booking requests, booking transitions, messaging and reports.
4. Add automated tests for role/ownership checks and booking state transitions.
5. Add deployment configuration and CI build checks.

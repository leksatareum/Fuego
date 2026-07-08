# Security Notes

Fuego currently runs as a client-side Vite app that talks directly to Supabase with the public anon key.

## Current risks

- User PINs are loaded in the browser and checked client-side.
- Admin access is controlled client-side through `isAdmin`.
- Current Row Level Security policies allow broad anon read/write access for operational tables.
- The Supabase anon key is public by design, but it should be paired with restrictive RLS policies before production use.

## Recommended hardening path

1. Move login to Supabase Auth or a server-side Edge Function verification flow.
2. Store PINs as hashes only, never as readable values returned to the browser.
3. Replace `allow all` RLS policies with authenticated role policies per table and operation.
4. Keep environment-specific values in `.env.local`; commit only `.env.example`.
5. Add audit tables or triggers for destructive actions such as task clearing, user deletion and stock deletion.

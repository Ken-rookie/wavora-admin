# Wavora Admin Panel (HTML / CSS / JavaScript)

This is a separate-file admin web app designed around the supplied Wavora Flutter/Supabase project. It uses the existing schema tables:
`profiles`, `artists`, `albums`, `songs`, `purchases`, `content_reports`, and Storage buckets `cover-art`, `audio`, `music-videos`.

## Included
- Admin-only email/password login (no public admin signup).
- Overview dashboard with counts calculated from live Supabase rows.
- Songs/music videos: create, edit, upload media, publish/unpublish, delete.
- Artists: create, edit, verify, delete.
- Albums: create, edit, delete.
- Purchases: read-only list and status filtering.
- Reports: read and update moderation status.
- Search, responsive sidebar, status badges, error handling, loading states.
- Supabase Auth session check and `profiles.role === 'admin' && is_active === true` gate.
- Separate `index.html`, `css/styles.css`, `js/config.js`, and `js/app.js`.

## Setup

1. Unzip this folder.
2. Open `js/config.js`.
3. Replace `https://YOUR_PROJECT.supabase.co` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with the URL and publishable/anon key from the **same Supabase project** as the Flutter app.
4. Ensure your Supabase schema is installed and RLS policies from your project's schema are enabled.
5. Create a regular user through your Flutter app or Supabase Auth.
6. In Supabase SQL Editor, promote the trusted account by its Auth UUID:

   ```sql
   update public.profiles
   set role = 'admin', is_active = true
   where id = 'YOUR_AUTH_USER_UUID';
   ```

7. Serve the folder using a local web server (recommended; avoid `file://`):
   - VS Code Live Server, or
   - `python -m http.server 8080` in this folder, then visit `http://localhost:8080`.

## Security notes

- The browser uses only the publishable/anon key. Never put `service_role`, database passwords, payment secrets, or webhook secrets in `js/config.js`.
- Supabase RLS is the real security boundary; hiding admin screens in JavaScript is not sufficient on its own.
- The app never marks a purchase as paid and never processes payment events. Payment verification must happen in a trusted server-side Edge Function/webhook.
- Purchase amounts are displayed in the currency on each row; the overview revenue tile currently totals paid purchase minor units and labels it PHP, so use a single currency or change aggregation before supporting multiple currencies.
- Media upload uses Storage policies from the supplied schema. `cover-art` is public for artwork; audio and music videos are private.
- For security, consider creating an Edge Function for all media upload and signed URL issuance, and configure CSP / HTTPS when deploying.
- If your SQL schema differs, update the queries and fields to match the installed database.
- The frontend uses the Supabase JS v2 CDN, so the browser needs internet access.

## Important schema compatibility notes

The provided schema grants `UPDATE` to `content_reports` only through RLS admin policy but broad SQL grants may vary by migration history. Ensure authenticated has the required UPDATE grant for reports. For example, if needed:

```sql
grant update on public.content_reports to authenticated;
```

For storage uploads, file size/MIME restrictions are enforced by bucket configuration and Storage policies. Confirm that the existing project has the same bucket names and policies.

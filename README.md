# Mentor Tracker

A static web portal for NMAMIT mentorship workflows. Students register, log academics, activities, and mentor meetings, while an Apps Script backend persists the data to Google Sheets/Drive. Every action now requires Google Sign-In so only authorised accounts can hit the APIs.

## Highlights
- Google GIS sign-in gating on every page (works with Workspace accounts).
- Student registration with server-generated access keys and duplicate detection.
- Academic, activity, meeting, and photo uploads backed by Google Sheets / Drive.
- Student dashboard with summaries and Plotly visualisations.
- Configurable API endpoints via `config-helper.js` query parameters or local storage.

## Backend Deployment
1. **Primary API (`tryagain.gs`)**
   - Paste `tryagain.gs` into the Apps Script project attached to your mentorship spreadsheet.
   - Update the constants at the top:
     - `CLIENT_ID` - your Google Identity Services web client ID.
     - `ALLOWED_EMAILS` / `ALLOWED_DOMAINS` - who is allowed to use the portal.
     - `ACTIVITY_FOLDER_ID` - Drive folder that stores activity proof uploads.
   - Deploy as a web app (`Execute as: Me`, `Who has access: Anyone` or Workspace domain).

2. **Photo upload API (`tracks.gs`)**
   - Create a second Apps Script project, paste `tracks.gs`, and fill in:
     - `SHEET_ID` - the sheet that contains the `photo` tab (and `students` tab for validation).
     - `FOLDER_ID` - Drive folder for photos.
     - `UPLOAD_ALLOWED_EMAILS` / `UPLOAD_ALLOWED_DOMAINS` - mirror the allow-list from the primary API if you want both endpoints in sync.
   - Reuse the same GIS client ID and allowed accounts.
   - Deploy as a web app and note the upload URL.

Both scripts verify the Google ID token server-side (`tokeninfo` API), enforce allow-lists, limit file types/size, and log to Apps Script execution logs.

## Frontend Configuration
- `auth-helper.js` renders the floating GIS sign-in widget and appends id tokens to every fetch request (`MENTOR_TRACKER_secureFetch`). It also disables `[data-auth-required]` blocks until auth succeeds.
- Each HTML page sets:
  ```html
  <script>
    window.MENTOR_TRACKER_CLIENT_ID = "YOUR_WEB_CLIENT_ID";
    window.MENTOR_TRACKER_AUTH_OPTIONS = {
      allowedEmails: ["jason1987martis@nitte.edu.in"],
      allowedDomains: ["nmamit.in"]
    };
  </script>
  ```
  Adjust the allow-list to match your deployment. (The legacy `allowedDomain` string still works, but `allowedDomains` lets you enumerate multiple Workspace tenants.)
- If you are fronting the Apps Script endpoints with another host (e.g. the Vercel proxy described below), set the defaults before loading `config-helper.js`:
  ```html
  <script>
    window.MENTOR_TRACKER_DEFAULT_API_URL = "https://YOUR_VERCEL_APP.vercel.app/api/core";
    window.MENTOR_TRACKER_DEFAULT_UPLOAD_URL = "https://YOUR_VERCEL_APP.vercel.app/api/upload";
  </script>
  ```
- Override API endpoints without rebuilding by visiting `index.html?apiUrl=...&uploadUrl=...`. `config-helper.js` stores overrides in `localStorage` and propagates them to internal links.

## Vercel Proxy Deployment
The `vercel-proxy` folder contains a lightweight Node.js proxy that lives on Vercel and forwards every request to your Apps Script web apps while injecting the right CORS headers.

1. `cd vercel-proxy` and connect the folder to a Vercel project (`vercel link`).
2. Add the required environment variables (via the Vercel dashboard or `vercel env add`):
   - `CORE_TARGET_URL` - the `exec` URL of `tryagain.gs`.
   - `UPLOAD_TARGET_URL` - the `exec` URL of `tracks.gs`.
   - `PROXY_ALLOWED_ORIGINS` (optional but recommended) - comma-separated list of front-end origins, e.g. `https://<username>.github.io`.
   - `PROXY_ALLOWED_HEADERS` (optional) - overrides the default `Content-Type,Authorization,X-Requested-With`.
3. Deploy: `vercel deploy --prod`.
4. Point the static site at the proxy by defining the globals in your HTML (as shown above) or via the existing `?apiUrl=` / `?uploadUrl=` query parameters.

Once deployed you can hit `https://YOUR_VERCEL_APP.vercel.app/api/core?formType=lookup` to confirm the proxy reaches Apps Script, and your GitHub Pages site will call the same path without any CORS errors.

## Key Behaviour Changes
- **Registration** - access keys are generated on the server (`Utilities.getUuid()` based) and returned once in the JSON response. The frontend no longer generates or reuses old keys.
- **Lookup API** - returns only boolean flags (`success`/`registered`), preventing personal data leaks.
- **Uploads** - `photoupload.html` validates MIME type, size (<=5 MB), and relies on the new upload endpoint (`tracks.gs`), which writes Drive files and records the link in the `photo` sheet.
- **Logging** - major operations (`REGISTER`, `ACADEMIC`, `ACTIVITY`, `MEETING`, `PHOTO`) are logged with `Logger.log` for audit trails.

## Development Notes
- `MENTOR_TRACKER_secureFetch` injects the ID token in headers, query strings, and POST bodies. Any custom fetch should use this helper to stay authenticated.
- CORS headers are emitted by both Apps Script endpoints (`Access-Control-Allow-Origin` defaults to the GitHub Pages host). Update the arrays in `tryagain.gs` / `tracks.gs` if you host elsewhere.
- The codebase uses plain HTML/JS; serve locally with `npx serve` or `python -m http.server` if required.

## License
jason1987martis officially owns these files.

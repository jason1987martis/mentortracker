# Mentor Tracker

A lightweight mentorship portal for registering students, capturing academic progress, tracking activities, logging mentor meetings, and offering a self-service dashboard. The frontend is fully static (HTML/CSS/JS) and communicates with Google Apps Script web apps that write to Google Sheets and Drive.

## Highlights
- Student registration with access-key generation and duplicate detection
- Academic, activity, meeting, and photo uploads with Google Sheets as the data store
- Student dashboard with summaries and charts powered by Plotly
- Mentor setup flow (`mentor.html`) so each mentor can point the UI at their own Apps Script deployment without modifying the hosted files
- Works on any static host (GitHub Pages, Netlify, local web server, etc.)

---

## Live Demo (default backend)
[GitHub Pages deployment](https://jason1987martis.github.io/mentortracker/index.html) – uses the default Apps Script URLs baked into the project. Mentors can override these endpoints via the hidden `mentor.html` page.

---

## Repository Layout

```
├─ academic.html          # Academic entry form
├─ activities.html        # Activity points entry form
├─ APIscript.gs           # Main Apps Script for registration/dashboard/forms
├─ config-helper.js       # Frontend helper for query-param/localStorage config
├─ mentor.html            # Mentor-only configuration screen (password-protected)
├─ photoupload.html       # Photo/PDF upload page (uses optional upload script)
├─ photouploadscript.gs   # Alternate Apps Script dedicated to file uploads
├─ register.html          # Student registration form
├─ viewdash.html          # Student dashboard
└─ … other static assets (index.html, meeting.html, list.html, etc.)
```

---

## Prerequisites
- Google account with access to Drive and Google Sheets
- Permission to deploy Google Apps Script web apps (“Anyone with the link” access)
- Optional: GitHub account (or any other static hosting platform)

---

## 1. Prepare Google Drive & Sheets

1. Create a Google Drive folder to store uploaded certificates/proofs. Note its folder ID (the long string in the URL after `/folders/`).
2. Create a Google Sheet and add the following tabs **with header rows that match the column order exactly**:

   | Sheet | Columns (left → right) |
   |-------|------------------------|
   | `students` | `Name`, `USN`, `DOB`, `SSLC`, `PUC`, `NUCAT`, `Access Key`, `Student Phone`, `Student Email`, `Stay Type`, `Hobbies`, `Father Name`, `Father Occupation`, `Mother Name`, `Mother Occupation`, `Residential Address`, `Father Phone`, `Mother Phone` |

   | `academic` | `USN`, `Semester`, `Course Code`, `Course Name`, `Attendance`, `MSE1`, `MSE2`, `Task`, `SEE`, `Grade Type`, `Grade Point`, `SGPA` |

   | `activities` | `USN`, `Semester`, `Date`, `Activity Type`, `Event Details`, `Credit Points`, `Proof Link` |

   | `meetings` | `USN`, `Semester`, `Date`, `Problems Faced`, `Issue Solved` |

   | `photo` *(optional, only if you use `photouploadscript.gs`)* | `USN`, `Image Formula`, `Shareable Link`, `Viewable Link` |

   > Tip: populate one sample row or freeze the header row to keep the structure intact.

3. Share the sheet with anyone who needs edit access (or keep it restricted and run the portal yourself).

---

## 2. Deploy the Main Google Apps Script (`APIscript.gs`)

1. In your Google Sheet, open **Extensions → Apps Script**.
2. Delete any starter code, then paste the contents of `APIscript.gs` into the editor (or split into multiple files if you prefer).
3. Update the placeholder Drive folder ID near the top of `saveActivityWithBlob`:
   ```js
   const folder = DriveApp.getFolderById("YOUR_FOLDER_ID_HERE");
   ```
4. Click **Deploy → Test deployments** to verify everything runs (use the “Event” dropdown to simulate requests).
5. Once satisfied, click **Deploy → Manage deployments → New deployment**.
   - Choose **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** or **Anyone with the link**
6. Copy the generated **Web app URL** – this is your primary API endpoint. Example: `https://script.google.com/macros/s/XXXXXXX/exec`

> The deploy URL changes each time you create a new version. If you redeploy, update your frontend configuration accordingly.

---

## 3. (Optional) Deploy the Photo Upload Script (`photouploadscript.gs`)

The main script already handles activity submissions with file blobs. If you prefer a dedicated uploader (for `photoupload.html`):

1. Create a **new** Apps Script project (Apps Script standalone or another sheet).
2. Paste the contents of `photouploadscript.gs`.
3. Replace the placeholder IDs at the top:
   ```js
   const SHEET_ID = 'YOUR_SHEET_ID';    // the same sheet that contains the `photo` tab
   const FOLDER_ID = 'YOUR_FOLDER_ID';  // Drive folder for uploads
   ```
4. Deploy as a web app (same settings as above). Copy the resulting URL – this becomes your `uploadUrl`.

If you’d rather keep everything in one deployment, you can ignore this script and rely on the `saveActivityWithBlob` handler already present in `APIscript.gs` (just ensure the Drive folder ID there is correct). Update `photoupload.html` to point at the same endpoint if you choose that route.

---

## 4. Configure the Frontend (Only for Mentors).

1. By default the pages use the URLs embedded in `config-helper.js`. To supply your own endpoints you have two options:
   - **Query-string override**: append `?apiUrl=YOUR_URL&uploadUrl=OPTIONAL_URL` to any page. The helper stores these values in `localStorage` and reuses them automatically.
   - **Mentor setup flow**: visit `mentor.html` (the link is intentionally absent from navigation). Enter the mentor credentials, paste the Apps Script URLs, and the tool redirects to the portal with the correct configuration applied.

---

## Troubleshooting

- **“Invalid USN or Access Key”**: ensure the student record exists in the `students` sheet with the Access Key in column 7 (index 6).
- **Uploads fail**: double-check the Drive folder ID and sharing permissions. The folder must allow the Apps Script project to create files. For `photouploadscript.gs`, the script also sets files to *Anyone with the link – View*.
- **Dashboard empty**: verify the `formType=dashboard` endpoint is enabled (make sure you deployed the latest version of `APIscript.gs`) and that academic/activity/meeting sheets use the required headers.
- **Mentor configuration not sticking**: confirm the browser allows `localStorage`. You can rerun `mentor.html` to reset the values.

---

## Development Notes

- The project is intentionally static—no bundler. If you need to serve locally, run a simple HTTP server (`npx serve`, `python -m http.server`, etc.) from the project root.
- `config-helper.js` centralises all configuration logic. If you add new pages, include the script and mark any internal links with `data-keep-query` to preserve the override parameters.
- For security-sensitive deployments, consider adding backend verification (emails, tokens, etc.) before accepting mentor submissions.

---
## License
jason1987martis officially owns these files.

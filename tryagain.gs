/**
 * Mentor Tracker core API with Google Identity token enforcement.
 *
 * Update constants as needed before deploying.
 */

const CLIENT_ID = "470142220043-4pm52ffc5gapjdgtplf6uim5t5o1juj7.apps.googleusercontent.com";
const ALLOWED_EMAILS = ["jason1987martis@nitte.edu.in"];
const ALLOWED_DOMAIN = "nmamit.in";
const TOKEN_CACHE_SECONDS = 300;
const TOKEN_CACHE_PREFIX = "mentortracker:idtoken:";
const ALLOWED_ORIGINS = ["https://jason1987martis.github.io", "*"];
const CORS_ALLOW_HEADERS = "Authorization, Content-Type";
const CORS_ALLOW_METHODS = "GET,POST,OPTIONS";
const CORS_MAX_AGE = "3600";
const ACTIVITY_FOLDER_ID = "MentorData"; // TODO: replace with actual Drive folder ID

function doGet(e) {
  return handleRequest("GET", e);
}

function doPost(e) {
  return handleRequest("POST", e);
}

function doOptions(e) {
  return withCors(ContentService.createTextOutput(""), e);
}

function handleRequest(method, e) {
  const ctx = parseRequest(e, method);
  const authFailure = authenticateRequest(ctx);
  if (authFailure) {
    Logger.log(`AUTH FAIL (${method}) :: ${authFailure.response.code} :: ${ctx.ip || "unknown"} :: ${ctx.params.formType || "(none)"}`);
    return authFailure.response;
  }

  Logger.log(`AUTH OK (${method}) :: ${ctx.user.email} :: ${ctx.params.formType || "(none)"}`);

  try {
    if (method === "GET") return handleGet(ctx);
    if (method === "POST") return handlePost(ctx);
    return jsonError("Unsupported HTTP method.", 405);
  } catch (err) {
    Logger.log(`ERROR (${method}) :: ${err.stack || err}`);
    return jsonError("Internal server error.");
  }
}

function handleGet(ctx) {
  const formType = (ctx.params.formType || "").toLowerCase();
  if (formType === "lookup") {
    return lookupStudent(ctx.params.usn, ctx.params.accessKey);
  }
  if (formType === "dashboard") {
    return getFullDashboardData(ctx.params.usn, ctx.params.accessKey);
  }
  return jsonError("Unsupported GET request.", 400);
}

function handlePost(ctx) {
  if (ctx.isMultipart) {
    return saveActivityWithBlob(ctx);
  }

  const formType = (ctx.params.formType || "").toLowerCase();
  switch (formType) {
    case "registration":
      return saveStudent(ctx.params);
    case "academic":
      return saveAcademic(ctx.params);
    case "meeting":
      return saveMeeting(ctx.params);
    case "activity":
      return saveActivity(ctx.params);
    case "lookup":
      return lookupStudent(ctx.params.usn, ctx.params.accessKey);
    default:
      return jsonError("Unknown formType.", 400);
  }
}

function parseRequest(e, method) {
  const params = Object.assign({}, e.parameter || {});
  const contentType = (e.postData && e.postData.type) || "";
  let bodyObj = null;

  if (method === "POST" && e.postData && e.postData.contents) {
    if (contentType.indexOf("application/json") !== -1) {
      try {
        bodyObj = JSON.parse(e.postData.contents || "{}");
        Object.assign(params, bodyObj);
      } catch (err) {
        Logger.log("JSON parse failure: " + err);
      }
    }
  }

  const idToken = extractIdToken(params, bodyObj);
  delete params.idToken;

  return {
    method: method,
    params: params,
    body: bodyObj,
    raw: e,
    contentType: contentType,
    isMultipart: contentType.indexOf("multipart/form-data") !== -1,
    idToken: idToken,
    ip: e?.context?.clientIp || ""
  };
}

function extractIdToken(params, body) {
  if (params.idToken) return params.idToken;
  if (body && body.idToken) return body.idToken;
  return "";
}

function authenticateRequest(ctx) {
  if (!ctx.idToken) {
    return { response: jsonError("Missing ID token.", 401) };
  }

  const payload = verifyIdToken(ctx.idToken);
  if (!payload) {
    return { response: jsonError("Invalid or expired ID token.", 401) };
  }

  if (!isEmailAllowed(payload)) {
    return { response: jsonError("Account not authorised for Mentor Tracker.", 403) };
  }

  ctx.user = payload;
  return null;
}

function verifyIdToken(token) {
  if (!token) return null;

  const cache = CacheService.getScriptCache();
  const cacheKey = TOKEN_CACHE_PREFIX + token;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let response;
  try {
    response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
  } catch (err) {
    Logger.log("tokeninfo fetch failed: " + err);
    return null;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log("tokeninfo error: " + response.getContentText());
    return null;
  }

  const payload = JSON.parse(response.getContentText());

  if (payload.aud !== CLIENT_ID) {
    Logger.log(`Token audience mismatch: ${payload.aud}`);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    Logger.log(`Token expired at ${payload.exp}`);
    return null;
  }

  if (TOKEN_CACHE_SECONDS > 0 && payload.exp) {
    const ttl = Math.min(TOKEN_CACHE_SECONDS, Math.max(payload.exp - now, 0));
    if (ttl > 0) cache.put(cacheKey, JSON.stringify(payload), ttl);
  }

  return payload;
}

function isEmailAllowed(payload) {
  const email = (payload.email || "").toLowerCase();
  if (!email) return false;

  if (ALLOWED_EMAILS.length > 0 && ALLOWED_EMAILS.indexOf(email) !== -1) {
    return true;
  }

  if (ALLOWED_DOMAIN) {
    const domain = (payload.hd || email.split("@")[1] || "").toLowerCase();
    if (domain === ALLOWED_DOMAIN.toLowerCase()) {
      return true;
    }
  }

  return ALLOWED_EMAILS.length === 0 && !ALLOWED_DOMAIN;
}

/* -------------------------------------------------------------------------- */
/*  Core helpers                                                              */
/* -------------------------------------------------------------------------- */

function resolveCorsOrigin() {
  if (!ALLOWED_ORIGINS || !ALLOWED_ORIGINS.length) {
    return "*";
  }
  if (ALLOWED_ORIGINS.indexOf("*") !== -1) {
    return "*";
  }
  return ALLOWED_ORIGINS[0];
}

function withCors(output) {
  const origin = resolveCorsOrigin();
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", origin)
    .setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS)
    .setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS)
    .setHeader("Access-Control-Max-Age", CORS_MAX_AGE)
    .setHeader("Access-Control-Allow-Credentials", "false")
    .setHeader("Vary", "Origin");
}

function jsonResponse(payload) {
  return withCors(ContentService.createTextOutput(JSON.stringify(payload)));
}

function jsonError(message, code) {
  return jsonResponse({
    success: false,
    error: message,
    code: code || 400
  });
}

function clean(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (/^[=+\-@]/.test(trimmed)) {
    return "'" + trimmed;
  }
  return trimmed;
}

function cleanRow(values) {
  return values.map(clean);
}

function generateAccessKey(usn) {
  const prefix = (usn || "XX").slice(0, 3).toUpperCase();
  const uuidSegment = Utilities.getUuid().split("-")[0].toUpperCase();
  return `${prefix}-${uuidSegment}`;
}

function findStudentRecord(usn) {
  if (!usn) return null;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("students");
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || "").toString().trim().toUpperCase() === usn.trim().toUpperCase()) {
      return { index: i, row: data[i] };
    }
  }
  return null;
}

function validateStudent(usn, accessKey) {
  const record = findStudentRecord(usn);
  return Boolean(record && record.row[6] === accessKey);
}

/* -------------------------------------------------------------------------- */
/*  API handlers                                                              */
/* -------------------------------------------------------------------------- */

function saveStudent(d) {
  const usn = (d.usn || "").trim();
  if (!usn) return jsonError("USN is required.");

  const existing = findStudentRecord(usn);
  if (existing) {
    return jsonError("Student already registered.", 409);
  }

  const accessKey = generateAccessKey(usn);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("students");
  sheet.appendRow(cleanRow([
    d.name, usn, d.dob, d.sslc, d.puc, d.nucat, accessKey,
    d.student_phone, d.student_email, d.stay_type, d.hobbies,
    d.father_name, d.father_job, d.mother_name, d.mother_job,
    d.res_address, d.father_phone, d.mother_phone
  ]));

  Logger.log(`STUDENT REGISTERED :: ${usn}`);
  return jsonResponse({ success: true, accessKey });
}

function saveAcademic(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return jsonError("Invalid USN or Access Key.", 403);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("academic");
  sheet.appendRow(cleanRow([
    d.usn, d.semester, d.course_code, d.course_name, d.attendance,
    d.mse1, d.mse2, d.task, d.see, d.grade_type, d.grade_point, d.sgpa
  ]));
  Logger.log(`ACADEMIC SAVED :: ${d.usn} :: sem ${d.semester}`);
  return jsonResponse({ success: true });
}

function saveActivity(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return jsonError("Invalid USN or Access Key.", 403);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("activities");
  sheet.appendRow(cleanRow([
    d.usn,
    d.semester,
    d.date,
    d.activity_type,
    d.event_details,
    d.credit_points,
    d.proof_link
  ]));

  Logger.log(`ACTIVITY SAVED :: ${d.usn} :: ${d.activity_type}`);
  return jsonResponse({ success: true });
}

function saveMeeting(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return jsonError("Invalid USN or Access Key.", 403);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("meetings");
  sheet.appendRow(cleanRow([
    d.usn,
    d.semester,
    d.date,
    d.problem,
    d.solution
  ]));

  Logger.log(`MEETING SAVED :: ${d.usn} :: ${d.date}`);
  return jsonResponse({ success: true });
}

function saveActivityWithBlob(ctx) {
  const params = ctx.params;
  const usn = params.usn;
  const accessKey = params.accessKey;

  if (!validateStudent(usn, accessKey)) {
    return jsonError("Invalid USN or Access Key.", 403);
  }

  if (!ctx.raw.postData || !ctx.raw.postData.contents) {
    return jsonError("No file provided.", 400);
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(ACTIVITY_FOLDER_ID);
  } catch (err) {
    return jsonError("Invalid Drive folder configuration.", 500);
  }

  let file;
  try {
    let decoded;
    try {
      decoded = Utilities.base64Decode(ctx.raw.postData.contents);
    } catch (err) {
      decoded = Utilities.base64DecodeWebSafe(ctx.raw.postData.contents);
    }

    const blob = Utilities.newBlob(
      decoded,
      ctx.raw.postData.type || "application/octet-stream"
    );

    const sizeBytes = blob.getBytes().length;
    if (sizeBytes > 5 * 1024 * 1024) {
      return jsonError("File exceeds 5 MB limit.", 413);
    }

    const mime = blob.getContentType();
    if (!(mime === "image/jpeg" || mime === "image/png" || mime === "application/pdf")) {
      return jsonError("Only JPEG, PNG or PDF files allowed.", 415);
    }

    file = folder.createFile(blob);
    file.setName(`${usn}_${new Date().toISOString()}`);
    Logger.log(`ACTIVITY FILE UPLOAD :: ${usn} -> ${file.getId()}`);
  } catch (err) {
    return jsonError("Upload failed: " + err.message, 500);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("activities");
  sheet.appendRow(cleanRow([
    usn,
    params.semester,
    params.date,
    params.activity_type,
    params.event_details,
    params.credit_points,
    file.getUrl()
  ]));

  return jsonResponse({ success: true, fileUrl: file.getUrl() });
}

function lookupStudent(usn, accessKey) {
  const record = findStudentRecord(usn || "");
  if (!record) {
    return jsonResponse({ success: false, registered: false });
  }

  if (!accessKey) {
    return jsonResponse({ success: true, registered: true });
  }

  const valid = record.row[6] === accessKey;
  return jsonResponse({ success: valid, registered: true });
}

function getFullDashboardData(usn, accessKey) {
  if (!validateStudent(usn, accessKey)) {
    return jsonError("Invalid USN or Access Key.", 403);
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const studentSheet = spreadsheet.getSheetByName("students");
  const academicSheet = spreadsheet.getSheetByName("academic");
  const activitySheet = spreadsheet.getSheetByName("activities");
  const meetingSheet = spreadsheet.getSheetByName("meetings");

  const result = {
    success: true,
    personal: {},
    academic: {},
    activities: {},
    meetings: {}
  };

  const studentData = studentSheet.getDataRange().getValues();
  const studentHeaders = studentData[0];
  for (let i = 1; i < studentData.length; i++) {
    const row = studentData[i];
    if (row[1] === usn && row[6] === accessKey) {
      for (let j = 0; j < row.length; j++) {
        const header = studentHeaders[j];
        if (header !== "USN" && header !== "Access Key") {
          result.personal[header] = row[j];
        }
      }
      break;
    }
  }

  function extractSection(sheet, startIndex) {
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const section = {};

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (row[0] === usn) {
        const semester = row[1];
        if (!section[semester]) section[semester] = [];

        const record = {};
        for (let j = startIndex; j < headers.length; j++) {
          record[headers[j]] = row[j];
        }

        section[semester].push(record);
      }
    }
    return section;
  }

  result.academic = extractSection(academicSheet, 2);
  result.activities = extractSection(activitySheet, 2);
  result.meetings = extractSection(meetingSheet, 2);

  return jsonResponse(result);
}

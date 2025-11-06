/**
 * Photo upload endpoint secured with Google Identity tokens.
 */

const UPLOAD_CLIENT_ID = "470142220043-4pm52ffc5gapjdgtplf6uim5t5o1juj7.apps.googleusercontent.com";
const UPLOAD_ALLOWED_EMAILS = ["jason1987martis@nitte.edu.in"];
const UPLOAD_ALLOWED_DOMAIN = "nmamit.in";
const UPLOAD_TOKEN_CACHE_SECONDS = 300;
const UPLOAD_TOKEN_CACHE_PREFIX = "mentortracker:upload:idtoken:";

const SHEET_ID = "11dZ8970TSuvCvfk33lJdbH3-R95EIPAclobuUQD3Ee4";
const FOLDER_ID = "1NeLc2pp6PST4I-Wf6rkT6LvW292lglWe";
const PHOTO_SHEET_NAME = "photo";
const STUDENT_SHEET_NAME = "students";
const UPLOAD_ALLOWED_ORIGINS = ["https://jason1987martis.github.io", "*"];
const UPLOAD_CORS_ALLOW_HEADERS = "Authorization, Content-Type";
const UPLOAD_CORS_ALLOW_METHODS = "POST,OPTIONS";
const UPLOAD_CORS_MAX_AGE = "3600";
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function doPost(e) {
  const ctx = parseUploadRequest(e);
  const authFailure = authenticateUploadRequest(ctx);
  if (authFailure) {
    Logger.log(`UPLOAD AUTH FAIL :: ${authFailure.code} :: ${ctx.ip || "unknown"} :: ${ctx.data ? ctx.data.usn : "no-usn"}`);
    return authFailure.response;
  }

  try {
    return handleUpload(ctx);
  } catch (err) {
    Logger.log(`UPLOAD ERROR :: ${err.stack || err}`);
    return uploadJsonError("Internal server error.");
  }
}

function doOptions(e) {
  return uploadWithCors(ContentService.createTextOutput(""));
}

function parseUploadRequest(e) {
  let data = {};
  if (e.postData && e.postData.contents) {
    try {
      data = JSON.parse(e.postData.contents);
    } catch (err) {
      Logger.log("UPLOAD JSON parse failure: " + err);
    }
  }

  const idToken = data.idToken || (e.parameter ? e.parameter.idToken : "");
  delete data.idToken;

  return {
    raw: e,
    data: data,
    idToken: idToken,
    ip: e?.context?.clientIp || ""
  };
}

function authenticateUploadRequest(ctx) {
  if (!ctx.idToken) {
    return { code: 401, response: uploadJsonError("Missing ID token.", 401) };
  }

  const payload = verifyUploadIdToken(ctx.idToken);
  if (!payload) {
    return { code: 401, response: uploadJsonError("Invalid or expired ID token.", 401) };
  }

  if (!isUploadEmailAllowed(payload)) {
    return { code: 403, response: uploadJsonError("Account not authorised for Mentor Tracker.", 403) };
  }

  ctx.user = payload;
  return null;
}

function handleUpload(ctx) {
  const payload = ctx.data || {};
  const usn = (payload.usn || "").trim();
  const accessKey = (payload.accessKey || "").trim();
  const base64 = payload.base64 || "";
  const mimeType = payload.mimeType || "application/octet-stream";
  const filename = (payload.filename || "").trim() || `${usn}_photo`;

  if (!usn || !accessKey || !base64) {
    return uploadJsonError("Missing required fields.", 400);
  }

  if (!validateStudentAccess(usn, accessKey)) {
    return uploadJsonError("Invalid USN or Access Key.", 403);
  }

  const blob = decodeFileBlob(base64, mimeType, filename);
  if (!blob.ok) {
    return uploadJsonError(blob.error, blob.code);
  }

  let file;
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    file = folder.createFile(blob.value);
    file.setName(filename);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    return uploadJsonError("Failed to write file: " + err.message, 500);
  }

  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(PHOTO_SHEET_NAME);
    const fileId = file.getId();
    const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    const viewableLink = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const imageFormula = `=IMAGE("${viewableLink}")`;
    sheet.appendRow([usn, imageFormula, shareableLink, viewableLink]);
    Logger.log(`PHOTO UPLOAD :: ${usn} :: ${fileId}`);
    return uploadJsonResponse({ success: true, fileUrl: shareableLink });
  } catch (err) {
    file.setTrashed(true);
    return uploadJsonError("Failed to write to sheet: " + err.message, 500);
  }
}

/* -------------------------------------------------------------------------- */
/*  Validation helpers                                                        */
/* -------------------------------------------------------------------------- */

function validateStudentAccess(usn, accessKey) {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(STUDENT_SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if ((data[i][1] || "").toString().trim().toUpperCase() === usn.trim().toUpperCase()) {
        return data[i][6] === accessKey;
      }
    }
  } catch (err) {
    Logger.log("UPLOAD validate access failure: " + err);
  }
  return false;
}

function decodeFileBlob(base64, mimeType, filename) {
  let decoded;
  try {
    decoded = Utilities.base64Decode(base64);
  } catch (err) {
    return { ok: false, error: "Invalid file encoding.", code: 400 };
  }

  if (!decoded || decoded.length === 0) {
    return { ok: false, error: "Empty file.", code: 400 };
  }

  if (decoded.length > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: "File exceeds 5 MB limit.", code: 413 };
  }

  if (!(mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "application/pdf")) {
    return { ok: false, error: "Only JPG, PNG or PDF files allowed.", code: 415 };
  }

  const blob = Utilities.newBlob(decoded, mimeType, filename);
  return { ok: true, value: blob };
}

/* -------------------------------------------------------------------------- */
/*  Token + response helpers                                                  */
/* -------------------------------------------------------------------------- */

function verifyUploadIdToken(token) {
  const cache = CacheService.getScriptCache();
  const cacheKey = UPLOAD_TOKEN_CACHE_PREFIX + token;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  let response;
  try {
    response = UrlFetchApp.fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
  } catch (err) {
    Logger.log("UPLOAD tokeninfo fetch failed: " + err);
    return null;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log("UPLOAD tokeninfo error: " + response.getContentText());
    return null;
  }

  const payload = JSON.parse(response.getContentText());
  if (payload.aud !== UPLOAD_CLIENT_ID) {
    Logger.log(`UPLOAD audience mismatch: ${payload.aud}`);
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return null;
  }

  if (UPLOAD_TOKEN_CACHE_SECONDS > 0 && payload.exp) {
    const ttl = Math.min(UPLOAD_TOKEN_CACHE_SECONDS, Math.max(payload.exp - now, 0));
    if (ttl > 0) cache.put(cacheKey, JSON.stringify(payload), ttl);
  }

  return payload;
}

function isUploadEmailAllowed(payload) {
  const email = (payload.email || "").toLowerCase();
  if (!email) return false;

  if (UPLOAD_ALLOWED_EMAILS.length > 0 && UPLOAD_ALLOWED_EMAILS.indexOf(email) !== -1) {
    return true;
  }

  if (UPLOAD_ALLOWED_DOMAIN) {
    const domain = (payload.hd || email.split("@")[1] || "").toLowerCase();
    if (domain === UPLOAD_ALLOWED_DOMAIN.toLowerCase()) {
      return true;
    }
  }

  return UPLOAD_ALLOWED_EMAILS.length === 0 && !UPLOAD_ALLOWED_DOMAIN;
}

function resolveUploadCorsOrigin() {
  if (!UPLOAD_ALLOWED_ORIGINS || !UPLOAD_ALLOWED_ORIGINS.length) {
    return "*";
  }
  if (UPLOAD_ALLOWED_ORIGINS.indexOf("*") !== -1) {
    return "*";
  }
  return UPLOAD_ALLOWED_ORIGINS[0];
}

function uploadWithCors(output) {
  const origin = resolveUploadCorsOrigin();
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", origin)
    .setHeader("Access-Control-Allow-Headers", UPLOAD_CORS_ALLOW_HEADERS)
    .setHeader("Access-Control-Allow-Methods", UPLOAD_CORS_ALLOW_METHODS)
    .setHeader("Access-Control-Max-Age", UPLOAD_CORS_MAX_AGE)
    .setHeader("Access-Control-Allow-Credentials", "false")
    .setHeader("Vary", "Origin");
}

function uploadJsonResponse(payload) {
  return uploadWithCors(ContentService.createTextOutput(JSON.stringify(payload)));
}

function uploadJsonError(message, code) {
  return uploadJsonResponse({
    success: false,
    error: message,
    code: code || 400
  });
}

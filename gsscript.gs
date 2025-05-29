function doGet(e) {
  const formType = e.parameter.formType;
  if (formType === 'lookup') {
    return lookupStudent(e.parameter.usn);
  } else {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unsupported GET request" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const contentType = e.postData.type;

    if (contentType === "application/x-www-form-urlencoded") {
      // Standard form data (no files)
      const d = e.parameter;
      const formType = d.formType;

      switch (formType) {
        case 'registration':
          return saveStudent(d);
        case 'academic':
          return saveAcademic(d);
        case 'meeting':
          return saveMeeting(d);
        case 'lookup':
          return lookupStudent(d.usn);
        default:
          return respond({ success: false, error: "Unsupported formType" });
      }

    } else if (contentType.indexOf("multipart/form-data") !== -1) {
      // Handle file upload with metadata
      return saveActivityWithBlob(e);
    } else {
      return respond({ success: false, error: "Unsupported content type" });
    }

  } catch (err) {
    return respond({ success: false, error: err.message });
  }
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function validateStudent(usn, accessKey) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('students');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === usn && data[i][6] === accessKey) {
      return true;
    }
  }
  return false;
}

function saveStudent(d) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('students');
  sheet.appendRow([
    d.name, d.usn, d.dob, d.sslc, d.puc, d.nucat, d.accessKey,
    d.student_phone, d.student_email, d.stay_type, d.hobbies,
    d.father_name, d.father_job, d.mother_name, d.mother_job,
    d.res_address, d.father_phone, d.mother_phone
  ]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveAcademic(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid USN or Access Key" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('academic');
  sheet.appendRow([
    d.usn, d.semester, d.course_code, d.course_name, d.attendance,
    d.mse1, d.mse2, d.task, d.see, d.grade_type, d.grade_point, d.sgpa
  ]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveActivityWithBlob(e) {
  const usn = e.parameter.usn;
  const accessKey = e.parameter.accessKey;

  if (!validateStudent(usn, accessKey)) {
    return respond({ success: false, error: "Invalid USN or Access Key" });
  }

  const semester = e.parameter.semester;
  const date = e.parameter.date;
  const activity_type = e.parameter.activity_type;
  const event_details = e.parameter.event_details;
  const credit_points = e.parameter.credit_points;

  const folder = DriveApp.getFolderById("MentorData"); // <-- Replace with your real folder ID

  let file;
  try {
    const blob = e.postData.contents
      ? Utilities.newBlob(Utilities.base64DecodeWebSafe(e.postData.contents), e.postData.type)
      : null;

    if (!blob) return respond({ success: false, error: "No file provided." });

    if (!(blob.getContentType() === "image/jpeg" || blob.getContentType() === "application/pdf")) {
      return respond({ success: false, error: "Only JPEG or PDF files allowed." });
    }

    file = folder.createFile(blob);
    file.setName(`${usn}_${new Date().toISOString()}`);
  } catch (err) {
    return respond({ success: false, error: "Upload failed: " + err.message });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('activities');
  sheet.appendRow([
    usn, semester, date, activity_type, event_details, credit_points, file.getUrl()
  ]);

  return respond({ success: true });
}


function lookupStudent(usn) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('students');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === usn) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: data[i] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Student not found" }))
    .setMimeType(ContentService.MimeType.JSON);
}

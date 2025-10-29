


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

//check code
function getFullDashboardData(usn, accessKey) {
  
  if (!validateStudent(usn, accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Invalid USN or Access Key"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const studentSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('students');
  const academicSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('academic');
  const activitySheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('activities');
  const meetingSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('meetings');

  const result = {
    success: true,
    personal: {},
    academic: {},
    activities: {},
    meetings: {}
  };

  // Fetch personal info
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

  // Helper to fetch tabular section
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

  result.academic = extractSection(academicSheet, 2);   // skip USN and Semester
  result.activities = extractSection(activitySheet, 2);
  result.meetings = extractSection(meetingSheet, 2);

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
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

function saveActivity(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Invalid USN or Access Key"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('activities');
  sheet.appendRow([
    d.usn,
    d.semester,
    d.date,
    d.activity_type,
    d.event_details,
    d.credit_points,
    d.proof_link
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


function saveMeeting(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: "Invalid USN or Access Key"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('meetings');
  sheet.appendRow([
    d.usn,
    d.semester,
    d.date,
    d.problem,
    d.solution
  ]);

  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}


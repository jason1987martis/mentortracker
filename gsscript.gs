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
  const d = e.parameter;
  const formType = d.formType;

  switch (formType) {
    case 'registration':
      return saveStudent(d);
    case 'academic':
      return saveAcademic(d);
    case 'activity':
      return saveActivity(d);
    case 'meeting':
      return saveMeeting(d);
    case 'lookup':
      return lookupStudent(d.usn);
    default:
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Unknown form type" }))
        .setMimeType(ContentService.MimeType.JSON);
  }
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

function saveActivity(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid USN or Access Key" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('activities');
  sheet.appendRow([
    d.usn, d.semester, d.date, d.activity_type, d.event_details, d.credit_points, d.proof_link
  ]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function saveMeeting(d) {
  if (!validateStudent(d.usn, d.accessKey)) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Invalid USN or Access Key" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('meetings');
  sheet.appendRow([
    d.usn, d.semester, d.date, d.problem, d.solution
  ]);
  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
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

const SHEET_ID = '11dZ8970TSuvCvfk33lJdbH3-R95EIPAclobuUQD3Ee4';
const FOLDER_ID = '1NeLc2pp6PST4I-Wf6rkT6LvW292lglWe';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const fileName = `${data.usn}_photo`;
    const blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType, fileName);
    const file = folder.createFile(blob).setName(fileName);

    // Make file publicly viewable
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const shareableLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    const viewableLink = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const imageFormula = `=IMAGE("${viewableLink}")`;

    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('photo');
    sheet.appendRow([
      data.usn,
      imageFormula,
      shareableLink,
      viewableLink
    ]);

    Logger.log("Uploaded: " + file.getName() + " in " + folder.getName());

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'success', fileUrl: shareableLink })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
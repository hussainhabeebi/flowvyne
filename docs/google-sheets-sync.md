# Google Sheets form sync

Flowvyne saves every completed form to D1 first. When **Sync to Google Sheets** is enabled on a Form node, it also sends the submission to a Google Apps Script web app.

## 1. Create the receiver

Open the target Google Sheet, choose **Extensions → Apps Script**, and paste:

```javascript
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const name = payload.sheet_name || 'Flowvyne Responses';
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const values = payload.values || {};
  const headers = ['submission_id', 'submitted_at', 'tenant_id', 'contact_id', 'form_title', ...Object.keys(values)];

  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missing = headers.filter((header) => !existingHeaders.includes(header));
  if (missing.length) {
    sheet.getRange(1, existingHeaders.length + 1, 1, missing.length).setValues([missing]);
    existingHeaders.push(...missing);
  }

  sheet.appendRow(existingHeaders.map((header) =>
    header in values ? values[header] : (payload[header] || '')
  ));
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## 2. Deploy it

Choose **Deploy → New deployment → Web app**, execute as yourself, and allow access to anyone who has the URL. Copy the `/exec` URL.

## 3. Connect the form

In Flowvyne, add or select a **Form** node, enable **Sync to Google Sheets**, paste the Apps Script webhook URL, and enter the destination tab name. Publish the flow.

The `form_submissions.sync_status` column records `synced`, `failed`, or `not_configured`. A Sheets outage therefore does not remove the copy stored in Flowvyne.

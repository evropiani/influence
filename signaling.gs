/**
 * Influence — 6-character invite-code relay (Google Apps Script)
 * ================================================================
 * This tiny web app lets friends connect with a short 6-character code instead of
 * pasting long WebRTC strings. It only ever stores a connection "offer" and "answer"
 * for a few minutes, and DELETES each one the moment it's read. No game data, no
 * personal data, nothing else touches this sheet.
 *
 * ── SETUP (about 3 minutes) ─────────────────────────────────────────────────────
 * 1. Create a new Google Sheet (sheets.new). Leave it empty.
 * 2. In that sheet: Extensions → Apps Script.
 * 3. Delete whatever code is there, paste THIS whole file, and Save.
 * 4. Click Deploy → New deployment → gear icon → "Web app".
 *      - Description: influence-signal
 *      - Execute as:  Me
 *      - Who has access:  Anyone
 *    Click Deploy, authorise when asked, and COPY the "Web app URL"
 *    (it ends in /exec).
 * 5. Paste that URL into net.js:  let SIGNAL_URL = "https://…/exec";
 *    Commit & deploy the game. Done — invites are now 6 characters.
 *
 * To rotate/disable it later, just delete the deployment; the game automatically
 * falls back to the manual long-code exchange when SIGNAL_URL is empty.
 */

var SHEET_NAME = 'signals';
var TTL_MS = 10 * 60 * 1000;   // rows older than 10 minutes are swept away

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['code', 'kind', 'sdp', 'ts']);
  }
  return sh;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sweep_(sh) {
  var n = sh.getLastRow();
  if (n < 2) return;
  var rows = sh.getRange(2, 1, n - 1, 4).getValues();
  var now = Date.now();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (now - Number(rows[i][3] || 0) > TTL_MS) sh.deleteRow(i + 2);
  }
}

// Guest fetches the offer / host fetches the answer. The matched row is DELETED on read.
function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var sh = sheet_();
    sweep_(sh);
    var op = (e.parameter.op || '');
    if (op !== 'take') return json_({ ok: false, err: 'bad op' });
    var code = String(e.parameter.code || '').toUpperCase();
    var kind = String(e.parameter.kind || '');
    var n = sh.getLastRow();
    if (n >= 2) {
      var rows = sh.getRange(2, 1, n - 1, 4).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) === code && String(rows[i][1]) === kind) {
          var sdp = rows[i][2];
          sh.deleteRow(i + 2);                 // one-time use: gone after it's read
          return json_({ ok: true, sdp: sdp });
        }
      }
    }
    return json_({ ok: true, sdp: null });     // not there yet — caller will poll again
  } finally {
    lock.releaseLock();
  }
}

// Host stores the offer / guest stores the answer.
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(8000);
  try {
    var sh = sheet_();
    sweep_(sh);
    var body = JSON.parse(e.postData.contents || '{}');
    if (body.op !== 'put') return json_({ ok: false, err: 'bad op' });
    var code = String(body.code || '').toUpperCase();
    var kind = String(body.kind || '');
    if (!code || !kind || !body.sdp) return json_({ ok: false, err: 'missing fields' });
    if (String(body.sdp).length > 20000) return json_({ ok: false, err: 'too big' });
    // replace any existing row for this code+kind
    var n = sh.getLastRow();
    if (n >= 2) {
      var rows = sh.getRange(2, 1, n - 1, 2).getValues();
      for (var i = rows.length - 1; i >= 0; i--) {
        if (String(rows[i][0]) === code && String(rows[i][1]) === kind) sh.deleteRow(i + 2);
      }
    }
    sh.appendRow([code, kind, body.sdp, Date.now()]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

/*
 * Test ensuring that messages with "long lines" are transmitted correctly.
 * Most of this test was copied from test_messageHeaders.js.
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC("@mozilla.org/messengercompose/composefields;1",
                    Ci.nsIMsgCompFields);

// Copied from jsmime.js.
function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++) {
    typedarray[i] = buffer.charCodeAt(i);
  }
  return typedarray;
}

function checkDraftHeadersAndBody(expectedHeaders, expectedBody, charset = "UTF-8") {
  let msgData = mailTestUtils
    .loadMessageToString(gDraftFolder, mailTestUtils.firstMsgHdr(gDraftFolder));
  checkMessageHeaders(msgData, expectedHeaders);

  // Get the message body, decode from base64 and check.
  let endOfHeaders = msgData.indexOf("\r\n\r\n");
  let body = msgData.slice(endOfHeaders + 4);
  let endOfBody = body.indexOf("\r\n\r\n");

  if (endOfBody > 0)
    body = body.slice(0, endOfBody);
  else
    body = body.slice(0, body.length);

  // Remove line breaks and decode from base64 if required.
  if (expectedHeaders["Content-Transfer-Encoding"] == "base64")
    body = atob(body.replace(/\r\n/g, ""));

  if (charset == "UTF-8") {
    let expectedBinary = String.fromCharCode.apply(undefined,
      new TextEncoder("UTF-8").encode(expectedBody));
    do_check_eq(body, expectedBinary);
  } else {
    let strView = stringToTypedArray(body);
    let decodedBody = new TextDecoder(charset).decode(strView);
    do_check_eq(decodedBody, expectedBody);
  }
}

function checkMessageHeaders(msgData, expectedHeaders, partNum = "") {
  let seen = false;
  let handler = {
    startPart: function (part, headers) {
      if (part != partNum)
        return;
      seen = true;
      for (let header in expectedHeaders) {
        let expected = expectedHeaders[header];
        if (expected === undefined)
          do_check_false(headers.has(header));
        else {
          let value = headers.getRawHeader(header);
          do_check_eq(value.length, 1);
          value[0] = value[0].replace(/boundary=[^;]*(;|$)/, "boundary=.");
          do_check_eq(value[0], expected);
        }
      }
    }
  };
  MimeParser.parseSync(msgData, handler, {onerror: function (e) { throw e; }});
  do_check_true(seen);
}

// Create a line with 600 letters 'a' with acute accent, encoded as
// two bytes c3a1 in UTF-8.
let longMultibyteLine = "\u00E1".repeat(600);

// And here a line with a Korean character, encoded as three bytes
// ec9588 in UTF-8.
let longMultibyteLineCJK = "안".repeat(400);

// And some Japanese.
let longMultibyteLineJapanese = "語".repeat(450);

function* testBodyWithLongLine() {
  let newline;
  // Windows uses CR+LF, the other platforms just LF.
  // Note: Services.appinfo.OS returns "XPCShell" in the test, so we
  // use this hacky condition to separate Windows from the others.
  if ("@mozilla.org/windows-registry-key;1" in Components.classes) {
    newline = "\r\n";
  } else {
    newline = "\n";
  }

  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.fullName = "Me";
  identity.organization = "World Destruction Committee";
  fields.from = "Nobody <nobody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Message with 1200 byte line in body";
  fields.characterSet = "UTF-8";
  let htmlMessage = "<html><head>" +
    "<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">" +
    "</head><body>" + longMultibyteLine + "</body></html>";
  fields.body = htmlMessage;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "base64"
    },
    htmlMessage
  );

  // Again, but this time as plain text.
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "base64"
    },
    longMultibyteLine + newline // Expected body: The message without the tags.
  );

  // Now CJK.
  fields.forcePlainText = false;
  htmlMessage = "<html><head>" +
    "<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">" +
    "</head><body>" + longMultibyteLineCJK + "</body></html>";
  fields.body = htmlMessage;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "base64"
    },
    htmlMessage
  );

  // Again, but this time as plain text.
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "base64"
    },
    longMultibyteLineCJK + newline // Expected body: The message without the tags.
  );

  // Now a special test for ISO-2022-JP.
  fields.characterSet = "ISO-2022-JP";

  fields.forcePlainText = false;
  htmlMessage = "<html><head>" +
    "<meta http-equiv=\"content-type\" content=\"text/html; charset=ISO-2022-JP\">" +
    "</head><body>" + longMultibyteLineJapanese + "</body></html>";
  fields.body = htmlMessage;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=ISO-2022-JP",
      "Content-Transfer-Encoding": "base64"
    },
    htmlMessage,
    "ISO-2022-JP"
  );

  // Again, but this time as plain text.
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  yield richCreateMessage(fields, [], identity);

  // Expected body: The message without the tags and chopped up in
  // chunks of 36 characters with a space appended to each line.
  let expectedBody = "";
  let lastIndex = 0;
  for (let i = 0; i + 36 < longMultibyteLineJapanese.length; i = i + 36) {
    expectedBody = expectedBody + longMultibyteLineJapanese.substr(i, 36) + " \r\n";
    lastIndex = i + 36;
  }
  expectedBody += longMultibyteLineJapanese.substr(lastIndex) + "\r\n";

  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=ISO-2022-JP; format=flowed; delsp=yes",
      "Content-Transfer-Encoding": "7bit"
    },
    expectedBody,
    "ISO-2022-JP"
  );

  // Again, but this time not flowed.
  Services.prefs.setBoolPref("mailnews.send_plaintext_flowed", false);

  yield richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=ISO-2022-JP",
      "Content-Transfer-Encoding": "7bit"
    },
    expectedBody.replace(/ /g, ""), // No spaces expected this time.
    "ISO-2022-JP"
  );
}

var tests = [
  testBodyWithLongLine,
]

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(add_task);
  run_next_test();
}

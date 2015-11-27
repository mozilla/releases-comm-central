/*
 * Test ensuring that messages with "long lines" are transmitted correctly.
 * Most of this test was copied from test_messageHeaders.js.
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC("@mozilla.org/messengercompose/composefields;1",
                    Ci.nsIMsgCompFields);

function checkDraftHeadersAndBody(expectedHeaders, expectedBody, partNum = "") {
  let msgData = mailTestUtils
    .loadMessageToString(gDraftFolder, mailTestUtils.firstMsgHdr(gDraftFolder));
  checkMessageHeaders(msgData, expectedHeaders, partNum);

  // Get the message body, decode from base64 and check.
  let endOfHeaders = msgData.indexOf("\r\n\r\n");
  let body = msgData.slice(endOfHeaders + 4);
  let endOfBody = body.indexOf("\r\n\r\n");

  if (endOfBody > 0)
    body = body.slice(0, endOfBody);
  else
    body = body.slice(0, body.length);

  // Remove line breaks and decode from base64.
  body = atob(body.replace(/\r\n/g, ""));

  let expectedBinary = String.fromCharCode.apply(undefined,
    new TextEncoder("UTF-8").encode(expectedBody));
  do_check_eq(body, expectedBinary);
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

function* testBodyWithLongLine() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.fullName = "Me";
  identity.organization = "World Destruction Committee";
  fields.from = "Nobody <nobody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Message with 1200 byte line in body";
  fields.characterSet = "UTF-8";
  let htmlMessage = "<htmt><head>" +
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
    longMultibyteLine + "\r\n" // Expected body: The message without the tags.
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

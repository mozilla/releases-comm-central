/*
 * Test ensuring that messages with "long lines" are transmitted correctly.
 * Most of this test was copied from test_messageHeaders.js.
 */

const { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC(
  "@mozilla.org/messengercompose/composefields;1",
  Ci.nsIMsgCompFields
);

// Copied from jsmime.js.
function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++) {
    typedarray[i] = buffer.charCodeAt(i);
  }
  return typedarray;
}

function checkDraftHeadersAndBody(
  expectedHeaders,
  expectedBody,
  charset = "UTF-8"
) {
  const msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  checkMessageHeaders(msgData, expectedHeaders);

  // Get the message body, decode from base64 and check.
  const endOfHeaders = msgData.indexOf("\r\n\r\n");
  let body = msgData.slice(endOfHeaders + 4);
  const endOfBody = body.indexOf("\r\n\r\n");

  if (endOfBody > 0) {
    body = body.slice(0, endOfBody);
  } else {
    body = body.slice(0, body.length);
  }

  // Remove line breaks and decode from base64 if required.
  if (expectedHeaders["Content-Transfer-Encoding"] == "base64") {
    body = atob(body.replace(/\r\n/g, ""));
  }

  if (charset == "UTF-8") {
    const expectedBinary = String.fromCharCode.apply(
      undefined,
      new TextEncoder("UTF-8").encode(expectedBody)
    );
    Assert.equal(body, expectedBinary);
  } else {
    const strView = stringToTypedArray(body);
    const decodedBody = new TextDecoder(charset).decode(strView);
    Assert.equal(decodedBody, expectedBody);
  }
}

function checkMessageHeaders(msgData, expectedHeaders, partNum = "") {
  let seen = false;
  const handler = {
    startPart(part, headers) {
      if (part != partNum) {
        return;
      }
      seen = true;
      for (const header in expectedHeaders) {
        const expected = expectedHeaders[header];
        if (expected === undefined) {
          Assert.ok(!headers.has(header));
        } else {
          const value = headers.getRawHeader(header);
          Assert.equal(value.length, 1);
          value[0] = value[0].replace(/boundary=[^;]*(;|$)/, "boundary=.");
          Assert.equal(value[0], expected);
        }
      }
    },
  };
  MimeParser.parseSync(msgData, handler, {
    onerror(e) {
      throw e;
    },
  });
  Assert.ok(seen);
}

// Create a line with 600 letters 'a' with acute accent, encoded as
// two bytes c3a1 in UTF-8.
const longMultibyteLine = "\u00E1".repeat(600);

// And here a line with a Korean character, encoded as three bytes
// ec9588 in UTF-8.
const longMultibyteLineCJK = "안".repeat(400);

// And some Japanese.
const longMultibyteLineJapanese = "語".repeat(450);

async function testBodyWithLongLine() {
  // Lines in the message body are split by CRLF according to RFC 5322, should
  // be independent of the system.
  const newline = "\r\n";

  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  identity.fullName = "Me";
  identity.organization = "World Destruction Committee";
  fields.from = "Nobody <nobody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Message with 1200 byte line in body";
  let htmlMessage =
    "<html><head>" +
    '<meta http-equiv="content-type" content="text/html; charset=utf-8">' +
    "</head><body>" +
    longMultibyteLine +
    "</body></html>\r\n\r\n";
  fields.body = htmlMessage;
  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "base64",
    },
    htmlMessage
  );

  // Again, but this time as plain text.
  fields.body = htmlMessage;
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "base64",
    },
    longMultibyteLine + " " + newline + newline // Expected body: The message without the tags.
  );

  // Now CJK.
  fields.forcePlainText = false;
  htmlMessage =
    "<html><head>" +
    '<meta http-equiv="content-type" content="text/html; charset=utf-8">' +
    "</head><body>" +
    longMultibyteLineCJK +
    "</body></html>\r\n\r\n";
  fields.body = htmlMessage;
  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "base64",
    },
    htmlMessage
  );

  // Again, but this time as plain text.
  fields.body = htmlMessage;
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "base64",
    },
    longMultibyteLineCJK + " " + newline + newline // Expected body: The message without the tags.
  );

  // Now a test for ISO-2022-JP.
  fields.forcePlainText = false;
  htmlMessage =
    "<html><head>" +
    '<meta http-equiv="content-type" content="text/html; charset=ISO-2022-JP">' +
    "</head><body>" +
    longMultibyteLineJapanese +
    "</body></html>\r\n\r\n";
  fields.body = htmlMessage;
  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "base64",
    },
    htmlMessage
  );

  // Again, but this time as plain text.
  fields.body = htmlMessage;
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  await richCreateMessage(fields, [], identity);

  const expectedBody = longMultibyteLineJapanese + " " + newline + newline;

  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "base64",
    },
    expectedBody
  );

  // Again, but this time not flowed.
  fields.body = htmlMessage;
  Services.prefs.setBoolPref("mailnews.send_plaintext_flowed", false);

  await richCreateMessage(fields, [], identity);
  checkDraftHeadersAndBody(
    {
      "Content-Type": "text/plain; charset=UTF-8",
      "Content-Transfer-Encoding": "base64",
    },
    expectedBody.replace(/ /g, "") // No spaces expected this time.
  );
}

var tests = [testBodyWithLongLine];

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(x => add_task(x));
  run_next_test();
}

/*
 * Test suite for ensuring that the headers of messages are set properly.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { MimeParser } = ChromeUtils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC(
  "@mozilla.org/messengercompose/composefields;1",
  Ci.nsIMsgCompFields
);

function makeAttachment(opts = {}) {
  const attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  for (const key in opts) {
    attachment[key] = opts[key];
  }
  return attachment;
}

function sendMessage(fieldParams, identity, opts = {}, attachments = []) {
  // Initialize compose fields
  const fields = new CompFields();
  for (const key in fieldParams) {
    fields[key] = fieldParams[key];
  }
  for (const attachment of attachments) {
    fields.addAttachment(attachment);
  }

  // Initialize compose params
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  for (const key in opts) {
    params[key] = opts[key];
  }

  // Send the message
  const msgCompose = MailServices.compose.initCompose(params);
  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  const promise = new Promise((resolve, reject) => {
    progressListener.resolve = resolve;
    progressListener.reject = reject;
  });
  progress.registerListener(progressListener);
  msgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgDeliverNow,
    identity,
    "",
    null,
    progress
  );
  return promise;
}

function checkDraftHeaders(expectedHeaders, partNum = "") {
  const msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  checkMessageHeaders(msgData, expectedHeaders, partNum);
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
          Assert.ok(
            !headers.has(header),
            `Should not have header named "${header}"`
          );
        } else {
          const value = headers.getRawHeader(header);
          Assert.equal(
            value && value.length,
            1,
            `Should have exactly one header named "${header}"`
          );
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

async function testEnvelope() {
  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  identity.fullName = "Me";
  identity.organization = "World Destruction Committee";
  fields.from = "Nobody <nobody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.cc = "Alex <alex@tinderbox.invalid>";
  fields.bcc = "Boris <boris@tinderbox.invalid>";
  fields.replyTo = "Charles <charles@tinderbox.invalid>";
  fields.organization = "World Salvation Committee";
  fields.subject = "This is an obscure reference";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // As of bug 87987, the identity does not override the from header.
    From: "Nobody <nobody@tinderbox.invalid>",
    // The identity should override the organization field here.
    Organization: "World Destruction Committee",
    To: "Nobody <nobody@tinderbox.invalid>",
    Cc: "Alex <alex@tinderbox.invalid>",
    Bcc: "Boris <boris@tinderbox.invalid>",
    "Reply-To": "Charles <charles@tinderbox.invalid>",
    Subject: "This is an obscure reference",
  });
}

async function testI18NEnvelope() {
  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  identity.fullName = "ケツァルコアトル";
  identity.organization = "Comité de la destruction du monde";
  fields.to = "Émile <nobody@tinderbox.invalid>";
  fields.cc = "André Chopin <alex@tinderbox.invalid>";
  fields.bcc = "Étienne <boris@tinderbox.invalid>";
  fields.replyTo = "Frédéric <charles@tinderbox.invalid>";
  fields.subject = "Ceci n'est pas un référence obscure";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    From: "=?UTF-8?B?44Kx44OE44Kh44Or44Kz44Ki44OI44Or?= <from@tinderbox.invalid>",
    Organization: "=?UTF-8?Q?Comit=C3=A9_de_la_destruction_du_monde?=",
    To: "=?UTF-8?B?w4ltaWxl?= <nobody@tinderbox.invalid>",
    Cc: "=?UTF-8?Q?Andr=C3=A9_Chopin?= <alex@tinderbox.invalid>",
    Bcc: "=?UTF-8?Q?=C3=89tienne?= <boris@tinderbox.invalid>",
    "Reply-To": "=?UTF-8?B?RnLDqWTDqXJpYw==?= <charles@tinderbox.invalid>",
    Subject: "=?UTF-8?Q?Ceci_n=27est_pas_un_r=C3=A9f=C3=A9rence_obscure?=",
  });
}

async function testIDNEnvelope() {
  const fields = new CompFields();
  const domain = "ケツァルコアトル.invalid";
  // We match against rawHeaderText, so we need to encode the string as a binary
  // string instead of a unicode string.
  const utf8Domain = String.fromCharCode.apply(
    undefined,
    new TextEncoder("UTF-8").encode(domain)
  );
  // Bug 1034658: nsIMsgIdentity doesn't like IDN in its email addresses.
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  fields.to = "Nobody <nobody@" + domain + ">";
  fields.cc = "Alex <alex@" + domain + ">";
  fields.bcc = "Boris <boris@" + domain + ">";
  fields.replyTo = "Charles <charles@" + domain + ">";
  fields.subject = "This is an obscure reference";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // The identity sets the from field here.
    From: "from@tinderbox.invalid",
    To: "Nobody <nobody@" + utf8Domain + ">",
    Cc: "Alex <alex@" + utf8Domain + ">",
    Bcc: "Boris <boris@" + utf8Domain + ">",
    "Reply-To": "Charles <charles@" + utf8Domain + ">",
    Subject: "This is an obscure reference",
  });
}

async function testDraftInfo() {
  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    FCC: identity.fccFolder,
    "X-Identity-Key": identity.key,
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=0; receipt=0; DSN=0; uuencode=0; attachmentreminder=0; deliveryformat=4",
  });

  fields.attachVCard = true;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=1; receipt=0; DSN=0; uuencode=0; attachmentreminder=0; deliveryformat=4",
  });

  fields.returnReceipt = true;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=1; receipt=1; DSN=0; uuencode=0; attachmentreminder=0; deliveryformat=4",
  });

  fields.DSN = true;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=1; receipt=1; DSN=1; uuencode=0; attachmentreminder=0; deliveryformat=4",
  });

  fields.attachmentReminder = true;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=1; receipt=1; DSN=1; uuencode=0; attachmentreminder=1; deliveryformat=4",
  });

  fields.deliveryFormat = Ci.nsIMsgCompSendFormat.Both;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info":
      "internal/draft; " +
      "vcard=1; receipt=1; DSN=1; uuencode=0; attachmentreminder=1; deliveryformat=3",
  });
}

async function testOtherHeadersAgentParam(sendAgent, minimalAgent) {
  Services.prefs.setBoolPref("mailnews.headers.sendUserAgent", sendAgent);
  if (sendAgent) {
    Services.prefs.setBoolPref(
      "mailnews.headers.useMinimalUserAgent",
      minimalAgent
    );
  }

  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  fields.priority = "high";
  fields.references = "<fake@tinderbox.invalid> <more@test.invalid>";
  fields.setHeader("X-Fake-Header", "124");
  let before = Date.now();
  const msgHdr = await richCreateMessage(fields, [], identity);
  let after = Date.now();
  const msgData = mailTestUtils.loadMessageToString(msgHdr.folder, msgHdr);
  let expectedAgent = undefined; // !sendAgent
  if (sendAgent) {
    if (minimalAgent) {
      expectedAgent = Services.strings
        .createBundle("chrome://branding/locale/brand.properties")
        .GetStringFromName("brandFullName");
    } else {
      expectedAgent = Cc[
        "@mozilla.org/network/protocol;1?name=http"
      ].getService(Ci.nsIHttpProtocolHandler).userAgent;
    }
  }
  checkMessageHeaders(msgData, {
    "Mime-Version": "1.0",
    "User-Agent": expectedAgent,
    "X-Priority": "2 (High)",
    References: "<fake@tinderbox.invalid> <more@test.invalid>",
    "In-Reply-To": "<more@test.invalid>",
    "X-Fake-Header": "124",
  });

  // Check headers with dynamic content
  const headers = MimeParser.extractHeaders(msgData);
  Assert.ok(headers.has("Message-Id"));
  Assert.ok(
    headers.getRawHeader("Message-Id")[0].endsWith("@tinderbox.invalid>")
  );
  // This is a very special crafted check. We don't know when the message was
  // actually created, but we have bounds on it, from above. From
  // experimentation, there are a few ways you can create dates that Date.parse
  // can't handle (specifically related to how 2-digit years). However, the
  // optimal RFC 5322 form is supported by Date.parse. If Date.parse fails, we
  // have a form that we shouldn't be using anyways.
  const date = new Date(headers.getRawHeader("Date")[0]);
  // If we have clock skew within the test, then our results are going to be
  // meaningless. Hopefully, this is only rarely the case.
  if (before > after) {
    info("Clock skew detected, skipping date check");
  } else {
    // In case this all took place within one second, remove sub-millisecond
    // timing (Date headers only carry second-level precision).
    before = before - (before % 1000);
    after = after - (after % 1000);
    info(before + " <= " + date + " <= " + after + "?");
    Assert.ok(before <= date && date <= after);
  }

  // We truncate too-long References. Check this.
  const references = [];
  for (let i = 0; i < 100; i++) {
    references.push("<" + i + "@test.invalid>");
  }
  const expected = references.slice(47);
  expected.unshift(references[0]);
  fields.references = references.join(" ");
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    References: expected.join(" "),
    "In-Reply-To": references[references.length - 1],
  });
}

/**
 * Tests that the domain for the Message-Id header defaults to the domain of the
 * identity's address.
 */
async function testMessageIdUseIdentityAddress() {
  const expectedMessageIdHostname = "tinderbox.test";

  const identity = getSmtpIdentity(
    `from@${expectedMessageIdHostname}`,
    getBasicSmtpServer()
  );

  await createMsgAndCompareMessageId(identity, null, expectedMessageIdHostname);
}

/**
 * Tests that if a custom address (with a custom domain) is used when composing a
 * message, the domain in this address takes precendence over the domain of the
 * identity's address to generate the value for the Message-Id header.
 */
async function testMessageIdUseFromDomain() {
  const expectedMessageIdHostname = "another-tinderbox.test";

  const identity = getSmtpIdentity("from@tinderbox.test", getBasicSmtpServer());

  // Set the From header to an address that uses a different domain than
  // the identity.
  const fields = new CompFields();
  fields.from = `Nobody <nobody@${expectedMessageIdHostname}>`;

  await createMsgAndCompareMessageId(
    identity,
    fields,
    expectedMessageIdHostname
  );
}

/**
 * Tests that if the identity has a "FQDN" attribute, it takes precedence to use as the
 * domain for the Message-Id header over any other domain or address.
 */
async function testMessageIdUseIdentityAttribute() {
  const expectedMessageIdHostname = "my-custom-fqdn.test";

  const identity = getSmtpIdentity("from@tinderbox.test", getBasicSmtpServer());
  identity.setCharAttribute("FQDN", expectedMessageIdHostname);

  // Set the From header to an address that uses a different domain than
  // the identity.
  const fields = new CompFields();
  fields.from = "Nobody <nobody@another-tinderbox.test>";

  await createMsgAndCompareMessageId(
    identity,
    fields,
    expectedMessageIdHostname
  );
}

/**
 * Util function to create a message using the given identity and fields,
 * and test that the message ID that was generated for it has the correct
 * host name.
 *
 * @param {nsIMsgIdentity} identity - The identity to use to create the message.
 * @param {?nsIMsgCompFields} fields - The compose fields to use. If not provided,
 *   default fields are used.
 * @param {string} expectedMessageIdHostname - The expected host name of the
 *   Message-Id header.
 */
async function createMsgAndCompareMessageId(
  identity,
  fields,
  expectedMessageIdHostname
) {
  if (!fields) {
    fields = new CompFields();
  }

  const msgHdr = await richCreateMessage(fields, [], identity);
  const msgData = mailTestUtils.loadMessageToString(msgHdr.folder, msgHdr);
  const headers = MimeParser.extractHeaders(msgData);

  // As of bug 1727181, the identity does not override the message-id header.
  Assert.ok(headers.has("Message-Id"), "the message has a Message-Id header");
  Assert.ok(
    headers
      .getRawHeader("Message-Id")[0]
      .endsWith(`@${expectedMessageIdHostname}>`),
    `the hostname for the Message-Id header should be ${expectedMessageIdHostname}`
  );
}

async function testOtherHeadersFullAgent() {
  await testOtherHeadersAgentParam(true, false);
}

async function testOtherHeadersMinimalAgent() {
  await testOtherHeadersAgentParam(true, true);
}

async function testOtherHeadersNoAgent() {
  await testOtherHeadersAgentParam(false, undefined);
}

async function testNewsgroups() {
  const fields = new CompFields();
  const nntpServer = localAccountUtils.create_incoming_server(
    "nntp",
    534,
    "",
    ""
  );
  nntpServer
    .QueryInterface(Ci.nsINntpIncomingServer)
    .subscribeToNewsgroup("mozilla.test");
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  fields.newsgroups = "mozilla.test, mozilla.test.multimedia";
  fields.followupTo = "mozilla.test";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // The identity should override the compose fields here.
    Newsgroups: "mozilla.test,mozilla.test.multimedia",
    "Followup-To": "mozilla.test",
    "X-Mozilla-News-Host": "localhost",
  });
}

async function testSendHeaders() {
  const fields = new CompFields();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  identity.setCharAttribute("headers", "bah,humbug");
  identity.setCharAttribute(
    "header.bah",
    "X-Custom-1: A header value: with a colon"
  );
  identity.setUnicharAttribute("header.humbug", "X-Custom-2: Enchanté");
  identity.setCharAttribute("subscribed_mailing_lists", "list@test.invalid");
  identity.setCharAttribute(
    "replyto_mangling_mailing_lists",
    "replyto@test.invalid"
  );
  fields.to = "list@test.invalid";
  fields.cc = "not-list@test.invalid";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Custom-1": "A header value: with a colon",
    "X-Custom-2": "=?UTF-8?B?RW5jaGFudMOp?=",
    "Mail-Followup-To": "list@test.invalid, not-list@test.invalid",
    "Mail-Reply-To": undefined,
  });

  // Don't set the M-F-T header if there's no list.
  fields.to = "replyto@test.invalid";
  fields.cc = "";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Custom-1": "A header value: with a colon",
    "X-Custom-2": "=?UTF-8?B?RW5jaGFudMOp?=",
    "Mail-Reply-To": "from@tinderbox.invalid",
    "Mail-Followup-To": undefined,
  });
}

async function testContentHeaders() {
  // Disable RFC 2047 fallback
  Services.prefs.setIntPref("mail.strictly_mime.parm_folding", 2);
  const fields = new CompFields();
  fields.body = "A body";
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "7bit",
  });

  // non-ASCII body should be 8-bit...
  fields.body = "Archæologist";
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "8bit",
  });

  // Attachments
  fields.body = "";
  const plainAttachment = makeAttachment({
    url: "data:text/plain,oïl",
    name: "attachment.txt",
  });
  const plainAttachmentHeaders = {
    "Content-Type": "text/plain; charset=UTF-8",
    "Content-Transfer-Encoding": "base64",
    "Content-Disposition": 'attachment; filename="attachment.txt"',
  };
  await richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "7bit",
    },
    "1"
  );
  checkDraftHeaders(plainAttachmentHeaders, "2");

  plainAttachment.name = "oïl.txt";
  plainAttachmentHeaders["Content-Disposition"] =
    "attachment; filename*=UTF-8''%6F%C3%AF%6C%2E%74%78%74";
  await richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders(plainAttachmentHeaders, "2");

  plainAttachment.name = "\ud83d\udca9.txt";
  plainAttachmentHeaders["Content-Disposition"] =
    "attachment; filename*=UTF-8''%F0%9F%92%A9%2E%74%78%74";
  await richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders(plainAttachmentHeaders, "2");

  const httpAttachment = makeAttachment({
    url: "data:text/html,<html></html>",
    name: "attachment.html",
  });
  const httpAttachmentHeaders = {
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Disposition": 'attachment; filename="attachment.html"',
    "Content-Location": "data:text/html,<html></html>",
  };
  await richCreateMessage(fields, [httpAttachment], identity);
  checkDraftHeaders(
    {
      "Content-Location": undefined,
    },
    "1"
  );
  checkDraftHeaders(httpAttachmentHeaders, "2");

  let cloudAttachment = makeAttachment({
    url: Services.io.newFileURI(do_get_file("data/test-UTF-8.txt")).spec,
    sendViaCloud: true,
    htmlAnnotation:
      "<html><body>This is an html placeholder file.</body></html>",
    cloudFileAccountKey: "akey",
    cloudPartHeaderData: "0123456789ABCDE",
    name: "attachment.html",
    contentLocation: "http://localhost.invalid/",
  });
  let cloudAttachmentHeaders = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Mozilla-Cloud-Part":
      "cloudFile; " +
      "url=http://localhost.invalid/; " +
      "provider=akey; " +
      'data="0123456789ABCDE"',
  };
  await richCreateMessage(fields, [cloudAttachment], identity);
  checkDraftHeaders(cloudAttachmentHeaders, "2");

  // Cloud attachment with non-ascii file name.
  cloudAttachment = makeAttachment({
    url: Services.io.newFileURI(do_get_file("data/test-UTF-8.txt")).spec,
    sendViaCloud: true,
    htmlAnnotation:
      "<html><body>This is an html placeholder file.</body></html>",
    cloudFileAccountKey: "akey",
    cloudPartHeaderData: "0123456789ABCDE",
    name: "ファイル.txt",
    contentLocation: "http://localhost.invalid/",
  });
  cloudAttachmentHeaders = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Mozilla-Cloud-Part":
      "cloudFile; " +
      "url=http://localhost.invalid/; " +
      "provider=akey; " +
      'data="0123456789ABCDE"',
  };
  await richCreateMessage(fields, [cloudAttachment], identity);
  checkDraftHeaders(cloudAttachmentHeaders, "2");

  // Some multipart/alternative tests.
  fields.body = "Some text";
  fields.forcePlainText = false;
  fields.useMultipartAlternative = true;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "multipart/alternative; boundary=.",
  });
  checkDraftHeaders(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "7bit",
    },
    "1"
  );
  checkDraftHeaders(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "7bit",
    },
    "2"
  );

  // multipart/mixed
  // + multipart/alternative
  //   + text/plain
  //   + text/html
  // + text/plain attachment
  await richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders({
    "Content-Type": "multipart/mixed; boundary=.",
  });
  checkDraftHeaders(
    {
      "Content-Type": "multipart/alternative; boundary=.",
    },
    "1"
  );
  checkDraftHeaders(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "7bit",
    },
    "1.1"
  );
  checkDraftHeaders(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "7bit",
    },
    "1.2"
  );
  checkDraftHeaders(plainAttachmentHeaders, "2");

  // Three attachments, and a multipart/alternative. Oh the humanity!
  await richCreateMessage(
    fields,
    [plainAttachment, httpAttachment, cloudAttachment],
    identity
  );
  checkDraftHeaders({
    "Content-Type": "multipart/mixed; boundary=.",
  });
  checkDraftHeaders(
    {
      "Content-Type": "multipart/alternative; boundary=.",
    },
    "1"
  );
  checkDraftHeaders(
    {
      "Content-Type": "text/plain; charset=UTF-8; format=flowed",
      "Content-Transfer-Encoding": "7bit",
    },
    "1.1"
  );
  checkDraftHeaders(
    {
      "Content-Type": "text/html; charset=UTF-8",
      "Content-Transfer-Encoding": "7bit",
    },
    "1.2"
  );
  checkDraftHeaders(plainAttachmentHeaders, "2");
  checkDraftHeaders(httpAttachmentHeaders, "3");
  checkDraftHeaders(cloudAttachmentHeaders, "4");

  // Test a request for plain text with text/html.
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  await richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/plain; charset=UTF-8; format=flowed",
    "Content-Transfer-Encoding": "7bit",
  });
}

async function testSentMessage() {
  const server = setupServerDaemon();
  const daemon = server._daemon;
  server.start();
  try {
    const localserver = getBasicSmtpServer(server.port);
    const identity = getSmtpIdentity("test@tinderbox.invalid", localserver);
    await sendMessage(
      {
        to: "Nobody <nobody@tinderbox.invalid>",
        cc: "Alex <alex@tinderbox.invalid>",
        bcc: "Boris <boris@tinderbox.invalid>",
        replyTo: "Charles <charles@tinderbox.invalid>",
      },
      identity,
      {},
      []
    );
    checkMessageHeaders(daemon.post, {
      From: "test@tinderbox.invalid",
      To: "Nobody <nobody@tinderbox.invalid>",
      Cc: "Alex <alex@tinderbox.invalid>",
      Bcc: undefined,
      "Reply-To": "Charles <charles@tinderbox.invalid>",
      "X-Mozilla-Status": undefined,
      "X-Mozilla-Keys": undefined,
      "X-Mozilla-Draft-Info": undefined,
      Fcc: undefined,
    });
    server.resetTest();
    await sendMessage({ bcc: "Somebody <test@tinderbox.invalid" }, identity);
    checkMessageHeaders(daemon.post, {
      To: "undisclosed-recipients: ;",
    });
    server.resetTest();
    await sendMessage(
      {
        to: "Somebody <test@tinderbox.invalid>",
        returnReceipt: true,
        receiptHeaderType: Ci.nsIMsgMdnGenerator.eDntRrtType,
      },
      identity
    );
    checkMessageHeaders(daemon.post, {
      "Disposition-Notification-To": "test@tinderbox.invalid",
      "Return-Receipt-To": "test@tinderbox.invalid",
    });
    server.resetTest();
    const cloudAttachment = makeAttachment({
      url: Services.io.newFileURI(do_get_file("data/test-UTF-8.txt")).spec,
      sendViaCloud: true,
      htmlAnnotation:
        "<html><body>This is an html placeholder file.</body></html>",
      cloudFileAccountKey: "akey",
      cloudPartHeaderData: "0123456789ABCDE",
      name: "attachment.html",
      contentLocation: "http://localhost.invalid/",
    });
    await sendMessage({ to: "test@tinderbox.invalid" }, identity, {}, [
      cloudAttachment,
    ]);
    checkMessageHeaders(
      daemon.post,
      {
        "Content-Type": "text/html; charset=utf-8",
        "X-Mozilla-Cloud-Part": "cloudFile; url=http://localhost.invalid/",
      },
      "2"
    );
  } finally {
    server.stop();
  }
}

var tests = [
  testEnvelope,
  testI18NEnvelope,
  testIDNEnvelope,
  testDraftInfo,
  testOtherHeadersFullAgent,
  testOtherHeadersMinimalAgent,
  testOtherHeadersNoAgent,
  testNewsgroups,
  testSendHeaders,
  testContentHeaders,
  testSentMessage,
  testMessageIdUseIdentityAddress,
  testMessageIdUseFromDomain,
  testMessageIdUseIdentityAttribute,
];

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(x => add_task(x));
  run_next_test();
}

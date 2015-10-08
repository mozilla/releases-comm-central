/*
 * Test suite for ensuring that the headers of messages are set properly.
 */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/mimeParser.jsm");

var CompFields = CC("@mozilla.org/messengercompose/composefields;1",
                    Ci.nsIMsgCompFields);

function makeAttachment(opts = {}) {
  let attachment = Cc["@mozilla.org/messengercompose/attachment;1"]
                     .createInstance(Ci.nsIMsgAttachment);
  for (let key in opts) {
    attachment[key] = opts[key];
  }
  return attachment;
}

function sendMessage(fieldParams, identity, opts = {}, attachments = []) {
  // Initialize compose fields
  let fields = new CompFields();
  for (let key in fieldParams)
    fields[key] = fieldParams[key];
  for (let attachment of attachments)
    fields.addAttachment(attachment);

  // Initialize compose params
  let params = Cc["@mozilla.org/messengercompose/composeparams;1"]
                 .createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  for (let key in opts)
    params[key] = opts[key];

  // Send the message
  let msgCompose = MailServices.compose.initCompose(params);
  let progress = Cc["@mozilla.org/messenger/progress;1"]
                   .createInstance(Ci.nsIMsgProgress);
  let promise = new Promise((resolve, reject) => {
    progressListener.resolve = resolve;
    progressListener.reject = reject;
  });
  progress.registerListener(progressListener);
  msgCompose.SendMsg(Ci.nsIMsgSend.nsMsgDeliverNow, identity, "", null,
                     progress);
  return promise;
}

function checkDraftHeaders(expectedHeaders, partNum = "") {
  let msgData = mailTestUtils
    .loadMessageToString(gDraftFolder, mailTestUtils.firstMsgHdr(gDraftFolder));
  checkMessageHeaders(msgData, expectedHeaders, partNum);
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

function* testEnvelope() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.fullName = "Me";
  identity.organization = "World Destruction Committee";
  fields.from = "Nobody <nobody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.cc = "Alex <alex@tinderbox.invalid>";
  fields.bcc = "Boris <boris@tinderbox.invalid>";
  fields.replyTo = "Charles <charles@tinderbox.invalid>";
  fields.organization = "World Salvation Committee";
  fields.subject = "This is an obscure reference";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // As of bug 87987, the identity does not override the from header.
    "From": "Nobody <nobody@tinderbox.invalid>",
    // The identity should override the organization field here.
    "Organization": "World Destruction Committee",
    "To": "Nobody <nobody@tinderbox.invalid>",
    "Cc": "Alex <alex@tinderbox.invalid>",
    "Bcc": "Boris <boris@tinderbox.invalid>",
    "Reply-To": "Charles <charles@tinderbox.invalid>",
    "Subject": "This is an obscure reference",
  });
}

function* testI18NEnvelope() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.fullName = "ケツァルコアトル";
  identity.organization = "Comité de la destruction du monde";
  fields.to = "Émile <nobody@tinderbox.invalid>";
  fields.cc = "André Chopin <alex@tinderbox.invalid>";
  fields.bcc = "Étienne <boris@tinderbox.invalid>";
  fields.replyTo = "Frédéric <charles@tinderbox.invalid>";
  fields.subject = "Ceci n'est pas un référence obscure";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "From": "=?UTF-8?B?44Kx44OE44Kh44Or44Kz44Ki44OI44Or?= <from@tinderbox.invalid>",
    "Organization": "=?UTF-8?Q?Comit=c3=a9_de_la_destruction_du_monde?=",
    "To": "=?UTF-8?B?w4ltaWxl?= <nobody@tinderbox.invalid>",
    "Cc": "=?UTF-8?Q?Andr=c3=a9_Chopin?= <alex@tinderbox.invalid>",
    "Bcc": "=?UTF-8?Q?=c3=89tienne?= <boris@tinderbox.invalid>",
    "Reply-To": "=?UTF-8?B?RnLDqWTDqXJpYw==?= <charles@tinderbox.invalid>",
    "Subject": "=?UTF-8?Q?Ceci_n'est_pas_un_r=c3=a9f=c3=a9rence_obscure?=",
  });
}

function* testIDNEnvelope() {
  let fields = new CompFields();
  let domain = "ケツァルコアトル.invalid";
  // We match against rawHeaderText, so we need to encode the string as a binary
  // string instead of a unicode string.
  let utf8Domain = String.fromCharCode.apply(undefined,
    new TextEncoder("UTF-8").encode(domain));
  // Bug 1034658: nsIMsgIdentity doesn't like IDN in its email addresses.
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  fields.to = "Nobody <nobody@" + domain + ">";
  fields.cc = "Alex <alex@" + domain + ">";
  fields.bcc = "Boris <boris@" + domain + ">";
  fields.replyTo = "Charles <charles@" + domain + ">";
  fields.subject = "This is an obscure reference";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // The identity sets the from field here.
    "From": "from@tinderbox.invalid",
    "To": "Nobody <nobody@" + utf8Domain + ">",
    "Cc": "Alex <alex@" + utf8Domain + ">",
    "Bcc": "Boris <boris@" + utf8Domain +">",
    "Reply-To": "Charles <charles@" + utf8Domain + ">",
    "Subject": "This is an obscure reference",
  });
}

function* testDraftInfo() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "FCC": identity.fccFolder,
    "X-Identity-Key": identity.key,
    "X-Mozilla-Draft-Info": "internal/draft; " +
      "vcard=0; receipt=0; DSN=0; uuencode=0; attachmentreminder=0",
  });

  fields.attachVCard = true;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info": "internal/draft; " +
      "vcard=1; receipt=0; DSN=0; uuencode=0; attachmentreminder=0",
  });

  fields.returnReceipt = true;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info": "internal/draft; " +
      "vcard=1; receipt=1; DSN=0; uuencode=0; attachmentreminder=0",
  });

  fields.DSN = true;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info": "internal/draft; " +
      "vcard=1; receipt=1; DSN=1; uuencode=0; attachmentreminder=0",
  });

  fields.attachmentReminder = true;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Mozilla-Draft-Info": "internal/draft; " +
      "vcard=1; receipt=1; DSN=1; uuencode=0; attachmentreminder=1",
  });
}

function* testOtherHeaders() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  fields.priority = "high";
  fields.references = "<fake@tinderbox.invalid> <more@test.invalid>";
  fields.setHeader("X-Fake-Header", "124");
  let before = Date.now();
  let msgHdr = yield richCreateMessage(fields, [], identity);
  let after = Date.now();
  let msgData = mailTestUtils.loadMessageToString(msgHdr.folder, msgHdr);
  checkMessageHeaders(msgData, {
    "Mime-Version": "1.0",
    "User-Agent":  Cc["@mozilla.org/network/protocol;1?name=http"]
                     .getService(Ci.nsIHttpProtocolHandler).userAgent,
    "X-Priority": "2 (High)",
    "References": "<fake@tinderbox.invalid> <more@test.invalid>",
    "In-Reply-To": "<more@test.invalid>",
    "X-Fake-Header": "124",
  });

  // Check headers with dynamic content
  let headers = MimeParser.extractHeaders(msgData);
  do_check_true(headers.has("Message-Id"));
  do_check_true(headers.getRawHeader("Message-Id")[0]
                       .endsWith("@tinderbox.invalid>"));
  // This is a very special crafted check. We don't know when the message was
  // actually created, but we have bounds on it, from above. From
  // experimentation, there are a few ways you can create dates that Date.parse
  // can't handle (specifically related to how 2-digit years). However, the
  // optimal RFC 5322 form is supported by Date.parse. If Date.parse fails, we
  // have a form that we shouldn't be using anyways.
  let date = new Date(headers.getRawHeader("Date")[0]);
  // If we have clock skew within the test, then our results are going to be
  // meaningless. Hopefully, this is only rarely the case.
  if (before > after) {
    do_print("Clock skew detected, skipping date check");
  } else {
    // In case this all took place within one second, remove sub-millisecond
    // timing (Date headers only carry second-level precision).
    before = before - before % 1000;
    after = after - after % 1000;
    do_print(before + " <= " + date + " <= " + after + "?");
    do_check_true(before <= date && date <= after);
  }


  // We truncate too-long References. Check this.
  let references = [];
  for (let i = 0; i < 100; i++)
    references.push("<" + i + "@test.invalid>");
  let expected = references.slice(47);
  expected.unshift(references[0]);
  fields.references = references.join(" ");
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "References": expected.join(" "),
    "In-Reply-To": references[references.length - 1],
  });
}

function* testNewsgroups() {
  let fields = new CompFields();
  let nntpServer = localAccountUtils.create_incoming_server("nntp", 534,
      "", "");
  nntpServer.QueryInterface(Ci.nsINntpIncomingServer)
    .subscribeToNewsgroup("mozilla.test");
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  fields.newsgroups = "mozilla.test, mozilla.test.multimedia";
  fields.followupTo = "mozilla.test";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    // The identity should override the compose fields here.
    "Newsgroups": "mozilla.test,mozilla.test.multimedia",
    "Followup-To": "mozilla.test",
    "X-Mozilla-News-Host": "localhost",
  });
}

function* testSendHeaders() {
  let fields = new CompFields();
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  identity.setCharAttribute("headers", "bah,humbug");
  identity.setCharAttribute("header.bah", "X-Custom-1: A header value");
  identity.setUnicharAttribute("header.humbug", "X-Custom-2: Enchanté");
  identity.setCharAttribute("subscribed_mailing_lists", "list@test.invalid");
  identity.setCharAttribute("replyto_mangling_mailing_lists",
    "replyto@test.invalid");
  fields.to = "list@test.invalid";
  fields.cc = "not-list@test.invalid";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Custom-1": "A header value",
    "X-Custom-2": "=?UTF-8?Q?_Enchant=c3=a9?=",
    "Mail-Followup-To": "list@test.invalid, not-list@test.invalid",
    "Mail-Reply-To": undefined,
  });

  // Don't set the M-F-T header if there's no list.
  fields.to = "replyto@test.invalid";
  fields.cc = "";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "X-Custom-1": "A header value",
    "X-Custom-2": "=?UTF-8?Q?_Enchant=c3=a9?=",
    "Mail-Reply-To": "from@tinderbox.invalid",
    "Mail-Followup-To": undefined,
  });
}

function* testContentHeaders() {
  // Disable RFC 2047 fallback
  Services.prefs.setIntPref("mail.strictly_mime.parm_folding", 2);
  let fields = new CompFields();
  fields.body = "A body";
  let identity = getSmtpIdentity("from@tinderbox.invalid",
    getBasicSmtpServer());
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "7bit"
  });

  // non-ASCII body should be 8-bit...
  fields.body = "Archæologist";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "8bit"
  });

  // What if we change the message charset?
  fields.characterSet = "ISO-8859-1";
  fields.body = "Archæologist";
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=ISO-8859-1",
    "Content-Transfer-Encoding": "8bit"
  });

  // Attachments
  fields.body = "";
  let plainAttachment = makeAttachment({
    url: "data:text/plain,oïl",
    name: "attachment.txt"
  });
  let plainAttachmentHeaders = {
    "Content-Type": "text/plain; charset=UTF-8",
    "Content-Transfer-Encoding": "base64",
    "Content-Disposition": "attachment; filename=\"attachment.txt\"",
  };
  yield richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders({
    "Content-Type": "text/html; charset=ISO-8859-1",
    "Content-Transfer-Encoding": "7bit"
  }, "1");
  checkDraftHeaders(plainAttachmentHeaders, "2");

  plainAttachment.name = "oïl.txt";
  plainAttachmentHeaders["Content-Disposition"] =
    "attachment; filename*=ISO-8859-1''%6F%EF%6C%2E%74%78%74";
  yield richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders(plainAttachmentHeaders, "2");

  plainAttachment.name = "\ud83d\udca9.txt";
  plainAttachmentHeaders["Content-Disposition"] =
    "attachment; filename*=UTF-8''%F0%9F%92%A9%2E%74%78%74";
  yield richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders(plainAttachmentHeaders, "2");

  let httpAttachment = makeAttachment({
    url: "data:text/html,",
    name: "attachment.html",
  });
  let httpAttachmentHeaders = {
    "Content-Type": "text/html",
    "Content-Disposition": "attachment; filename=\"attachment.html\"",
    "Content-Base": '"data:text/html,"',
    "Content-Location": '"data:text/html,"',
  };
  yield richCreateMessage(fields, [httpAttachment], identity);
  checkDraftHeaders({
    "Content-Base": undefined,
    "Content-Location": undefined
  }, "1");
  checkDraftHeaders(httpAttachmentHeaders, "2");

  fields.characterSet = "UTF-8";
  let cloudAttachment = makeAttachment({
    url: Services.io.newFileURI(do_get_file("data/test-UTF-8.txt")).spec,
    sendViaCloud: true,
    cloudProviderKey: "akey",
    name: "attachment.html",
    contentLocation: "http://localhost.invalid/",
  });
  let cloudAttachmentHeaders = {
    "Content-Type": "application/octet-stream",
    "X-Mozilla-Cloud-Part": "cloudFile; url=http://localhost.invalid/; " +
      "provider=akey; " +
      "file=" + cloudAttachment.url + "; name=attachment.html",
  };
  yield richCreateMessage(fields, [cloudAttachment], identity);
  checkDraftHeaders(cloudAttachmentHeaders, "2");

  // Some multipart/alternative tests.
  fields.body = "Some text";
  fields.forcePlainText = false;
  fields.useMultipartAlternative = true;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "multipart/alternative; boundary=."
  });
  checkDraftHeaders({
    "Content-Type": "text/plain; charset=UTF-8; format=flowed",
    "Content-Transfer-Encoding": "7bit"
  }, "1");
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "7bit"
  }, "2");

  // multipart/mixed
  // + multipart/alternative
  //   + text/plain
  //   + text/html
  // + text/plain attachment
  yield richCreateMessage(fields, [plainAttachment], identity);
  checkDraftHeaders({
    "Content-Type": "multipart/mixed; boundary=."
  });
  checkDraftHeaders({
    "Content-Type": "multipart/alternative; boundary=."
  }, "1");
  checkDraftHeaders({
    "Content-Type": "text/plain; charset=UTF-8; format=flowed",
    "Content-Transfer-Encoding": "7bit"
  }, "1.1");
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "7bit"
  }, "1.2");
  checkDraftHeaders(plainAttachmentHeaders, "2");

  // Three attachments, and a multipart/alternative. Oh the humanity!
  yield richCreateMessage(fields,
    [plainAttachment, httpAttachment, cloudAttachment], identity);
  checkDraftHeaders({
    "Content-Type": "multipart/mixed; boundary=."
  });
  checkDraftHeaders({
    "Content-Type": "multipart/alternative; boundary=."
  }, "1");
  checkDraftHeaders({
    "Content-Type": "text/plain; charset=UTF-8; format=flowed",
    "Content-Transfer-Encoding": "7bit"
  }, "1.1");
  checkDraftHeaders({
    "Content-Type": "text/html; charset=UTF-8",
    "Content-Transfer-Encoding": "7bit"
  }, "1.2");
  checkDraftHeaders(cloudAttachmentHeaders, "2");
  checkDraftHeaders(plainAttachmentHeaders, "3");
  checkDraftHeaders(httpAttachmentHeaders, "4");

  // Test a request for plain text with text/html.
  fields.forcePlainText = true;
  fields.useMultipartAlternative = false;
  yield richCreateMessage(fields, [], identity);
  checkDraftHeaders({
    "Content-Type": "text/plain; charset=UTF-8; format=flowed",
    "Content-Transfer-Encoding": "7bit"
  });
}

function* testSentMessage() {
  let server = setupServerDaemon();
  let daemon = server._daemon;
  server.start();
  try {
    let localserver = getBasicSmtpServer(server.port);
    let identity = getSmtpIdentity("test@tinderbox.invalid", localserver);
    yield sendMessage({
      "to": "Nobody <nobody@tinderbox.invalid>",
      "cc": "Alex <alex@tinderbox.invalid>",
      "bcc": "Boris <boris@tinderbox.invalid>",
      "replyTo": "Charles <charles@tinderbox.invalid>",
    }, identity, {}, []);
    checkMessageHeaders(daemon.post, {
      "From": "test@tinderbox.invalid",
      "To": "Nobody <nobody@tinderbox.invalid>",
      "Cc": "Alex <alex@tinderbox.invalid>",
      "Bcc": undefined,
      "Reply-To": "Charles <charles@tinderbox.invalid>",
      "X-Mozilla-Status": undefined,
      "X-Mozilla-Keys": undefined,
      "X-Mozilla-Draft-Info": undefined,
      "Fcc": undefined
    });
    yield sendMessage({"bcc": "Somebody <test@tinderbox.invalid"}, identity);
    checkMessageHeaders(daemon.post, {
      "To": "undisclosed-recipients: ;"
    });
    yield sendMessage({
      "to": "Somebody <test@tinderbox.invalid>",
      "returnReceipt": true,
      "receiptHeaderType": Ci.nsIMsgMdnGenerator.eDntRrtType,
    }, identity);
    checkMessageHeaders(daemon.post, {
      "Disposition-Notification-To": "test@tinderbox.invalid",
      "Return-Receipt-To": "test@tinderbox.invalid",
    });
    let cloudAttachment = makeAttachment({
      url: Services.io.newFileURI(do_get_file("data/test-UTF-8.txt")).spec,
      sendViaCloud: true,
      cloudProviderKey: "akey",
      name: "attachment.html",
      contentLocation: "http://localhost.invalid/",
    });
    yield sendMessage({to: "test@tinderbox.invalid"}, identity, {},
      [cloudAttachment]);
    checkMessageHeaders(daemon.post, {
      "Content-Type": "application/octet-stream",
      "X-Mozilla-Cloud-Part": "cloudFile; url=http://localhost.invalid/; " +
        "name=attachment.html",
    }, "2");
  } finally {
    server.stop();
  }
}

var tests = [
  testEnvelope,
  testI18NEnvelope,
  testIDNEnvelope,
  testDraftInfo,
  testOtherHeaders,
  testNewsgroups,
  testSendHeaders,
  testContentHeaders,
  testSentMessage,
]

function run_test() {
  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();
  tests.forEach(add_task);
  run_next_test();
}

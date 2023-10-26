/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ImapResponse } = ChromeUtils.import(
  "resource:///modules/ImapResponse.jsm"
);
var { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

/**
 * Test CAPABILITY response can be correctly parsed.
 */
add_task(function test_CapabilityResponse() {
  let response = new ImapResponse();
  response.parse(
    "32 OK [CAPABILITY IMAP4rev1 IDLE STARTTLS AUTH=LOGIN AUTH=PLAIN] server ready\r\n"
  );

  deepEqual(response.authMethods, ["LOGIN", "PLAIN"]);
  deepEqual(response.capabilities, ["IMAP4REV1", "IDLE", "STARTTLS"]);

  response = new ImapResponse();
  response.parse("* CAPABILITY IMAP4rev1 ID IDLE STARTTLS AUTH=PLAIN\r\n");

  deepEqual(response.authMethods, ["PLAIN"]);
  deepEqual(response.capabilities, ["IMAP4REV1", "ID", "IDLE", "STARTTLS"]);
});

/**
 * Test flags from a FETCH response can be correctly parsed.
 */
add_task(function test_FetchResponse_flags() {
  const response = new ImapResponse();
  response.parse(
    [
      "* 1 FETCH (UID 500 FLAGS (\\Answered \\Seen $Forwarded))",
      "* 2 FETCH (UID 600 FLAGS (\\Seen))",
      "",
    ].join("\r\n")
  );
  ok(!response.done);

  response.parse(
    ["* 3 FETCH (UID 601 FLAGS ())", "40 OK Fetch completed", ""].join("\r\n")
  );

  ok(response.done);
  deepEqual(response.messages[0], {
    sequence: 1,
    uid: 500,
    flags:
      ImapUtils.FLAG_ANSWERED | ImapUtils.FLAG_SEEN | ImapUtils.FLAG_FORWARDED,
    keywords: "$Forwarded",
    customAttributes: {},
  });
  deepEqual(response.messages[1], {
    sequence: 2,
    uid: 600,
    flags: ImapUtils.FLAG_SEEN,
    keywords: "",
    customAttributes: {},
  });
  deepEqual(response.messages[2], {
    sequence: 3,
    uid: 601,
    flags: 0,
    keywords: "",
    customAttributes: {},
  });
});

/**
 * Test body from a FETCH response can be correctly parsed.
 */
add_task(function test_messageBody() {
  const response = new ImapResponse();
  response.parse(
    [
      "* 1 FETCH (UID 500 FLAGS (\\Answered \\Seen $Forwarded) BODY[HEADER.FIELDS (FROM TO)] {12}",
      "abcd",
      "efgh",
      ")",
      "* 2 FETCH (UID 600 FLAGS (\\Seen) BODY[] {15}",
      "Hello ",
      "world",
      ")",
      "40 OK Fetch completed",
      "",
    ].join("\r\n")
  );

  equal(response.messages[0].body, "abcd\r\nefgh\r\n");
  equal(response.messages[1].body, "Hello \r\nworld\r\n");
});

/**
 * Test msg body spanning multiple chuncks can be correctly parsed.
 */
add_task(function test_messageBodyIncremental() {
  const response = new ImapResponse();
  // Chunk 1.
  response.parse(
    [
      "* 1 FETCH (UID 500 FLAGS (\\Answered \\Seen $Forwarded) BODY[HEADER.FIELDS (FROM TO)] {12}",
      "abcd",
      "efgh",
      ")",
      "* 2 FETCH (UID 600 FLAGS (\\Seen) BODY[] {15}",
      "Hel",
    ].join("\r\n")
  );
  equal(response.messages[0].body, "abcd\r\nefgh\r\n");
  ok(!response.done);

  // Chunk 2.
  response.parse("lo \r\nworld\r\n");
  ok(!response.done);

  // Chunk 3.
  response.parse(")\r\n40 OK Fetch completed\r\n");
  ok(response.done);
  equal(response.messages[1].body, "Hello \r\nworld\r\n");
});

/**
 * Test FLAGS response can be correctly parsed.
 */
add_task(function test_FlagsResponse() {
  const response = new ImapResponse();
  response.parse(
    [
      "* FLAGS (\\Seen \\Draft $Forwarded)",
      "* OK [PERMANENTFLAGS (\\Seen \\Draft $Forwarded \\*)] Flags permitted.",
      "* 6 EXISTS",
      "* OK [UNSEEN 2] First unseen.",
      "* OK [UIDVALIDITY 1594877893] UIDs valid",
      "* OK [UIDNEXT 625] Predicted next UID",
      "* OK [HIGHESTMODSEQ 1148] Highest",
      "42 OK [READ-WRITE] Select completed",
      "",
    ].join("\r\n")
  );

  equal(
    response.flags,
    ImapUtils.FLAG_SEEN | ImapUtils.FLAG_DRAFT | ImapUtils.FLAG_FORWARDED
  );
  equal(
    response.permanentflags,
    ImapUtils.FLAG_SEEN |
      ImapUtils.FLAG_DRAFT |
      ImapUtils.FLAG_FORWARDED |
      ImapUtils.FLAG_LABEL |
      ImapUtils.FLAG_MDN_SENT |
      ImapUtils.FLAG_FORWARDED |
      ImapUtils.FLAG_SUPPORT_USER_FLAG
  );
  equal(response.highestmodseq, 1148);
  equal(response.exists, 6);
});

/**
 * Test mailbox updates can be correctly parsed.
 */
add_task(function test_MailboxResponse() {
  const response = new ImapResponse();
  response.parse("* 7 EXISTS\r\n");
  response.parse("* 1 EXPUNGE\r\n* 3 EXPUNGE\r\n");
  equal(response.exists, 7);
  deepEqual(response.expunged, [1, 3]);
});

/**
 * Test LIST response can be correctly parsed.
 */
add_task(function test_ListResponse() {
  const response = new ImapResponse();
  response.parse(
    [
      '* LIST (\\Subscribed \\NoInferiors \\Marked \\Trash) "/" "Trash"',
      '* LIST () "/" "a \\"b\\" c"',
      '* LIST (\\Subscribed) "/" INBOX',
      "84 OK List completed (0.002 + 0.000 + 0.001 secs).",
      "",
    ].join("\r\n")
  );
  equal(response.mailboxes.length, 3);
  deepEqual(response.mailboxes[0], {
    name: "Trash",
    delimiter: "/",
    flags:
      ImapUtils.FLAG_SUBSCRIBED |
      ImapUtils.FLAG_NO_INFERIORS |
      ImapUtils.FLAG_HAS_NO_CHILDREN |
      ImapUtils.FLAG_MARKED |
      ImapUtils.FLAG_IMAP_TRASH |
      ImapUtils.FLAG_IMAP_XLIST_TRASH,
  });
  deepEqual(response.mailboxes[1], {
    name: 'a "b" c',
    delimiter: "/",
    flags: 0,
  });
  deepEqual(response.mailboxes[2], {
    name: "INBOX",
    delimiter: "/",
    flags: ImapUtils.FLAG_SUBSCRIBED,
  });
});

/**
 * Test folder names containg [] or () or "" can be correctly parsed.
 */
add_task(function test_parseFolderNames() {
  const response = new ImapResponse();
  response.parse(
    [
      '* LSUB () "/" "[Gmail]"',
      '* LSUB () "/" "[Gmail]/All Mail"',
      '* LSUB () "/" "[Gmail]/Sent"',
      '* LSUB () "/" "[a(b)])"',
      '* LSUB () "/" "a \\"b \\"c\\""',
      "84 OK LSUB completed",
      "",
    ].join("\r\n")
  );
  equal(response.mailboxes.length, 5);
  deepEqual(
    response.mailboxes.map(x => x.name),
    ["[Gmail]", "[Gmail]/All Mail", "[Gmail]/Sent", "[a(b)])", 'a "b "c"']
  );
});

/**
 * Test STATUS response can be correctly parsed.
 */
add_task(function test_StatusResponse() {
  const response = new ImapResponse();
  response.parse(
    '* STATUS "sub folder 2" (UIDNEXT 2 MESSAGES 1 UNSEEN 1 RECENT 0)\r\n'
  );
  deepEqual(response.attributes, {
    mailbox: "sub folder 2",
    uidnext: 2,
    messages: 1,
    unseen: 1,
    recent: 0,
  });
});

/**
 * Test GETQUOTAROOT response can be correctly parsed.
 */
add_task(function test_QuotaResponse() {
  const response = new ImapResponse();
  response.parse(
    ["* QUOTAROOT Sent INBOX", "* QUOTA INBOX (STORAGE 123 456)", ""].join(
      "\r\n"
    )
  );
  deepEqual(response.quotaRoots, ["INBOX"]);
  deepEqual(response.quotas, [["INBOX", "STORAGE", 123, 456]]);
});

/**
 * Test IDLE and DONE response can be correctly parsed.
 */
add_task(function test_IdleDoneResponse() {
  let response = new ImapResponse();
  response.parse("+ idling\r\n");
  deepEqual(
    [response.tag, response.status, response.done],
    ["+", "idling", true]
  );

  response = new ImapResponse();
  response.parse(["+ idling", "75 OK Completed", ""].join("\r\n"));
  deepEqual([response.tag, response.status, response.done], [75, "OK", true]);
});

/**
 * Test SEARCH response can be correctly parsed.
 */
add_task(function test_SearchResponse() {
  const response = new ImapResponse();
  response.parse("* SEARCH 1 4 9\r\n90 OK SEARCH COMPLETED\r\n");
  deepEqual(response.search, [1, 4, 9]);
});

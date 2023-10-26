/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests the msgIStructuredHeaders and msgIWritableStructuredHeaders
// interfaces.

// Verify that a specific XPCOM error code is thrown.
function verifyError(block, errorCode) {
  let caught = undefined;
  try {
    block();
  } catch (actual) {
    caught = actual.result;
  }
  Assert.equal(caught, errorCode);
}

var StructuredHeaders = CC(
  "@mozilla.org/messenger/structuredheaders;1",
  Ci.msgIWritableStructuredHeaders
);

add_task(async function check_addressing() {
  const headers = new StructuredHeaders();
  headers.setHeader("To", [{ name: "undisclosed-recipients", group: [] }]);
  Assert.ok(Array.isArray(headers.getHeader("To")));
  const flat = headers.getAddressingHeader("To", false);
  Assert.ok(Array.isArray(flat));
  Assert.equal(flat.length, 0);
  const full = headers.getAddressingHeader("To", true);
  Assert.ok(Array.isArray(full));
  Assert.equal(full.length, 1);
  Assert.equal(full[0].name, "undisclosed-recipients");
  Assert.ok(Array.isArray(full[0].group));
  Assert.equal(headers.getRawHeader("To"), "undisclosed-recipients: ;");

  headers.setHeader("To", [{ name: "\u00D3", email: "test@foo.invalid" }]);
  Assert.equal(
    headers.getRawHeader("To"),
    "=?UTF-8?B?w5M=?= <test@foo.invalid>"
  );
  headers.setAddressingHeader("To", [
    { name: "Comma, Name", email: "test@foo.invalid" },
  ]);
  Assert.equal(headers.getRawHeader("To"), '"Comma, Name" <test@foo.invalid>');
});

add_task(async function check_custom_header() {
  // Load an extension for our custom header.
  const url = Services.io.newFileURI(do_get_file("custom_header.js")).spec;
  const promise = new Promise((resolve, reject) => {
    function observer(subject, topic, data) {
      Assert.equal(topic, "xpcom-category-entry-added");
      Assert.equal(data, "custom-mime-encoder");
      resolve();
      Services.obs.removeObserver(observer, "xpcom-category-entry-added");
    }
    Services.obs.addObserver(observer, "xpcom-category-entry-added");
  });
  Services.catMan.addCategoryEntry(
    "custom-mime-encoder",
    "X-Unusual",
    url,
    false,
    true
  );
  // The category manager doesn't fire until a later timestep.
  await promise;
  const headers = new StructuredHeaders();
  headers.setRawHeader("X-Unusual", "10");
  Assert.equal(headers.getHeader("X-Unusual"), 16);
  headers.setHeader("X-Unusual", 32);
  Assert.equal(headers.getRawHeader("X-Unusual"), "20");
});

add_task(async function check_raw() {
  const headers = new StructuredHeaders();
  Assert.ok(!headers.hasHeader("Date"));
  const day = new Date("2000-01-01T00:00:00Z");
  headers.setHeader("Date", day);
  Assert.ok(headers.hasHeader("Date"));
  Assert.ok(headers.hasHeader("date"));
  Assert.equal(headers.getHeader("Date"), day);
  Assert.equal(headers.getHeader("date"), day);
  verifyError(
    () => headers.getUnstructuredHeader("Date"),
    Cr.NS_ERROR_ILLEGAL_VALUE
  );
  verifyError(
    () => headers.getAddressingHeader("Date"),
    Cr.NS_ERROR_ILLEGAL_VALUE
  );
  // This is easier than trying to match the actual value for the Date header,
  // since that depends on the current timezone.
  Assert.equal(new Date(headers.getRawHeader("Date")).getTime(), day.getTime());

  // Otherwise, the string values should work.
  headers.setRawHeader("Custom-Date", "1 Jan 2000 00:00:00 +0000");
  Assert.equal(
    headers.getRawHeader("Custom-Date"),
    "1 Jan 2000 00:00:00 +0000"
  );
  headers.deleteHeader("Custom-Date");

  headers.setUnstructuredHeader("Content-Description", "A description!");
  Assert.equal(headers.getHeader("Content-Description"), "A description!");
  Assert.equal(
    headers.getUnstructuredHeader("Content-Description"),
    "A description!"
  );
  verifyError(
    () => headers.getAddressingHeader("Content-Description"),
    Cr.NS_ERROR_ILLEGAL_VALUE
  );
  Assert.equal(headers.getRawHeader("Content-Description"), "A description!");

  Assert.ok(!headers.hasHeader("Subject"));
  Assert.ok(headers.getUnstructuredHeader("Subject") === null);
  headers.setRawHeader("Subject", "=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?=");
  Assert.equal(
    headers.getHeader("Subject"),
    "\u79c1\u306f\u4ef6\u540d\u5348\u524d"
  );
  Assert.equal(
    headers.getRawHeader("Subject"),
    "=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?="
  );

  // Multiple found headers
  Assert.equal(headers.getHeader("Not-Found-Anywhere"), undefined);
  Assert.notEqual(headers.getHeader("Not-Found-Anywhere"), "");
  Assert.equal(headers.getRawHeader("Not-Found-Anywhere"), undefined);
  headers.setHeader("Not-Found-Anywhere", 515);
  Assert.equal(headers.getHeader("Not-Found-Anywhere"), 515);
  headers.deleteHeader("not-found-anywhere");
  Assert.equal(headers.getHeader("Not-Found-Anywhere"), undefined);

  // Check the enumeration of header values.
  headers.setHeader("unabashed-random-header", false);
  const headerList = [
    "Date",
    "Content-Description",
    "Subject",
    "Unabashed-Random-Header",
  ];
  for (const value of headers.headerNames) {
    Assert.equal(value.toLowerCase(), headerList.shift().toLowerCase());
  }

  // Check that copying works
  const moreHeaders = new StructuredHeaders();
  moreHeaders.addAllHeaders(headers);
  for (const value of headers.headerNames) {
    Assert.equal(moreHeaders.getHeader(value), headers.getHeader(value));
  }
  headers.deleteHeader("Date");
  Assert.ok(moreHeaders.hasHeader("Date"));
});

add_task(async function check_nsIMimeHeaders() {
  const headers = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
    Ci.nsIMimeHeaders
  );
  Assert.ok(headers instanceof Ci.msgIStructuredHeaders);
  Assert.equal(false, headers instanceof Ci.msgIWritableStructuredHeaders);
  headers.initialize(
    mailTestUtils.loadFileToString(do_get_file("../../../data/draft1"))
  );
  Assert.equal(headers.getHeader("To").length, 1);
  Assert.equal(headers.getHeader("To")[0].email, "bugmail@example.org");
  Assert.equal(headers.getAddressingHeader("To").length, 1);
  Assert.equal(headers.getHeader("Content-Type").type, "text/html");

  const headerList = [
    "X-Mozilla-Status",
    "X-Mozilla-Status2",
    "X-Mozilla-Keys",
    "FCC",
    "BCC",
    "X-Identity-Key",
    "Message-ID",
    "Date",
    "From",
    "X-Mozilla-Draft-Info",
    "User-Agent",
    "MIME-Version",
    "To",
    "Subject",
    "Content-Type",
    "Content-Transfer-Encoding",
  ];
  for (const value of headers.headerNames) {
    Assert.equal(value.toLowerCase(), headerList.shift().toLowerCase());
  }
});

add_task(async function checkBuildMimeText() {
  let headers = new StructuredHeaders();
  headers.setHeader("To", [
    { name: "François Smith", email: "user@☃.invalid" },
  ]);
  headers.setHeader("From", [{ name: "John Doe", email: "jdoe@test.invalid" }]);
  headers.setHeader(
    "Subject",
    "A subject that spans a distance quite in " +
      "excess of 80 characters so as to force an intermediary CRLF"
  );
  headers.setHeader(
    "User-Agent",
    "Mozilla/5.0 (X11; Linux x86_64; rv:40.0) Gecko/20100101 Thunderbird/40.0a1"
  );
  let mimeText =
    "To: =?UTF-8?Q?Fran=C3=A7ois_Smith?= <user@☃.invalid>\r\n" +
    "From: John Doe <jdoe@test.invalid>\r\n" +
    "Subject: A subject that spans a distance quite in excess of 80 characters so\r\n" +
    " as to force an intermediary CRLF\r\n" +
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:40.0) Gecko/20100101\r\n" +
    " Thunderbird/40.0a1\r\n";
  Assert.equal(headers.buildMimeText(), mimeText);

  // Check the version used for the nsIMimeHeaders implementation. This requires
  // initializing with a UTF-8 version.
  const utf8Text = mimeText.replace("☃", "\xe2\x98\x83");
  const mimeHeaders = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
    Ci.nsIMimeHeaders
  );
  mimeHeaders.initialize(utf8Text);
  Assert.equal(mimeHeaders.getHeader("To")[0].email, "user@☃.invalid");
  Assert.equal(mimeHeaders.buildMimeText(), mimeText);
  Assert.equal(mimeHeaders.allHeaders, utf8Text);

  // Check date header sanitization
  headers = new StructuredHeaders();
  headers.setHeader("Date", new Date("Fri, 6 Mar 2020 00:12:34 +0100"));
  mimeText = "Date: Thu, 5 Mar 2020 23:12:00 +0000\r\n";
  Assert.equal(headers.buildMimeText(true), mimeText);
});

/**
 * Test that very long message id can be encoded without error.
 */
add_task(async function test_longMessageId() {
  const msgId =
    "<loqrvrxAUJXbUjUpqbrOJ8nHnJ49hmTREaUhehHZQv0AELQUM7ym6MUklPkt13aw4UD81bYIwO91pQL2OaeKMYVYD5hvZiRT2lSUmGtJkthgb3p5-y03p9bkxbnixgary7va1z0rv6hmd0yy69dm9exwga43h5k6266uwwchtjuxail7ipjhu6307yuft5bm186nu9vejf2joegwtq309cz9m-o3gwPZsvyB4qDpaAkxaj8iyh4OHc0kJsbQPQG8c5z6l3mmtwJuFHC4PxJnzAx9TyQzfnxhiXetQqFaNfvjNYetmNGMd4oq-sihw-d26z-bmdkvy47cloy2vwrnEYPKxtmjXtsmyFJGNxL7d1CeFIAOloSFAwccA6Onq6zPC9lfwWcAOFFje5XqkGVK2XNsUsFao5PR51WsOZStvoCzkqPuWB5PpJ791D9gzPXvGVa45ahuwgpmr1v8g1h5dalaytuxtpettthl506s7l4odqnkhufkvqkja56ulbd4ukgpbd88o3msjz3qk906pbfq6cahdecxoidplpbtsm-673718934717750999799265953521388769563044829819888815300763892678635939321303281062602679958225188.n050jeqcu1blxrm38i58q9dsws108c2m3xcc1tfmlgx8ya2wjyvzxyikgaaed3q6r@ZGCDPKIGJZGEPNVFFMXMTCMUFOPRMBFLIIPXSXECXKGNXBSDNPPHRBCXQRPCTUOCDDZVBEXYODLMFEQTUGBMHDJYUYus-575687677-2.673718934717750999799265953521388769563044829819888815300763892678635939321303281062602679958225188.invalid>";
  const headers = new StructuredHeaders();
  headers.setHeader("Message-ID", msgId);
  Assert.equal(headers.getRawHeader("message-id"), msgId);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests the msgIStructuredHeaders and msgIWritableStructuredHeaders
// interfaces.

Components.utils.import("resource://gre/modules/Services.jsm");

/// Verify that a specific XPCOM error code is thrown.
function verifyError(block, errorCode) {
  let caught = undefined;
  try {
    block();
  } catch (actual) {
    caught = actual.result;
  }
  do_check_eq(caught, errorCode);
}

var StructuredHeaders = CC("@mozilla.org/messenger/structuredheaders;1",
                           Ci.msgIWritableStructuredHeaders);

add_task(function* check_addressing() {
  let headers = new StructuredHeaders();
  headers.setHeader("To", [{name: "undisclosed-recipients", group: []}]);
  do_check_true(Array.isArray(headers.getHeader("To")));
  let flat = headers.getAddressingHeader("To", false);
  do_check_true(Array.isArray(flat));
  do_check_eq(flat.length, 0);
  let full = headers.getAddressingHeader("To", true);
  do_check_true(Array.isArray(full));
  do_check_eq(full.length, 1);
  do_check_eq(full[0].name, "undisclosed-recipients");
  do_check_true(Array.isArray(full[0].group));
  do_check_eq(headers.getRawHeader("To"), "undisclosed-recipients: ;");

  headers.setHeader("To", [{name: "\u00D3", email: "test@foo.invalid"}]);
  do_check_eq(headers.getRawHeader("To"),
    "=?UTF-8?B?w5M=?= <test@foo.invalid>");
  headers.setAddressingHeader("To",
    [{name: "Comma, Name", email: "test@foo.invalid"}], 1);
  do_check_eq(headers.getRawHeader("To"),
    "\"Comma, Name\" <test@foo.invalid>");
});

add_task(function* check_custom_header() {
  // Load an extension for our custom header.
  let url = Services.io.newFileURI(do_get_file("custom_header.js")).spec;
  let promise = new Promise((resolve, reject) => {
    function observer(subject, topic, data) {
      do_check_eq(topic, "xpcom-category-entry-added");
      do_check_eq(data, "custom-mime-encoder");
      resolve();
      Services.obs.removeObserver(observer, "xpcom-category-entry-added");
    }
    Services.obs.addObserver(observer, "xpcom-category-entry-added", false);
  });
  Cc["@mozilla.org/categorymanager;1"]
    .getService(Ci.nsICategoryManager)
    .addCategoryEntry("custom-mime-encoder", "X-Unusual", url, false, true);
  // The category manager doesn't fire until a later timestep.
  yield promise;
  let headers = new StructuredHeaders();
  headers.setRawHeader("X-Unusual", "10", null);
  do_check_eq(headers.getHeader("X-Unusual"), 16);
  headers.setHeader("X-Unusual", 32);
  do_check_eq(headers.getRawHeader("X-Unusual"), "20");
});

add_task(function* check_raw() {
  let headers = new StructuredHeaders();
  do_check_false(headers.hasHeader("Date"));
  let day = new Date("2000-01-01T00:00:00Z");
  headers.setHeader("Date", day);
  do_check_true(headers.hasHeader("Date"));
  do_check_true(headers.hasHeader("date"));
  do_check_eq(headers.getHeader("Date"), day);
  do_check_eq(headers.getHeader("date"), day);
  verifyError(() => headers.getUnstructuredHeader("Date"),
    Components.results.NS_ERROR_ILLEGAL_VALUE);
  verifyError(() => headers.getAddressingHeader("Date"),
    Components.results.NS_ERROR_ILLEGAL_VALUE);
  // This is easier than trying to match the actual value for the Date header,
  // since that depends on the current timezone.
  do_check_eq(new Date(headers.getRawHeader("Date")).getTime(), day.getTime());

  // Otherwise, the string values should work.
  headers.setRawHeader("Custom-Date", "1 Jan 2000 00:00:00 +0000", null);
  do_check_eq(headers.getRawHeader("Custom-Date"), "1 Jan 2000 00:00:00 +0000");
  headers.deleteHeader("Custom-Date");

  headers.setUnstructuredHeader("Content-Description", "A description!");
  do_check_eq(headers.getHeader("Content-Description"), "A description!");
  do_check_eq(headers.getUnstructuredHeader("Content-Description"),
    "A description!");
  verifyError(() => headers.getAddressingHeader("Content-Description"),
    Components.results.NS_ERROR_ILLEGAL_VALUE);
  do_check_eq(headers.getRawHeader("Content-Description"),
    "A description!");

  do_check_false(headers.hasHeader("Subject"));
  do_check_true(headers.getUnstructuredHeader("Subject") === null);
  headers.setRawHeader("Subject", "=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?=",
    "US-ASCII");
  do_check_eq(headers.getHeader("Subject"),
    "\u79c1\u306f\u4ef6\u540d\u5348\u524d");
  do_check_eq(headers.getRawHeader("Subject"),
    "=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?=");

  // Multiple found headers
  do_check_eq(headers.getHeader("Not-Found-Anywhere"), undefined);
  do_check_neq(headers.getHeader("Not-Found-Anywhere"), "");
  do_check_eq(headers.getRawHeader("Not-Found-Anywhere"), undefined);
  headers.setHeader("Not-Found-Anywhere", 515);
  do_check_eq(headers.getHeader("Not-Found-Anywhere"), 515);
  headers.deleteHeader("not-found-anywhere");
  do_check_eq(headers.getHeader("Not-Found-Anywhere"), undefined);

  // Check the enumeration of header values.
  headers.setHeader("unabashed-random-header", false);
  let headerList = ["Date", "Content-Description", "Subject",
    "Unabashed-Random-Header"];
  let enumerator = headers.headerNames;
  while (enumerator.hasMore()) {
    let value = enumerator.getNext();
    do_check_eq(value.toLowerCase(), headerList.shift().toLowerCase());
  }

  // Check that copying works
  let moreHeaders = new StructuredHeaders();
  moreHeaders.addAllHeaders(headers);
  enumerator = headers.headerNames;
  while (enumerator.hasMore()) {
    let value = enumerator.getNext();
    do_check_eq(moreHeaders.getHeader(value), headers.getHeader(value));
  }
  headers.deleteHeader("Date");
  do_check_true(moreHeaders.hasHeader("Date"));
})

add_task(function* check_nsIMimeHeaders() {
  let headers = Cc["@mozilla.org/messenger/mimeheaders;1"]
                  .createInstance(Ci.nsIMimeHeaders);
  do_check_true(headers instanceof Ci.msgIStructuredHeaders);
  do_check_false(headers instanceof Ci.msgIWritableStructuredHeaders);
  headers.initialize(mailTestUtils.loadFileToString(
    do_get_file("../../../data/draft1")));
  do_check_eq(headers.getHeader("To").length, 1);
  do_check_eq(headers.getHeader("To")[0].email, "bugmail@example.org");
  do_check_eq(headers.getAddressingHeader("To").length, 1);
  do_check_eq(headers.getHeader("Content-Type").type, "text/html");

  let headerList = ["X-Mozilla-Status", "X-Mozilla-Status2", "X-Mozilla-Keys",
    "FCC", "BCC", "X-Identity-Key", "Message-ID", "Date", "From",
    "X-Mozilla-Draft-Info", "User-Agent", "MIME-Version", "To", "Subject",
    "Content-Type", "Content-Transfer-Encoding"];
  let enumerator = headers.headerNames;
  while (enumerator.hasMore()) {
    let value = enumerator.getNext();
    do_check_eq(value.toLowerCase(), headerList.shift().toLowerCase());
  }
});

add_task(function* checkBuildMimeText() {
  let headers = new StructuredHeaders();
  headers.setHeader("To", [{name: "François Smith", email: "user@☃.invalid"}]);
  headers.setHeader("From", [{name: "John Doe", email: "jdoe@test.invalid"}]);
  headers.setHeader("Subject", "A subject that spans a distance quite in " +
    "excess of 80 characters so as to force an intermediary CRLF");
  headers.setHeader("User-Agent", "Mozilla/5.0 (X11; Linux x86_64; rv:40.0) Gecko/20100101 Thunderbird/40.0a1");
  let mimeText =
    "To: =?UTF-8?Q?Fran=c3=a7ois_Smith?= <user@☃.invalid>\r\n" +
    "From: John Doe <jdoe@test.invalid>\r\n" +
    "Subject: A subject that spans a distance quite in excess of 80 characters so\r\n" +
      " as to force an intermediary CRLF\r\n" +
    "User-Agent: Mozilla/5.0 (X11; Linux x86_64; rv:40.0) Gecko/20100101\r\n" +
      " Thunderbird/40.0a1\r\n";
  do_check_eq(headers.buildMimeText(), mimeText);

  // Check the version used for the nsIMimeHeaders implementation. This requires
  // initializing with a UTF-8 version.
  let utf8Text = mimeText.replace("☃", "\xe2\x98\x83");
  let mimeHeaders = Cc["@mozilla.org/messenger/mimeheaders;1"]
                      .createInstance(Ci.nsIMimeHeaders);
  mimeHeaders.initialize(utf8Text);
  do_check_eq(mimeHeaders.getHeader("To")[0].email, "user@☃.invalid");
  do_check_eq(mimeHeaders.buildMimeText(), mimeText);
  do_check_eq(mimeHeaders.allHeaders, utf8Text);
});

function run_test() {
  run_next_test();
}

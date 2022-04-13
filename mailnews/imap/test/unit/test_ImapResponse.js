/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ImapResponse } = ChromeUtils.import(
  "resource:///modules/ImapResponse.jsm"
);

/**
 * Test flags from a FETCH response can be correctly parsed.
 */
add_task(function test_FetchResponse_flags() {
  let str = [
    "* 1 FETCH (UID 500 FLAGS (\\Answered \\Seen $Forwarded))",
    "* 2 FETCH (UID 600 FLAGS (\\Seen))",
    "* 3 FETCH (UID 601 FLAGS ())",
    "40 OK Fetch completed",
    "",
  ].join("\r\n");
  let response = ImapResponse.parse(str);

  equal(response.tag, "40");
  equal(response.status, "OK");
  equal(response.statusText, "Fetch completed");
  deepEqual(response.data[0].attributes, {
    UID: "500",
    FLAGS: ["\\Answered", "\\Seen", "$Forwarded"],
  });
  deepEqual(response.data[1].attributes, {
    UID: "600",
    FLAGS: ["\\Seen"],
  });
  deepEqual(response.data[2].attributes, {
    UID: "601",
    FLAGS: [],
  });
});

/**
 * Test body from a FETCH response can be correctly parsed.
 */
add_task(function test_FetchResponse_body() {
  let str = [
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
  ].join("\r\n");
  let response = ImapResponse.parse(str);

  equal(response.data[0].attributes.body, "abcd\r\nefgh\r\n");
  equal(response.data[1].attributes.body, "Hello \r\nworld\r\n");
});

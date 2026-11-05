/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that anything but a sequence set in the message id list of an IMAP URL
 * makes the URL invalid, since the list is sent to the server as is.
 */

function imapUrl(path) {
  return Services.io
    .newURI(`imap://localhost:143/fetch%3EUID%3E%2FINBOX%3E${path}`)
    .QueryInterface(Ci.nsIImapUrl);
}

add_task(function test_validMessageIds() {
  for (const path of [
    "1",
    "1:5,7,9:*",
    "1?part=1.2&filename=a%0D%0Ab.txt",
    "1/;section=2",
  ]) {
    const url = imapUrl(path);
    Assert.ok(url.validUrl, `${path} should be a valid URL`);
  }
  Assert.equal(
    imapUrl("1?part=1.2&filename=a%0D%0Ab.txt").listOfMessageIds,
    "1",
    "the query should be stripped from the message id list"
  );
});

add_task(function test_invalidMessageIds() {
  for (const path of [
    "1%0D%0Aa001%20LOGOUT",
    "1%0Aa001%20LOGOUT",
    "1%0D",
    "1%09",
    "1%7F",
    "1%0D%0A/;section=2",
    "1%0D%0A?part=1.2",
    "1%20LOGOUT",
    "1(",
    "1&part=1.2",
    "a",
  ]) {
    const url = imapUrl(path);
    Assert.ok(!url.validUrl, `${path} should not be a valid URL`);
  }
});

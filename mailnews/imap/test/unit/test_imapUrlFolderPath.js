/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that control characters in a folder path of an IMAP URL make the URL
 * invalid, since the path ends up in commands sent to the server.
 */

function imapUrl(path) {
  return Services.io
    .newURI(`imap://localhost:143/${path}`)
    .QueryInterface(Ci.nsIImapUrl);
}

add_task(function test_validFolderPaths() {
  for (const path of [
    "fetch%3EUID%3E%2FINBOX%3E1",
    "fetch%3EUID%3E%2FINBOX%2FSub%20folder%3E1",
    "fetch%3EUID%3E.INBOX.Sub%3E1",
    "select%3E%5EINBOX",
    "onlinecopy%3EUID%3E%2FINBOX%3E1%3E%2FArchive",
  ]) {
    const url = imapUrl(path);
    Assert.ok(url.validUrl, `${path} should be a valid URL`);
  }
});

add_task(function test_controlCharactersInFolderPaths() {
  for (const path of [
    "fetch%3EUID%3E%2FINBOX%0D%0Aa001%20LOGOUT%3E1",
    "fetch%3EUID%3E%2FINBOX%250D%250Aa001%20LOGOUT%3E1",
    "fetch%3EUID%3E%2FINBOX%09%3E1",
    "fetch%3EUID%3E%2FINBOX%7F%3E1",
    "fetch%3EUID%3E%0DINBOX%3E1",
    "select%3E%2FINBOX%0D%0Aa001%20LOGOUT",
    "onlinecopy%3EUID%3E%2FINBOX%3E1%3E%2FArchive%0D%0Aa001%20LOGOUT",
    "onlinecopy%3EUID%3E%2FINBOX%3E1?a%3E%2FArchive%0D%0Aa001%20LOGOUT",
  ]) {
    const url = imapUrl(path);
    Assert.ok(!url.validUrl, `${path} should not be a valid URL`);
  }
});

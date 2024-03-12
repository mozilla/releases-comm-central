/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function getMessageHeaderFromUrl(aUrl) {
  const msgUrl = Services.io.newURI(aUrl).QueryInterface(Ci.nsIMsgMessageUrl);
  return msgUrl.messageHeader;
}

function run_test() {
  // This is crash test for Bug 392729
  try {
    // msgkey is invalid for news:// protocol
    getMessageHeaderFromUrl(
      "news://localhost:119" +
        "/123@example.invalid?group=test.subscribe.simple&key=abcdefghijk"
    );
    Assert.ok(false);
  } catch (e) {
    Assert.equal(e.result, Cr.NS_ERROR_MALFORMED_URI);
  }
}

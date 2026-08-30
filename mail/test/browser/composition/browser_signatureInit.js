/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the compose window initializes with the signature correctly
 * under various circumstances.
 */

"use strict";

var { close_compose_window, get_compose_body, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

var kHtmlPref = "mail.identity.default.compose_html";
var kReplyOnTopPref = "mail.identity.default.reply_on_top";
var kReplyOnTop = 1;
var kSigBottomPref = "mail.identity.default.sig_bottom";

/**
 * Regression test for bug 762413 - tests that when we're set to reply above,
 * with the signature below the reply, we initialize the compose window such
 * that there is a <br> node above the signature. This allows the user to
 * insert text before the signature.
 */
add_task(async function test_on_reply_above_signature_below_reply() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [kHtmlPref, false],
      [kReplyOnTopPref, kReplyOnTop],
      [kSigBottomPref, false],
    ],
  });

  const cw = await open_compose_new_mail();
  const mailBody = get_compose_body(cw);

  const node = mailBody.firstChild;
  Assert.equal(
    node.localName,
    "br",
    "Expected a BR node to start the compose body."
  );

  await close_compose_window(cw);
});

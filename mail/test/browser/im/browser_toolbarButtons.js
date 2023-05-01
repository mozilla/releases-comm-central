/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

/* This test checks that the toolbar buttons of the chat toolbar are
 * correctly disabled/enabled, and that the placeholder displayed in
 * the middle of the chat tab is correct.
 */
add_task(function test_toolbar_and_placeholder() {
  Assert.notEqual(
    mc.window.document.getElementById("tabmail").selectedTab.mode.type,
    "chat",
    "the chat tab shouldn't be selected at startup"
  );
  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("chatButton"),
    { clickCount: 1 },
    mc.window
  );
  Assert.equal(
    mc.window.document.getElementById("tabmail").selectedTab.mode.type,
    "chat",
    "the chat tab should be selected"
  );

  // Check that "No connected account" placeholder is correct.
  Assert.ok(
    !mc.window.document.getElementById("noConvScreen").hidden,
    "'Your chat accounts are not connected.' placeholder"
  );
  Assert.ok(
    mc.window.document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is hidden"
  );
  Assert.ok(
    mc.window.document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    !mc.window.document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is visible"
  );
  let chatHandler = mc.window.chatHandler;
  Assert.equal(
    chatHandler._placeHolderButtonId,
    "openIMAccountManagerButton",
    "the correct placeholder button is visible"
  );
  Assert.equal(
    mc.window.document.activeElement.id,
    chatHandler._placeHolderButtonId,
    "the placeholder button is focused"
  );

  // check that add contact and join chat are disabled
  Assert.ok(
    mc.window.document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is disabled"
  );
  Assert.ok(
    mc.window.document.getElementById("button-join-chat").disabled,
    "the Join Chat button is disabled"
  );

  // The next tests require an account, get the unwrapped default IRC account.
  let account = IMServices.accounts.getAccountByNumericId(1);
  Assert.equal(
    account.protocol.id,
    "prpl-irc",
    "the default IM account is an IRC account"
  );
  let ircAccount = account.prplAccount.wrappedJSObject;

  // Pretend the account is connected and check how the UI reacts
  ircAccount.reportConnected();

  // check that add contact and join chat are no longer disabled
  Assert.ok(
    !mc.window.document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is not disabled"
  );
  Assert.ok(
    !mc.window.document.getElementById("button-join-chat").disabled,
    "the Join Chat button is not disabled"
  );

  // Check that the "No conversations" placeholder is correct.
  Assert.ok(
    !mc.window.document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is visible"
  );
  Assert.ok(
    mc.window.document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    mc.window.document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is hidden"
  );
  Assert.ok(!chatHandler._placeHolderButtonId, "no placeholder button");

  // Now check that the UI reacts to account disconnections too.
  ircAccount.reportDisconnected();

  // check that add contact and join chat are disabled again.
  Assert.ok(
    mc.window.document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is disabled"
  );
  Assert.ok(
    mc.window.document.getElementById("button-join-chat").disabled,
    "the Join Chat button is disabled"
  );

  // Check that the "No connected account" placeholder is back.
  Assert.ok(
    mc.window.document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is hidden"
  );
  Assert.ok(
    mc.window.document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    !mc.window.document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is visible"
  );
  Assert.equal(
    chatHandler._placeHolderButtonId,
    "openIMAccountManagerButton",
    "the correct placeholder button is visible"
  );

  while (mc.window.document.getElementById("tabmail").tabInfo.length > 1) {
    mc.window.document.getElementById("tabmail").closeTab(1);
  }
});

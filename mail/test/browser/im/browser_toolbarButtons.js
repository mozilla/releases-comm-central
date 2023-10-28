/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

/* This test checks that the toolbar buttons of the chat toolbar are
 * correctly disabled/enabled, and that the placeholder displayed in
 * the middle of the chat tab is correct.
 */
add_task(function test_toolbar_and_placeholder() {
  Assert.notEqual(
    document.getElementById("tabmail").selectedTab.mode.type,
    "chat",
    "the chat tab shouldn't be selected at startup"
  );
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("chatButton"),
    { clickCount: 1 },
    window
  );
  Assert.equal(
    document.getElementById("tabmail").selectedTab.mode.type,
    "chat",
    "the chat tab should be selected"
  );

  // Check that "No connected account" placeholder is correct.
  Assert.ok(
    !document.getElementById("noConvScreen").hidden,
    "'Your chat accounts are not connected.' placeholder"
  );
  Assert.ok(
    document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is hidden"
  );
  Assert.ok(
    document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    !document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is visible"
  );
  const chatHandler = window.chatHandler;
  Assert.equal(
    chatHandler._placeHolderButtonId,
    "openIMAccountManagerButton",
    "the correct placeholder button is visible"
  );
  Assert.equal(
    document.activeElement.id,
    chatHandler._placeHolderButtonId,
    "the placeholder button is focused"
  );

  // check that add contact and join chat are disabled
  Assert.ok(
    document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is disabled"
  );
  Assert.ok(
    document.getElementById("button-join-chat").disabled,
    "the Join Chat button is disabled"
  );

  // The next tests require an account, get the unwrapped default IRC account.
  const account = IMServices.accounts.getAccountByNumericId(1);
  Assert.equal(
    account.protocol.id,
    "prpl-irc",
    "the default IM account is an IRC account"
  );
  const ircAccount = account.prplAccount.wrappedJSObject;

  // Pretend the account is connected and check how the UI reacts
  ircAccount.reportConnected();

  // check that add contact and join chat are no longer disabled
  Assert.ok(
    !document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is not disabled"
  );
  Assert.ok(
    !document.getElementById("button-join-chat").disabled,
    "the Join Chat button is not disabled"
  );

  // Check that the "No conversations" placeholder is correct.
  Assert.ok(
    !document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is visible"
  );
  Assert.ok(
    document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is hidden"
  );
  Assert.ok(!chatHandler._placeHolderButtonId, "no placeholder button");

  // Now check that the UI reacts to account disconnections too.
  ircAccount.reportDisconnected();

  // check that add contact and join chat are disabled again.
  Assert.ok(
    document.getElementById("button-add-buddy").disabled,
    "the Add Buddy button is disabled"
  );
  Assert.ok(
    document.getElementById("button-join-chat").disabled,
    "the Join Chat button is disabled"
  );

  // Check that the "No connected account" placeholder is back.
  Assert.ok(
    document.getElementById("noConvInnerBox").hidden,
    "the 'No conversation' placeholder is hidden"
  );
  Assert.ok(
    document.getElementById("noAccountInnerBox").hidden,
    "the 'No account' placeholder is hidden"
  );
  Assert.ok(
    !document.getElementById("noConnectedAccountInnerBox").hidden,
    "the 'No connected account' placeholder is visible"
  );
  Assert.equal(
    chatHandler._placeHolderButtonId,
    "openIMAccountManagerButton",
    "the correct placeholder button is visible"
  );

  while (document.getElementById("tabmail").tabInfo.length > 1) {
    document.getElementById("tabmail").closeTab(1);
  }
});

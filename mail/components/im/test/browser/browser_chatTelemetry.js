/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

add_task(async function testMessageThemeTelemetry() {
  Services.telemetry.clearScalars();

  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  account.password = "this is a test";
  account.connect();

  let scalars = TelemetryTestUtils.getProcessScalars("parent");
  ok(
    !scalars["tb.chat.active_message_theme"],
    "Active chat theme not reported without open conversation."
  );

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  const conversationLoaded = waitForConversationLoad(chatConv.convBrowser);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);

  await conversationLoaded;
  scalars = TelemetryTestUtils.getProcessScalars("parent");
  // NOTE: tb.chat.active_message_theme expires at v 117.
  is(
    scalars["tb.chat.active_message_theme"],
    "mail:default",
    "Active chat message theme and variant reported after opening conversation."
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

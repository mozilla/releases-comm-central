/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ChatCore } = ChromeUtils.importESModule(
  "resource:///modules/chatHandler.sys.mjs"
);

add_setup(async () => {
  await closeChatTab();
  Assert.ok(ChatCore.initialized, "Chat core should be initialized");
});

add_task(async function test_tabRestoresConversations() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("existing");

  await openChatTab();

  const conversationItem = getConversationItem(conversation);
  Assert.ok(conversationItem, "Should have conversation");

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
  await closeChatTab();
});

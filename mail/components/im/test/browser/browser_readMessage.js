/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { Message } = ChromeUtils.import(
  "resource://testing-common/TestProtocol.jsm"
);

add_task(async function testDisplayed() {
  const account = Services.accounts.createAccount("testuser", "prpl-mochitest");
  account.password = "this is a test";
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  ok(!convNode.hasAttribute("unread"), "No unread messages");

  const message = new Message("mochitest", "hello world", {
    incoming: true,
  });
  message.conversation = conversation;

  ok(convNode.hasAttribute("unread"), "Unread message waiting");
  is(convNode.getAttribute("unreadCount"), "(1)");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");

  await browserDisplayed;
  await message.displayed;

  ok(!convNode.hasAttribute("unread"), "Message read");

  conversation.close();
  account.disconnect();
  Services.accounts.deleteAccount(account.id);
});

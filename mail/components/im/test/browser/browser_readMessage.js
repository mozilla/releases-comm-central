/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testDisplayed() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.isVisible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  ok(!convNode.hasAttribute("unread"), "No unread messages");

  const messagePromise = waitForNotification(conversation, "new-text");
  conversation.writeMessage("mochitest", "hello world", {
    incoming: true,
  });
  const { subject: message } = await messagePromise;

  ok(convNode.hasAttribute("unread"), "Unread message waiting");
  is(convNode.getAttribute("unreadCount"), "(1)");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");

  await browserDisplayed;
  await message.displayed;

  ok(!convNode.hasAttribute("unread"), "Message read");

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testUpdate() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeMUC("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  conversation.writeMessage("mochitest", "hello world", {
    incoming: true,
    remoteId: "foo",
  });

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);
  await browserDisplayed;

  is(
    messageParent.querySelector(".message.incoming:nth-child(1) .ib-msg-txt")
      .textContent,
    "hello world",
    "message added to conv"
  );

  const updateTextPromise = waitForNotification(conversation, "update-text");
  conversation.updateMessage("mochitest", "bye world", {
    incoming: true,
    remoteId: "foo",
  });
  await updateTextPromise;
  await TestUtils.waitForTick();

  is(
    messageParent.querySelector(".message.incoming:nth-child(1) .ib-msg-txt")
      .textContent,
    "bye world",
    "message text updated"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

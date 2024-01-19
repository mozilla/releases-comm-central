/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testCollapse() {
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

  const conversation = account.prplAccount.wrappedJSObject.makeDM("collapse");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  await addNotice(conversation, chatConv);

  is(
    messageParent.querySelector(".event-row:nth-child(1) .body").textContent,
    "test notice",
    "notice added to conv"
  );

  await addNotice(conversation, chatConv);
  await addNotice(conversation, chatConv);
  await addNotice(conversation, chatConv);
  await Promise.all([
    await addNotice(conversation, chatConv),
    BrowserTestUtils.waitForMutationCondition(
      messageParent,
      {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      },
      () => messageParent.querySelector(".hide-children")
    ),
  ]);

  const hiddenGroup = messageParent.querySelector(".hide-children");
  const toggle = hiddenGroup.querySelector(".eventToggle");
  ok(toggle);
  ok(hiddenGroup.querySelectorAll(".event-row").length >= 5);

  toggle.click();
  await BrowserTestUtils.waitForMutationCondition(
    hiddenGroup,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => !hiddenGroup.classList.contains("hide-children")
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testGrouping() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(
    BrowserTestUtils.isVisible(document.getElementById("chatPanel")),
    "Chat tab is visible"
  );

  const conversation = account.prplAccount.wrappedJSObject.makeDM("grouping");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation is in contacts list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Found conversation element");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    {
      who: "grouping",
      content: "system message",
      options: {
        system: true,
        incoming: true,
      },
    },
    {
      who: "grouping",
      content: "normal message",
      options: {
        incoming: true,
      },
    },
    {
      who: "grouping",
      content: "another system message",
      options: {
        system: true,
        incoming: true,
      },
    },
  ]);
  // Wait for at least one event.
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  for (const child of messageParent.children) {
    isnot(child.id, "insert", "Message element is not the insert point");
  }
  is(
    messageParent.childElementCount,
    3,
    "All three messages are their own top level element"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testSystemMessageReplacement() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(
    BrowserTestUtils.isVisible(document.getElementById("chatPanel")),
    "Chat tab is visible"
  );

  const conversation = account.prplAccount.wrappedJSObject.makeDM("replacing");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation is in contacts list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Found conversation element");
  ok(BrowserTestUtils.isVisible(chatConv), "conversation visible");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addMessages([
    {
      who: "replacing",
      content: "system message",
      options: {
        system: true,
        incoming: true,
        remoteId: "foo",
      },
    },
    {
      who: "replacing",
      content: "another system message",
      options: {
        system: true,
        incoming: true,
        remoteId: "bar",
      },
    },
  ]);
  // Wait for at least one event.
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const updateTextPromise = waitForNotification(conversation, "update-text");
  conversation.updateMessage("replacing", "better system message", {
    system: true,
    incoming: true,
    remoteId: "foo",
  });
  await updateTextPromise;
  await TestUtils.waitForTick();

  is(messageParent.childElementCount, 1, "Only one message group in browser");
  is(
    messageParent.firstElementChild.childElementCount,
    3,
    "Has two messages plus insert inside group"
  );
  const firstMessage = messageParent.firstElementChild.firstElementChild;
  ok(
    firstMessage.classList.contains("event-row"),
    "Replacement message is an event-row"
  );
  is(firstMessage.dataset.remoteId, "foo");
  is(
    firstMessage.querySelector(".body").textContent,
    "better system message",
    "Message content was updated"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

function addNotice(conversation, uiConversation) {
  conversation.addNotice();
  return BrowserTestUtils.waitForEvent(
    uiConversation.convBrowser,
    "MessagesDisplayed"
  );
}

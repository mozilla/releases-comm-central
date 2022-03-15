/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_spacesToolbarChatBadgeMUC() {
  window.gSpacesToolbar.toggleToolbar(false);
  const account = Services.accounts.createAccount("testuser", "prpl-mochitest");
  account.password = "this is a test";
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const chatButton = document.getElementById("chatButton");

  ok(
    !chatButton.classList.contains("has-unread"),
    "Initially no unread chat messages"
  );

  // Send a new message in a MUC that is not currently open
  const conversation = account.prplAccount.wrappedJSObject.makeMUC(
    "noSpaceBadge"
  );
  const messagePromise = waitForNotification(conversation, "new-text");
  conversation.writeMessage("spaceBadge", "just a normal message", {
    incoming: true,
  });
  await messagePromise;
  // Make sure nothing else was waiting to happen
  await TestUtils.waitForTick();

  ok(
    !chatButton.classList.contains("has-unread"),
    "Untargeted MUC message doesn't change badge"
  );

  // Send a new targeted message in the conversation
  const unreadContainer = chatButton.querySelector(".spaces-unread-container");
  const unreadContainerText = unreadContainer.textContent;
  const unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
    containsNick: true,
  });
  await unreadCountChanged;
  ok(chatButton.classList.contains("has-unread"), "Unread badge is shown");

  // Fluent doesn't immediately apply the translation, wait for it.
  await TestUtils.waitForCondition(
    () => unreadContainer.textContent !== unreadContainerText
  );

  is(unreadContainer.textContent, "1", "Unread count is in badge");
  ok(unreadContainer.title);

  conversation.close();
  account.disconnect();
  Services.accounts.deleteAccount(account.id);
});

add_task(async function test_spacesToolbarChatBadgeDM() {
  window.gSpacesToolbar.toggleToolbar(false);
  const account = Services.accounts.createAccount("testuser", "prpl-mochitest");
  account.password = "this is a test";
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const chatButton = document.getElementById("chatButton");

  ok(
    !chatButton.classList.contains("has-unread"),
    "Initially no unread chat messages"
  );

  const unreadContainer = chatButton.querySelector(".spaces-unread-container");
  if (unreadContainer.textContent !== "0") {
    await BrowserTestUtils.waitForMutationCondition(
      unreadContainer,
      {
        subtree: true,
        childList: true,
        characterData: true,
      },
      () => unreadContainer.textContent === "0"
    );
  }

  // Send a new message in a DM conversation that is not currently open
  const unreadContainerText = unreadContainer.textContent;
  let unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  const conversation = account.prplAccount.wrappedJSObject.makeDM("spaceBadge");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
  });
  await unreadCountChanged;
  ok(chatButton.classList.contains("has-unread"), "Unread badge is shown");

  // Fluent doesn't immediately apply the translation, wait for it.
  await TestUtils.waitForCondition(
    () => unreadContainer.textContent !== unreadContainerText
  );

  is(unreadContainer.textContent, "1", "Unread count is in badge");
  ok(unreadContainer.title);

  // Display the DM conversation
  unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  await openChatTab();
  const convNode = getConversationItem(conversation);
  ok(convNode);
  await EventUtils.synthesizeMouseAtCenter(convNode, {});
  const chatConv = getChatConversationElement(conversation);
  ok(chatConv);
  ok(BrowserTestUtils.is_visible(chatConv));
  await unreadCountChanged;

  ok(
    !chatButton.classList.contains("has-unread"),
    "Unread badge is hidden again"
  );

  conversation.close();
  account.disconnect();
  Services.accounts.deleteAccount(account.id);
});

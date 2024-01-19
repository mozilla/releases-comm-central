/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_spacesToolbarChatBadgeMUC() {
  window.gSpacesToolbar.toggleToolbar(false);
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const chatButton = document.getElementById("chatButton");

  ok(
    !chatButton.classList.contains("has-badge"),
    "Initially no unread chat messages"
  );

  // Send a new message in a MUC that is not currently open.
  const conversation =
    account.prplAccount.wrappedJSObject.makeMUC("noSpaceBadge");
  const messagePromise = waitForNotification(conversation, "new-text");
  conversation.writeMessage("spaceBadge", "just a normal message", {
    incoming: true,
  });
  await messagePromise;
  // Make sure nothing else was waiting to happen.
  await TestUtils.waitForTick();

  ok(
    !chatButton.classList.contains("has-badge"),
    "Untargeted MUC message doesn't change badge"
  );

  // Send a new targeted message in the conversation.
  const unreadContainer = chatButton.querySelector(".spaces-badge-container");
  const unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
    containsNick: true,
  });
  await unreadCountChanged;
  ok(chatButton.classList.contains("has-badge"), "Unread badge is shown");

  // Fluent doesn't immediately apply the translation, wait for it.
  if (document.hasPendingL10nMutations) {
    await BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  }

  is(unreadContainer.textContent, "1", "Unread count is in badge");
  ok(unreadContainer.title);

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function test_spacesToolbarChatBadgeDM() {
  window.gSpacesToolbar.toggleToolbar(false);
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const chatButton = document.getElementById("chatButton");

  ok(
    !chatButton.classList.contains("has-badge"),
    "Initially no unread chat messages"
  );

  const unreadContainer = chatButton.querySelector(".spaces-badge-container");
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

  // Send a new message in a DM conversation that is not currently open.
  let unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  const conversation = account.prplAccount.wrappedJSObject.makeDM("spaceBadge");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
  });
  await unreadCountChanged;
  ok(chatButton.classList.contains("has-badge"), "Unread badge is shown");

  // Fluent doesn't immediately apply the translation, wait for it.
  if (document.hasPendingL10nMutations) {
    await BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  }

  is(unreadContainer.textContent, "1", "Unread count is in badge");
  ok(unreadContainer.title);

  // Display the DM conversation.
  unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  await openChatTab();
  const convNode = getConversationItem(conversation);
  ok(convNode);
  await EventUtils.synthesizeMouseAtCenter(convNode, {});
  const chatConv = getChatConversationElement(conversation);
  ok(chatConv);
  ok(BrowserTestUtils.isVisible(chatConv));
  await unreadCountChanged;

  ok(
    !chatButton.classList.contains("has-badge"),
    "Unread badge is hidden again"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function test_spacesToolbarPinnedChatBadgeMUC() {
  window.gSpacesToolbar.toggleToolbar(true);
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const spacesPopupButtonChat = document.getElementById(
    "spacesPopupButtonChat"
  );

  ok(
    !spacesPopupButtonChat.classList.contains("has-badge"),
    "Initially no unread chat messages"
  );

  // Send a new message in a MUC that is not currently open.
  const conversation =
    account.prplAccount.wrappedJSObject.makeMUC("noSpaceBadge");
  const messagePromise = waitForNotification(conversation, "new-text");
  conversation.writeMessage("spaceBadge", "just a normal message", {
    incoming: true,
  });
  await messagePromise;
  // Make sure nothing else was waiting to happen.
  await TestUtils.waitForTick();

  ok(
    !spacesPopupButtonChat.classList.contains("has-badge"),
    "Untargeted MUC message doesn't change badge"
  );

  // Send a new targeted message in the conversation.
  const unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
    containsNick: true,
  });
  await unreadCountChanged;
  ok(
    spacesPopupButtonChat.classList.contains("has-badge"),
    "Unread badge is shown"
  );
  ok(
    document
      .getElementById("spacesPinnedButton")
      .classList.contains("has-badge"),
    "Unread state is propagated to pinned menu button"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function test_spacesToolbarPinnedChatBadgeDM() {
  window.gSpacesToolbar.toggleToolbar(true);
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  if (window.chatHandler._chatButtonUpdatePending) {
    await TestUtils.waitForTick();
  }

  const spacesPopupButtonChat = document.getElementById(
    "spacesPopupButtonChat"
  );
  const spacesPinnedButton = document.getElementById("spacesPinnedButton");

  ok(
    !spacesPopupButtonChat.classList.contains("has-badge"),
    "Initially no unread chat messages"
  );
  ok(!spacesPinnedButton.classList.contains("has-badge"));

  // Send a new message in a DM conversation that is not currently open.
  let unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  const conversation = account.prplAccount.wrappedJSObject.makeDM("spaceBadge");
  conversation.writeMessage("spaceBadge", "new direct message", {
    incoming: true,
  });
  await unreadCountChanged;
  ok(
    spacesPopupButtonChat.classList.contains("has-badge"),
    "Unread badge is shown"
  );
  ok(spacesPinnedButton.classList.contains("has-badge"));

  // Display the DM conversation.
  unreadCountChanged = TestUtils.topicObserved("unread-im-count-changed");
  await openChatTab();
  const convNode = getConversationItem(conversation);
  ok(convNode);
  await EventUtils.synthesizeMouseAtCenter(convNode, {});
  const chatConv = getChatConversationElement(conversation);
  ok(chatConv);
  ok(BrowserTestUtils.isVisible(chatConv));
  await unreadCountChanged;

  ok(
    !spacesPopupButtonChat.classList.contains("has-badge"),
    "Unread badge is hidden again"
  );
  ok(!spacesPinnedButton.classList.contains("has-badge"));

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

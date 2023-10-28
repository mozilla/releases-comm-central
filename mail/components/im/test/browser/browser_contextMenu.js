/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testContextMenu() {
  const account = IMServices.accounts.createAccount(
    "context",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM("context");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  const conversationLoaded = waitForConversationLoad();

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);

  await conversationLoaded;

  const contextMenu = document.getElementById("chatConversationContextMenu");
  ok(BrowserTestUtils.is_hidden(contextMenu));

  const popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouse(
    "body",
    0,
    0,
    { type: "contextmenu" },
    chatConv.convBrowser,
    true
  );
  await popupShown;

  const popupHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  // Assume normal context menu semantics work and just close it directly.
  contextMenu.hidePopup();
  await popupHidden;

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testMessageContextMenuOnLink() {
  const account = IMServices.accounts.createAccount(
    "context",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));
  const conversation = account.prplAccount.wrappedJSObject.makeDM("linker");

  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);

  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");

  conversation.addMessages([
    {
      who: "linker",
      content: "hi https://example.com/",
      options: {
        incoming: true,
      },
    },
    {
      who: "linker",
      content: "hi mailto:test@example.com",
      options: {
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

  const contextMenu = document.getElementById("chatConversationContextMenu");
  ok(BrowserTestUtils.is_hidden(contextMenu));

  const popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouse(
    ".message:nth-child(1) a",
    0,
    0,
    { type: "contextmenu", centered: true },
    chatConv.convBrowser,
    true
  );
  await popupShown;

  ok(
    BrowserTestUtils.is_visible(contextMenu.querySelector("#context-openlink")),
    "open link"
  );
  ok(
    BrowserTestUtils.is_visible(contextMenu.querySelector("#context-copylink")),
    "copy link"
  );

  const popupHidden = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  // Assume normal context menu semantics work and just close it directly.
  contextMenu.hidePopup();
  await popupHidden;

  const popupShownAgain = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );
  BrowserTestUtils.synthesizeMouse(
    ".message:nth-child(2) a",
    0,
    0,
    { type: "contextmenu", centered: true },
    chatConv.convBrowser,
    true
  );
  await popupShownAgain;

  ok(
    BrowserTestUtils.is_visible(
      contextMenu.querySelector("#context-copyemail")
    ),
    "copy mail"
  );

  const popupHiddenAgain = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  // Assume normal context menu semantics work and just close it directly.
  contextMenu.hidePopup();
  await popupHiddenAgain;

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testMessageAction() {
  const account = IMServices.accounts.createAccount(
    "context",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject.makeDM("context");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);

  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");

  const messagePromise = waitForNotification(conversation, "new-text");
  const displayedPromise = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  conversation.writeMessage("context", "hello world", {
    incoming: true,
  });
  const { subject: message } = await messagePromise;
  await displayedPromise;

  const contextMenu = document.getElementById("chatConversationContextMenu");
  ok(BrowserTestUtils.is_hidden(contextMenu));

  const popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouse(
    ".message:nth-child(1)",
    0,
    0,
    { type: "contextmenu", centered: true },
    chatConv.convBrowser,
    true
  );
  await popupShown;

  const separator = contextMenu.querySelector("#context-sep-messageactions");
  if (!BrowserTestUtils.is_visible(separator)) {
    await BrowserTestUtils.waitForMutationCondition(
      separator,
      {
        subtree: false,
        childList: false,
        attributes: true,
        attributeFilter: ["hidden"],
      },
      () => BrowserTestUtils.is_visible(separator)
    );
  }
  const item = contextMenu.querySelector(
    "#context-sep-messageactions + menuitem"
  );
  ok(item, "Item for message action injected");
  is(item.getAttribute("label"), "Test");

  const popupHiddenAgain = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popuphidden"
  );
  item.click();
  // Assume normal context menu semantics work and just close it.
  contextMenu.hidePopup();
  await Promise.all([message.actionRan, popupHiddenAgain]);

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

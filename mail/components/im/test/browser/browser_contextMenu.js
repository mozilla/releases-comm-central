/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testContextMenu() {
  const account = Services.accounts.createAccount("context", "prpl-mochitest");
  account.password = "this is a test";
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
  const convDocument = chatConv.convBrowser.contentWindow.document;

  await conversationLoaded;

  const contextMenu = document.getElementById("chatConversationContextMenu");
  ok(BrowserTestUtils.is_hidden(contextMenu));

  const popupShown = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  BrowserTestUtils.synthesizeMouse(
    convDocument.body,
    10,
    10,
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
  Services.accounts.deleteAccount(account.id);
});

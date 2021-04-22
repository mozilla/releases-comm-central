/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testCollapse() {
  const account = Services.accounts.createAccount("testuser", "prpl-mochitest");
  account.password = "this is a test";
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const conversation = account.prplAccount.wrappedJSObject._conv;
  const convList = document.getElementById("contactlistbox");
  const convNode = Array.from(convList.children).find(
    element =>
      element.getAttribute("is") === "chat-imconv-richlistitem" &&
      element.getAttribute("displayname") === conversation.name
  );
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = Array.from(
    document.querySelectorAll("chat-conversation")
  ).find(element => element._conv.target.wrappedJSObject === conversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);
  const convDocument = chatConv.convBrowser.contentWindow.document;
  const messageParent = convDocument.getElementById("Chat");

  // libOTR will show 0-1 notices at the start of the conversation.
  if (!chatConv.loaded || chatConv.convBrowser._messageDisplayPending) {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  }
  const libOtrNotices = messageParent.querySelectorAll(".event-row .body")
    .length;
  const expectedNoticeIndex = 1 + libOtrNotices;

  await addNotice(conversation, chatConv);

  is(
    messageParent.querySelector(
      `.event-row:nth-child(${expectedNoticeIndex}) .body`
    ).textContent,
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
  ok(hiddenGroup.querySelectorAll(".event-row").length >= 5 + libOtrNotices);

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
  Services.accounts.deleteAccount(account.id);
});

function addNotice(conversation, uiConversation) {
  conversation.addNotice();
  return BrowserTestUtils.waitForEvent(
    uiConversation.convBrowser,
    "MessagesDisplayed"
  );
}

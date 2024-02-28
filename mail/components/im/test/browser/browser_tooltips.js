/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testMUCMessageSenderTooltip() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  const conversation = account.prplAccount.wrappedJSObject.makeMUC("tooltips");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation should be in list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Conversation should exist");
  ok(BrowserTestUtils.isVisible(chatConv), "Conversation should be shown");
  const messageParent = await getChatMessageParent(chatConv);

  conversation.addParticipant("foo", "1");
  conversation.addParticipant("bar", "2");
  conversation.addParticipant("loremipsum", "3");
  conversation.addMessages([
    // Message without alias
    {
      who: "foo",
      content: "hi",
      options: {
        incoming: true,
      },
    },
    // Message with alias
    {
      who: "bar",
      content: "o/",
      options: {
        incoming: true,
        _alias: "Bar",
      },
    },
    // Alias is not directly related to nick
    {
      who: "loremipsum",
      content: "what's up?",
      options: {
        incoming: true,
        _alias: "Dolor sit amet",
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

  const tooltip = document.getElementById("imTooltip");
  const tooltipTests = [
    {
      messageIndex: 1,
      who: "foo",
      alias: "1",
      displayed: "foo",
    },
    {
      messageIndex: 2,
      who: "bar",
      alias: "2",
      displayed: "Bar",
    },
    {
      messageIndex: 3,
      who: "loremipsum",
      alias: "3",
      displayed: "Dolor sit amet",
    },
  ];
  window.windowUtils.disableNonTestMouseEvents(true);
  try {
    for (const testInfo of tooltipTests) {
      const usernameSelector = `.message:nth-child(${testInfo.messageIndex}) .ib-sender`;
      const username = messageParent.querySelector(usernameSelector);
      is(
        username.textContent,
        testInfo.displayed,
        `Message username ${testInfo.messageIndex}`
      );

      const buddyInfo = TestUtils.topicObserved(
        "user-info-received",
        (subject, data) => data === testInfo.who
      );
      await showTooltip(usernameSelector, tooltip, chatConv.convBrowser);

      is(
        tooltip.getAttribute("displayname"),
        testInfo.who,
        `Tooltip display name ${testInfo.messageIndex}`
      );
      await buddyInfo;
      is(
        tooltip.table.querySelector("td").textContent,
        testInfo.alias,
        `Tooltip alias ${testInfo.messageIndex}`
      );
      await hideTooltip(tooltip, chatConv.convBrowser);
    }
  } finally {
    window.windowUtils.disableNonTestMouseEvents(false);
  }

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testTimestampTooltip() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  const conversation = account.prplAccount.wrappedJSObject.makeMUC("tooltips");
  const convNode = getConversationItem(conversation);
  ok(convNode, "Conversation should be in list");

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "Conversation should exist");
  ok(BrowserTestUtils.isVisible(chatConv), "Conversation should be shown");

  const messageTime = Math.floor(Date.now() / 1000);

  conversation.addParticipant("foo", "1");
  conversation.addMessages([
    {
      who: "foo",
      content: "hi",
      options: {
        incoming: true,
      },
      time: messageTime,
    },
  ]);
  // Wait for at least one event.
  do {
    await BrowserTestUtils.waitForEvent(
      chatConv.convBrowser,
      "MessagesDisplayed"
    );
  } while (chatConv.convBrowser.getPendingMessagesCount() > 0);

  const tooltip = document.getElementById("imTooltip");
  window.windowUtils.disableNonTestMouseEvents(true);
  try {
    const messageSelector = ".message:nth-child(1)";
    const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
      timeStyle: "medium",
    });
    const expectedText = dateTimeFormatter.format(new Date(messageTime * 1000));

    await showTooltip(messageSelector, tooltip, chatConv.convBrowser);

    const htmlTooltip = tooltip.querySelector(".htmlTooltip");
    ok(BrowserTestUtils.isVisible(htmlTooltip), "HTML tooltip should be shown");
    is(htmlTooltip.textContent, expectedText, "HTML tooltip text");
    await hideTooltip(tooltip, chatConv.convBrowser);
  } finally {
    window.windowUtils.disableNonTestMouseEvents(false);
  }

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

async function showTooltip(elementSelector, tooltip, browser) {
  await BrowserTestUtils.synthesizeMouseAtCenter(
    elementSelector,
    { type: "mousemove" },
    browser
  );
  return BrowserTestUtils.waitForPopupEvent(tooltip, "shown");
}

async function hideTooltip(tooltip, browser) {
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ".message .body",
    { type: "mousemove" },
    browser
  );
  return BrowserTestUtils.waitForPopupEvent(tooltip, "hidden");
}

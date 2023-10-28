/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

add_task(async function testTopicRestored() {
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

  const conversation =
    account.prplAccount.wrappedJSObject.makeMUC("logs topic");
  let convNode = getConversationItem(conversation);
  ok(convNode);

  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  let chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");

  conversation.addParticipant("topic");
  conversation.addMessages([
    {
      who: "topic",
      content: "hi",
      options: {
        incoming: true,
      },
    },
  ]);
  await browserDisplayed;

  // Close and re-open conversation to get logs
  conversation.close();
  const newConversation =
    account.prplAccount.wrappedJSObject.makeMUC("logs topic");
  convNode = getConversationItem(newConversation);
  ok(convNode);

  let conversationLoaded = waitForConversationLoad();
  await EventUtils.synthesizeMouseAtCenter(convNode, {});

  chatConv = getChatConversationElement(newConversation);
  ok(chatConv, "found conversation");
  ok(BrowserTestUtils.is_visible(chatConv), "conversation visible");

  const topicChanged = waitForNotification(
    newConversation,
    "chat-update-topic"
  );
  newConversation.setTopic("foo bar", "topic");
  await topicChanged;
  const logTree = document.getElementById("logTree");
  const chatTopInfo = document.querySelector("chat-conversation-info");

  is(chatTopInfo.topic.value, "foo bar");

  // Wait for log list to be populated, sadly there is no event and it is delayed by promises.
  await TestUtils.waitForCondition(() => logTree.view.rowCount > 0);

  await conversationLoaded;
  const logBrowser = document.getElementById("conv-log-browser");
  conversationLoaded = waitForConversationLoad(logBrowser);
  mailTestUtils.treeClick(EventUtils, window, logTree, 0, 0, {
    clickCount: 1,
  });
  await conversationLoaded;

  ok(BrowserTestUtils.is_visible(logBrowser));
  is(chatTopInfo.topic.value, "", "Topic is cleared when viewing logs");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("goToConversation"),
    {}
  );

  ok(BrowserTestUtils.is_hidden(logBrowser));
  is(chatTopInfo.topic.value, "foo bar");

  newConversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const THEME_PREF = "messenger.options.messagesStyle.theme";
const VARIANT_PREF = "messenger.options.messagesStyle.variant";

add_task(async function testMessageStyleChangeReloadsConversation() {
  const defaultVariant = "default";
  const newVariant = "Blue_-_Green";
  await SpecialPowers.pushPrefEnv({
    set: [
      [THEME_PREF, "bubbles"],
      [VARIANT_PREF, defaultVariant],
    ],
  });

  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();

  const conversation =
    account.prplAccount.wrappedJSObject.makeMUC("messageStyle");
  const convNode = getConversationItem(conversation);
  ok(convNode);

  conversation.writeMessage("mochitest", "hello world", {
    incoming: true,
  });

  EventUtils.synthesizeMouseAtCenter(convNode, {});

  const chatConv = getChatConversationElement(conversation);
  ok(chatConv, "found conversation");
  const browserDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  const messageParent = await getChatMessageParent(chatConv);
  await browserDisplayed;

  ok(
    messageParent.textContent.includes("hello world"),
    "message added to conv"
  );

  let reloaded = waitForConversationLoad(chatConv.convBrowser);
  let redisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  await SpecialPowers.pushPrefEnv({ set: [[VARIANT_PREF, newVariant]] });
  await reloaded;
  await redisplayed;

  is(
    chatConv.convBrowser.theme.variant,
    newVariant,
    "conversation browser picked up the new variant"
  );
  ok(
    chatConv.convBrowser.contentDocument.querySelector(
      `link[href="Variants/${newVariant}.css"]`
    ),
    "stylesheet of the new variant is in the conversation document"
  );
  Assert.stringContains(
    chatConv.convBrowser.contentChatNode.textContent,
    "hello world",
    "message redisplayed after the reload"
  );

  const messageDisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  conversation.writeMessage("mochitest", "after the reload", {
    incoming: true,
  });
  await messageDisplayed;

  Assert.stringContains(
    chatConv.convBrowser.contentChatNode.textContent,
    "after the reload",
    "message received after the reload is displayed"
  );

  reloaded = waitForConversationLoad(chatConv.convBrowser);
  redisplayed = BrowserTestUtils.waitForEvent(
    chatConv.convBrowser,
    "MessagesDisplayed"
  );
  await SpecialPowers.popPrefEnv();
  await reloaded;
  await redisplayed;

  is(
    chatConv.convBrowser.theme.variant,
    defaultVariant,
    "conversation browser is back on the default variant"
  );

  conversation.close();
  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
  await Promise.resolve(); // Ensure login removal.
});

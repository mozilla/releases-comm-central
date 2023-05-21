/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { registerTestProtocol, unregisterTestProtocol } =
  ChromeUtils.importESModule("resource://testing-common/TestProtocol.sys.mjs");
var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

async function openChatTab() {
  let tabmail = document.getElementById("tabmail");
  let chatMode = tabmail.tabModes.chat;

  if (chatMode.tabs.length == 1) {
    tabmail.selectedTab = chatMode.tabs[0];
  } else {
    window.showChatTab();
  }

  is(chatMode.tabs.length, 1, "chat tab is open");
  is(tabmail.selectedTab, chatMode.tabs[0], "chat tab is selected");

  await new Promise(resolve => setTimeout(resolve));
}

async function closeChatTab() {
  let tabmail = document.getElementById("tabmail");
  let chatMode = tabmail.tabModes.chat;

  if (chatMode.tabs.length == 1) {
    tabmail.closeTab(chatMode.tabs[0]);
  }

  is(chatMode.tabs.length, 0, "chat tab is not open");

  await new Promise(resolve => setTimeout(resolve));
}

/**
 * @param {prplIConversation} conversation
 * @returns {HTMLElement} The corresponding chat-imconv-richlistitem element.
 */
function getConversationItem(conversation) {
  const convList = document.getElementById("contactlistbox");
  const convNode = Array.from(convList.children).find(
    element =>
      element.getAttribute("is") === "chat-imconv-richlistitem" &&
      element.getAttribute("displayname") === conversation.name
  );
  return convNode;
}

/**
 * @param {prplIConversation} conversation
 * @returns {HTMLElement} The corresponding chat-conversation element.
 */
function getChatConversationElement(conversation) {
  const chatConv = Array.from(
    document.querySelectorAll("chat-conversation")
  ).find(element => element._conv.target.wrappedJSObject === conversation);
  return chatConv;
}

/**
 * @param {HTMLElement} chatConv - chat-conversation element.
 * @returns {HTMLElement} The parent element to all chat messages.
 */
async function getChatMessageParent(chatConv) {
  await BrowserTestUtils.browserLoaded(chatConv.convBrowser);
  const messageParent = chatConv.convBrowser.contentChatNode;
  return messageParent;
}

/**
 * @param {HTMLElement} [browser] - The conversation-browser element.
 * @returns {Promise<void>}
 */
function waitForConversationLoad(browser) {
  return TestUtils.topicObserved(
    "conversation-loaded",
    subject => !browser || subject === browser
  );
}

function waitForNotification(target, expectedTopic) {
  let observer;
  let promise = new Promise(resolve => {
    observer = {
      observe(subject, topic, data) {
        if (topic === expectedTopic) {
          resolve({ subject, data });
          target.removeObserver(observer);
        }
      },
    };
  });
  target.addObserver(observer);
  return promise;
}

registerTestProtocol();

registerCleanupFunction(async () => {
  // Make sure the chat state is clean
  await closeChatTab();

  const conversations = IMServices.conversations.getConversations();
  is(conversations.length, 0, "All conversations were closed by their test");
  for (const conversation of conversations) {
    try {
      conversation.close();
    } catch (error) {
      ok(false, error.message);
    }
  }

  const accounts = IMServices.accounts.getAccounts();
  is(accounts.length, 0, "All accounts were removed by their test");
  for (const account of accounts) {
    try {
      if (account.connected || account.connecting) {
        account.disconnect();
      }
      IMServices.accounts.deleteAccount(account.id);
    } catch (error) {
      ok(false, "Error deleting account " + account.id + ": " + error.message);
    }
  }

  unregisterTestProtocol();
});

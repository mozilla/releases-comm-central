/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function getDisplayedMessages(tab, extension) {
  let displayedMessages;

  if (tab instanceof TabmailTab) {
    if (
      tab.active &&
      ["folder", "glodaList", "message"].includes(tab.nativeTab.mode.name)
    ) {
      displayedMessages = tab.nativeTab.folderDisplay.selectedMessages;
    }
  } else if (tab.nativeTab.gMessageDisplay) {
    displayedMessages = [tab.nativeTab.gMessageDisplay.displayedMessage];
  }

  if (!displayedMessages) {
    return [];
  }

  let result = [];
  for (let msg of displayedMessages) {
    let hdr = convertMessage(msg, extension);
    if (hdr) {
      result.push(hdr);
    }
  }
  return result;
}

this.messageDisplay = class extends ExtensionAPI {
  getAPI(context) {
    let { extension } = context;
    let { tabManager, windowManager } = extension;
    return {
      messageDisplay: {
        onMessageDisplayed: new EventManager({
          context,
          name: "messageDisplay.onMessageDisplayed",
          register: fire => {
            let listener = {
              handleEvent(event) {
                let win = windowManager.wrapWindow(event.target);
                fire.async(
                  tabManager.convert(win.activeTab.nativeTab),
                  convertMessage(event.detail, extension)
                );
              },
            };

            windowTracker.addListener("MsgLoaded", listener);
            return () => {
              windowTracker.removeListener("MsgLoaded", listener);
            };
          },
        }).api(),
        onMessagesDisplayed: new EventManager({
          context,
          name: "messageDisplay.onMessageDisplayed",
          register: fire => {
            let listener = {
              handleEvent(event) {
                let win = windowManager.wrapWindow(event.target);
                let tab = tabManager.convert(win.activeTab.nativeTab);
                let msgs = getDisplayedMessages(win.activeTab, extension);
                fire.async(tab, msgs);
              },
            };

            windowTracker.addListener("MsgsLoaded", listener);
            return () => {
              windowTracker.removeListener("MsgsLoaded", listener);
            };
          },
        }).api(),
        async getDisplayedMessage(tabId) {
          let tab = tabManager.get(tabId);
          let displayedMessage = null;

          if (tab instanceof TabmailTab) {
            if (
              tab.active &&
              ["folder", "glodaList", "message"].includes(
                tab.nativeTab.mode.name
              )
            ) {
              displayedMessage = tab.nativeTab.messageDisplay.displayedMessage;
            }
          } else if (tab.nativeTab.gMessageDisplay) {
            displayedMessage = tab.nativeTab.gMessageDisplay.displayedMessage;
          }

          return convertMessage(displayedMessage, extension);
        },
        async getDisplayedMessages(tabId) {
          return getDisplayedMessages(tabManager.get(tabId), extension);
        },
      },
    };
  }
};

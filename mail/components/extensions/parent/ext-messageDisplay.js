/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

this.messageDisplay = class extends ExtensionAPI {
  getAPI(context) {
    let { extension } = context;
    let { tabManager } = extension;
    return {
      messageDisplay: {
        onMessageDisplayed: new EventManager({
          context,
          name: "messageDisplay.onMessageDisplayed",
          register: fire => {
            let listener = {
              handleEvent(event) {
                let window = extension.windowManager.wrapWindow(event.target);
                fire.async(
                  window.activeTab.id,
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
      },
    };
  }
};

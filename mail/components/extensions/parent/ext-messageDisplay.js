/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

function _getDisplayedMessages(tab) {
  let nativeTab = tab.nativeTab;
  if (tab instanceof TabmailTab) {
    if (nativeTab.mode.name == "mail3PaneTab") {
      return nativeTab.chromeBrowser.contentWindow.gDBView.getSelectedMsgHdrs();
    } else if (nativeTab.mode.name == "mailMessageTab") {
      return [nativeTab.chromeBrowser.contentWindow.gMessage];
    }
  } else if (nativeTab) {
    return [nativeTab.messageBrowser.contentWindow.gMessage];
  }
  return [];
}

function getDisplayedMessages(tab, extension) {
  let displayedMessages = _getDisplayedMessages(tab);
  let result = [];
  for (let msg of displayedMessages) {
    let hdr = convertMessage(msg, extension);
    if (hdr) {
      result.push(hdr);
    }
  }
  return result;
}

/**
 * Check the users preference on opening new messages in tabs or windows.
 *
 * @returns {string} - either "tab" or "window"
 */
function getDefaultMessageOpenLocation() {
  let pref = Services.prefs.getIntPref("mail.openMessageBehavior");
  return pref == MailConsts.OpenMessageBehavior.NEW_TAB ? "tab" : "window";
}

/**
 * Return the msgHdr of the message specified in the properties object. Message
 * can be specified via properties.headerMessageId or properties.messageId.
 *
 * @param {object} properties - @see mail/components/extensions/schemas/messageDisplay.json
 * @throws ExtensionError if an unknown message has been specified
 * @returns {nsIMsgHdr} the requested msgHdr
 */
function getMsgHdr(properties) {
  if (
    ["messageId", "headerMessageId"].reduce(
      (count, value) => (properties[value] ? count + 1 : count),
      0
    ) != 1
  ) {
    throw new ExtensionError(
      "Exactly one of messageId or headerMessageId must be specified."
    );
  }

  if (properties.headerMessageId) {
    let msgHdr = MailUtils.getMsgHdrForMsgId(properties.headerMessageId);
    if (!msgHdr) {
      throw new ExtensionError(
        `Unknown or invalid headerMessageId: ${properties.headerMessageId}.`
      );
    }
    return msgHdr;
  }
  let msgHdr = messageTracker.getMessage(properties.messageId);
  if (!msgHdr) {
    throw new ExtensionError(
      `Unknown or invalid messageId: ${properties.messageId}.`
    );
  }
  return msgHdr;
}

this.messageDisplay = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onMessageDisplayed({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      let listener = {
        async handleEvent(event) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          // `event.target` is an about:message window.
          let nativeTab = event.target.tabOrWindow;
          let tab = tabManager.wrapTab(nativeTab);
          let msg = convertMessage(event.detail, extension);
          fire.async(tab.convert(), msg);
        },
      };
      windowTracker.addListener("MsgLoaded", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("MsgLoaded", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
    onMessagesDisplayed({ context, fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      let listener = {
        async handleEvent(event) {
          if (fire.wakeup) {
            await fire.wakeup();
          }
          // `event.target` is an about:message or about:3pane window.
          let nativeTab = event.target.tabOrWindow;
          let tab = tabManager.wrapTab(nativeTab);
          let msgs = getDisplayedMessages(tab, extension);
          fire.async(tab.convert(), msgs);
        },
      };
      windowTracker.addListener("MsgsLoaded", listener);
      return {
        unregister: () => {
          windowTracker.removeListener("MsgsLoaded", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    let { extension } = context;
    let { tabManager } = extension;
    return {
      messageDisplay: {
        onMessageDisplayed: new EventManager({
          context,
          module: "messageDisplay",
          event: "onMessageDisplayed",
          extensionApi: this,
        }).api(),
        onMessagesDisplayed: new EventManager({
          context,
          module: "messageDisplay",
          event: "onMessagesDisplayed",
          extensionApi: this,
        }).api(),
        async getDisplayedMessage(tabId) {
          let tab = tabManager.get(tabId);
          let messages = _getDisplayedMessages(tab);
          if (messages.length == 1) {
            return convertMessage(messages[0], extension);
          }
          return null;
        },
        async getDisplayedMessages(tabId) {
          return getDisplayedMessages(tabManager.get(tabId), extension);
        },
        async open(properties) {
          let msgHdr = getMsgHdr(properties);
          let messageURI;
          if (msgHdr.folder) {
            messageURI = msgHdr.folder.getUriForMsg(msgHdr);
          } else {
            // Add the application/x-message-display type to the url, if missing.
            // The slash is escaped when setting the type via searchParams, but
            // core code needs it unescaped.
            let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
            url.searchParams.delete("type");
            messageURI = `${url.href}${
              url.searchParams.toString() ? "&" : "?"
            }type=application/x-message-display`;
          }

          let window = await getNormalWindowReady(context, properties.windowId);
          let tab;
          switch (properties.location || getDefaultMessageOpenLocation()) {
            case "tab":
              {
                let active = properties.active ?? true;
                let tabmail = window.document.getElementById("tabmail");
                let currentTab = tabmail.selectedTab;
                let nativeTabInfo = tabmail.openTab("mailMessageTab", {
                  messageURI,
                  background: !active,
                });
                await new Promise(resolve =>
                  nativeTabInfo.chromeBrowser.addEventListener(
                    "MsgLoaded",
                    resolve,
                    { once: true }
                  )
                );
                tab = tabManager.convert(nativeTabInfo, currentTab);
              }
              break;

            case "window":
              {
                // Handle window location.
                let msgWindow = window.MsgOpenNewWindowForMessage(
                  Services.io.newURI(messageURI)
                );
                await new Promise(resolve =>
                  msgWindow.addEventListener("MsgLoaded", resolve, {
                    once: true,
                  })
                );
                tab = tabManager.convert(msgWindow);
              }
              break;
          }
          return tab;
        },
      },
    };
  }
};

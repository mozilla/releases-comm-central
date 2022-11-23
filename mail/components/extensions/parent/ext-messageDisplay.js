/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

async function getDisplayedMessages(tab, extension) {
  let displayedMessages;

  if (tab instanceof TabmailTab) {
    // TODO: Fix this.
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
                // `event.target` is an about:message window.
                let tabId = tabTracker.getBrowserTabId(
                  event.target.document.getElementById("messagepane")
                );
                let tab = tabManager.get(tabId).convert();
                let msg = convertMessage(event.detail, extension);
                fire.async(tab, msg);
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
          name: "messageDisplay.onMessagesDisplayed",
          register: fire => {
            let listener = {
              handleEvent(event) {
                // `event.target` is an about:message window.
                let tabId = tabTracker.getBrowserTabId(
                  event.target.document.getElementById("messagepane")
                );
                let tab = tabManager.get(tabId).convert();
                getDisplayedMessages(tab, extension).then(msgs => {
                  fire.async(tab, msgs);
                });
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
            // TODO: Fix this.
          } else if (tab.nativeTab.gMessageDisplay) {
            displayedMessage = tab.nativeTab.gMessageDisplay.displayedMessage;
          }

          return convertMessage(displayedMessage, extension);
        },
        async getDisplayedMessages(tabId) {
          return getDisplayedMessages(tabManager.get(tabId), extension);
        },
        async open(properties) {
          let msgHdr = getMsgHdr(properties);
          if (!msgHdr.folder) {
            // Add the application/x-message-display type to the url, if missing.
            // The slash is escaped when setting the type via searchParams, but
            // core code needs it unescaped.
            let url = new URL(msgHdr.getStringProperty("dummyMsgUrl"));
            url.searchParams.delete("type");
            let msgUrl = `${url.href}${
              url.searchParams.toString() ? "&" : "?"
            }type=application/x-message-display`;

            let window = await getNormalWindowReady(context);
            let msgWindow = window.openDialog(
              "chrome://messenger/content/messageWindow.xhtml",
              "_blank",
              "all,chrome,dialog=no,status,toolbar",
              Services.io.newURI(msgUrl)
            );
            return tabManager.convert(msgWindow);
          }

          let tab;
          switch (properties.location || getDefaultMessageOpenLocation()) {
            case "tab":
              {
                let active = properties.active ?? true;
                let window = await getNormalWindowReady(
                  context,
                  properties.windowId
                );
                let tabmail = window.document.getElementById("tabmail");
                let currentTab = tabmail.selectedTab;
                let nativeTabInfo = tabmail.openTab("mailMessageTab", {
                  messageURI: msgHdr.folder.getUriForMsg(msgHdr),
                  background: !active,
                });

                // Only messages loaded into active tabs correctly set
                // messageDisplay.displayedMessage.
                // To have browser.messageDisplay.getDisplayedMessage() return the
                // message in the inactive tab, manually set the msgHdr here.
                if (!active) {
                  nativeTabInfo.messageDisplay.displayedMessage = msgHdr;
                }
                tab = tabManager.convert(nativeTabInfo, currentTab);
              }
              break;

            case "window":
              {
                // Handle window location.
                let msgWindow = null;
                let messageLoadPromise = new Promise(resolve => {
                  function msgLoadedListener(event) {
                    if (msgWindow && msgWindow == event.target) {
                      windowTracker.removeListener(
                        "MsgLoaded",
                        msgLoadedListener
                      );
                      resolve();
                    }
                  }
                  windowTracker.addListener("MsgLoaded", msgLoadedListener);
                });
                msgWindow = MailUtils.openMessageInNewWindow(msgHdr);
                await messageLoadPromise;
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

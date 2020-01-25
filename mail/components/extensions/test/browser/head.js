/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// There are shutdown issues for which multiple rejections are left uncaught.
// This bug should be fixed, but for the moment this directory is whitelisted.
//
// NOTE: Entire directory whitelisting should be kept to a minimum. Normally you
//       should use "expectUncaughtRejection" to flag individual failures.
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/PromiseTestUtils.jsm"
);
PromiseTestUtils.whitelistRejectionsGlobally(/Message manager disconnected/);
PromiseTestUtils.whitelistRejectionsGlobally(/No matching message handler/);
PromiseTestUtils.whitelistRejectionsGlobally(/Receiving end does not exist/);

function createAccount() {
  registerCleanupFunction(() => {
    [...MailServices.accounts.accounts.enumerate()].forEach(cleanUpAccount);
  });

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts.enumerate().getNext();
  info(`Created account ${account.toString()}`);

  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

function addIdentity(account) {
  let identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.defaultIdentity = identity;
  info(`Created identity ${identity.toString()}`);
}

function createMessages(folder, count) {
  const { MessageGenerator } = ChromeUtils.import(
    "resource://testing-common/mailnews/MessageGenerator.jsm"
  );
  let messages = new MessageGenerator().makeMessages({ count });
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
}

async function promiseAnimationFrame(win = window) {
  await new Promise(win.requestAnimationFrame);
  // dispatchToMainThread throws if used as the first argument of Promise.
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

function makeWidgetId(id) {
  id = id.toLowerCase();
  return id.replace(/[^a-z0-9_-]/g, "_");
}

async function focusWindow(win) {
  if (Services.focus.activeWindow == win) {
    return;
  }

  let promise = new Promise(resolve => {
    win.addEventListener(
      "focus",
      function() {
        resolve();
      },
      { capture: true, once: true }
    );
  });

  win.focus();
  await promise;
}

function promisePopupShown(popup) {
  return new Promise(resolve => {
    if (popup.state == "open") {
      resolve();
    } else {
      let onPopupShown = event => {
        popup.removeEventListener("popupshown", onPopupShown);
        resolve();
      };
      popup.addEventListener("popupshown", onPopupShown);
    }
  });
}

function getPanelForNode(node) {
  while (node.localName != "panel") {
    node = node.parentNode;
  }
  return node;
}

var awaitBrowserLoaded = browser =>
  ContentTask.spawn(browser, null, () => {
    if (
      content.document.readyState !== "complete" ||
      content.document.documentURI === "about:blank"
    ) {
      return ContentTaskUtils.waitForEvent(this, "load", true, event => {
        return content.document.documentURI !== "about:blank";
      }).then(() => {});
    }
    return Promise.resolve();
  });

var awaitExtensionPanel = async function(
  extension,
  win = window,
  awaitLoad = true
) {
  let { originalTarget: browser } = await BrowserTestUtils.waitForEvent(
    win.document,
    "WebExtPopupLoaded",
    true,
    event => event.detail.extension.id === extension.id
  );

  await Promise.all([
    promisePopupShown(getPanelForNode(browser)),
    awaitLoad && awaitBrowserLoaded(browser),
  ]);

  return browser;
};

function getBrowserActionPopup(extension, win = window) {
  return window.document.getElementById(makeWidgetId(extension.id) + "-panel");
}

function closeBrowserAction(extension, win = window) {
  let popup = getBrowserActionPopup(extension, win);
  let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.hidePopup();

  return hidden;
}

async function openNewMailWindow(options = {}) {
  if (!options.newAccountWizard) {
    Services.prefs.setBoolPref(
      "mail.provider.suppress_dialog_on_startup",
      true
    );
  }

  let win = window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,all,dialog=no"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(win, "focus", true),
    BrowserTestUtils.waitForEvent(win, "activate", true),
  ]);

  return win;
}

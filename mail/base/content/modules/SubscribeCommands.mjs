/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

/**
 * Determine whether the Subscribe... menu item can be enabled.
 *
 * @param {nsIMsgFolder} selectedFolder
 * @returns {boolean}
 */
function IsSubscribeEnabled(selectedFolder) {
  // If there are any IMAP or News servers, we can show the dialog any time and
  // it will properly show those.
  for (const server of MailServices.accounts.allServers) {
    if (server.type == "imap" || server.type == "nntp") {
      return true;
    }
  }

  // RSS accounts use a separate Subscribe dialog that we can only show when
  // such an account is selected.
  if (lazy.FeedUtils.isFeedFolder(selectedFolder)) {
    return true;
  }

  return false;
}

/**
 * Open subscribe window.
 *
 * @param {nsIMsgFolder} selectedFolder
 */
function MsgSubscribe(selectedFolder) {
  if (lazy.FeedUtils.isFeedFolder(selectedFolder)) {
    // Open feed subscription dialog.
    openSubscriptionsDialog(selectedFolder);
  } else {
    // Open IMAP/NNTP subscription dialog.
    top.openDialog(
      "chrome://messenger/content/subscribe.xhtml",
      "subscribe",
      "chrome,modal,titlebar,resizable=yes",
      {
        folder: selectedFolder,
        okCallback: SubscribeOKCallback,
      }
    );
  }
}

/**
 * @param {nsIMsgFolder} selectedFolder
 */
function openSubscriptionsDialog(selectedFolder) {
  // Check for an existing feed subscriptions window and focus it.
  const subscriptionsWindow = Services.wm.getMostRecentWindow(
    "Mail:News-BlogSubscriptions"
  );

  if (subscriptionsWindow) {
    subscriptionsWindow.FeedSubscriptions.selectFolder(selectedFolder);
    subscriptionsWindow.FeedSubscriptions.mView.tree.ensureRowIsVisible(
      subscriptionsWindow.FeedSubscriptions.mView.selection.currentIndex
    );

    subscriptionsWindow.focus();
  } else {
    top.openDialog(
      "chrome://messenger-newsblog/content/feed-subscriptions.xhtml",
      "",
      "centerscreen,chrome,dialog=no,resizable",
      { folder: selectedFolder }
    );
  }
}

/**
 * @param {string} serverURI
 * @param {Record<string, boolean>} changes - Each entry is a change to make,
 *   keys are paths to [un]subscribe. A true value means the path should be
 *   subscribed, false means it should be unsubscribed.
 */
function SubscribeOKCallback(serverURI, changes) {
  const folder = lazy.MailUtils.getExistingFolder(serverURI);
  const server = folder.server;
  const subscribableServer = server.QueryInterface(Ci.nsISubscribableServer);

  for (const [path, subscribe] of Object.entries(changes)) {
    if (subscribe) {
      try {
        subscribableServer.subscribe(path);
      } catch (ex) {
        console.error(`Failed to subscribe to ${path}:`, ex);
      }
    } else {
      try {
        subscribableServer.unsubscribe(path);
      } catch (ex) {
        console.error(`Failed to unsubscribe to ${path}:`, ex);
      }
    }
  }

  try {
    subscribableServer.commitSubscribeChanges();
  } catch (ex) {
    console.error("Failed to commit the changes:", ex);
  }
}

/**
 * Unsubscribe from selected or passed in newsgroup.
 *
 * @param {nsIMsgFolder} folder - The folder to unsubscribe.
 */
function MsgUnsubscribe(folder) {
  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );

  // Show a confirmation dialog - check if the user really want to unsubscribe
  // from the given newsgroup(s).
  const titleMsg = bundle.GetStringFromName("confirmUnsubscribeTitle");
  const dialogMsg = bundle.formatStringFromName("confirmUnsubscribeText", [
    folder.localizedName,
  ]);

  if (!Services.prompt.confirm(top, titleMsg, dialogMsg)) {
    return;
  }

  const subscribableServer = folder.server.QueryInterface(
    Ci.nsISubscribableServer
  );
  subscribableServer.unsubscribe(folder.name);
  subscribableServer.commitSubscribeChanges();
}

export const SubscribeCommands = {
  IsSubscribeEnabled,
  MsgSubscribe,
  MsgUnsubscribe,
};

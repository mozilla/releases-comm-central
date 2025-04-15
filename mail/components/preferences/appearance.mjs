/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global Preferences, MozElements */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailServices: "resource:///modules/MailServices.sys.mjs",
  MailUtils: "resource:///modules/MailUtils.sys.mjs",
});

Preferences.addAll([
  { id: "mail.threadpane.listview", type: "int" },
  { id: "mail.threadpane.cardsview.rowcount", type: "int" },
  { id: "mailnews.default_view_flags", type: "int" },
  { id: "mailnews.default_sort_type", type: "int" },
  { id: "mailnews.default_sort_order", type: "int" },
  { id: "mail.threadpane.table.horizontal_scroll", type: "bool" },
]);

ChromeUtils.defineLazyGetter(lazy, "notification", () => {
  return new MozElements.NotificationBox(element => {
    document.getElementById("appearance-notifications").append(element);
  });
});

export const appearancePane = {
  init() {
    this.addEventListeners();
    this.toggleExtraViewOptions();
    Preferences.get("mail.threadpane.listview").on(
      "change",
      this.toggleExtraViewOptions
    );
  },

  /**
   * Add event listeners to the various interactive elements of the pane.
   */
  addEventListeners() {
    document.getElementById("applyAll").addEventListener("command", () => {
      this.applyViewToAll();
    });
    document
      .getElementById("applyChoose")
      .addEventListener("command", event => {
        document
          .getElementById("folderPickerMenuPopup")
          .openPopup(event.target, "after_start", 0, 0, true);
      });
    document
      .getElementById("applyViewToFolder")
      .addEventListener("command", event => {
        this.applyViewToFolder(event);
      });
    document
      .getElementById("applyViewToFolderAndChildren")
      .addEventListener("command", event => {
        this.applyViewToFolder(event, true);
      });
  },

  /**
   * Toggle the visibility of the extra view options.
   */
  toggleExtraViewOptions() {
    const prefValue = Preferences.get("mail.threadpane.listview").value;
    document.getElementById("cardsViewOptions").hidden = prefValue === 1;
    document.getElementById("tableViewOptions").hidden = prefValue === 0;
  },

  /**
   * Update the view state flags of the folder database and forget the
   * reference to prevent memory bloat.
   *
   * @param {nsIMsgFolder} folder - The message folder.
   */
  commitViewState(folder) {
    if (folder.isServer) {
      return;
    }

    folder.msgDatabase.dBFolderInfo.viewFlags = Services.prefs.getIntPref(
      "mailnews.default_view_flags"
    );
    folder.msgDatabase.dBFolderInfo.sortType = Services.prefs.getIntPref(
      "mailnews.default_sort_type"
    );
    folder.msgDatabase.dBFolderInfo.sortOrder = Services.prefs.getIntPref(
      "mailnews.default_sort_order"
    );
    // Null out to avoid memory bloat.
    folder.msgDatabase = null;
  },

  /**
   * Prompt the user to confirm applying the current view settings to all
   * folders of all accounts.
   */
  async applyViewToAll() {
    const [title, message] = await document.l10n.formatValues([
      { id: "apply-changes-prompt-title" },
      { id: "apply-changes-prompt-message" },
    ]);
    if (!Services.prompt.confirm(null, title, message)) {
      return;
    }

    for (const server of lazy.MailServices.accounts.allServers) {
      await lazy.MailUtils.takeActionOnFolderAndDescendents(
        server.rootFolder,
        this.commitViewState
      );
    }

    await this.showSuccessMessage();
  },

  /**
   * Prompt the user to confirm applying the current view settings to the chosen
   * folder and its children.
   *
   * @param {DOMEvent} event - The trigger event on the folder menuitem.
   * @param {boolean} [useChildren=false] - If the requested action should be
   *   propagated to the child folders.
   */
  async applyViewToFolder(event, useChildren = false) {
    const folder = event.target._folder;
    if (!folder) {
      this.showErrorMessage();
      return;
    }

    const messageId = useChildren
      ? "apply-changes-prompt-folder-children-message"
      : "apply-changes-prompt-folder-message";

    const [title, message] = await document.l10n.formatValues([
      { id: "apply-changes-prompt-title" },
      { id: messageId, args: { name: folder.name } },
    ]);
    if (!Services.prompt.confirm(null, title, message)) {
      return;
    }

    if (!useChildren) {
      this.commitViewState(folder);
      await this.showSuccessMessage();
      return;
    }

    await lazy.MailUtils.takeActionOnFolderAndDescendents(
      folder,
      this.commitViewState
    );
    await this.showSuccessMessage();
  },

  /**
   * Show an error message at the top of the appearance page if something goes
   * wrong.
   */
  async showErrorMessage() {
    lazy.notification.removeAllNotifications();

    await lazy.notification.appendNotification(
      "folderFlagsError",
      {
        label: {
          "l10n-id": "apply-current-view-error",
        },
        priority: lazy.notification.PRIORITY_WARNING_MEDIUM,
      },
      null
    );
  },

  /**
   * Show a success message after the view settings have been correctly applied.
   */
  async showSuccessMessage() {
    lazy.notification.removeAllNotifications();

    const notification = await lazy.notification.appendNotification(
      "folderFlagsSuccess",
      {
        label: {
          "l10n-id": "apply-current-view-success",
        },
        priority: lazy.notification.PRIORITY_INFO_MEDIUM,
      },
      null
    );
    notification.setAttribute("type", "success");

    Services.obs.notifyObservers(null, "global-view-flags-changed");
  },
};

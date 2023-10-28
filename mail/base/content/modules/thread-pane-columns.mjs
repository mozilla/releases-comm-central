/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "USE_CORRESPONDENTS",
  "mail.threadpane.use_correspondents",
  true
);
XPCOMUtils.defineLazyModuleGetters(lazy, {
  FeedUtils: "resource:///modules/FeedUtils.jsm",
  DBViewWrapper: "resource:///modules/DBViewWrapper.jsm",
});

/**
 * The array of columns for the table layout. This must be kept in sync with
 * the row template #threadPaneRowTemplate in about3Pane.xhtml.
 *
 * @type {Array}
 */
const DEFAULT_COLUMNS = [
  {
    id: "selectCol",
    l10n: {
      header: "threadpane-column-header-select",
      menuitem: "threadpane-column-label-select",
    },
    ordinal: 1,
    select: true,
    icon: true,
    resizable: false,
    sortable: false,
    hidden: true,
  },
  {
    id: "threadCol",
    l10n: {
      header: "threadpane-column-header-thread",
      menuitem: "threadpane-column-label-thread",
    },
    ordinal: 2,
    thread: true,
    icon: true,
    resizable: false,
    sortable: false,
  },
  {
    id: "flaggedCol",
    l10n: {
      header: "threadpane-column-header-flagged",
      menuitem: "threadpane-column-label-flagged",
    },
    ordinal: 3,
    sortKey: "byFlagged",
    star: true,
    icon: true,
    resizable: false,
  },
  {
    id: "attachmentCol",
    l10n: {
      header: "threadpane-column-header-attachments",
      menuitem: "threadpane-column-label-attachments",
    },
    ordinal: 4,
    sortKey: "byAttachments",
    icon: true,
    resizable: false,
  },
  {
    id: "subjectCol",
    l10n: {
      header: "threadpane-column-header-subject",
      menuitem: "threadpane-column-label-subject",
    },
    ordinal: 5,
    picker: false,
    sortKey: "bySubject",
  },
  {
    id: "unreadButtonColHeader",
    l10n: {
      header: "threadpane-column-header-unread-button",
      menuitem: "threadpane-column-label-unread-button",
    },
    ordinal: 6,
    sortKey: "byUnread",
    icon: true,
    resizable: false,
    unread: true,
  },
  {
    id: "senderCol",
    l10n: {
      header: "threadpane-column-header-sender",
      menuitem: "threadpane-column-label-sender",
    },
    ordinal: 7,
    sortKey: "byAuthor",
    hidden: true,
  },
  {
    id: "recipientCol",
    l10n: {
      header: "threadpane-column-header-recipient",
      menuitem: "threadpane-column-label-recipient",
    },
    ordinal: 8,
    sortKey: "byRecipient",
    hidden: true,
  },
  {
    id: "correspondentCol",
    l10n: {
      header: "threadpane-column-header-correspondents",
      menuitem: "threadpane-column-label-correspondents",
    },
    ordinal: 9,
    sortKey: "byCorrespondent",
  },
  {
    id: "junkStatusCol",
    l10n: {
      header: "threadpane-column-header-spam",
      menuitem: "threadpane-column-label-spam",
    },
    ordinal: 10,
    sortKey: "byJunkStatus",
    spam: true,
    icon: true,
    resizable: false,
  },
  {
    id: "dateCol",
    l10n: {
      header: "threadpane-column-header-date",
      menuitem: "threadpane-column-label-date",
    },
    ordinal: 11,
    sortKey: "byDate",
  },
  {
    id: "receivedCol",
    l10n: {
      header: "threadpane-column-header-received",
      menuitem: "threadpane-column-label-received",
    },
    ordinal: 12,
    sortKey: "byReceived",
    hidden: true,
  },
  {
    id: "statusCol",
    l10n: {
      header: "threadpane-column-header-status",
      menuitem: "threadpane-column-label-status",
    },
    ordinal: 13,
    sortKey: "byStatus",
    hidden: true,
  },
  {
    id: "sizeCol",
    l10n: {
      header: "threadpane-column-header-size",
      menuitem: "threadpane-column-label-size",
    },
    ordinal: 14,
    sortKey: "bySize",
    hidden: true,
  },
  {
    id: "tagsCol",
    l10n: {
      header: "threadpane-column-header-tags",
      menuitem: "threadpane-column-label-tags",
    },
    ordinal: 15,
    sortKey: "byTags",
    hidden: true,
  },
  {
    id: "accountCol",
    l10n: {
      header: "threadpane-column-header-account",
      menuitem: "threadpane-column-label-account",
    },
    ordinal: 16,
    sortKey: "byAccount",
    hidden: true,
  },
  {
    id: "priorityCol",
    l10n: {
      header: "threadpane-column-header-priority",
      menuitem: "threadpane-column-label-priority",
    },
    ordinal: 17,
    sortKey: "byPriority",
    hidden: true,
  },
  {
    id: "unreadCol",
    l10n: {
      header: "threadpane-column-header-unread",
      menuitem: "threadpane-column-label-unread",
    },
    ordinal: 18,
    sortable: false,
    hidden: true,
  },
  {
    id: "totalCol",
    l10n: {
      header: "threadpane-column-header-total",
      menuitem: "threadpane-column-label-total",
    },
    ordinal: 19,
    sortable: false,
    hidden: true,
  },
  {
    id: "locationCol",
    l10n: {
      header: "threadpane-column-header-location",
      menuitem: "threadpane-column-label-location",
    },
    ordinal: 20,
    sortKey: "byLocation",
    hidden: true,
  },
  {
    id: "idCol",
    l10n: {
      header: "threadpane-column-header-id",
      menuitem: "threadpane-column-label-id",
    },
    ordinal: 21,
    sortKey: "byId",
    hidden: true,
  },
  {
    id: "deleteCol",
    l10n: {
      header: "threadpane-column-header-delete",
      menuitem: "threadpane-column-label-delete",
    },
    ordinal: 22,
    delete: true,
    icon: true,
    resizable: false,
    sortable: false,
    hidden: true,
  },
];

/**
 * Check if the current folder is a special Outgoing folder.
 *
 * @param {nsIMsgFolder} folder - The message folder.
 * @returns {boolean} True if the folder is Outgoing.
 */
export const isOutgoing = folder => {
  return folder.isSpecialFolder(
    lazy.DBViewWrapper.prototype.OUTGOING_FOLDER_FLAGS,
    true
  );
};

/**
 * Generate the correct default array of columns, accounting for different views
 * and folder states.
 *
 * @param {?nsIMsgFolder} folder - The currently viewed folder if available.
 * @param {boolean} [isSynthetic=false] - If the current view is synthetic,
 *   meaning we are not visualizing a real folder, but rather
 *   the gloda results list.
 * @returns {object[]}
 */
export function getDefaultColumns(folder, isSynthetic = false) {
  // Create a clone we can edit.
  const updatedColumns = DEFAULT_COLUMNS.map(column => ({ ...column }));

  if (isSynthetic) {
    // Synthetic views usually can contain messages from multiple folders.
    // Folder for the selected message will still be set.
    for (const c of updatedColumns) {
      switch (c.id) {
        case "correspondentCol":
          // Don't show the correspondent if is not wanted.
          c.hidden = !lazy.USE_CORRESPONDENTS;
          break;
        case "senderCol":
          // Hide the sender if correspondent is enabled.
          c.hidden = lazy.USE_CORRESPONDENTS;
          break;
        case "attachmentCol":
        case "unreadButtonColHeader":
        case "junkStatusCol":
          // Hide all the columns we don't want in a default gloda view.
          c.hidden = true;
          break;
        case "locationCol":
          // Always show the location by default in a gloda view.
          c.hidden = false;
          break;
      }
    }
    return updatedColumns;
  }

  if (!folder) {
    // We don't have a folder yet. Use defaults.
    return updatedColumns;
  }

  for (const c of updatedColumns) {
    switch (c.id) {
      case "correspondentCol":
        // Don't show the correspondent for news or RSS.
        c.hidden = lazy.USE_CORRESPONDENTS
          ? !folder.getFlag(Ci.nsMsgFolderFlags.Mail) ||
            lazy.FeedUtils.isFeedFolder(folder)
          : true;
        break;
      case "senderCol":
        // Show the sender even if correspondent is enabled for news and feeds.
        c.hidden = lazy.USE_CORRESPONDENTS
          ? !folder.getFlag(Ci.nsMsgFolderFlags.Newsgroup) &&
            !lazy.FeedUtils.isFeedFolder(folder)
          : isOutgoing(folder);
        break;
      case "recipientCol":
        // No recipient column if we use correspondent. Otherwise hide it if is
        // not an outgoing folder.
        c.hidden = lazy.USE_CORRESPONDENTS ? true : !isOutgoing(folder);
        break;
      case "junkStatusCol":
        // No ability to mark newsgroup or feed messages as spam.
        c.hidden =
          folder.getFlag(Ci.nsMsgFolderFlags.Newsgroup) ||
          lazy.FeedUtils.isFeedFolder(folder);
        break;
    }
  }
  return updatedColumns;
}

/**
 * Find the proper column to use as sender field for the cards view.
 *
 * @param {?nsIMsgFolder} folder - The currently viewed folder if available.
 * @returns {string} - The name of the column to use as sender field.
 */
function getProperSenderForCardsView(folder) {
  // Default to correspondent as it's the safest choice most of the times.
  if (!folder) {
    return "correspondentCol";
  }

  // Show the recipient for outgoing folders.
  if (isOutgoing(folder)) {
    return "recipientCol";
  }

  // Show the sender for any other scenario, including news and feeds folders.
  return "senderCol";
}

/**
 * Get the default array of columns to fetch data for the cards view.
 *
 * @param {?nsIMsgFolder} folder - The currently viewed folder if available.
 * @returns {string[]}
 */
export function getDefaultColumnsForCardsView(folder) {
  const sender = getProperSenderForCardsView(folder);
  return ["subjectCol", sender, "dateCol", "tagsCol"];
}

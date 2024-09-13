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

ChromeUtils.defineESModuleGetters(lazy, {
  FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
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
      cell: "threadpane-cell-select",
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
      cell: "threadpane-cell-thread",
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
      cell: "threadpane-cell-flagged",
    },
    ordinal: 3,
    sortKey: "byFlagged",
    icon: true,
    resizable: false,
  },
  {
    id: "attachmentCol",
    l10n: {
      header: "threadpane-column-header-attachments",
      menuitem: "threadpane-column-label-attachments",
      cell: "threadpane-cell-attachments",
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
      cell: "threadpane-cell-subject-title",
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
      cell: "threadpane-cell-read-status",
    },
    ordinal: 6,
    sortKey: "byUnread",
    icon: true,
    resizable: false,
  },
  {
    id: "senderCol",
    l10n: {
      header: "threadpane-column-header-sender",
      menuitem: "threadpane-column-label-sender",
      cell: "threadpane-cell-sender-title",
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
      cell: "threadpane-cell-recipient-title",
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
      cell: "threadpane-cell-correspondents-title",
    },
    ordinal: 9,
    sortKey: "byCorrespondent",
  },
  {
    id: "junkStatusCol",
    l10n: {
      header: "threadpane-column-header-spam",
      menuitem: "threadpane-column-label-spam",
      cell: "threadpane-cell-spam",
    },
    ordinal: 10,
    sortKey: "byJunkStatus",
    icon: true,
    resizable: false,
  },
  {
    id: "dateCol",
    l10n: {
      header: "threadpane-column-header-date",
      menuitem: "threadpane-column-label-date",
      cell: "threadpane-cell-date-title",
    },
    ordinal: 11,
    sortKey: "byDate",
  },
  {
    id: "receivedCol",
    l10n: {
      header: "threadpane-column-header-received",
      menuitem: "threadpane-column-label-received",
      cell: "threadpane-cell-received-title",
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
      cell: "threadpane-cell-status-title",
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
      cell: "threadpane-cell-size-title",
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
      cell: "threadpane-cell-tags-title",
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
      cell: "threadpane-cell-account-title",
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
      cell: "threadpane-cell-priority-title",
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
      cell: "threadpane-cell-unread-title",
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
      cell: "threadpane-cell-total-title",
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
      cell: "threadpane-cell-location-title",
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
      cell: "threadpane-cell-id-title",
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
      cell: "threadpane-cell-delete",
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
const isOutgoing = folder => {
  return folder.isSpecialFolder(lazy.FolderUtils.OUTGOING_FOLDER_FLAGS, true);
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
function getDefaultColumns(folder, isSynthetic = false) {
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
function getDefaultColumnsForCardsView(folder) {
  const sender = getProperSenderForCardsView(folder);
  return [
    "subjectCol",
    sender,
    "dateCol",
    "tagKeysCol",
    "totalCol",
    "unreadCol",
  ];
}

/**
 * @typedef CustomColumnProperties
 * @property {string} name - Name of the column as displayed in the column
 *    header of text columns, and in the column picker menu.
 * @property {boolean} [hidden] - Whether the column should be initially hidden.
 * @property {boolean} [icon] - Whether the column is an icon column.
 * @property {IconCellDefinition[]} [iconCellDefinitions] - Cell icon definitions
 *   for the column. Required if the icon property is set.
 * @property {string} [iconHeaderUrl] - Header icon url for the column.
 *   Required if the icon property is set.
 * @property {boolean} [resizable] - Whether the column should be resizable.
 * @property {boolean} [sortable] - Whether the column should be sortable.
 *
 * @property {TextCallback} textCallback - Callback function to retrieve the
 *   text to be used for a given msgHdr. Used for sorting if no dedicated
 *   sortCallback function given. Also used as display name if columns are
 *   grouped by the sorted column.
 * @property {IconCallback} [iconCallback] - Callback function to retrieve the
 *   icon id to be used for a given msgHdr. Required if icon property is set.
 * @property {SortCallback} [sortCallback] - Callback function to retrieve a
 *   numeric sort key for a given msgHdr. If not given, column will be sorted
 *   by the value returned by specified textCallback.
 */

/**
 * @typedef IconCellDefinition
 * @property {string} id - The id of the icon. Must be alphanumeric only.
 * @property {string} url - The url of the icon.
 * @property {string} [title] - Optional value for the icon's title attribute.
 * @property {string} [alt] - Optional value for the icon's alt attribute.
 */

/**
 * Callback function to retrieve the icon to be used for the given msgHdr.
 * @callback IconCallback
 * @param {nsIMsgDBHdr} msgHdr
 *
 * @returns {string} The id of the icon to be used, as specified in the
 *   iconCellDefinitions property.
 */

/**
 * Callback function to retrieve a numeric sort key for the given msgHdr.
 * @callback SortCallback
 * @param {nsIMsgDBHdr} msgHdr
 *
 * @returns {integer} A numeric sort key.
 */

/**
 * Callback function to retrieve the text to be used for the given msgHdr.
 * @callback TextCallback
 * @param {nsIMsgDBHdr} msgHdr
 *
 * @returns {string} The text content.
 */

/**
 * Register a custom column.
 *
 * @param {string} id - uniqe id of the custom column
 * @param {CustomColumnProperties} properties
 */
function addCustomColumn(id, properties) {
  const {
    name: columnName,
    resizable = true,
    hidden = false,
    icon = false,
    sortable = false,
    iconCellDefinitions = [],
    iconHeaderUrl = "",
    iconCallback = null,
    sortCallback = null,
    textCallback = null,
  } = properties;

  if (DEFAULT_COLUMNS.some(column => column.id == id)) {
    throw new Error(`Cannot add custom column, id is already used: ${id}`);
  }
  if (!columnName) {
    throw new Error(`Missing name property for custom column: ${id}`);
  }
  if (icon) {
    if (!iconCellDefinitions || !iconHeaderUrl || !iconCallback) {
      throw new Error(`Invalid icon properties for custom icon column: ${id}`);
    }
    if (iconCellDefinitions.some(e => !e.id || !e.url || /\W/g.test(e.id))) {
      throw new Error(
        `Invalid icon definition: ${JSON.stringify(iconCellDefinitions)}`
      );
    }
  }
  if (!textCallback) {
    throw new Error(`Missing textCallback property for custom column: ${id}`);
  }

  const columnDef = {
    id,
    name: columnName,
    ordinal: DEFAULT_COLUMNS.length + 1,
    resizable,
    hidden,
    icon,
    sortable,
    sortKey: sortable ? "byCustom" : undefined,
    custom: true,
    iconCellDefinitions,
    iconHeaderUrl,
    handler: {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgCustomColumnHandler"]),
      // For simplicity return the icon information for custom icon cells here.
      getCellText: icon ? iconCallback : textCallback,
      // With Bug 1192696, Grouped By Sort was implemented for custom columns.
      // Implementers should consider that the value returned by GetSortStringForRow
      // will be displayed in the grouped header row, as well as be used as the
      // sort string.
      getSortStringForRow: textCallback,
      // Allow to provide a dedicated numerical sort function.
      getSortLongForRow: sortCallback,
      isString() {
        return !sortCallback;
      },
    },
  };
  DEFAULT_COLUMNS.push(columnDef);

  Services.obs.notifyObservers(null, "custom-column-added", id);
}

/**
 * Unregister a custom column.
 *
 * @param {string} id - uniqe id of the custom column
 */
function removeCustomColumn(id) {
  const index = DEFAULT_COLUMNS.findIndex(column => column.id == id);
  if (index >= 0) {
    DEFAULT_COLUMNS.splice(index, 1);
  }

  Services.obs.notifyObservers(null, "custom-column-removed", id);
}

/**
 * Refresh display of a custom column.
 *
 * @param {string} id - uniqe id of the custom column
 */
function refreshCustomColumn(id) {
  Services.obs.notifyObservers(null, "custom-column-refreshed", id);
}

/**
 * Retrieve the registered column information for the column with the given id.
 *
 * @param {string} id - uniqe id of the custom column
 * @returns {object} Entry of the DEFAULT_COLUMNS array with the given id, or null.
 */
function getColumn(id) {
  const columnDef = DEFAULT_COLUMNS.find(column => column.id == id);
  if (!columnDef) {
    console.warn(`Found unknown column ${id}`);
    return null;
  }
  return { ...columnDef };
}

/**
 * Retrieve the registered column information of all custom columns.
 *
 * @returns {object} Entries of the DEFAULT_COLUMNS array of custom columns.
 */
function getCustomColumns() {
  return DEFAULT_COLUMNS.filter(column => column.custom).map(column => ({
    ...column,
  }));
}

export const ThreadPaneColumns = {
  isOutgoing,
  getDefaultColumns,
  getDefaultColumnsForCardsView,
  addCustomColumn,
  removeCustomColumn,
  refreshCustomColumn,
  getColumn,
  getCustomColumns,
};

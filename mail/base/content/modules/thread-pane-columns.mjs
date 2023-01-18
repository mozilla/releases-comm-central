/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The array of columns for the table layout.
 *
 * @type {Array}
 */
export const DEFAULT_COLUMNS = [
  {
    id: "selectCol",
    l10n: {
      header: "about-threadpane-column-header-select",
      menuitem: "about-threadpane-column-label-select",
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
      header: "about-threadpane-column-header-thread",
      menuitem: "about-threadpane-column-label-thread",
    },
    ordinal: 2,
    thread: true,
    icon: true,
    resizable: false,
    sortable: false,
    hidden: true,
  },
  {
    id: "flaggedCol",
    l10n: {
      header: "about-threadpane-column-header-flagged",
      menuitem: "about-threadpane-column-label-flagged",
    },
    ordinal: 3,
    star: true,
    icon: true,
    resizable: false,
    sortable: false,
  },
  {
    id: "attachmentCol",
    l10n: {
      header: "about-threadpane-column-header-attachments",
      menuitem: "about-threadpane-column-label-attachments",
    },
    ordinal: 4,
    icon: true,
    resizable: false,
    hidden: true,
  },
  {
    id: "unreadButtonColHeader",
    l10n: {
      header: "about-threadpane-column-header-unread-button",
      menuitem: "about-threadpane-column-label-unread-button",
    },
    ordinal: 5,
    icon: true,
    resizable: false,
    unread: true,
  },
  {
    id: "senderCol",
    l10n: {
      header: "about-threadpane-column-header-sender",
      menuitem: "about-threadpane-column-label-sender",
    },
    ordinal: 6,
    sortKey: "byAuthor",
  },
  {
    id: "recipientCol",
    l10n: {
      header: "about-threadpane-column-header-recipient",
      menuitem: "about-threadpane-column-label-recipient",
    },
    ordinal: 7,
    sortKey: "byRecipient",
    hidden: true,
  },
  {
    id: "correspondentCol",
    l10n: {
      header: "about-threadpane-column-header-correspondents",
      menuitem: "about-threadpane-column-label-correspondents",
    },
    ordinal: 8,
    sortKey: "byCorrespondent",
    hidden: true,
  },
  {
    id: "junkStatusCol",
    l10n: {
      header: "about-threadpane-column-header-spam",
      menuitem: "about-threadpane-column-label-spam",
    },
    ordinal: 9,
    sortKey: "byJunkStatus",
    spam: true,
    icon: true,
    resizable: false,
  },
  {
    id: "subjectCol",
    l10n: {
      header: "about-threadpane-column-header-subject",
      menuitem: "about-threadpane-column-label-subject",
    },
    ordinal: 10,
    picker: false,
    sortKey: "bySubject",
  },
  {
    id: "dateCol",
    l10n: {
      header: "about-threadpane-column-header-date",
      menuitem: "about-threadpane-column-label-date",
    },
    ordinal: 11,
    sortKey: "byDate",
  },
  {
    id: "receivedCol",
    l10n: {
      header: "about-threadpane-column-header-received",
      menuitem: "about-threadpane-column-label-received",
    },
    ordinal: 12,
    sortKey: "byReceived",
    hidden: true,
  },
  {
    id: "statusCol",
    l10n: {
      header: "about-threadpane-column-header-status",
      menuitem: "about-threadpane-column-label-status",
    },
    ordinal: 13,
    sortKey: "byStatus",
    hidden: true,
  },
  {
    id: "sizeCol",
    l10n: {
      header: "about-threadpane-column-header-size",
      menuitem: "about-threadpane-column-label-size",
    },
    ordinal: 14,
    sortKey: "bySize",
    hidden: true,
  },
  {
    id: "tagsCol",
    l10n: {
      header: "about-threadpane-column-header-tags",
      menuitem: "about-threadpane-column-label-tags",
    },
    ordinal: 15,
    sortKey: "byTags",
    hidden: true,
  },
  {
    id: "accountCol",
    l10n: {
      header: "about-threadpane-column-header-account",
      menuitem: "about-threadpane-column-label-account",
    },
    ordinal: 16,
    sortKey: "byAccount",
    hidden: true,
  },
  {
    id: "priorityCol",
    l10n: {
      header: "about-threadpane-column-header-priority",
      menuitem: "about-threadpane-column-label-priority",
    },
    ordinal: 17,
    sortKey: "byPriority",
    hidden: true,
  },
  {
    id: "unreadCol",
    l10n: {
      header: "about-threadpane-column-header-unread",
      menuitem: "about-threadpane-column-label-unread",
    },
    ordinal: 18,
    sortable: false,
    hidden: true,
  },
  {
    id: "totalCol",
    l10n: {
      header: "about-threadpane-column-header-total",
      menuitem: "about-threadpane-column-label-total",
    },
    ordinal: 19,
    sortable: false,
    hidden: true,
  },
  {
    id: "locationCol",
    l10n: {
      header: "about-threadpane-column-header-location",
      menuitem: "about-threadpane-column-label-location",
    },
    ordinal: 20,
    sortKey: "byLocation",
    hidden: true,
  },
  {
    id: "idCol",
    l10n: {
      header: "about-threadpane-column-header-id",
      menuitem: "about-threadpane-column-label-id",
    },
    ordinal: 21,
    sortKey: "byId",
    hidden: true,
  },
  {
    id: "deleteCol",
    l10n: {
      header: "about-threadpane-column-header-delete",
      menuitem: "about-threadpane-column-label-delete",
    },
    ordinal: 22,
    delete: true,
    icon: true,
    resizable: false,
    sortable: false,
    hidden: true,
  },
];

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* This has the following companion definition files:
 * - unifiedToolbarCustomizableItems.css for the preview icons based on the id.
 * - unifiedToolbarItems.ftl for the labels associated with the labelId.
 * - unifiedToolbarCustomizableItems.inc.xhtml for the templates referenced with
 *   templateId.
 * - unifiedToolbarShared.css contains styles for the template contents shared
 *   between the customization preview and the actual toolbar.
 * - unifiedtoolbar/content/items contains all item specific custom elements.
 */

/**
 * @typedef {object} CustomizableItemDetails
 * @property {string} id - The ID of the item. Will be set as a class on the
 *   outer wrapper. May not contain commas.
 * @property {string} labelId - Fluent ID for the label shown while in the
 *   palette.
 * @property {boolean} [allowMultiple] - If this item can be added more than
 *   once to a space.
 * @property {string[]} [spaces] - If empty or omitted, item is allowed in all
 *   spaces.
 * @property {string} [templateId] - ID of template defining the "live" markup.
 * @property {string[]} [requiredModules] - List of modules that must be loaded
 *   for the template of this item.
 */

/**
 * @type {CustomizableItemDetails[]}
 */
export default [
  // Universal items (all spaces)
  {
    id: "spacer",
    labelId: "spacer",
    allowMultiple: true,
  },
  {
    id: "search-bar",
    labelId: "search-bar",
    templateId: "searchBarItemTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/global-search-bar.mjs",
    ],
  },
  {
    id: "write-message",
    labelId: "toolbar-write-message",
    templateId: "writeMessageTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "get-messages",
    labelId: "toolbar-get-messages",
    templateId: "getMessagesTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "address-book",
    labelId: "toolbar-address-book",
    templateId: "addressBookTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/space-button.mjs",
    ],
  },
  {
    id: "chat",
    labelId: "toolbar-chat",
    templateId: "chatTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/space-button.mjs",
    ],
  },
  {
    id: "add-ons-and-themes",
    labelId: "toolbar-add-ons-and-themes",
    templateId: "addOnsAndThemesTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/addons-button.mjs",
    ],
  },
  {
    id: "calendar",
    labelId: "toolbar-calendar",
    templateId: "calendarTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/space-button.mjs",
    ],
  },
  {
    id: "tasks",
    labelId: "toolbar-tasks",
    templateId: "tasksTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/space-button.mjs",
    ],
  },
  {
    id: "mail",
    labelId: "toolbar-mail",
    templateId: "mailTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/space-button.mjs",
    ],
  },
  // Mail space
  {
    id: "move-to",
    labelId: "toolbar-move-to",
    spaces: ["mail"],
    templateId: "moveToTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "reply",
    labelId: "toolbar-reply",
    spaces: ["mail"],
    templateId: "replyTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "reply-all",
    labelId: "toolbar-reply-all",
    spaces: ["mail"],
    templateId: "replyAllTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "reply-to-list",
    labelId: "toolbar-reply-to-list",
    spaces: ["mail"],
    templateId: "replyToListTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "redirect",
    labelId: "toolbar-redirect",
    spaces: ["mail"],
    templateId: "redirectTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "archive",
    labelId: "toolbar-archive",
    spaces: ["mail"],
    templateId: "archiveTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "conversation",
    labelId: "toolbar-conversation",
    spaces: ["mail"],
    templateId: "conversationTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "previous-unread",
    labelId: "toolbar-previous-unread",
    spaces: ["mail"],
    templateId: "previousUnreadTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "previous",
    labelId: "toolbar-previous",
    spaces: ["mail"],
    templateId: "previousTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "next-unread",
    labelId: "toolbar-next-unread",
    spaces: ["mail"],
    templateId: "nextUnreadTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "next",
    labelId: "toolbar-next",
    spaces: ["mail"],
    templateId: "nextTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "junk",
    labelId: "toolbar-junk",
    spaces: ["mail"],
    templateId: "junkTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "delete",
    labelId: "toolbar-delete",
    spaces: ["mail"],
    templateId: "deleteTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/delete-button.mjs",
    ],
  },
  {
    id: "compact",
    labelId: "toolbar-compact",
    spaces: ["mail"],
    templateId: "compactTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/compact-folder-button.mjs",
    ],
  },
  {
    id: "add-as-event",
    labelId: "toolbar-add-as-event",
    spaces: ["mail"],
    templateId: "addAsEventTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/add-to-calendar-button.mjs",
    ],
  },
  {
    id: "add-as-task",
    labelId: "toolbar-add-as-task",
    spaces: ["mail"],
    templateId: "addAsTaskTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/add-to-calendar-button.mjs",
    ],
  },
  {
    id: "folder-location",
    labelId: "toolbar-folder-location",
    spaces: ["mail"],
    templateId: "folderLocationTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/folder-location-button.mjs",
    ],
  },
  {
    id: "tag-message",
    labelId: "toolbar-tag-message",
    spaces: ["mail"],
    templateId: "tagMessageTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "forward-inline",
    labelId: "toolbar-forward-inline",
    spaces: ["mail"],
    templateId: "forwardInlineTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "forward-attachment",
    labelId: "toolbar-forward-attachment",
    spaces: ["mail"],
    templateId: "forwardAttachmentTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "mark-as",
    labelId: "toolbar-mark-as",
    spaces: ["mail"],
    templateId: "markAsTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "view-picker",
    labelId: "toolbar-view-picker",
    spaces: ["mail"],
    templateId: "viewPickerTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  {
    id: "print",
    labelId: "toolbar-print",
    spaces: ["mail"],
    templateId: "printTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs",
    ],
  },
  // Calendar space
  {
    id: "unifinder",
    labelId: "toolbar-unifinder",
    spaces: ["calendar"],
    templateId: "calendarUnifinderTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
  {
    id: "edit-event",
    labelId: "toolbar-edit-event",
    spaces: ["calendar", "tasks"],
    templateId: "editEventTemplate",
    requiredModules: [
      "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs",
    ],
  },
];

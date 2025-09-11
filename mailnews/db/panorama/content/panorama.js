/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { LiveViewDataAdapter } = ChromeUtils.importESModule(
  "chrome://messenger/content/LiveViewDataAdapter.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

window.addEventListener("load", async function () {
  function addFolderToList(folder, list) {
    const item = list.appendChild(document.createElement("li"));
    const name = item.appendChild(document.createElement("div"));
    name.textContent = folderDB.getFolderName(folder);
    name.dataset.path = folderDB.getFolderPath(folder);

    const childList = item.appendChild(document.createElement("ul"));
    for (const child of folderDB.getFolderChildren(folder)) {
      addFolderToList(child, childList);
    }
  }

  function addTagToList(tag, list) {
    const item = list.appendChild(document.createElement("li"));
    const name = item.appendChild(document.createElement("div"));
    name.textContent = tag.tag;
    name.dataset.tag = tag.key;
  }

  const database = Cc["@mozilla.org/mailnews/database-core;1"].getService(
    Ci.nsIDatabaseCore
  );
  const folderDB = database.folderDB;

  const folderList = document.body.querySelector("ul#folderList");
  for (const server of MailServices.accounts.allServers) {
    addFolderToList(folderDB.getFolderByPath(server.key), folderList);
  }

  const tagsItem = folderList.appendChild(document.createElement("li"));
  tagsItem.appendChild(document.createElement("div")).textContent = "Tags";
  const tagsList = tagsItem.appendChild(document.createElement("ul"));
  for (const tag of MailServices.tags.getAllTags()) {
    addTagToList(tag, tagsList);
  }

  for (const name of folderList.querySelectorAll("li > ul > li > div")) {
    const { path, tag } = name.dataset;
    const liveView = Cc["@mozilla.org/mailnews/live-view;1"].createInstance(
      Ci.nsILiveView
    );
    if (path) {
      const folder = folderDB.getFolderByPath(path);
      liveView.initWithFolder(folder);
    } else if (tag) {
      liveView.initWithTag(tag);
    }
    name.textContent += ` (${liveView.countUnreadMessages()}/${liveView.countMessages()})`;
  }

  const messageList = document.body.querySelector("auto-tree-view#messageList");
  messageList.setAttribute("rows", "auto-tree-view-table-row");
  messageList.defaultColumns = [
    { id: "id", l10n: {}, name: "id", sortable: false },
    { id: "folderId", l10n: {}, name: "folder", sortable: false },
    { id: "messageId", l10n: {}, name: "message-id", sortable: false },
    { id: "date", l10n: {}, name: "date" },
    { id: "sender", l10n: {}, name: "sender" },
    { id: "recipients", l10n: {}, name: "recipients" },
    { id: "subject", l10n: {}, name: "subject" },
    { id: "flags", l10n: {}, name: "flags", sortable: false },
    { id: "unread", l10n: {}, name: "unread" },
    { id: "flagged", l10n: {}, name: "flagged" },
    { id: "tags", l10n: {}, name: "tags", sortable: false },
    { id: "threadId", l10n: {}, name: "thread", sortable: false },
    { id: "threadParent", l10n: {}, name: "parent", sortable: false },
  ];

  const threadedCheckbox = document.body.querySelector(
    "input#threaded_messages"
  );
  folderList.addEventListener("click", function (event) {
    const { path, tag } = event.target.dataset;
    if (!path && !tag) {
      return;
    }

    const liveView = Cc["@mozilla.org/mailnews/live-view;1"].createInstance(
      Ci.nsILiveView
    );
    if (path) {
      const folder = folderDB.getFolderByPath(path);
      liveView.initWithFolder(folder);
    } else if (tag) {
      liveView.initWithTag(tag);
    }
    liveView.threadsOnly = threadedCheckbox.checked;

    messageList.view = new LiveViewDataAdapter(liveView);
  });
});

window.addEventListener("unload", function () {
  const messageList = document.body.querySelector("auto-tree-view#messageList");
  if (messageList.view) {
    messageList.view = null;
  }
});

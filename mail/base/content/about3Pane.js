/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { DBViewWrapper } = ChromeUtils.import(
  "resource:///modules/DBViewWrapper.jsm"
);
var { getFolderIcon } = ChromeUtils.import(
  "resource:///modules/folderUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var folderTree, threadTree, messageBrowser;

window.addEventListener("DOMContentLoaded", () => {
  function addSubFolders(parentFolder, parentItem) {
    let subFolders = parentFolder.subFolders;
    if (!subFolders.length) {
      return;
    }

    subFolders.sort((a, b) => a.compareSortKeys(b));

    let childList = parentItem.appendChild(document.createElement("ul"));
    for (let folder of subFolders) {
      let folderItem = childList.appendChild(
        folderTemplate.content.firstElementChild.cloneNode(true)
      );
      folderItem.dataset.uri = folder.URI;
      folderItem.querySelector(
        ".icon"
      ).style.backgroundImage = `url("${getFolderIcon(folder)}")`;
      folderItem.querySelector(".name").textContent = folder.name;
      addSubFolders(folder, folderItem);
    }
  }

  // Setting the pane config on a preference change may turn out to be a bad
  // idea now that we can have multiple tabs open. It'll do for now though.
  function setLayout(layout) {
    switch (layout) {
      case 1:
        document.body.classList.remove("layout-classic", "layout-vertical");
        document.body.classList.add("layout-wide");
        break;
      case 2:
        document.body.classList.remove("layout-classic", "layout-wide");
        document.body.classList.add("layout-vertical");
        break;
      default:
        document.body.classList.remove("layout-wide", "layout-vertical");
        document.body.classList.add("layout-classic");
        break;
    }
  }
  XPCOMUtils.defineLazyPreferenceGetter(
    this,
    "layout",
    "mail.pane_config.dynamic",
    null,
    (name, oldValue, newValue) => setLayout(newValue)
  );
  setLayout(this.layout);

  let splitter1Width = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "folderPaneBox",
    "width"
  );
  if (splitter1Width) {
    document.body.style.setProperty("--splitter1-width", `${splitter1Width}px`);
  }

  let splitter1Height = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "messagepaneboxwrapper",
    "height"
  );
  if (splitter1Height) {
    document.body.style.setProperty(
      "--splitter2-height",
      `${splitter1Height}px`
    );
  }

  let splitter2Width = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "messagepaneboxwrapper",
    "width"
  );
  if (splitter2Width) {
    document.body.style.setProperty("--splitter2-width", `${splitter2Width}px`);
  }

  folderTree = document.getElementById("folderTree");
  threadTree = document.getElementById("threadTree");
  messageBrowser = document.getElementById("messageBrowser");
  let folderTemplate = document.getElementById("folderTemplate");

  for (let account of MailServices.accounts.accounts) {
    let accountItem = folderTree.appendChild(
      folderTemplate.content.firstElementChild.cloneNode(true)
    );
    accountItem.dataset.uri = account.incomingServer.rootFolder.URI;
    accountItem.querySelector(
      ".icon"
    ).style.backgroundImage = `url("${getFolderIcon(
      account.incomingServer.rootFolder
    )}")`;
    accountItem.querySelector(".name").textContent =
      account.incomingServer.prettyName;
    addSubFolders(account.incomingServer.rootFolder, accountItem);
  }

  folderTree.addEventListener("select", event => {
    let uri = folderTree.rows[folderTree.selectedIndex]?.dataset.uri;
    if (!uri) {
      return;
    }

    let folder = MailServices.folderLookup.getFolderForURL(uri);

    document.head.querySelector(`link[rel="icon"]`).href = getFolderIcon(
      folder
    );

    if (folder.isServer) {
      document.title = folder.server.prettyName;
      threadTree.view = null;
      return;
    }
    document.title = `${folder.name} - ${folder.server.prettyName}`;

    let wrapper = new DBViewWrapper(dbViewWrapperListener);
    wrapper._viewFlags = 1;
    wrapper.open(folder);
    threadTree.view = wrapper.dbView;
    window.dispatchEvent(
      new CustomEvent("folderURIChanged", { bubbles: true, detail: uri })
    );
  });

  threadTree.addEventListener("select", async event => {
    if (threadTree.selectedIndicies.length != 1) {
      return;
    }

    let uri = threadTree.view.getURIForViewIndex(threadTree.selectedIndex);
    if (!uri) {
      return;
    }
    displayMessage(uri);
  });
});

window.addEventListener("splitter-resizing", () =>
  document.body.classList.add("dragging")
);
window.addEventListener("splitter-resized", () =>
  document.body.classList.remove("dragging")
);

window.addEventListener("keypress", event => {
  // These keypresses are implemented here to aid the development process.
  // It's likely they won't remain here in future.
  switch (event.key) {
    case "F4":
      Services.prefs.setIntPref(
        "mail.pane_config.dynamic",
        (Services.prefs.getIntPref("mail.pane_config.dynamic") + 1) % 3
      );
      break;
    case "F5":
      location.reload();
      break;
    case "F6": {
      let focusList = [folderTree, threadTree, messageBrowser];
      let currentIndex = focusList.indexOf(document.activeElement);
      let delta = event.shiftKey ? -1 : 1;

      currentIndex = (currentIndex + delta + 3) % 3;
      focusList[currentIndex].focus();
      if (document.activeElement != focusList[currentIndex]) {
        currentIndex = (currentIndex + delta + 3) % 3;
        focusList[currentIndex].focus();
      }
      break;
    }
  }
});

function displayFolder(folderURI) {
  let folderTree = document.getElementById("folderTree");
  for (let index = 0; index < folderTree.rowCount; index++) {
    if (folderTree.rows[index].dataset.uri == folderURI) {
      folderTree.selectedIndex = index;
      return;
    }
  }
}

function displayMessage(messageURI) {
  messageBrowser.contentWindow.displayMessage(messageURI);
  messageBrowser.style.visibility = "visible";
}

/**
 * Custom element for rows in the thread tree.
 */
class ThreadListrow extends customElements.get("tree-view-listrow") {
  static ROW_HEIGHT = 22;

  columns = ["senderCol", "subjectCol", "dateCol"];

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    let twisty = this.appendChild(document.createElement("div"));
    twisty.classList.add("twisty");
    let twistyImage = twisty.appendChild(document.createElement("img"));
    twistyImage.className = "twisty-icon";
    twistyImage.src = "chrome://global/skin/icons/arrow-down-12.svg";

    for (let i = 0; i < this.columns.length; i++) {
      this.appendChild(document.createElement("span")).classList.add(
        this.columns[i]
      ); //.style.width = `var(--col${i + 1}width, 15em)`;
    }
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;
    this.dataset.uri = this.view.getURIForViewIndex(index);
    let rowProps = this.view.getRowProperties(index);
    if (/\bunread\b/.test(rowProps)) {
      this.style.fontWeight = "bold";
    }

    for (let i = 0; i < this.columns.length; i++) {
      this.children[i + 1].textContent = this.view.cellTextForColumn(
        index,
        this.columns[i]
      );
    }
    this.setAttribute("aria-label", this.firstElementChild.textContent);

    this.children[2].style.paddingInlineStart = `${this.view.getLevel(
      index
    )}em`;
  }
}
customElements.define("thread-listrow", ThreadListrow);

/**
 * Dummy DBViewWrapperListener so that we can have a DBViewWrapper. Some of
 * this will no doubt need to be filled in later.
 */
const dbViewWrapperListener = {
  messenger: null,
  msgWindow: null,
  threadPaneCommandUpdater: null,

  get shouldUseMailViews() {
    return false;
  },
  get shouldDeferMessageDisplayUntilAfterServerConnect() {
    return false;
  },
  shouldMarkMessagesReadOnLeavingFolder(msgFolder) {
    return false;
  },
  onFolderLoading(isFolderLoading) {},
  onSearching(isSearching) {},
  onCreatedView() {},
  onDestroyingView(folderIsComingBack) {},
  onLoadingFolder(dbFolderInfo) {},
  onDisplayingFolder() {},
  onLeavingFolder() {},
  onMessagesLoaded(all) {},
  onMailViewChanged() {},
  onSortChanged() {},
  onMessagesRemoved() {},
  onMessageRemovalFailed() {},
  onMessageCountsChanged() {},
};

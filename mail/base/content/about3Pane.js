/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals dbViewWrapperListener, mailContextMenu */ // mailContext.js
/* globals goDoCommand */ // globalOverlay.js

var { DBViewWrapper } = ChromeUtils.import(
  "resource:///modules/DBViewWrapper.jsm"
);
var { canRenameDeleteJunkMail, getFolderIcon } = ChromeUtils.import(
  "resource:///modules/folderUtils.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  FeedUtils: "resource:///modules/FeedUtils.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gFolder, gViewWrapper, gMessage, gMessageURI;
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
  let folderTemplate = document.getElementById("folderTemplate");
  let folderPaneContext = document.getElementById("folderPaneContext");

  for (let account of MailServices.accounts.accounts) {
    let accountItem = folderTree.appendChild(
      folderTemplate.content.firstElementChild.cloneNode(true)
    );
    accountItem.id = account.key;
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

    gFolder = MailServices.folderLookup.getFolderForURL(uri);

    document.head.querySelector(`link[rel="icon"]`).href = getFolderIcon(
      gFolder
    );

    if (gFolder.isServer) {
      document.title = gFolder.server.prettyName;
      gViewWrapper = threadTree.view = null;
      return;
    }
    document.title = `${gFolder.name} - ${gFolder.server.prettyName}`;

    gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
    gViewWrapper._viewFlags = 1;
    gViewWrapper.open(gFolder);
    threadTree.view = gViewWrapper.dbView;

    // Tell the view about the tree. nsITreeView.setTree can't be used because
    // it needs a XULTreeElement and threadTree isn't one. Strictly speaking
    // the shim passed here isn't a tree either (TreeViewListbox can't be made
    // to QI to anything) but it does implement the required methods.
    gViewWrapper.dbView.setJSTree({
      QueryInterface: ChromeUtils.generateQI(["nsIMsgJSTree"]),
      beginUpdateBatch() {},
      endUpdateBatch() {},
      ensureRowIsVisible(index) {
        threadTree.scrollToIndex(index);
      },
      invalidate() {
        threadTree.invalidate();
      },
      invalidateRange(startIndex, endIndex) {
        for (let index = startIndex; index <= endIndex; index++) {
          threadTree.invalidateRow(index);
        }
      },
      rowCountChanged(index, count) {
        threadTree.rowCountChanged(index, count);
      },
    });

    window.dispatchEvent(
      new CustomEvent("folderURIChanged", { bubbles: true, detail: uri })
    );
  });

  folderTree.addEventListener("contextmenu", event => {
    if (folderTree.selectedIndex == -1) {
      return;
    }

    folderTree.selectedIndex = folderTree.rows.indexOf(
      event.target.closest("li")
    );

    let popup = document.getElementById("folderPaneContext");
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
    event.preventDefault();
  });

  folderPaneContext.addEventListener(
    "popupshowing",
    folderPaneContextMenu.onPopupShowing
  );
  folderPaneContext.addEventListener(
    "command",
    folderPaneContextMenu.onCommand
  );

  threadTree = document.getElementById("threadTree");

  threadTree.addEventListener("select", async event => {
    if (threadTree.selectedIndex == -1) {
      displayMessage();
      return;
    }
    if (threadTree.selectedIndicies.length != 1) {
      return;
    }

    let uri = threadTree.view.getURIForViewIndex(threadTree.selectedIndex);
    if (!uri) {
      return;
    }
    displayMessage(uri);
  });

  messageBrowser = document.getElementById("messageBrowser");
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
  for (let index = 0; index < folderTree.rowCount; index++) {
    if (folderTree.rows[index].dataset.uri == folderURI) {
      folderTree.selectedIndex = index;
      return;
    }
  }
}

function displayMessage(messageURI) {
  messageBrowser.contentWindow.displayMessage(messageURI);
  messageBrowser.style.visibility = messageURI ? "visible" : null;
  if (!messageURI) {
    gMessage = null;
    gMessageURI = null;
    return;
  }

  gMessageURI = messageURI;

  let protocol = new URL(messageURI).protocol.replace(/:$/, "");
  let messageService = Cc[
    `@mozilla.org/messenger/messageservice;1?type=${protocol}`
  ].getService(Ci.nsIMsgMessageService);
  gMessage = messageService.messageURIToMsgHdr(messageURI);
}

var folderPaneContextMenu = {
  onPopupShowing(event) {
    function showItem(id, show) {
      let item = document.getElementById(id);
      if (item) {
        item.hidden = !show;
      }
    }

    function checkItem(id, checked) {
      let item = document.getElementById(id);
      if (item) {
        // Always convert truthy/falsy to boolean before string.
        item.setAttribute("checked", !!checked);
      }
    }

    let {
      canCompact,
      canCreateSubfolders,
      canRename,
      deletable,
      flags,
      isServer,
      isSpecialFolder,
      server,
      URI,
    } = gFolder;
    let isJunk = flags & Ci.nsMsgFolderFlags.Junk;
    let isTrash = isSpecialFolder(Ci.nsMsgFolderFlags.Trash, true);
    let isVirtual = flags & Ci.nsMsgFolderFlags.Virtual;
    let isRealFolder = !isServer && !isVirtual;
    let serverType = server.type;

    showItem(
      "folderPaneContext-getMessages",
      (isServer && serverType != "none") ||
        (["nntp", "rss"].includes(serverType) && !isTrash && !isVirtual)
    );
    let showPauseAll = isServer && FeedUtils.isFeedFolder(gFolder);
    showItem("folderPaneContext-pauseAllUpdates", showPauseAll);
    if (showPauseAll) {
      let optionsAcct = FeedUtils.getOptionsAcct(server);
      checkItem("folderPaneContext-pauseAllUpdates", !optionsAcct.doBiff);
    }
    let showPaused = !isServer && FeedUtils.getFeedUrlsInFolder(gFolder);
    showItem("folderPaneContext-pauseUpdates", showPaused);
    if (showPaused) {
      let properties = FeedUtils.getFolderProperties(gFolder);
      checkItem(
        "folderPaneContext-pauseUpdates",
        properties.includes("isPaused")
      );
    }

    showItem("folderPaneContext-searchMessages", !isVirtual);
    if (isVirtual) {
      showItem("folderPaneContext-subscribe", false);
    } else if (serverType == "rss" && !isTrash) {
      showItem("folderPaneContext-subscribe", true);
    } else {
      showItem(
        "folderPaneContext-subscribe",
        isServer && ["imap", "nntp"].includes(serverType)
      );
    }
    showItem(
      "folderPaneContext-newsUnsubscribe",
      isRealFolder && serverType == "nntp"
    );

    let showNewFolderItem =
      (serverType != "nntp" && canCreateSubfolders) ||
      flags & Ci.nsMsgFolderFlags.Inbox;
    showItem("folderPaneContext-new", showNewFolderItem);
    if (showNewFolderItem) {
      document
        .getElementById("folderPaneContext-new")
        .setAttribute(
          "label",
          messengerBundle.GetStringFromName(
            isServer || flags & Ci.nsMsgFolderFlags.Inbox
              ? "newFolder"
              : "newSubfolder"
          )
        );
    }
    if (isJunk) {
      showItem("folderPaneContext-remove", canRenameDeleteJunkMail(URI));
    } else {
      showItem("folderPaneContext-remove", deletable);
    }
    showItem(
      "folderPaneContext-rename",
      (!isServer && canRename && !(flags & Ci.nsMsgFolderFlags.SpecialUse)) ||
        isVirtual ||
        (isJunk && canRenameDeleteJunkMail(URI))
    );

    showItem(
      "folderPaneContext-compact",
      !isVirtual && canCompact && gFolder.isCommandEnabled("cmd_compactFolder")
    );
    showItem(
      "folderPaneContext-markMailFolderAllRead",
      isRealFolder && serverType != "nntp"
    );
    showItem(
      "folderPaneContext-markNewsgroupAllRead",
      isRealFolder && serverType == "nntp"
    );
    showItem("folderPaneContext-emptyTrash", isTrash);
    showItem("folderPaneContext-emptyJunk", isJunk);
    showItem(
      "folderPaneContext-sendUnsentMessages",
      flags & Ci.nsMsgFolderFlags.Queue
    );

    showItem("folderPaneContext-favoriteFolder", !isServer);
    if (!isServer) {
      checkItem(
        "folderPaneContext-favoriteFolder",
        flags & Ci.nsMsgFolderFlags.Favorite
      );
    }
    showItem("folderPaneContext-properties", !isServer);
    showItem("folderPaneContext-markAllFoldersRead", isServer);

    showItem("folderPaneContext-settings", isServer);

    let lastItem;
    for (let child of document.getElementById("folderPaneContext").children) {
      if (child.localName == "menuseparator") {
        child.hidden = !lastItem || lastItem.localName == "menuseparator";
      }
      if (!child.hidden) {
        lastItem = child;
      }
    }
    if (lastItem.localName == "menuseparator") {
      lastItem.hidden = true;
    }
  },

  onCommand(event) {
    let topChromeWindow = window.browsingContext.topChromeWindow;
    switch (event.target.id) {
      case "folderPaneContext-getMessages":
        topChromeWindow.MsgGetMessage();
        break;
      case "folderPaneContext-pauseAllUpdates":
        topChromeWindow.MsgPauseUpdates(
          [gFolder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-pauseUpdates":
        topChromeWindow.MsgPauseUpdates(
          [gFolder],
          event.target.getAttribute("checked") == "true"
        );
        break;
      case "folderPaneContext-openNewTab": {
        let inBackground = Services.prefs.getBoolPref(
          "mail.tabs.loadInBackground"
        );
        if (event.shiftKey) {
          inBackground = !inBackground;
        }
        topChromeWindow.MsgOpenNewTabForFolder([gFolder], inBackground);
        break;
      }
      case "folderPaneContext-openNewWindow":
        topChromeWindow.MsgOpenNewWindowForFolder(gFolder.URI, -1);
        break;
      case "folderPaneContext-searchMessages":
        topChromeWindow.gFolderTreeController.searchMessages(gFolder);
        break;
      case "folderPaneContext-subscribe":
        topChromeWindow.MsgSubscribe(gFolder);
        break;
      case "folderPaneContext-newsUnsubscribe":
        topChromeWindow.MsgUnsubscribe([gFolder]);
        break;
      case "folderPaneContext-new":
        topChromeWindow.gFolderTreeController.newFolder(gFolder);
        break;
      case "folderPaneContext-remove":
        topChromeWindow.gFolderTreeController.deleteFolder(gFolder);
        break;
      case "folderPaneContext-rename":
        topChromeWindow.gFolderTreeController.renameFolder(gFolder);
        break;
      case "folderPaneContext-compact":
        topChromeWindow.gFolderTreeController.compactFolders([gFolder]);
        break;
      case "folderPaneContext-markMailFolderAllRead":
      case "folderPaneContext-markNewsgroupAllRead":
        topChromeWindow.MsgMarkAllRead([gFolder]);
        break;
      case "folderPaneContext-emptyTrash":
        topChromeWindow.gFolderTreeController.emptyTrash(gFolder);
        break;
      case "folderPaneContext-emptyJunk":
        topChromeWindow.gFolderTreeController.emptyJunk(gFolder);
        break;
      case "folderPaneContext-sendUnsentMessages":
        topChromeWindow.SendUnsentMessages();
        break;
      case "folderPaneContext-favoriteFolder":
        gFolder.toggleFlag(Ci.nsMsgFolderFlags.Favorite);
        break;
      case "folderPaneContext-properties":
        topChromeWindow.gFolderTreeController.editFolder(undefined, gFolder);
        break;
      case "folderPaneContext-markAllFoldersRead":
        topChromeWindow.MsgMarkAllFoldersRead([gFolder]);
        break;
      case "folderPaneContext-settings":
        topChromeWindow.gFolderTreeController.editFolder(undefined, gFolder);
        break;
    }
  },
};

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
      );
    }

    this.addEventListener("contextmenu", event => {
      if (threadTree.selectedIndex == -1) {
        return;
      }

      mailContextMenu.emptyMessageContextMenu();
      let popup = document.getElementById("mailContext");
      popup.openPopupAtScreen(event.screenX, event.screenY, true);
      event.preventDefault();
    });
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;
    this.dataset.uri = this.view.getURIForViewIndex(index);
    let rowProps = this.view.getRowProperties(index);
    this.style.fontWeight = /\bunread\b/.test(rowProps) ? "bold" : null;

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

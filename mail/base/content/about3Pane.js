/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals commandController, dbViewWrapperListener, mailContextMenu
     nsMsgViewIndex_None */ // mailContext.js
/* globals goDoCommand */ // globalOverlay.js

var { DBViewWrapper } = ChromeUtils.import(
  "resource:///modules/DBViewWrapper.jsm"
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
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  GlodaSyntheticView: "resource:///modules/gloda/GlodaSyntheticView.jsm",
  MailE10SUtils: "resource:///modules/MailE10SUtils.jsm",
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gFolder, gViewWrapper, gDBView;
var folderTree,
  splitter1,
  threadTree,
  splitter2,
  webBrowser,
  messageBrowser,
  multiMessageBrowser,
  accountCentralBrowser;

window.addEventListener("DOMContentLoaded", event => {
  if (event.target != document) {
    return;
  }

  let threadTreePane = document.getElementById("threadTreePane");

  splitter1 = document.getElementById("splitter1");
  let splitter1Width = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "folderPaneBox",
    "width"
  );
  if (splitter1Width) {
    splitter1.width = splitter1Width;
  }

  splitter2 = document.getElementById("splitter2");
  let splitter2Height = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "messagepaneboxwrapper",
    "height"
  );
  if (splitter2Height) {
    splitter2.height = splitter2Height;
  }

  let splitter2Width = Services.xulStore.getValue(
    "chrome://messenger/content/messenger.xhtml",
    "messagepaneboxwrapper",
    "width"
  );
  if (splitter2Width) {
    splitter2.width = splitter2Width;
  }

  // Setting the pane config on a preference change may turn out to be a bad
  // idea now that we can have multiple tabs open. It'll do for now though.
  function setLayout(layout) {
    switch (layout) {
      case 1:
        document.body.classList.remove("layout-classic", "layout-vertical");
        document.body.classList.add("layout-wide");
        splitter2.resizeDirection = "vertical";
        break;
      case 2:
        document.body.classList.remove("layout-classic", "layout-wide");
        document.body.classList.add("layout-vertical");
        splitter2.resizeDirection = "horizontal";
        break;
      default:
        document.body.classList.remove("layout-wide", "layout-vertical");
        document.body.classList.add("layout-classic");
        splitter2.resizeDirection = "vertical";
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
  restoreState();

  splitter1.addEventListener("splitter-resized", () => {
    Services.xulStore.setValue(
      "chrome://messenger/content/messenger.xhtml",
      "folderPaneBox",
      "width",
      splitter1.width
    );
  });

  splitter2.addEventListener("splitter-resized", () => {
    if (splitter2.orientation == "vertical") {
      Services.xulStore.setValue(
        "chrome://messenger/content/messenger.xhtml",
        "messagepaneboxwrapper",
        "height",
        splitter2.height
      );
    } else {
      Services.xulStore.setValue(
        "chrome://messenger/content/messenger.xhtml",
        "messagepaneboxwrapper",
        "width",
        splitter2.width
      );
    }
  });

  splitter2.addEventListener("splitter-collapsed", () => {
    // Clear any loaded page or messages.
    clearWebPage();
    clearMessage();
    clearMessages();

    Services.xulStore.setValue(
      "chrome://messenger/content/messenger.xhtml",
      "messagepaneboxwrapper",
      "collapsed",
      true
    );
  });

  splitter2.addEventListener("splitter-expanded", () => {
    // Load the selected messages.
    threadTree.dispatchEvent(new CustomEvent("select"));

    Services.xulStore.setValue(
      "chrome://messenger/content/messenger.xhtml",
      "messagepaneboxwrapper",
      "collapsed",
      false
    );
  });

  for (let s of [splitter1, splitter2]) {
    s.addEventListener("mousedown", () =>
      document.body.classList.add("dragging")
    );
  }
  window.addEventListener("mouseup", () =>
    document.body.classList.remove("dragging")
  );

  folderTree = document.getElementById("folderTree");
  folderListener.init();

  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.all
  );

  folderTree.addEventListener("select", event => {
    clearMessage();
    let uri = folderTree.rows[folderTree.selectedIndex]?.dataset.uri;
    if (!uri) {
      return;
    }

    gFolder = MailServices.folderLookup.getFolderForURL(uri);

    document.head.querySelector(
      `link[rel="icon"]`
    ).href = FolderUtils.getFolderIcon(gFolder);

    if (gFolder.isServer) {
      document.title = gFolder.server.prettyName;
      gViewWrapper = gDBView = threadTree.view = null;

      clearWebPage();
      clearMessage();
      clearMessages();

      MailE10SUtils.loadURI(
        accountCentralBrowser,
        `chrome://messenger/content/msgAccountCentral.xhtml?folderURI=${encodeURIComponent(
          gFolder.URI
        )}`
      );
      document.body.classList.add("account-central");
      accountCentralBrowser.hidden = false;
      // Splitter now exchanges size with the account central instead of the
      // hidden thread tree.
      splitter1.oppositeElement = accountCentralBrowser;
      return;
    }
    document.title = `${gFolder.name} - ${gFolder.server.prettyName}`;
    document.body.classList.remove("account-central");
    accountCentralBrowser.hidden = true;
    // Splitter exchanges size with the thread tree.
    splitter1.oppositeElement = threadTreePane;

    gViewWrapper = new DBViewWrapper(dbViewWrapperListener);
    gViewWrapper._viewFlags = 1;
    gViewWrapper.open(gFolder);
    gDBView = gViewWrapper.dbView;

    // Tell the view about the tree. nsITreeView.setTree can't be used because
    // it needs a XULTreeElement and threadTree isn't one. Strictly speaking
    // the shim passed here isn't a tree either (TreeViewListbox can't be made
    // to QI to anything) but it does implement the required methods.
    gViewWrapper.dbView.setJSTree({
      QueryInterface: ChromeUtils.generateQI(["nsIMsgJSTree"]),
      _inBatch: false,
      beginUpdateBatch() {
        this._inBatch = true;
      },
      endUpdateBatch() {
        this._inBatch = false;
      },
      ensureRowIsVisible(index) {
        if (!this._inBatch) {
          threadTree.scrollToIndex(index);
        }
      },
      invalidate() {
        if (!this._inBatch) {
          threadTree.invalidate();
        }
      },
      invalidateRange(startIndex, endIndex) {
        if (this._inBatch) {
          return;
        }

        for (let index = startIndex; index <= endIndex; index++) {
          threadTree.invalidateRow(index);
        }
      },
      rowCountChanged(index, count) {
        if (!this._inBatch) {
          threadTree.rowCountChanged(index, count);
        }
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

  let folderPaneContext = document.getElementById("folderPaneContext");
  folderPaneContext.addEventListener(
    "popupshowing",
    folderPaneContextMenu.onPopupShowing
  );
  folderPaneContext.addEventListener(
    "command",
    folderPaneContextMenu.onCommand
  );

  threadTree = document.getElementById("threadTree");

  threadTree.addEventListener("keypress", event => {
    if (event.key != "Enter") {
      return;
    }

    if (gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Drafts, true)) {
      commandController.doCommand("cmd_editDraftMsg");
    } else if (gFolder.isSpecialFolder(Ci.nsMsgFolderFlags.Templates, true)) {
      commandController.doCommand("cmd_newMsgFromTemplate");
    } else {
      commandController.doCommand("cmd_openMessage");
    }
  });

  threadTree.addEventListener("select", async event => {
    if (splitter2.isCollapsed || !gDBView) {
      return;
    }
    clearWebPage();
    switch (gDBView.numSelected) {
      case 0:
        clearMessage();
        clearMessages();
        return;
      case 1:
        let uri = gDBView.getURIForViewIndex(threadTree.selectedIndex);
        displayMessage(uri);
        return;
      default:
        displayMessages(gDBView.getSelectedMsgHdrs());
    }
  });

  webBrowser = document.getElementById("webBrowser");
  messageBrowser = document.getElementById("messageBrowser");
  multiMessageBrowser = document.getElementById("multiMessageBrowser");
  accountCentralBrowser = document.getElementById("accountCentralBrowser");
});

window.addEventListener("unload", () => {
  MailServices.mailSession.RemoveFolderListener(folderListener);
});

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
    case "a":
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        commandController.doCommand("cmd_selectAll");
        event.preventDefault();
      }
      break;
  }
});

function restoreState({
  folderPaneVisible,
  messagePaneVisible,
  folderURI,
  first = false,
} = {}) {
  if (folderPaneVisible === undefined) {
    folderPaneVisible = true;
  }
  splitter1.isCollapsed = !folderPaneVisible;

  if (messagePaneVisible === undefined) {
    messagePaneVisible =
      Services.xulStore.getValue(
        "chrome://messenger/content/messenger.xhtml",
        "messagepaneboxwrapper",
        "collapsed"
      ) !== "true";
  }
  splitter2.isCollapsed = !messagePaneVisible;

  if (folderURI) {
    displayFolder(folderURI);
  }

  if (first && Services.prefs.getBoolPref("mailnews.start_page.enabled")) {
    commandController.doCommand("cmd_goStartPage");
  }
}

function displayFolder(folderURI) {
  let index = folderListener.getIndexForFolder(folderURI);
  if (index >= 0) {
    folderTree.selectedIndex = index;
  }
}

function clearWebPage() {
  displayWebPage();
}

function clearMessage() {
  displayMessage();
}

function clearMessages() {
  displayMessages();
}

function displayWebPage(url) {
  if (!url) {
    MailE10SUtils.loadURI(webBrowser, "about:blank");
    webBrowser.hidden = true;
    return;
  }

  clearMessage();
  clearMessages();

  MailE10SUtils.loadURI(webBrowser, url);
  webBrowser.hidden = false;
}

async function displayMessage(messageURI) {
  if (messageBrowser.contentDocument.readyState != "complete") {
    await new Promise(resolve =>
      messageBrowser.contentWindow.addEventListener("load", resolve, {
        once: true,
      })
    );
  }
  messageBrowser.contentWindow.displayMessage(messageURI);
  if (!messageURI) {
    messageBrowser.hidden = true;
    return;
  }

  clearWebPage();
  clearMessages();

  messageBrowser.hidden = false;
}

async function displayMessages(messages = []) {
  if (multiMessageBrowser.contentDocument.readyState != "complete") {
    await new Promise(r =>
      multiMessageBrowser.contentWindow.addEventListener("load", r, {
        once: true,
      })
    );
  }
  if (messages.length == 0) {
    multiMessageBrowser.hidden = true;
    multiMessageBrowser.contentWindow.gMessageSummary.clear();
    return;
  }

  clearWebPage();
  clearMessage();

  let getThreadId = function(message) {
    return gDBView.getThreadContainingMsgHdr(message).getChildHdrAt(0)
      .messageKey;
  };

  let oneThread = true;
  let firstThreadId = getThreadId(messages[0]);
  for (let i = 1; i < messages.length; i++) {
    if (getThreadId(messages[i]) != firstThreadId) {
      oneThread = false;
      break;
    }
  }

  multiMessageBrowser.contentWindow.gMessageSummary.summarize(
    oneThread ? "thread" : "multipleselection",
    messages,
    gDBView,
    function(messages) {
      threadTree.selectedIndicies = messages
        .map(m => gDBView.findIndexOfMsgHdr(m, true))
        .filter(i => i != nsMsgViewIndex_None);
    }
  );
  multiMessageBrowser.hidden = false;
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
      showItem(
        "folderPaneContext-remove",
        FolderUtils.canRenameDeleteJunkMail(URI)
      );
    } else {
      showItem("folderPaneContext-remove", deletable);
    }
    showItem(
      "folderPaneContext-rename",
      (!isServer && canRename && !(flags & Ci.nsMsgFolderFlags.SpecialUse)) ||
        isVirtual ||
        (isJunk && FolderUtils.canRenameDeleteJunkMail(URI))
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
      case "folderPaneContext-openNewTab":
        topChromeWindow.MsgOpenNewTabForFolders([gFolder], {
          event,
          folderPaneVisible: !splitter1.isCollapsed,
          messagePaneVisible: !splitter2.isCollapsed,
        });
        break;
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

var folderListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),

  init() {
    this._folderTemplate = document.getElementById("folderTemplate");
    for (let account of MailServices.accounts.accounts) {
      this._addAccount(account);
    }
  },

  _addAccount(account) {
    let accountItem = folderTree.appendChild(
      this._folderTemplate.content.firstElementChild.cloneNode(true)
    );
    accountItem.id = account.key;
    accountItem.dataset.uri = account.incomingServer.rootFolder.URI;
    accountItem.querySelector(
      ".icon"
    ).style.backgroundImage = `url("${FolderUtils.getFolderIcon(
      account.incomingServer.rootFolder
    )}")`;
    accountItem.querySelector(".name").textContent =
      account.incomingServer.prettyName;
    this._addSubFolders(account.incomingServer.rootFolder, accountItem);
  },
  _addFolder(folder, childList, before = null) {
    let folderItem = childList.insertBefore(
      this._folderTemplate.content.firstElementChild.cloneNode(true),
      before
    );
    folderItem.id = `folder-${folder.URI}`;
    folderItem.dataset.uri = folder.URI;
    folderItem.querySelector(
      ".icon"
    ).style.backgroundImage = `url("${FolderUtils.getFolderIcon(folder)}")`;
    folderItem.querySelector(".name").textContent = folder.name;
    let numUnread = folder.getNumUnread(false);
    folderItem.classList.toggle("unread", numUnread > 0);
    folderItem.querySelector(".unreadCount").textContent = numUnread;
    this._addSubFolders(folder, folderItem);
  },
  _addSubFolders(parentFolder, parentItem) {
    let subFolders = parentFolder.subFolders;
    if (!subFolders.length) {
      return;
    }

    subFolders.sort((a, b) => a.compareSortKeys(b));

    let childList = parentItem.appendChild(document.createElement("ul"));
    childList.style.setProperty(
      "--depth",
      parseInt(getComputedStyle(parentItem).getPropertyValue("--depth"), 10) + 1
    );
    for (let folder of subFolders) {
      this._addFolder(folder, childList);
    }
  },

  getIndexForFolder(folderOrURI) {
    if (folderOrURI instanceof Ci.nsIMsgFolder) {
      folderOrURI = folderOrURI.URI;
    }
    return folderTree.rows.findIndex(row => row.dataset.uri == folderOrURI);
  },
  getRowForFolder(folderOrURI) {
    if (folderOrURI instanceof Ci.nsIMsgFolder) {
      folderOrURI = folderOrURI.URI;
    }
    return folderTree.rows.find(row => row.dataset.uri == folderOrURI);
  },

  onFolderAdded(parentFolder, childFolder) {
    if (!parentFolder) {
      let account = MailServices.accounts.FindAccountForServer(
        childFolder.server
      );
      this._addAccount(account, false);
      return;
    }

    let parentRow = this.getRowForFolder(parentFolder);
    if (!parentRow) {
      return;
    }

    let childList = parentRow.querySelector("ul");
    if (!childList) {
      childList = parentRow.appendChild(document.createElement("ul"));
      childList.style.setProperty(
        "--depth",
        parseInt(getComputedStyle(parentRow).getPropertyValue("--depth"), 10) +
          1
      );
    }

    for (let row of childList.children) {
      let rowFolder = MailServices.folderLookup.getFolderForURL(
        row.dataset.uri
      );
      if (childFolder.compareSortKeys(rowFolder) < 0) {
        this._addFolder(childFolder, childList, row);
        return;
      }
    }

    this._addFolder(childFolder, childList);
  },
  onMessageAdded(parentFolder, msg) {},
  onFolderRemoved(parentFolder, childFolder) {
    let row = folderListener.getRowForFolder(childFolder);
    if (row) {
      row.remove();
    }
  },
  onMessageRemoved(parentFolder, msg) {},
  onFolderPropertyChanged(item, property, oldValue, newValue) {},
  onFolderIntPropertyChanged(item, property, oldValue, newValue) {
    if (property == "TotalUnreadMessages") {
      let folderItem = document.getElementById(`folder-${item.URI}`);
      if (folderItem) {
        folderItem.classList.toggle("unread", newValue > 0);
        folderItem.querySelector(".unreadCount").textContent = newValue;
      }
    }
  },
  onFolderBoolPropertyChanged(item, property, oldValue, newValue) {},
  onFolderUnicharPropertyChanged(item, property, oldValue, newValue) {},
  onFolderPropertyFlagChanged(item, property, oldFlag, newFlag) {},
  onFolderEvent(folder, event) {},
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

commandController.registerCallback("cmd_viewClassicMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 0)
);
commandController.registerCallback("cmd_viewWideMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 1)
);
commandController.registerCallback("cmd_viewVerticalMailLayout", () =>
  Services.prefs.setIntPref("mail.pane_config.dynamic", 2)
);
commandController.registerCallback("cmd_toggleFolderPane", () => {
  splitter1.isCollapsed = !splitter1.isCollapsed;
});
commandController.registerCallback("cmd_toggleMessagePane", () => {
  splitter2.isCollapsed = !splitter2.isCollapsed;
});

function restoreThreadState() {
  if (
    gViewWrapper._threadExpandAll &&
    !(gViewWrapper.dbView.viewFlags & Ci.nsMsgViewFlagsType.kExpandAll)
  ) {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.expandAll);
  }
  if (
    !gViewWrapper._threadExpandAll &&
    gViewWrapper.dbView.viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
  ) {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
  }
}

var _savedSelection;
function saveSelection() {
  _savedSelection = threadTree.selectedIndicies.map(gDBView.getKeyAt);
}

function restoreSelection() {
  threadTree.selectedIndicies = _savedSelection
    .map(gDBView.findIndexFromKey)
    .filter(i => i != nsMsgViewIndex_None);
  _savedSelection = null;
}

commandController.registerCallback(
  "cmd_selectAll",
  () => {
    gDBView.selection.selectAll();
  },
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_selectThread",
  () => {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectThread);
  },
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_selectFlagged",
  () => {
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.selectFlagged);
  },
  () => !!gViewWrapper
);

var sortController = {
  handleCommand(event) {
    switch (event.target.value) {
      case "ascending":
        this.sortAscending();
        break;
      case "descending":
        this.sortDescending();
        break;
      case "threaded":
        this.sortThreaded();
        break;
      case "unthreaded":
        this.sortUnthreaded();
        break;
      case "group":
        this.groupBySort();
        break;
      default:
        if (event.target.value in Ci.nsMsgViewSortType) {
          this.sortThreadPane(event.target.value);
        }
        break;
    }
  },
  sortByThread() {
    gViewWrapper.showThreaded = true;
    this.sortThreadPane("byDate");
  },
  sortThreadPane(sortName) {
    let sortType = Ci.nsMsgViewSortType[sortName];
    let grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    if (!grouped) {
      gViewWrapper.sort(sortType, Ci.nsMsgViewSortOrder.ascending);
      // Respect user's last expandAll/collapseAll choice, post sort direction change.
      restoreThreadState();
      return;
    }

    // legacy behavior dictates we un-group-by-sort if we were.  this probably
    //  deserves a UX call...

    // For non virtual folders, do not ungroup (which sorts by the going away
    // sort) and then sort, as it's a double sort.
    // For virtual folders, which are rebuilt in the backend in a grouped
    // change, create a new view upfront rather than applying viewFlags. There
    // are oddities just applying viewFlags, for example changing out of a
    // custom column grouped xfvf view with the threads collapsed works (doesn't)
    // differently than other variations.
    // So, first set the desired sortType and sortOrder, then set viewFlags in
    // batch mode, then apply it all (open a new view) with endViewUpdate().
    gViewWrapper.beginViewUpdate();
    gViewWrapper._sort = [[sortType, Ci.nsMsgViewSortOrder.ascending]];
    gViewWrapper.showGroupedBySort = false;
    gViewWrapper.endViewUpdate();

    // Virtual folders don't persist viewFlags well in the back end,
    // due to a virtual folder being either 'real' or synthetic, so make
    // sure it's done here.
    if (gViewWrapper.isVirtual) {
      gViewWrapper.dbView.viewFlags = gViewWrapper.viewFlags;
    }
  },
  reverseSortThreadPane() {
    let grouped = gViewWrapper.showGroupedBySort;
    gViewWrapper._threadExpandAll = Boolean(
      gViewWrapper._viewFlags & Ci.nsMsgViewFlagsType.kExpandAll
    );

    // Grouped By view is special for column click sort direction changes.
    if (grouped) {
      if (gDBView.selection.count) {
        saveSelection();
      }

      if (gViewWrapper.isSingleFolder) {
        if (gViewWrapper.isVirtual) {
          gViewWrapper.showGroupedBySort = false;
        } else {
          // Must ensure rows are collapsed and kExpandAll is unset.
          gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
        }
      }
    }

    if (gViewWrapper.isSortedAscending) {
      gViewWrapper.sortDescending();
    } else {
      gViewWrapper.sortAscending();
    }

    // Restore Grouped By state post sort direction change.
    if (grouped) {
      if (gViewWrapper.isVirtual && gViewWrapper.isSingleFolder) {
        this.groupBySort();
      }

      // Restore Grouped By selection post sort direction change.
      restoreSelection();
    }

    // Respect user's last expandAll/collapseAll choice, for both threaded and grouped
    // views, post sort direction change.
    restoreThreadState();
  },
  toggleThreaded() {
    if (gViewWrapper.showThreaded) {
      gViewWrapper.showUnthreaded = true;
    } else {
      gViewWrapper.showThreaded = true;
    }
  },
  sortThreaded() {
    gViewWrapper.showThreaded = true;
  },
  groupBySort() {
    gViewWrapper.showGroupedBySort = true;
  },
  sortUnthreaded() {
    gViewWrapper.showUnthreaded = true;
  },
  sortAscending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedDescending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    gViewWrapper.sortAscending();
  },
  sortDescending() {
    if (gViewWrapper.showGroupedBySort && gViewWrapper.isSingleFolder) {
      if (gViewWrapper.isSortedAscending) {
        this.reverseSortThreadPane();
      }
      return;
    }

    gViewWrapper.sortDescending();
  },
};

commandController.registerCallback(
  "cmd_sort",
  event => sortController.handleCommand(event),
  () => !!gViewWrapper
);

commandController.registerCallback(
  "cmd_expandAllThreads",
  () => {
    saveSelection();
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    restoreSelection();
  },
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_collapseAllThreads",
  () => {
    saveSelection();
    gViewWrapper.dbView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    // TODO: this reopens threads containing a selected message.
    restoreSelection();
  },
  () => !!gViewWrapper
);

function SwitchView(command) {
  // when switching thread views, we might be coming out of quick search
  // or a message view.
  // first set view picker to all
  if (gViewWrapper.mailViewIndex != 0) {
    // MailViewConstants.kViewItemAll
    gViewWrapper.setMailView(0);
  }

  switch (command) {
    // "All" threads and "Unread" threads don't change threading state
    case "cmd_viewAllMsgs":
      gViewWrapper.showUnreadOnly = false;
      break;
    case "cmd_viewUnreadMsgs":
      gViewWrapper.showUnreadOnly = true;
      break;
    // "Threads with Unread" and "Watched Threads with Unread" force threading
    case "cmd_viewWatchedThreadsWithUnread":
      gViewWrapper.specialViewWatchedThreadsWithUnread = true;
      break;
    case "cmd_viewThreadsWithUnread":
      gViewWrapper.specialViewThreadsWithUnread = true;
      break;
    // "Ignored Threads" toggles 'ignored' inclusion --
    //   but it also resets 'With Unread' views to 'All'
    case "cmd_viewIgnoredThreads":
      gViewWrapper.showIgnored = !gViewWrapper.showIgnored;
      break;
  }
}

commandController.registerCallback(
  "cmd_viewAllMsgs",
  () => SwitchView("cmd_viewAllMsgs"),
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_viewThreadsWithUnread",
  () => SwitchView("cmd_viewThreadsWithUnread"),
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_viewWatchedThreadsWithUnread",
  () => SwitchView("cmd_viewWatchedThreadsWithUnread"),
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_viewUnreadMsgs",
  () => SwitchView("cmd_viewUnreadMsgs"),
  () => !!gViewWrapper
);
commandController.registerCallback(
  "cmd_viewIgnoredThreads",
  () => SwitchView("cmd_viewIgnoredThreads"),
  () => !!gViewWrapper
);

commandController.registerCallback("cmd_goStartPage", () =>
  displayWebPage(Services.urlFormatter.formatURLPref("mailnews.start_page.url"))
);

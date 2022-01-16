/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals commandController, dbViewWrapperListener, mailContextMenu */ // mailContext.js
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
});

const messengerBundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);

var gFolder, gViewWrapper, gDBView;
var folderTree, splitter1, threadTree, splitter2, messageBrowser;

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
      ).style.backgroundImage = `url("${FolderUtils.getFolderIcon(folder)}")`;
      folderItem.querySelector(".name").textContent = folder.name;
      addSubFolders(folder, folderItem);
    }
  }

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
    displayMessage();

    Services.xulStore.setValue(
      "chrome://messenger/content/messenger.xhtml",
      "messagepaneboxwrapper",
      "collapsed",
      true
    );
  });

  splitter2.addEventListener("splitter-expanded", () => {
    if (threadTree.view?.selection.count == 1) {
      let uri = threadTree.view.getURIForViewIndex(threadTree.selectedIndex);
      if (!uri) {
        return;
      }
      displayMessage(uri);
    }

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
    ).style.backgroundImage = `url("${FolderUtils.getFolderIcon(
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

    document.head.querySelector(
      `link[rel="icon"]`
    ).href = FolderUtils.getFolderIcon(gFolder);

    if (gFolder.isServer) {
      document.title = gFolder.server.prettyName;
      gViewWrapper = gDBView = threadTree.view = null;
      return;
    }
    document.title = `${gFolder.name} - ${gFolder.server.prettyName}`;

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
    if (splitter2.isCollapsed) {
      return;
    }
    if (threadTree.view.selection.count != 1) {
      displayMessage();
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
}

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
    .filter(i => i != 0xffffffff); // nsMsgViewIndex_None
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

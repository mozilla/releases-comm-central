/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals msgWindow, nsMsgStatusFeedback */ // From mailWindow.js

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { TreeDataAdapter, TreeDataRow } = ChromeUtils.importESModule(
  "chrome://messenger/content/TreeDataAdapter.mjs",
  { global: "current" }
);
var { UIFontSize } = ChromeUtils.importESModule(
  "resource:///modules/UIFontSize.sys.mjs"
);

var gSubscribeTree = null;
var okCallback = null;
var gServerURI = null;
var gSubscribableServer = null;
var gNameField = null;
var gStatusFeedback;
var gSubscribeBundle;

window.addEventListener("load", SubscribeOnLoad);
window.addEventListener("unload", SubscribeOnUnload);

document.addEventListener("dialogaccept", subscribeOK);
document.addEventListener("dialogcancel", subscribeCancel);

function Stop() {
  if (gSubscribableServer) {
    gSubscribableServer.stopPopulating(msgWindow);
  }
}

function SetServerTypeSpecificTextValues() {
  if (!gServerURI) {
    return;
  }

  const serverType = MailUtils.getExistingFolder(gServerURI).server.type;

  // Set the server specific ui elements.
  const subscribeLabelString = gSubscribeBundle.getString(
    "subscribeLabel-" + serverType
  );
  const currentListTab = "currentListTab-" + serverType;
  const currentListTabLabel = gSubscribeBundle.getString(
    currentListTab + ".label"
  );
  const currentListTabAccesskey = gSubscribeBundle.getString(
    currentListTab + ".accesskey"
  );

  document
    .getElementById("currentListTab")
    .setAttribute("label", currentListTabLabel);
  document
    .getElementById("currentListTab")
    .setAttribute("accesskey", currentListTabAccesskey);
  document.getElementById("newGroupsTab").collapsed = serverType != "nntp"; // show newGroupsTab only for nntp servers
  document
    .getElementById("subscribeLabel")
    .setAttribute("value", subscribeLabelString);
}

function onServerClick(aFolder) {
  gServerURI = aFolder.server.serverURI;
  const serverMenu = document.getElementById("serverMenu");
  serverMenu.menupopup.selectFolder(aFolder);

  SetServerTypeSpecificTextValues();
  ShowCurrentList();
}

var MySubscribeListener = {
  async OnDonePopulating() {
    MailServices.feedback.reportStatus("", "stop-meteors");
    document.getElementById("stopButton").disabled = true;
    document.getElementById("refreshButton").disabled = false;
    document.getElementById("currentListTab").disabled = false;
    document.getElementById("newGroupsTab").disabled = false;
    gSubscribableServer.subscribeListener = null;
    await customElements.whenDefined("checkbox-tree-table-row");
    gSubscribeTree.view = new SubscribeDataAdapter();
  },
};

function SetUpTree(forceToServer, getOnlyNew) {
  if (!gServerURI) {
    return;
  }

  var server = MailUtils.getExistingFolder(gServerURI).server;
  try {
    gSubscribableServer = server.QueryInterface(Ci.nsISubscribableServer);

    SetServerTypeSpecificTextValues();

    // Clear out the text field when switching server.
    gNameField.value = "";

    gSubscribableServer.subscribeListener = MySubscribeListener;

    document.getElementById("currentListTab").disabled = true;
    document.getElementById("newGroupsTab").disabled = true;
    document.getElementById("refreshButton").disabled = true;

    MailServices.feedback.reportStatus(
      gSubscribeBundle.getString("pleaseWaitString"),
      "start-meteors"
    );
    document.getElementById("stopButton").disabled = false;

    gSubscribableServer.startPopulating(msgWindow, forceToServer, getOnlyNew);
  } catch (e) {
    if (e.result == 0x80550014) {
      // NS_MSG_ERROR_OFFLINE
      MailServices.feedback.reportStatus(
        gSubscribeBundle.getString("offlineState"),
        "stop-meteors"
      );
    } else {
      console.error("Failed to populate subscribe tree", e);
      MailServices.feedback.reportStatus(
        gSubscribeBundle.getString("errorPopulating"),
        "stop-meteors"
      );
    }
    Stop();
  }
}

function SubscribeOnUnload() {
  msgWindow.closeWindow();
  gStatusFeedback = null;
  gSubscribableServer = null;
}

function SubscribeOnLoad() {
  UIFontSize.registerWindow(window);
  gSubscribeBundle = document.getElementById("bundle_subscribe");

  gSubscribeTree = document.getElementById("subscribeTree");
  gSubscribeTree.setAttribute("rows", "checkbox-tree-table-row");
  gSubscribeTree.headerHidden = true;
  gNameField = document.getElementById("namefield");

  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  msgWindow.domWindow = window;
  gStatusFeedback = new nsMsgStatusFeedback();
  msgWindow.rootDocShell.allowAuth = true;

  // look in arguments[0] for parameters
  if (window.arguments && window.arguments[0]) {
    if (window.arguments[0].okCallback) {
      top.okCallback = window.arguments[0].okCallback;
    }
  }

  var serverMenu = document.getElementById("serverMenu");

  gServerURI = null;
  const folder =
    "folder" in window.arguments[0] ? window.arguments[0].folder : null;
  if (folder && folder.server instanceof Ci.nsISubscribableServer) {
    serverMenu.menupopup.selectFolder(folder.server.rootMsgFolder);
    try {
      gSubscribableServer = folder.server.QueryInterface(
        Ci.nsISubscribableServer
      );
      gServerURI = folder.server.serverURI;
    } catch (ex) {
      // dump("not a subscribable server\n");
      gSubscribableServer = null;
      gServerURI = null;
    }
  }

  if (!gServerURI) {
    // dump("subscribe: no uri\n");
    // dump("xxx todo:  use the default news server.  right now, I'm just using the first server\n");

    serverMenu.selectedIndex = 0;

    if (serverMenu.selectedItem) {
      // if we didn't get a gServerURI, yet (maybe by opening this window from calendar tab)
      // grab it from the selected item
      gServerURI = serverMenu.selectedItem._folder?.server.serverURI;
    } else {
      // dump("xxx todo none of your servers are subscribable\n");
      // dump("xxx todo fix this by disabling subscribe if no subscribable server or, add a CREATE SERVER button, like in 4.x\n");
      return;
    }
  }

  ShowCurrentList();

  SetServerTypeSpecificTextValues();

  gNameField.focus();
}

function subscribeOK() {
  const changes = {};
  function collectChanges(row) {
    if (row.hasProperty("checked")) {
      if (!row.hasProperty("wasChecked")) {
        changes[row.childPath] = true;
      }
    } else if (row.hasProperty("wasChecked")) {
      changes[row.childPath] = false;
    }

    for (const childRow of row.children) {
      collectChanges(childRow);
    }
  }

  for (const topRow of gSubscribeTree.view._allRowMap) {
    collectChanges(topRow);
  }

  if (top.okCallback) {
    top.okCallback({ [gServerURI]: changes });
  }
  Stop();
  if (gSubscribableServer) {
    gSubscribableServer.subscribeCleanup();
  }
}

function subscribeCancel() {
  Stop();
  if (gSubscribableServer) {
    gSubscribableServer.subscribeCleanup();
  }
}

function Refresh() {
  // Clear out the textfield's entry.
  gNameField.value = "";

  var newGroupsTab = document.getElementById("newGroupsTab");
  SetUpTree(true, newGroupsTab.selected);
}

function ShowCurrentList() {
  // Clear out the textfield's entry on call of Refresh().
  gNameField.value = "";

  // Make sure the current list tab is selected.
  document.getElementById("subscribeTabs").selectedIndex = 0;

  // Try loading the hostinfo before talk to server.
  SetUpTree(false, false);
}

function ShowNewGroupsList() {
  // Clear out the textfield's entry.
  gNameField.value = "";

  // Make sure the new groups tab is selected.
  document.getElementById("subscribeTabs").selectedIndex = 1;

  // Force it to talk to the server and get new groups.
  SetUpTree(true, true);
}

function Search() {
  gSubscribeTree.view.filter(gNameField.value);
}

class SubscribeDataAdapter extends TreeDataAdapter {
  /**
   * Segmenter for splitting filter strings into tokens.
   *
   * @type {Intl.Segmenter}
   */
  static #segmenter = null;

  constructor() {
    super();
    this._rowMap = this.getChildren(null);
    this._allRowMap = this._rowMap.slice();
  }

  /**
   * Build the hierarchy by adding the children of `path` recursively.
   *
   * @param {string|null} path
   */
  getChildren(path) {
    const rows = [];
    for (const childPath of gSubscribableServer.getChildURIs(path)) {
      const row = new TreeDataRow({
        name: gSubscribableServer.getLeafName(childPath),
      });
      row.childPath = childPath;
      if (gSubscribableServer.type == "nntp") {
        row.addProperty("folder-type-news");
      }
      if (gSubscribableServer.isSubscribable(childPath)) {
        if (gSubscribableServer.isSubscribed(childPath)) {
          row.addProperty("checked");
          row.addProperty("wasChecked");
        }
      } else {
        row.addProperty("noselect");
        row.addProperty("uncheckable");
      }
      if (gSubscribableServer.hasChildren(childPath)) {
        row.open = true;
        row.children = this.getChildren(childPath);
      }
      rows.push(row);
    }
    return rows;
  }

  /**
   * Swap the tree hierarchy for a flat list of rows that match `value`.
   *
   * @param {string} value - A user-provided string to match against. This is
   *   treated as a space-separated list of tokens, and rows to display must
   *   match all of the tokens. If there's no tokens (i.e. the value is empty
   *   or all white space), displaying all rows is restored.
   */
  filter(value) {
    const oldCount = this.rowCount;
    this._rowMap.length = 0;
    this._clearFlatRowCache();
    this._tree?.rowCountChanged(0, -oldCount);

    if (!SubscribeDataAdapter.#segmenter) {
      SubscribeDataAdapter.#segmenter = new Intl.Segmenter(undefined, {
        granularity: "word",
      });
    }
    const tokens = [...SubscribeDataAdapter.#segmenter.segment(value)]
      .filter(s => s.isWordLike)
      .map(s => s.segment);
    if (tokens.length > 0) {
      const filterRow = row => {
        const name = row.texts.name.normalize();
        if (
          !row.hasProperty("uncheckable") &&
          tokens.every(token => name.includes(token))
        ) {
          this._rowMap.push(
            new TreeDataRow(row.texts, row.values, row.properties)
          );
        }
        for (const childRow of row.children) {
          filterRow(childRow);
        }
      };
      for (const topRow of this._allRowMap) {
        filterRow(topRow);
      }
    } else {
      this._rowMap = this._allRowMap.slice();
    }
    this._clearFlatRowCache();
    this._tree?.rowCountChanged(0, this.rowCount);
  }
}

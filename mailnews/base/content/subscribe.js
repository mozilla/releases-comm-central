/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals msgWindow, nsMsgStatusFeedback */ // From mailWindow.js

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var gSubscribeTree = null;
var gSubscribeBody = null;
var okCallback = null;
var gChangeTable = {};
var gServerURI = null;
var gSubscribableServer = null;
var gNameField = null;
var gNameFieldLabel = null;
var gStatusFeedback;
var gSearchView = null;
var gSearchTree = null;
var gSubscribeBundle;

window.addEventListener("DOMContentLoaded", SubscribeOnLoad);
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
  OnDonePopulating() {
    gStatusFeedback._stopMeteors();
    document.getElementById("stopButton").disabled = true;
    document.getElementById("refreshButton").disabled = false;
    document.getElementById("currentListTab").disabled = false;
    document.getElementById("newGroupsTab").disabled = false;
    gSubscribableServer.subscribeListener = null;
  },
};

function SetUpTree(forceToServer, getOnlyNew) {
  if (!gServerURI) {
    return;
  }

  var server = MailUtils.getExistingFolder(gServerURI).server;
  try {
    CleanUpSearchView();
    gSubscribableServer = server.QueryInterface(Ci.nsISubscribableServer);

    // Enable (or disable) the search related UI.
    EnableSearchUI();

    // Clear out the text field when switching server.
    gNameField.value = "";

    // Since there is no text, switch to the Subscription view.
    toggleSubscriptionView(false);

    gSubscribeTree.view = gSubscribableServer.folderView;
    gSubscribableServer.subscribeListener = MySubscribeListener;

    document.getElementById("currentListTab").disabled = true;
    document.getElementById("newGroupsTab").disabled = true;
    document.getElementById("refreshButton").disabled = true;

    gStatusFeedback._startMeteors();
    gStatusFeedback.setStatusString("");
    gStatusFeedback.showStatusString(
      gSubscribeBundle.getString("pleaseWaitString")
    );
    document.getElementById("stopButton").disabled = false;

    gSubscribableServer.startPopulating(msgWindow, forceToServer, getOnlyNew);
  } catch (e) {
    if (e.result == 0x80550014) {
      // NS_MSG_ERROR_OFFLINE
      gStatusFeedback.setStatusString(
        gSubscribeBundle.getString("offlineState")
      );
    } else {
      console.error("Failed to populate subscribe tree: ", e);
      gStatusFeedback.setStatusString(
        gSubscribeBundle.getString("errorPopulating")
      );
    }
    Stop();
  }
}

function SubscribeOnUnload() {
  try {
    CleanUpSearchView();
  } catch (ex) {
    dump("Failed to remove the subscribe tree: " + ex + "\n");
  }

  msgWindow.closeWindow();
}

function EnableSearchUI() {
  if (gSubscribableServer.supportsSubscribeSearch) {
    gNameField.removeAttribute("disabled");
    gNameFieldLabel.removeAttribute("disabled");
  } else {
    gNameField.setAttribute("disabled", true);
    gNameFieldLabel.setAttribute("disabled", true);
  }
}

function SubscribeOnLoad() {
  gSubscribeBundle = document.getElementById("bundle_subscribe");

  gSubscribeTree = document.getElementById("subscribeTree");
  gSubscribeBody = document.getElementById("subscribeTreeBody");
  gSearchTree = document.getElementById("searchTree");
  gSearchTree = document.getElementById("searchTree");
  gNameField = document.getElementById("namefield");
  gNameFieldLabel = document.getElementById("namefieldlabel");

  // eslint-disable-next-line no-global-assign
  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
    Ci.nsIMsgWindow
  );
  msgWindow.domWindow = window;
  gStatusFeedback = new nsMsgStatusFeedback();
  msgWindow.statusFeedback = gStatusFeedback;
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
      CleanUpSearchView();
      gSubscribableServer = folder.server.QueryInterface(
        Ci.nsISubscribableServer
      );
      // Enable (or disable) the search related UI.
      EnableSearchUI();
      gServerURI = folder.server.serverURI;
    } catch (ex) {
      // dump("not a subscribable server\n");
      CleanUpSearchView();
      gSubscribableServer = null;
      gServerURI = null;
    }
  }

  if (!gServerURI) {
    // dump("subscribe: no uri\n");
    // dump("xxx todo:  use the default news server.  right now, I'm just using the first server\n");

    serverMenu.selectedIndex = 0;

    if (serverMenu.selectedItem) {
      gServerURI = serverMenu.selectedItem.getAttribute("id");
    } else {
      // dump("xxx todo none of your servers are subscribable\n");
      // dump("xxx todo fix this by disabling subscribe if no subscribable server or, add a CREATE SERVER button, like in 4.x\n");
      return;
    }
  }

  SetServerTypeSpecificTextValues();

  ShowCurrentList();

  gNameField.focus();
}

function subscribeOK() {
  if (top.okCallback) {
    top.okCallback(top.gChangeTable);
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

function SetState(name, state) {
  var changed = gSubscribableServer.setState(name, state);
  if (changed) {
    StateChanged(name, state);
  }
}

function StateChanged(name, state) {
  if (gServerURI in gChangeTable) {
    if (name in gChangeTable[gServerURI]) {
      var oldValue = gChangeTable[gServerURI][name];
      if (oldValue != state) {
        delete gChangeTable[gServerURI][name];
      }
    } else {
      gChangeTable[gServerURI][name] = state;
    }
  } else {
    gChangeTable[gServerURI] = {};
    gChangeTable[gServerURI][name] = state;
  }
}

function SearchOnClick(event) {
  // We only care about button 0 (left click) events.
  if (event.button != 0 || event.target.localName != "treechildren") {
    return;
  }

  const treeCellInfo = gSearchTree.getCellAt(event.clientX, event.clientY);
  if (treeCellInfo.row == -1 || treeCellInfo.row > gSearchView.rowCount - 1) {
    return;
  }

  if (treeCellInfo.col.id == "subscribedColumn2") {
    if (event.detail != 2) {
      // Single clicked on the check box
      // (in the "subscribedColumn2" column) reverse state.
      // If double click, do nothing.
      ReverseStateFromRow(treeCellInfo.row);
    }
  } else if (event.detail == 2) {
    // Double clicked on a row, reverse state.
    ReverseStateFromRow(treeCellInfo.row);
  }

  // Invalidate the row.
  InvalidateSearchTreeRow(treeCellInfo.row);
}

function ReverseStateFromRow(aRow) {
  // To determine if the row is subscribed or not,
  // we get the properties for the "subscribedColumn2" cell in the row
  // and look for the "subscribed" property.
  // If the "subscribed" string is in the list of properties
  // we are subscribed.
  const col = gSearchTree.columns.nameColumn2;
  const name = gSearchView.getCellValue(aRow, col);
  const isSubscribed = gSubscribableServer.isSubscribed(name);
  SetStateFromRow(aRow, !isSubscribed);
}

function SetStateFromRow(row, state) {
  var col = gSearchTree.columns.nameColumn2;
  var name = gSearchView.getCellValue(row, col);
  SetState(name, state);
}

function ReverseStateFromNode(row) {
  const name = gSubscribeTree.view.getCellValue(
    row,
    gSubscribeTree.columns.nameColumn
  );
  SetState(name, !gSubscribableServer.isSubscribed(name), row);
}

function SubscribeOnClick(event) {
  // We only care about button 0 (left click) events.
  if (event.button != 0 || event.target.localName != "treechildren") {
    return;
  }

  const treeCellInfo = gSubscribeTree.getCellAt(event.clientX, event.clientY);
  if (
    treeCellInfo.row == -1 ||
    treeCellInfo.row > gSubscribeTree.view.rowCount - 1
  ) {
    return;
  }

  if (event.detail == 2) {
    // Only toggle subscribed state when double clicking something
    // that isn't a container.
    if (!gSubscribeTree.view.isContainer(treeCellInfo.row)) {
      ReverseStateFromNode(treeCellInfo.row);
    }
  } else if (event.detail == 1) {
    // If the user single clicks on the subscribe check box, we handle it here.
    if (treeCellInfo.col.id == "subscribedColumn") {
      ReverseStateFromNode(treeCellInfo.row);
    }
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

function InvalidateSearchTreeRow(row) {
  gSearchTree.invalidateRow(row);
}

function InvalidateSearchTree() {
  gSearchTree.invalidate();
}

/**
 * Toggle the tree panel in the dialog between search view and subscribe view.
 *
 * @param {boolean} toggle - If true, show the search view else show the
 *  subscribe view.
 */
function toggleSubscriptionView(toggle) {
  document.getElementById("subscribeView").hidden = toggle;
  document.getElementById("searchView").hidden = !toggle;
}

function Search() {
  const searchValue = gNameField.value;
  if (
    searchValue.length &&
    gSubscribableServer &&
    gSubscribableServer.supportsSubscribeSearch
  ) {
    toggleSubscriptionView(true);
    gSubscribableServer.setSearchValue(searchValue);

    if (!gSearchView && gSubscribableServer) {
      gSearchView = gSubscribableServer.QueryInterface(Ci.nsITreeView);
      gSearchView.selection = null;
      gSearchTree.view = gSearchView;
    }
    return;
  }
  toggleSubscriptionView(false);
}

function CleanUpSearchView() {
  if (gSearchView) {
    gSearchView.selection = null;
    gSearchView = null;
  }
}

function onSearchTreeKeyPress(event) {
  // For now, only do something on space key.
  if (event.charCode != KeyEvent.DOM_VK_SPACE) {
    return;
  }

  var treeSelection = gSearchView.selection;
  for (let i = 0; i < treeSelection.getRangeCount(); i++) {
    var start = {},
      end = {};
    treeSelection.getRangeAt(i, start, end);
    for (let k = start.value; k <= end.value; k++) {
      ReverseStateFromRow(k);
    }

    // Force a repaint.
    InvalidateSearchTree();
  }
}

function onSubscribeTreeKeyPress(event) {
  // For now, only do something on space key.
  if (event.charCode != KeyEvent.DOM_VK_SPACE) {
    return;
  }

  var treeSelection = gSubscribeTree.view.selection;
  for (let i = 0; i < treeSelection.getRangeCount(); i++) {
    var start = {},
      end = {};
    treeSelection.getRangeAt(i, start, end);
    for (let k = start.value; k <= end.value; k++) {
      ReverseStateFromNode(k);
    }
  }
}

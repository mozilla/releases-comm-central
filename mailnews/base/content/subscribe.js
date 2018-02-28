/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource:///modules/MailUtils.js");
ChromeUtils.import("resource:///modules/iteratorUtils.jsm");

var gSubscribeTree = null;
var gSubscribeBody = null;
var gSearchTree;
var okCallback = null;
var gChangeTable = {};
var gServerURI = null;
var gSubscribableServer = null;
var gNameField = null;
var gNameFieldLabel = null;
var gFolderDelimiter = ".";
var gStatusFeedback;
var gSubscribeDeck = null;
var gSearchView = null;
var gSearchTreeBoxObject = null;
var gItemsFound = new Map();
var gSubscribeBundle;

function goDoCommand()
{
}

function Stop()
{
  //dump("Stop()\n")
  if (gSubscribableServer) {
    gSubscribableServer.stopPopulating(msgWindow);
  }
}

function SetServerTypeSpecificTextValues()
{
  if (!gServerURI)
    return;

  let serverType = MailUtils.getFolderForURI(gServerURI, true).server.type;

  // set the server specific ui elements
  let subscribeLabelString = gSubscribeBundle.getString("subscribeLabel-" + serverType);
  let currentListTab  = "currentListTab-" + serverType;
  let currentListTabLabel     = gSubscribeBundle.getString(currentListTab + ".label");
  let currentListTabAccesskey = gSubscribeBundle.getString(currentListTab + ".accesskey");

  document.getElementById("currentListTab").setAttribute("label", currentListTabLabel);
  document.getElementById("currentListTab").setAttribute("accesskey", currentListTabAccesskey);
  document.getElementById("newGroupsTab").collapsed = (serverType != "nntp"); // show newGroupsTab only for nntp servers
  document.getElementById("subscribeLabel").setAttribute("value", subscribeLabelString);

  // XXX this isn't used right now.
  //set the delimiter
  try {
    gFolderDelimiter = gSubscribableServer.delimiter;
  }
  catch (ex) {
    //dump(ex + "\n");
    gFolderDelimiter = ".";
  }
}

function onServerClick(aFolder)
{
  gServerURI = aFolder.server.serverURI;
  let serverMenu = document.getElementById("serverMenu");
  serverMenu.menupopup.selectFolder(aFolder);

  SetServerTypeSpecificTextValues();
  ShowCurrentList();
}

var MySubscribeListener = {
  OnItemDiscovered: function(aPath, aSubscribable) {
    if (!gItemsFound.has(aPath))
      gItemsFound.set(aPath, gSubscribableServer.getLeafName(aPath));
  },

  OnDonePopulating: function() {
    createSubscribeTree();
    gStatusFeedback._stopMeteors();
    document.getElementById("stopButton").disabled = true;

// XXX what does this do? Is this needed without RDF/template?
    // Only re-root the tree, if it is null.
    // Otherwise, we are in here because we are populating a part of the tree.
/*    let refValue = gSubscribeTree.getAttribute('ref');
    if (!refValue) {
      //dump("root subscribe tree at: "+ gServerURI +"\n");
      gSubscribeTree.database.AddDataSource(subscribeDS);
      gSubscribeTree.setAttribute('ref',gServerURI);
    }
*/

    document.getElementById("refreshButton").disabled = false;
    document.getElementById("currentListTab").disabled = false;
    document.getElementById("newGroupsTab").disabled = false;
  }
};

function setSubscribableCellState(aSubscribeCell, aSubscribed, aSubscribable) {
  aSubscribeCell.setAttribute("properties", "subscribed-" + aSubscribed +
                                            " subscribable-" + aSubscribable);
  aSubscribeCell.setAttribute("value", aSubscribed);
}

/**
 * Populate the subscribe tree with the items found on the server.
 */
function createSubscribeTree() {
  let items = toArray(gItemsFound.entries());
  items.sort((a,b) => a[0].localeCompare(b[0]));

  for (let [path, name] of items) {
    let subscribed = gSubscribableServer.isSubscribed(path);
    let subscribable = gSubscribableServer.isSubscribable(path);
    let itemEl = document.createElement("treeitem");
    let rowEl = document.createElement("treerow");
    let nameEl = document.createElement("treecell");
    let subscribeEl = document.createElement("treecell");
    nameEl.setAttribute("label", name);
    nameEl.setAttribute("value", path);
    nameEl.setAttribute("properties", "serverType-" + gSubscribableServer.type +
                                      " subscribable-" + subscribable);
    setSubscribableCellState(subscribeEl, subscribed, subscribable);
    rowEl.appendChild(nameEl);
    rowEl.appendChild(subscribeEl);
    itemEl.appendChild(rowEl);
    gSubscribeBody.appendChild(itemEl);
 }
}

function SetUpTree(forceToServer, getOnlyNew)
{
  if (!gServerURI)
    return;

  var server = MailUtils.getFolderForURI(gServerURI, true).server;
  try
  {
    CleanUpSearchView();
    gSubscribableServer = server.QueryInterface(Ci.nsISubscribableServer);
    gSubscribeTree.setAttribute('ref', ''); // XXX: what is this?

    // enable (or disable) the search related UI
    EnableSearchUI();

    // clear out the text field when switching server
    gNameField.value = "";

    // since there is no text, switch to the non-search view...
    SwitchToNormalView();

    // Clear the subscribe tree.
    while (gSubscribeBody.hasChildNodes())
      gSubscribeBody.lastChild.remove();

    gSubscribableServer.subscribeListener = MySubscribeListener;

    var currentListTab = document.getElementById("currentListTab");
    if (currentListTab.selected)
      document.getElementById("newGroupsTab").disabled = true;
    else
      currentListTab.disabled = true;

    document.getElementById("refreshButton").disabled = true;

    gStatusFeedback._startMeteors();
    gStatusFeedback.showStatusString(gSubscribeBundle.getString("pleaseWaitString"));
    document.getElementById("stopButton").removeAttribute("disabled");

    gItemsFound.clear();
    gSubscribableServer.startPopulating(msgWindow, forceToServer, getOnlyNew);
  }
  catch (ex)
  {
    dump("failed to populate subscribe ds: " + ex + "\n");
  }
}


function SubscribeOnUnload()
{
  try {
    CleanUpSearchView();
  }
  catch (ex) {
    dump("failed to remove the subscribe ds: " + ex + "\n");
  }
}

function EnableSearchUI()
{
  if (gSubscribableServer.supportsSubscribeSearch) {
    gNameField.removeAttribute('disabled');
    gNameFieldLabel.removeAttribute('disabled');
  }
  else {
    gNameField.setAttribute('disabled',true);
    gNameFieldLabel.setAttribute('disabled',true);
  }
}

function SubscribeOnLoad()
{
  //dump("SubscribeOnLoad()\n");
  gSubscribeBundle = document.getElementById("bundle_subscribe");

  gSubscribeTree = document.getElementById("subscribeTree");
  gSubscribeBody = document.getElementById("subscribeTreeBody");
  gSearchTree = document.getElementById("searchTree");
  gSearchTreeBoxObject = document.getElementById("searchTree").treeBoxObject;
  gNameField = document.getElementById("namefield");
  gNameFieldLabel = document.getElementById("namefieldlabel");

  gSubscribeDeck = document.getElementById("subscribedeck");

  msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"]
                .createInstance(Ci.nsIMsgWindow);
  msgWindow.domWindow = window;
  gStatusFeedback = new nsMsgStatusFeedback
  msgWindow.statusFeedback = gStatusFeedback;
  msgWindow.rootDocShell.allowAuth = true;
  msgWindow.rootDocShell.appType = Ci.nsIDocShell.APP_TYPE_MAIL;

  // look in arguments[0] for parameters
  if (window.arguments && window.arguments[0]) {
    if ( window.arguments[0].okCallback ) {
      top.okCallback = window.arguments[0].okCallback;
    }
  }

  var serverMenu = document.getElementById("serverMenu");

  gServerURI = null;
  let folder = window.arguments[0].folder;
  if (folder && folder.server instanceof Ci.nsISubscribableServer) {
    serverMenu.menupopup.selectFolder(folder.server.rootMsgFolder);
    try {
                        CleanUpSearchView();
      gSubscribableServer = folder.server.QueryInterface(Ci.nsISubscribableServer);
                        // enable (or disable) the search related UI
                        EnableSearchUI();
      gServerURI = folder.server.serverURI;
    }
    catch (ex) {
      //dump("not a subscribable server\n");
                        CleanUpSearchView();
      gSubscribableServer = null;
      gServerURI = null;
    }
  }

  if (!gServerURI) {
    //dump("subscribe: no uri\n");
    //dump("xxx todo:  use the default news server.  right now, I'm just using the first server\n");

    serverMenu.selectedIndex = 0;

    if (serverMenu.selectedItem) {
      gServerURI = serverMenu.selectedItem.getAttribute("id");
    }
    else {
      //dump("xxx todo none of your servers are subscribable\n");
      //dump("xxx todo fix this by disabling subscribe if no subscribable server or, add a CREATE SERVER button, like in 4.x\n");
      return;
    }
  }

  SetServerTypeSpecificTextValues();

  ShowCurrentList();

  gNameField.focus();
}

function subscribeOK()
{
  //dump("in subscribeOK()\n")
  if (top.okCallback) {
    top.okCallback(top.gChangeTable);
  }
  Stop();
  if (gSubscribableServer) {
    gSubscribableServer.subscribeCleanup();
  }
  return true;
}

function subscribeCancel()
{
  Stop();
  if (gSubscribableServer) {
    gSubscribableServer.subscribeCleanup();
  }
  return true;
}

function SetState(name, state, aRow)
{
  var changed = gSubscribableServer.setState(name, state);
  if (changed)
    StateChanged(name, state);

  let subscribeCell;
  if (aRow === undefined) {
    // XXX This won't work when multiple levels of children are implemented
    for (let row of gSubscribeBody.children) {
      if (row.children[0].children[0].getAttribute("value") == name) {
        subscribeCell = row;
        break;
      }
    }
  } else {
    subscribeCell = gSubscribeBody.children[aRow];
  }
  setSubscribableCellState(subscribeCell.children[0].children[1], state, true);
}

function changeTableRecord(server, name, state)
{
  this.server = server;
  this.name = name;
  this.state = state;
}

function StateChanged(name,state)
{
  if (gServerURI in gChangeTable) {
    if (name in gChangeTable[gServerURI]) {
      var oldValue = gChangeTable[gServerURI][name];
      if (oldValue != state)
        delete gChangeTable[gServerURI][name];
    }
    else {
      gChangeTable[gServerURI][name] = state;
    }
  }
  else {
    gChangeTable[gServerURI] = {};
    gChangeTable[gServerURI][name] = state;
  }
}

function InSearchMode()
{
  // search is the second card in the deck
  return (gSubscribeDeck.getAttribute("selectedIndex") == "1");
}

function SearchOnClick(event)
{
  // we only care about button 0 (left click) events
  if (event.button != 0 || event.originalTarget.localName != "treechildren") return;

  var row = {}, col = {}, childElt = {};
  gSearchTreeBoxObject.getCellAt(event.clientX, event.clientY, row, col, childElt);
  if (row.value == -1 || row.value > gSearchView.rowCount-1)
    return;

  if (col.value.id == "subscribedColumn2") {
    if (event.detail != 2) {
      // single clicked on the check box
      // (in the "subscribedColumn2" column) reverse state
      // if double click, do nothing
      ReverseStateFromRow(row.value);
    }
  } else if (event.detail == 2) {
    // double clicked on a row, reverse state
    ReverseStateFromRow(row.value);
  }

  // invalidate the row
  InvalidateSearchTreeRow(row.value);
}

function ReverseStateFromRow(aRow)
{
  // To determine if the row is subscribed or not,
  // we get the properties for the "subscribedColumn2" cell in the row
  // and look for the "subscribed" property.
  // If the "subscribed" string is in the list of properties
  // we are subscribed.
  let col = gSearchTree.columns["nameColumn2"];
  let name = gSearchView.getCellValue(aRow, col);
  let isSubscribed = gSubscribableServer.isSubscribed(name);
  SetStateFromRow(aRow, !isSubscribed);
}

function SetStateFromRow(row, state)
{
  var col = gSearchTree.columns["nameColumn2"];
  var name = gSearchView.getCellValue(row, col);
  SetState(name, state);
}

function SetSubscribeState(state)
{
  try {
    // we need to iterate over the tree selection, and set the state for
    // all rows in the selection
    var inSearchMode = InSearchMode();
    var view = inSearchMode ? gSearchView : gSubscribeTree.view;
    var colId = inSearchMode ? "nameColumn2" : "nameColumn";

    var sel = view.selection;
    for (var i = 0; i < sel.getRangeCount(); ++i) {
      var start = {}, end = {};
      sel.getRangeAt(i, start, end);
      for (var k = start.value; k <= end.value; ++k) {
        if (inSearchMode)
          SetStateFromRow(k, state);
        else {
          let name = view.getCellValue(k, gSubscribeTree.columns[colId]);
          SetState(name, state, k);
        }
      }
    }

    if (inSearchMode) {
      // force a repaint
      InvalidateSearchTree();
    }
  }
  catch (ex) {
    dump("SetSubscribedState failed:  " + ex + "\n");
  }
}

function ReverseStateFromNode(row)
{
  let name = gSubscribeTree.view.getCellValue(row, gSubscribeTree.columns["nameColumn"]);

  SetState(name, !gSubscribableServer.isSubscribed(name), row);
}

function SubscribeOnClick(event)
{
  // we only care about button 0 (left click) events
  if (event.button != 0 || event.originalTarget.localName != "treechildren")
   return;

  var row = {}, col = {}, obj = {};
  gSubscribeTree.treeBoxObject.getCellAt(event.clientX, event.clientY, row, col, obj);
  if (row.value == -1 || row.value > (gSubscribeTree.view.rowCount - 1))
    return;

  if (event.detail == 2) {
    // only toggle subscribed state when double clicking something
    // that isn't a container
    if (!gSubscribeTree.view.isContainer(row.value)) {
      ReverseStateFromNode(row.value);
      return;
    }
  }
  else if (event.detail == 1)
  {
    if (obj.value == "twisty") {
        if (gSubscribeTree.view.isContainerOpen(row.value)) {
          var uri = gSubscribeTree.builderView.getResourceAtIndex(row.value).Value;

          gStatusFeedback._startMeteors();
          gStatusFeedback.showStatusString(gSubscribeBundle.getString("pleaseWaitString"));

          gSubscribableServer.startPopulatingWithUri(msgWindow, true /* force to server */, uri);
        }
    }
    else {
      // if the user single clicks on the subscribe check box, we handle it here
      if (col.value.id == "subscribedColumn")
        ReverseStateFromNode(row.value);
    }
  }
}

function Refresh()
{
  // clear out the textfield's entry
  gNameField.value = "";

  var newGroupsTab = document.getElementById("newGroupsTab");
  SetUpTree(true, newGroupsTab.selected);
}

function ShowCurrentList()
{
  // clear out the textfield's entry on call of Refresh()
  gNameField.value = "";

  // make sure the current list tab is selected
  document.getElementById("subscribeTabs").selectedIndex = 0;

  // try loading the hostinfo before talk to server
  SetUpTree(false, false);
}

function ShowNewGroupsList()
{
  // clear out the textfield's entry
  gNameField.value = "";

  // make sure the new groups tab is selected
  document.getElementById("subscribeTabs").selectedIndex = 1;

  // force it to talk to the server and get new groups
  SetUpTree(true, true);
}

function InvalidateSearchTreeRow(row)
{
    gSearchTreeBoxObject.invalidateRow(row);
}

function InvalidateSearchTree()
{
    gSearchTreeBoxObject.invalidate();
}

function SwitchToNormalView()
{
  // the first card in the deck is the "normal" view
  gSubscribeDeck.setAttribute("selectedIndex","0");
}

function SwitchToSearchView()
{
  // the second card in the deck is the "search" view
  gSubscribeDeck.setAttribute("selectedIndex","1");
}

function Search()
{
  var searchValue = gNameField.value;
  if (searchValue.length && gSubscribableServer.supportsSubscribeSearch) {
    SwitchToSearchView();
    gSubscribableServer.setSearchValue(searchValue);

    if (!gSearchView && gSubscribableServer) {
    gSearchView = gSubscribableServer.QueryInterface(Ci.nsITreeView);
      gSearchView.selection = null;
    gSearchTreeBoxObject.view = gSearchView;
  }
  }
  else {
    SwitchToNormalView();
  }
}

function CleanUpSearchView()
{
  if (gSearchView) {
    gSearchView.selection = null;
    gSearchView = null;
  }
}

function onSearchTreeKeyPress(event)
{
  // for now, only do something on space key
  if (event.charCode != KeyEvent.DOM_VK_SPACE)
    return;

  var treeSelection = gSearchView.selection;
  for (var i=0;i<treeSelection.getRangeCount();i++) {
    var start = {}, end = {};
    treeSelection.getRangeAt(i,start,end);
    for (var k=start.value;k<=end.value;k++)
      ReverseStateFromRow(k);

    // force a repaint
    InvalidateSearchTree();
  }
}

function onSubscribeTreeKeyPress(event)
{
  // for now, only do something on space key
  if (event.charCode != KeyEvent.DOM_VK_SPACE)
    return;

  var treeSelection = gSubscribeTree.view.selection;
  for (var i=0;i<treeSelection.getRangeCount();i++) {
    var start = {}, end = {};
    treeSelection.getRangeAt(i,start,end);
    for (var k=start.value;k<=end.value;k++)
      ReverseStateFromNode(k);
  }
}

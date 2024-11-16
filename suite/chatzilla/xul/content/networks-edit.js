/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var ASSERT = function(cond, msg) {
  if (!cond) {
    Services.prompt.alert(window, client.mainWindow.MSG_ALERT, msg);
  }
  return cond;
}
var client;

// To be able to load static.js, we need a few things defined first:
function CIRCNetwork() {}
function CIRCServer() {}
function CIRCChannel() {}
function CIRCUser() {}
function CIRCChanUser() {}
function CIRCDCCUser() {}
function CIRCDCCChat() {}
function CIRCDCCFile() {}
function CIRCDCCFileTransfer() {}
function CIRCSTS() {}

// Actual network window itself.
var gNetworkWindow = {
  mBundle: null,
  mServerList: null,
  mNetworkList: null,

  /* Stores all the network and server objects we're using.
   */
  networkList: null,

  alert: function(aSubject, aVar) {
    let title = this.mBundle.getString(aSubject + "Title");
    let msg = this.mBundle.getFormattedString(aSubject, [aVar]);
    Services.prompt.alert(window, title, msg);
  },

  confirmEx: function(aSubject, aVar) {
    let title = this.mBundle.getString(aSubject + "Title");
    let msg = aVar ? this.mBundle.getFormattedString(aSubject, [aVar])
                   : this.mBundle.getString(aSubject);
    return Services.prompt.confirmEx(window, title, msg,
                                     Services.prompt.STD_YES_NO_BUTTONS, null,
                                     null, null, null, { });
  },

  prompt: function(aSubject, aInitial) {
    let title = this.mBundle.getString(aSubject + "Title");
    let msg = this.mBundle.getString(aSubject);
    let rv = { value: aInitial };

    if (!Services.prompt.prompt(window, title, msg, rv, null, {value: null})) {
      return null;
    }

    return rv.value.toLowerCase().trim();
  },

  refreshNetworks: function(aNetwork) {
    // Remove all children.
    while (this.mNetworkList.hasChildNodes()) {
      this.mNetworkList.lastChild.remove();
    }

    let hasChildren = false;
    let network;
    // Populate the network item list.
    for (let name in this.networkList) {
      let label = document.createElement("label");
      label.setAttribute("value", name);
      let listitem = document.createElement("listitem");
      listitem.appendChild(label);
      listitem.id = name;
      if (aNetwork && (aNetwork == name)) {
        network = listitem;
      }
      this.mNetworkList.appendChild(listitem);
      hasChildren = true;
    }

    if (hasChildren) {
      // If a network name was given and found select it,
      // otherwise select the first item.
      this.mNetworkList.selectItem(network || this.mNetworkList.firstChild);
    } else {
      this.onSelectNetwork();
    }
    this.updateNetworkButtons(hasChildren);
  },

  updateNetworkButtons: function(aSelected) {
    let editButton = document.getElementById("networkListEditButton");
    let removeButton = document.getElementById("networkListRemoveButton");
    if (!aSelected) {
      editButton.setAttribute("disabled", "true");
      removeButton.setAttribute("disabled", "true");
    } else {
      editButton.removeAttribute("disabled");
      removeButton.removeAttribute("disabled");
    }
  },

  // Loads the networks list.
  onLoad: function() {
    client = window.arguments[0];

    // Needed for ASSERT.
    initMessages();

    this.mBundle = document.getElementById("bundle_networks");
    this.mServerList = document.getElementById("serverList");
    this.mNetworkList = document.getElementById("networkList");

    // The list of objects we're tracking.
    this.networkList = networksToNetworkList();
    this.refreshNetworks();

    // Force the window to be the right size now, not later.
    window.sizeToContent();
  },

  // Closing the window. Clean up.
  onClose: function() {
  },

  // OK button.
  onOK: function() {
    // Save the list and update client.networks
    try {
      networksSaveList(this.networkList);
    }
    catch (e) {
      this.alert("network-saveError", e);
      return false;
    }

    networksSyncFromList(this.networkList);
    window.close();
    client.updateHeader();
    client.dispatch("networks");
    return true;
  },

  // Cancel button.
  onCancel: function() {
    window.close();
    return true;
  },

  // Restore Defaults button.
  onRestore: function() {
    // Ask for confirmation.
    if (this.confirmEx("network-confirmRestoreDefaults") != 0) {
      return;
    }

    // Repopulate the network list.
    this.networkList = networksGetDefaults();
    this.refreshNetworks();
  },

  // Connect to Network button.
  onConnect: function() {
    let selection = this.mNetworkList.selectedItem;
    if (!selection)
      return;

    let network = this.networkList[selection.id];
    if (this.onOK()) {
      if (networkHasSecure(network.servers)) {
          client.dispatch("sslserver " + network.name);
      } else {
          client.dispatch("server " + network.name);
      }
    }
  },

  // Select a network listitem.
  onSelectNetwork: function(aId = 0) {
    let header = document.getElementById("network-header");

    // Remove all children.
    while (this.mServerList.hasChildNodes()) {
      this.mServerList.lastChild.remove();
    }

    let selection = this.mNetworkList.selectedItem;
    if (!selection) {
      header.setAttribute("title",
                          this.mBundle.getString("network-headerDefault"));
      this.updateServerButtons(null, true);
      return;
    }

    // Make sure selected network item is visible.
    this.mNetworkList.ensureElementIsVisible(selection);

    let hasChildren = false;
    let network = this.networkList[selection.id];
    for (let i = 0; i < network.servers.length; i++) {
      let server = network.servers[i];
      let label = document.createElement("label");
      label.setAttribute("value", server.hostname + ":" + server.port);
      let listitem = document.createElement("listitem");
      listitem.appendChild(label);
      listitem.setAttribute("server_id", i);
      listitem.id = network.name + "-" + i;
      this.mServerList.appendChild(listitem);
      hasChildren = true;
    }

    if (hasChildren) {
      // Select the given id if it exists otherwise the first item.
      this.mServerList.selectedIndex = aId;
    } else {
      this.onSelectServer();
    }

    header.setAttribute("title",
                        this.mBundle.getFormattedString("network-headerName",
                                                        [network.name]));
  },

  // Network Add button.
  onAddNetwork: function() {
    let name = this.prompt("network-add");
    if (!name) {
      return;
    }

    if (name in this.networkList) {
      this.alert("network-nameError", name);
      return;
    }

    // Create new network entry.
    this.networkList[name] = { name: name, displayName: name, servers: [] };

    this.refreshNetworks(name);
  },

  // Network Edit button.
  onEditNetwork: function() {
    let oldName = this.mNetworkList.selectedItem.id;
    let name = this.prompt("network-edit", oldName);
    if (!name || (name == oldName)) {
      return;
    }

    if (name in this.networkList) {
      this.alert("network-nameError", name);
      return;
    }

    // Create new network entry.
    this.networkList[name] = { name: name, displayName: name,
                               servers: this.networkList[oldName].servers };
    // Remove old network entry.
    delete this.networkList[oldName];

    this.refreshNetworks(name);
  },

  // Network Remove button.
  onRemoveNetwork: function() {
    let selected = this.mNetworkList.selectedItem;

    // Confirm definitely want to remove this network.
    if (this.confirmEx("network-remove", selected.id) != 0) {
      return;
    }

    // Remove network entry.
    delete this.networkList[selected.id];

    this.refreshNetworks();
  },

  // Move up / down buttons.
  onMoveServer: function(aDir) {
    let item = this.mServerList.selectedItem;
    let network = this.mNetworkList.selectedItem.id;
    let id = parseInt(item.getAttribute("server_id"));
    let server = this.networkList[network].servers[id];
    this.networkList[network].servers.splice(id, 1);
    this.networkList[network].servers.splice(id + aDir, 0, server);

    // Refresh the server list and select the server that has been moved.
    this.onSelectNetwork(id + aDir);
  },

  // Add Server button.
  onAddServer: function() {
    this.openServerEditor(null);
  },

  // Edit Server button.
  onEditServer: function() {
    let item = this.mServerList.selectedItem;
    if (!item) {
      return;
    }
    this.openServerEditor(item);
  },

  // Remove Server button.
  onRemoveServer: function() {
    let item = this.mServerList.selectedItem;
    let network = this.mNetworkList.selectedItem.id;
    let id = item.getAttribute("server_id");
    let server = this.networkList[network].servers[id];
    let name = server.hostname + ":" + server.port;

    // Confirm definitely want to remove this network.
    if (this.confirmEx("server-remove", name) != 0) {
      return;
    }

    this.networkList[network].servers.splice(id, 1);
    this.onSelectNetwork();
  },

  onSelectServer: function() {
    let server = this.mServerList.selectedItem;
    this.updateServerButtons(server, false);
    this.updateServerInfoBox(server);
  },

  openServerEditor: function(aItem) {
    let network = this.mNetworkList.selectedItem.id;
    let id;
    let server;
    if (aItem) {
      id = aItem.getAttribute("server_id");
      server = this.networkList[network].servers[id];
    }

    let args = { server: server, result: false };
    window.openDialog("chrome://chatzilla/content/networks-server.xul",
                      "serverEdit", "chrome,titlebar,modal,centerscreen", args);
    // Now update the server which was just added / edited and select it.
    if (args.result) {
      if (server) {
        this.networkList[network].servers[id] = args.server;
      } else {
        id = this.networkList[network].servers.length;
        this.networkList[network].servers.push(args.server);
      }
      this.refreshNetworks(network);
      this.mServerList.selectedIndex = id;
    }
  },

  updateServerButtons: function(aServer, aNone) {
    this.disableButton("serverListUpButton", aNone || !aServer ||
                                             !aServer.previousSibling);
    this.disableButton("serverListDownButton", aNone || !aServer ||
                                               !aServer.nextSibling);
    this.disableButton("serverListAddButton", aNone);
    this.disableButton("serverListEditButton", aNone || !aServer);
    this.disableButton("serverListRemoveButton", aNone || !aServer);
  },

  disableButton: function(aButtonId, aDisable) {
    let button = document.getElementById(aButtonId);
    if (aDisable) {
      button.setAttribute("disabled", "true");
    } else {
      button.removeAttribute("disabled");
    }
  },

  updateServerInfoBox: function(aServer) {
    let name = document.getElementById("nameValue");
    let port = document.getElementById("portValue");
    let connection = document.getElementById("connectionSecurityValue");
    if (!aServer) {
      name.value = "";
      port.value = "";
      connection.value = "";
      return;
    }

    let network = this.mNetworkList.selectedItem.id;
    let id = aServer.getAttribute("server_id");
    let server = this.networkList[network].servers[id];
    let type = "server-ConnectionSecurityType-" + (server.isSecure ? "3" : "0");
    name.value = server.hostname;
    port.value = server.port;
    connection.value = this.mBundle.getString(type);
  },
};

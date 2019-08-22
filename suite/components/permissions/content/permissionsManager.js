/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

var permissions = [];
var removals = [];

var sortColumn;
var sortAscending;

var permissionsTreeView = {
    rowCount: 0,
    setTree: function(tree) {},
    getImageSrc: function(row, column) {},
    getProgressMode: function(row, column) {},
    getCellValue: function(row, column) {},
    getCellText: function(row, column) { return permissions[row][column.id]; },
    isSeparator: function(index) { return false; },
    isSorted: function() { return false; },
    isContainer: function(index) { return false; },
    cycleHeader: function(column) {},
    getRowProperties: function(row, column) { return ""; },
    getColumnProperties: function(column) { return ""; },
    getCellProperties: function(row, column) { return ""; }
  };

var permissionsTree;
var permissionType = "popup";
var gManageCapability;

var permissionsBundle;

function Startup() {
  var introText, windowTitle;

  permissionsTree = document.getElementById("permissionsTree");

  permissionsBundle = document.getElementById("permissionsBundle");

  sortAscending = (permissionsTree.getAttribute("sortAscending") == "true");
  sortColumn = permissionsTree.getAttribute("sortColumn");

  var params = { blockVisible   : true,
                 sessionVisible : true,
                 allowVisible   : true,
                 manageCapability : true
               };

  if (window.arguments && window.arguments[0]) {
    params = window.arguments[0];
    setHost(params.prefilledHost);
    permissionType = params.permissionType;
    gManageCapability = params.manageCapability;
    introText = params.introText;
    windowTitle = params.windowTitle;
  }

  document.getElementById("btnBlock").hidden = !params.blockVisible;
  document.getElementById("btnSession").hidden = !params.sessionVisible;
  document.getElementById("btnAllow").hidden = !params.allowVisible;

  document.getElementById("permissionsText").textContent = introText ||
      permissionsBundle.getString(permissionType + "permissionstext");

  document.title = windowTitle ||
      permissionsBundle.getString(permissionType + "permissionstitle");

  var dialogElement = document.getElementById("permissionsManager");
  dialogElement.setAttribute("windowtype", "permissions-" + permissionType);

  var urlFieldVisible = params.blockVisible ||
                        params.sessionVisible ||
                        params.allowVisible;

  document.getElementById("url").hidden = !urlFieldVisible;
  document.getElementById("urlLabel").hidden = !urlFieldVisible;

  handleHostInput(document.getElementById("url").value);
  loadPermissions();
}

function onAccept() {
  finalizeChanges();
  reInitialize();

  // Don't close the window.
  return false;
}

function onCancel() {
  reInitialize();

  // Don't close the window.
  return false;
}

function reInitialize() {
  permissions = [];
  removals = [];

  // loadPermissions will reverse the sort direction so flip it now.
  sortAscending = !sortAscending;

  // Reload permissions tree.
  loadPermissions();
}

function setHost(aHost) {
  document.getElementById("url").value = aHost;
}

function Permission(id, principal, host, type, capability, perm) {
  this.id = id;
  this.principal = principal;
  this.host = host;
  this.rawHost = host.replace(/^\./, "");
  this.type = type;
  this.capability = capability;
  this.perm = perm;
}

function loadPermissions() {
  var enumerator = Services.perms.enumerator;
  var count = 0;
  var permission;

  try {
    while (enumerator.hasMoreElements()) {
      permission = enumerator.getNext().QueryInterface(Ci.nsIPermission);
      if (permission.type == permissionType &&
          (!gManageCapability || permission.capability == gManageCapability)) {
        permissions.push(new Permission(count++,
                                        permission.principal,
                                        permission.principal.URI.host,
                                        permission.type,
                                        capabilityString(permission.capability),
                                        permission.capability));
      }
    }
  } catch(ex) {
  }

  permissionsTreeView.rowCount = permissions.length;

  // sort and display the table
  permissionsTree.view = permissionsTreeView;
  permissionColumnSort(sortColumn, false);

  // disable "remove all" button if there are none
  document.getElementById("removeAllPermissions").disabled =
    permissions.length == 0;
}

function capabilityString(aCapability) {
  var capability = null;
  switch (aCapability) {
    case Ci.nsIPermissionManager.ALLOW_ACTION:
      capability = "can";
      break;
    case Ci.nsIPermissionManager.DENY_ACTION:
      capability = "cannot";
      break;
    // we should only ever hit this for cookies
    case Ci.nsICookiePermission.ACCESS_SESSION:
      capability = "canSession";
      break;
    default:
      break;
  }
  return permissionsBundle.getString(capability);
}

function permissionColumnSort(aColumn, aUpdateSelection) {
  sortAscending =
    SortTree(permissionsTree, permissionsTreeView, permissions,
             aColumn, sortColumn, sortAscending, aUpdateSelection);
  sortColumn = aColumn;

  SetSortDirection(permissionsTree, aColumn, sortAscending);
}

function deletePermissions() {
  DeleteSelectedItemFromTree(permissionsTree, permissionsTreeView,
                             permissions, removals,
                             "removePermission", "removeAllPermissions");
}

function deleteAllPermissions() {
  DeleteAllFromTree(permissionsTree, permissionsTreeView, permissions,
                    removals, "removePermission", "removeAllPermissions");
}

function finalizeChanges() {
  let p;

  for (let i in permissions) {
    p = permissions[i];
    try {
      // Principal is null so a permission we just added in this session.
      if (p.principal == null) {
        let uri = Services.io.newURI("https://" + p.host);
        Services.perms.add(uri, p.type, p.perm);
      }
    } catch(ex) {
    }
  }

  for (let i in removals) {
    p = removals[i];
    try {
      // Principal is not null so not a permission we just added in this
      // session.
      if (p.principal) {
        Services.perms.removeFromPrincipal(p.principal,
                                           p.type);
      }
    } catch(ex) {
    }
  }
}

function handlePermissionKeyPress(e) {
  if (e.keyCode == KeyEvent.DOM_VK_DELETE ||
      (AppConstants.platform == "macosx" &&
       e.keyCode == KeyEvent.DOM_VK_BACK_SPACE)) {
    deletePermissions();
  }
}

function addPermission(aPermission) {
  var textbox = document.getElementById("url");
  // trim any leading and trailing spaces and scheme
  var host = trimSpacesAndScheme(textbox.value);
  try {
    let uri = Services.io.newURI("https://" + host);
    host = uri.host;
  } catch(ex) {
    var message = permissionsBundle.getFormattedString("alertInvalid", [host]);
    var title = permissionsBundle.getString("alertInvalidTitle");
    Services.prompt.alert(window, title, message);
    textbox.value = "";
    textbox.focus();
    handleHostInput("");
    return;
  }

  // we need this whether the perm exists or not
  var stringCapability = capabilityString(aPermission);

  // check whether the permission already exists, if not, add it
  var exists = false;
  for (var i in permissions) {
    if (permissions[i].rawHost == host) {
      // Avoid calling the permission manager if the capability settings are
      // the same. Otherwise allow the call to the permissions manager to
      // update the listbox for us.
      exists = permissions[i].perm == aPermission;
      break;
    }
  }

  if (!exists) {
    permissions.push(new Permission(permissions.length, null, host,
                                    permissionType, stringCapability,
                                    aPermission));

    permissionsTreeView.rowCount = permissions.length;
    permissionsTree.treeBoxObject.rowCountChanged(permissions.length - 1, 1);
    permissionsTree.treeBoxObject.ensureRowIsVisible(permissions.length - 1);
  }
  textbox.value = "";
  textbox.focus();

  // covers a case where the site exists already, so the buttons don't disable
  handleHostInput("");

  // enable "remove all" button as needed
  document.getElementById("removeAllPermissions").disabled = permissions.length == 0;
}

function doHelpButton() {
  openHelp(permissionsBundle.getString(permissionType + "permissionshelp"), "chrome://communicator/locale/help/suitehelp.rdf");
  return true;
}

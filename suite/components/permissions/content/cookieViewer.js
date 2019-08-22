/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");

// cookies and permissions list
var cookies              = [];
var permissions          = [];
var allCookies           = [];
var deletedCookies       = [];
var deletedPermissions   = [];

var cookieBundle;
var gUpdatingBatch = "";
var lastCookieSortColumn;
var lastCookieSortAscending;
var lastPermissionSortColumn;
var lastPermissionSortAscending;

function Startup() {

  // arguments passed to this routine:
  //   cookieManager

  // intialize string bundle
  cookieBundle = document.getElementById("cookieBundle");

  // load in the cookies and permissions
  cookiesTree = document.getElementById("cookiesTree");
  lastCookieSortAscending = (cookiesTree.getAttribute("sortAscending") == "true");
  lastCookieSortColumn = cookiesTree.getAttribute("sortColumn");
  permissionsTree = document.getElementById("permissionsTree");
  lastPermissionSortAscending = (permissionsTree.getAttribute("sortAscending") == "true");
  lastPermissionSortColumn = permissionsTree.getAttribute("sortColumn");
  loadCookies();
  loadPermissions();

  // be prepared to reload the display if anything changes
  Services.obs.addObserver(cookieReloadDisplay, "cookie-changed", false);
  Services.obs.addObserver(cookieReloadDisplay, "perm-changed", false);

  // filter the table if requested by caller
  if (window.arguments &&
      window.arguments[0] &&
      window.arguments[0].filterString)
    setFilter(window.arguments[0].filterString);

  document.getElementById("filter").focus();
}

function Shutdown() {
  Services.obs.removeObserver(cookieReloadDisplay, "cookie-changed");
  Services.obs.removeObserver(cookieReloadDisplay, "perm-changed");
}

function PromptConfirm(title, msg, yes) {
  var flags =
    ((Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0) +
     (Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1) +
     Services.prompt.BUTTON_POS_1_DEFAULT)
  return Services.prompt.confirmEx(window,
                                   cookieBundle.getString(title),
                                   cookieBundle.getString(msg),
                                   flags,
                                   cookieBundle.getString(yes),
                                   null, null, null, {value:0});
}

var cookieReloadDisplay = {
  observe: function(subject, topic, state) {
    if (topic == gUpdatingBatch)
      return;
    if (topic == "cookie-changed") {
      allCookies.length = 0;
      loadCookies();
    } else if (topic == "perm-changed") {
      permissions.length = 0;
      loadPermissions();
    }
  }
}

function doSelectAll() {
  var elem = document.commandDispatcher.focusedElement;
  if (elem && "treeBoxObject" in elem)
    elem.view.selection.selectAll();
}

/*** =================== COOKIES CODE =================== ***/

var cookiesTreeView = {
  rowCount : 0,
  setTree : function(tree){},
  getImageSrc : function(row,column) {},
  getProgressMode : function(row,column) {},
  getCellValue : function(row,column) {},
  getCellText : function(row,column){ return cookies[row][column.id]; },
  isSeparator : function(index) {return false;},
  isSorted: function() { return false; },
  isContainer : function(index) {return false;},
  cycleHeader : function(aCol) {},
  getRowProperties : function(row) { return ""; },
  getColumnProperties : function(column) { return ""; },
  getCellProperties : function(row, column) { return ""; }
};
var cookiesTree;

function Cookie(id, host, name, path, originAttributes, value,
                isDomain, rawHost, isSecure, expires) {
  this.id = id;
  this.host = host;
  this.name = name;
  this.path = path;
  this.originAttributes = originAttributes;
  this.value = value;
  this.isDomain = isDomain;
  this.rawHost = rawHost;
  this.isSecure = isSecure;
  this.expires = GetExpiresString(expires);
  this.expiresSortValue = expires;
}

function loadCookies() {
  // load cookies into a table
  var enumerator = Services.cookies.enumerator;
  var count = 0;
  while (enumerator.hasMoreElements()) {
    var nextCookie = enumerator.getNext();
    if (!nextCookie) break;
    nextCookie = nextCookie.QueryInterface(Ci.nsICookie);
    var host = nextCookie.host;
    allCookies.push(
      new Cookie(count++, host, nextCookie.name,
                 nextCookie.path, nextCookie.originAttributes,
                 nextCookie.value, nextCookie.isDomain,
                 host.charAt(0)=="." ? host.slice(1) : host,
                 nextCookie.isSecure, nextCookie.expires));
  }

  // filter, sort and display the table
  cookiesTree.view = cookiesTreeView;
  filter(document.getElementById("filter").value);
}

function GetExpiresString(expires) {
  if (expires) {
    var date = new Date(1000*expires);

    // if a server manages to set a really long-lived cookie, the dateservice
    // can't cope with it properly, so we'll just return a blank string
    // see bug 238045 for details
    var expiry = "";
    try {
      const dateTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
                                dateStyle: "full", timeStyle: "long" });
      expiry = dateTimeFormatter.format(date);
    } catch(ex) {
      // do nothing
    }
    return expiry;
  }
  return cookieBundle.getString("expireAtEndOfSession");
}

function CookieSelected() {
  var selections = GetTreeSelections(cookiesTree);
  if (selections.length) {
    document.getElementById("removeCookie").removeAttribute("disabled");
  } else {
    document.getElementById("removeCookie").setAttribute("disabled", "true");
    ClearCookieProperties();
    return true;
  }

  var idx = selections[0];
  if (idx >= cookies.length) {
    // Something got out of synch.  See bug 119812 for details
    dump("Tree and viewer state are out of sync! " +
         "Help us figure out the problem in bug 119812");
    return false;
  }

  var props = [
    {id: "ifl_name", value: cookies[idx].name},
    {id: "ifl_value", value: cookies[idx].value},
    {id: "ifl_isDomain",
     value: cookies[idx].isDomain ?
            cookieBundle.getString("domainColon") : cookieBundle.getString("hostColon")},
    {id: "ifl_host", value: cookies[idx].host},
    {id: "ifl_path", value: cookies[idx].path},
    {id: "ifl_isSecure",
     value: cookies[idx].isSecure ?
            cookieBundle.getString("forSecureOnly") :
            cookieBundle.getString("forAnyConnection")},
    {id: "ifl_expires", value: cookies[idx].expires}
  ];

  var value;
  var field;

  for (let lProp of props)
  {
    field = document.getElementById(lProp.id);
    if ((selections.length > 1) && (lProp.id != "ifl_isDomain")) {
      value = ""; // clear field if multiple selections
    } else {
      value = lProp.value;
    }
    field.value = value;
  }
  return true;
}

function ClearCookieProperties() {
  var properties =
    ["ifl_name","ifl_value","ifl_host","ifl_path","ifl_isSecure","ifl_expires"];
  for (let prop of properties) {
    document.getElementById(prop).value = "";
  }
}

function DeleteCookie() {
  if (cookiesTreeView.selection.count > 1 &&
      PromptConfirm("deleteSelectedCookiesTitle",
                    "deleteSelectedCookies",
                    "deleteSelectedCookiesYes") == 1) {
    return;
  }
  DeleteSelectedItemFromTree(cookiesTree, cookiesTreeView,
                                 cookies, deletedCookies,
                                 "removeCookie", "removeAllCookies");
  if (document.getElementById("filter").value) {
    // remove selected cookies from unfiltered set
    for (let cookie of deletedCookies) {
      allCookies.splice(allCookies.indexOf(cookie), 1);
    }
  }
  if (!cookies.length) {
    ClearCookieProperties();
  }
  FinalizeCookieDeletions();
}

function DeleteAllCookies() {
  if (PromptConfirm("deleteAllCookiesTitle",
                    "deleteAllCookies",
                    "deleteAllCookiesYes") == 1) {
    return;
  }

  ClearCookieProperties();
  DeleteAllFromTree(cookiesTree, cookiesTreeView,
                        cookies, deletedCookies,
                        "removeCookie", "removeAllCookies");
  allCookies.length = 0;
  FinalizeCookieDeletions();
}

function FinalizeCookieDeletions() {
  gUpdatingBatch = "cookie-changed";
  for (let delCookie of deletedCookies) {
    Services.cookies.remove(delCookie.host,
                            delCookie.name,
                            delCookie.path,
                            document.getElementById("checkbox").checked,
                            delCookie.originAttributes);
  }
  deletedCookies.length = 0;
  gUpdatingBatch = "";
}

function HandleCookieKeyPress(e) {
  if (e.keyCode == KeyEvent.DOM_VK_DELETE ||
      (AppConstants.platform == "macosx" &&
       e.keyCode == KeyEvent.DOM_VK_BACK_SPACE)) {
    DeleteCookie();
  }
}

function CookieColumnSort(column, updateSelection) {
  lastCookieSortAscending =
      SortTree(cookiesTree, cookiesTreeView, cookies,
               column, lastCookieSortColumn, lastCookieSortAscending,
               updateSelection);
  lastCookieSortColumn = column;

  SetSortDirection(cookiesTree, column, lastCookieSortAscending);
}

/*** =================== PERMISSIONS CODE =================== ***/

var permissionsTreeView = {
  rowCount : 0,
  setTree : function(tree){},
  getImageSrc : function(row,column) {},
  getProgressMode : function(row,column) {},
  getCellValue : function(row,column) {},
  getCellText : function(row,column) { return permissions[row][column.id]; },
  isSeparator : function(index) {return false;},
  isSorted: function() { return false; },
  isContainer : function(index) {return false;},
  cycleHeader : function(aCol) {},
  getRowProperties : function(row) { return ""; },
  getColumnProperties : function(column) { return ""; },
  getCellProperties : function(row, column) { return ""; }
};
var permissionsTree;

function Permission(id, principal, type, capability) {
  this.id = id;
  this.principal = principal;
  this.host = principal.URI.hostPort;
  this.scheme = principal.URI.scheme;
  this.type = type;
  this.capability = capability;
}

function loadPermissions() {
  // load permissions into a table
  var enumerator = Services.perms.enumerator;
  var canStr = cookieBundle.getString("can");
  var canSessionStr = cookieBundle.getString("canSession");
  var cannotStr = cookieBundle.getString("cannot");
  var capability;
  var count = 0;
  var permission;
  while (enumerator.hasMoreElements()) {
    permission = enumerator.getNext().QueryInterface(Ci.nsIPermission);
    // We are only interested in cookie permissions in this code.
    if (permission.type == "cookie") {
      // It is currently possible to add a cookie permission for about:xxx
      // and other internal pages. They are probably invalid and will be
      // ignored for now.
      // Test if the permission has a host.
      try {
        permission.principal.URI.host;
      }
      catch (e) {
        Cu.reportError("Invalid permission found: " +
                       permission.principal.origin + " " + permission.type);
        continue;
      }

      switch (permission.capability) {
        case Ci.nsIPermissionManager.ALLOW_ACTION:
          capability = canStr;
          break;
        case Ci.nsIPermissionManager.DENY_ACTION:
          capability = cannotStr;
          break;
        case Ci.nsICookiePermission.ACCESS_SESSION:
          capability = canSessionStr;
          break;
        default:
          continue;
      }
      permissions.push(new Permission(count++,
                                      permission.principal,
                                      permission.type,
                                      capability));
    }
  }
  permissionsTreeView.rowCount = permissions.length;

  // sort and display the table
  permissionsTree.view = permissionsTreeView;
  permissionsTreeView.selection.clearSelection();
  SortTree(permissionsTree, permissionsTreeView, permissions,
           lastPermissionSortColumn, lastPermissionSortColumn,
           !lastPermissionSortAscending);

  // disable "remove all" button if there are no cookies
  document.getElementById("removeAllPermissions").disabled = permissions.length == 0;
}

function DeletePermission() {
  if (permissionsTreeView.selection.count > 1 &&
      PromptConfirm("deleteSelectedSitesTitle",
                    "deleteSelectedCookiesSites",
                    "deleteSelectedSitesYes") == 1) {
    return;
  }
  DeleteSelectedItemFromTree(permissionsTree, permissionsTreeView,
                                 permissions, deletedPermissions,
                                 "removePermission", "removeAllPermissions");
  FinalizePermissionDeletions();
}

function setCookiePermissions(action) {
  var site = document.getElementById("cookie-site");

  // let the backend do the validation
  try {
    var url = new URL(site.value);
  } catch (e) {
    // show an error if URL is invalid
    window.alert(cookieBundle.getString("allowedURLSchemes"));
    return;
  }

  try {
    var uri = Services.io.newURI(url);
  } catch (e) {
    // show an error if URI can not be constructed or adding it failed
    window.alert(cookieBundle.getString("errorAddPermission"));
    return;
  }
  // only allow a few schemes here
  // others like file:// would produce an invalid entry in the database
  if (uri.scheme != "http"  &&
      uri.scheme != "https") {
    // show an error if uri uses invalid scheme
    window.alert(uri.scheme + ": " + cookieBundle.getString("allowedURLSchemes"));
    return;
  }

  if (Services.perms.testPermission(uri, "cookie") != action)
    Services.perms.add(uri, "cookie", action);

  site.focus();
  site.value = "";
}

function DeleteAllPermissions() {
  if (PromptConfirm("deleteAllSitesTitle",
                    "deleteAllCookiesSites",
                    "deleteAllSitesYes") == 1) {
    return;
  }

  DeleteAllFromTree(permissionsTree, permissionsTreeView,
                        permissions, deletedPermissions,
                        "removePermission", "removeAllPermissions");
  FinalizePermissionDeletions();
}

function FinalizePermissionDeletions() {
  if (!deletedPermissions.length)
    return;

  gUpdatingBatch = "perm-changed";
  for (let permission of deletedPermissions)
    Services.perms.removeFromPrincipal(permission.principal, permission.type);
  deletedPermissions.length = 0;
  gUpdatingBatch = "";
}

function HandlePermissionKeyPress(e) {
  if (e.keyCode == KeyEvent.DOM_VK_DELETE ||
      (AppConstants.platform == "macosx" &&
       e.keyCode == KeyEvent.DOM_VK_BACK_SPACE)) {
    DeletePermission();
  }
}

function PermissionColumnSort(column, updateSelection) {
  lastPermissionSortAscending =
    SortTree(permissionsTree, permissionsTreeView, permissions,
                 column, lastPermissionSortColumn, lastPermissionSortAscending,
                 updateSelection);
  lastPermissionSortColumn = column;

  SetSortDirection(permissionsTree, column, lastPermissionSortAscending);
}

/*** ============ CODE FOR HELP BUTTON =================== ***/

function doHelpButton()
{
  var selTab = document.getElementById("tabbox").selectedTab;
  var key = selTab.getAttribute("help");
  openHelp(key, "chrome://communicator/locale/help/suitehelp.rdf");
}

/*** =================== FILTER CODE =================== ***/

function filterCookies(aFilterValue)
{
  var filterSet = [];
  for (let cookie of allCookies) {
    if (cookie.rawHost.includes(aFilterValue) ||
        cookie.name.includes(aFilterValue) ||
        cookie.value.includes(aFilterValue))
      filterSet.push(cookie);
  }
  return filterSet;
}

function filter(filter)
{
  // clear the display
  var oldCount = cookiesTreeView.rowCount;
  cookiesTreeView.rowCount = 0;
  cookiesTree.treeBoxObject.rowCountChanged(0, -oldCount);

  // set up the display
  cookies = filter ? filterCookies(filter) : allCookies;
  cookiesTreeView.rowCount = cookies.length;
  cookiesTree.treeBoxObject.rowCountChanged(0, cookiesTreeView.rowCount);

  // sort the tree according to the last sort parameters
  SortTree(cookiesTree, cookiesTreeView, cookies, lastCookieSortColumn,
           lastCookieSortColumn, !lastCookieSortAscending);

  // disable Remove All Cookies button if the view is filtered or there are no cookies
  if (filter || !cookies.length)
    document.getElementById("removeAllCookies").setAttribute("disabled", "true");
  else
    document.getElementById("removeAllCookies").removeAttribute("disabled");

  // if the view is filtered and not empty then select the first item
  if (filter && cookies.length)
    cookiesTreeView.selection.select(0);
}

function setFilter(aFilterString)
{
  document.getElementById("filter").value = aFilterString;
  filter(aFilterString);
}

function focusFilterBox()
{
  var filterBox = document.getElementById("filter");
  filterBox.focus();
  filterBox.select();
}

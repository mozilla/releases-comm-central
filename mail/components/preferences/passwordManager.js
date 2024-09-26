/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** * =================== SAVED SIGNONS CODE =================== */
/* eslint-disable-next-line no-var */
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
/* eslint-disable-next-line no-var */
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

// Default value for signon table sorting
let lastSignonSortColumn = "origin";
let lastSignonSortAscending = true;

let showingPasswords = false;

// password-manager lists
let signons = [];
const deletedSignons = [];

// Elements that would be used frequently
let filterField;
let togglePasswordsButton;
let signonsIntro;
let removeButton;
let removeAllButton;
let signonsTree;

/**
 * To avoid multiple display reloads by observing notifications from
 * LoginManagerStorage, temporarily set to false when calling LoginManager
 * functions.
 *
 * @type {boolean}
 */
let reloadDisplay = true;

window.addEventListener("load", () => {
  Startup();
});
window.addEventListener("unload", () => {
  Shutdown();
});

const signonReloadDisplay = {
  async observe(subject, topic, data) {
    if (topic == "passwordmgr-storage-changed" && reloadDisplay) {
      switch (data) {
        case "addLogin":
        case "modifyLogin":
        case "removeLogin":
        case "removeAllLogins":
          if (!signonsTree) {
            return;
          }
          await LoadSignons();
          // apply the filter if needed
          if (filterField && filterField.value != "") {
            await FilterPasswords();
          }
          signonsTree.ensureRowIsVisible(
            signonsTree.view.selection.currentIndex
          );
          break;
      }
      Services.obs.notifyObservers(null, "passwordmgr-dialog-updated");
    }
  },
};

// Formatter for localization.
const dateFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});
const dateAndTimeFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

async function Startup() {
  // be prepared to reload the display if anything changes
  Services.obs.addObserver(signonReloadDisplay, "passwordmgr-storage-changed");

  signonsTree = document.getElementById("signonsTree");
  filterField = document.getElementById("filter");
  togglePasswordsButton = document.getElementById("togglePasswords");
  signonsIntro = document.getElementById("signonsIntro");
  removeButton = document.getElementById("removeSignon");
  removeAllButton = document.getElementById("removeAllSignons");

  document.l10n.setAttributes(togglePasswordsButton, "show-passwords");
  document.l10n.setAttributes(signonsIntro, "logins-description-all");
  document.l10n.setAttributes(removeAllButton, "remove-all");

  document
    .getElementsByTagName("treecols")[0]
    .addEventListener("click", event => {
      const { target, button } = event;
      const sortField = target.getAttribute("data-field-name");

      if (target.nodeName != "treecol" || button != 0 || !sortField) {
        return;
      }

      SignonColumnSort(sortField);
    });

  await LoadSignons();

  // filter the table if requested by caller
  if (
    window.arguments &&
    window.arguments[0] &&
    window.arguments[0].filterString
  ) {
    await setFilter(window.arguments[0].filterString);
  }

  FocusFilterBox();
  document.l10n
    .translateElements(document.querySelectorAll("[data-l10n-id]"))
    .then(() => window.sizeToContent());
}

function Shutdown() {
  Services.obs.removeObserver(
    signonReloadDisplay,
    "passwordmgr-storage-changed"
  );
}

async function setFilter(aFilterString) {
  filterField.value = aFilterString;
  await FilterPasswords();
}

const signonsTreeView = {
  QueryInterface: ChromeUtils.generateQI(["nsITreeView"]),
  _filterSet: [],
  selection: null,

  rowCount: 0,
  setTree() {},
  getImageSrc(row, column) {
    if (column.element.getAttribute("id") !== "providerCol") {
      return "";
    }

    const signon = GetVisibleLogins()[row];

    return PlacesUtils.urlWithSizeRef(window, "page-icon:" + signon.origin, 16);
  },
  getCellValue() {},
  getCellText(row, column) {
    let time;
    const signon = GetVisibleLogins()[row];
    switch (column.id) {
      case "providerCol":
        return signon.httpRealm
          ? signon.origin + " (" + signon.httpRealm + ")"
          : signon.origin;
      case "userCol":
        return signon.username || "";
      case "passwordCol":
        return signon.password || "";
      case "timeCreatedCol":
        time = new Date(signon.timeCreated);
        return dateFormatter.format(time);
      case "timeLastUsedCol":
        time = new Date(signon.timeLastUsed);
        return dateAndTimeFormatter.format(time);
      case "timePasswordChangedCol":
        time = new Date(signon.timePasswordChanged);
        return dateFormatter.format(time);
      case "timesUsedCol":
        return signon.timesUsed;
      default:
        return "";
    }
  },
  isEditable(row, col) {
    if (col.id == "userCol" || col.id == "passwordCol") {
      return true;
    }
    return false;
  },
  isSeparator() {
    return false;
  },
  isSorted() {
    return false;
  },
  isContainer() {
    return false;
  },
  cycleHeader() {},
  getRowProperties() {
    return "";
  },
  getColumnProperties() {
    return "";
  },
  getCellProperties(row, column) {
    if (column.element.getAttribute("id") == "providerCol") {
      return "ltr";
    }

    return "";
  },
  setCellText(row, col, value) {
    const table = GetVisibleLogins();
    function _editLogin(field) {
      if (value == table[row][field]) {
        return;
      }
      const existingLogin = table[row].clone();
      table[row][field] = value;
      table[row].timePasswordChanged = Date.now();
      reloadDisplay = false;
      Services.logins.modifyLogin(existingLogin, table[row]);
      reloadDisplay = true;
      signonsTree.invalidateRow(row);
    }

    if (col.id == "userCol") {
      _editLogin("username");
    } else if (col.id == "passwordCol") {
      if (!value) {
        return;
      }
      _editLogin("password");
    }
  },
  getParentIndex() {
    return -1;
  },
};

function SortTree(column, ascending) {
  const table = GetVisibleLogins();
  // Remember which item was selected so we can restore it after sorting.
  const index = signonsTree.view.selection.currentIndex;
  const selectedGuid = index >= 0 ? table[index].guid : null;

  function compareFunc(a, b) {
    let valA, valB;
    switch (column) {
      case "origin": {
        let realmA = a.httpRealm;
        let realmB = b.httpRealm;
        realmA = realmA == null ? "" : realmA.toLowerCase();
        realmB = realmB == null ? "" : realmB.toLowerCase();

        valA = a[column].toLowerCase() + realmA;
        valB = b[column].toLowerCase() + realmB;
        break;
      }
      case "username":
      case "password": {
        valA = a[column].toLowerCase();
        valB = b[column].toLowerCase();
        break;
      }
      default:
        valA = a[column];
        valB = b[column];
    }

    if (valA < valB) {
      return -1;
    }
    if (valA > valB) {
      return 1;
    }
    return 0;
  }

  // Do the sort.
  table.sort(compareFunc);
  if (!ascending) {
    table.reverse();
  }

  // Restore the last selected item.
  const selectedIndex =
    table.findIndex(login => login.guid == selectedGuid) ?? -1;
  signonsTree.view.selection.select(selectedIndex);
  SignonSelected();

  // Display the results.
  signonsTree.invalidate();
  if (selectedIndex >= 0) {
    signonsTree.ensureRowIsVisible(selectedIndex);
  }
}

/**
 * Clear the view, load and sort signons.
 */
async function LoadSignons() {
  // Clear the display
  const oldRowCount = signonsTreeView.rowCount;
  signonsTreeView.rowCount = 0;
  signonsTree.rowCountChanged(0, -oldRowCount);

  // loads signons into table
  try {
    signons = await Services.logins.getAllLogins();
  } catch (e) {
    signons = [];
  }
  signons.forEach(login => login.QueryInterface(Ci.nsILoginMetaInfo));
  signonsTreeView.rowCount = signons.length;
  signonsTree.rowCountChanged(0, signons.length);

  // sort and display the table
  signonsTree.view = signonsTreeView;
  // The sort column didn't change. SortTree (called by
  // SignonColumnSort) assumes we want to toggle the sort
  // direction but here we don't so we have to trick it
  lastSignonSortAscending = !lastSignonSortAscending;
  SignonColumnSort(lastSignonSortColumn);

  // disable "remove all signons" button if there are no signons
  if (signons.length == 0) {
    removeAllButton.setAttribute("disabled", "true");
    togglePasswordsButton.setAttribute("disabled", "true");
  } else {
    removeAllButton.removeAttribute("disabled");
    togglePasswordsButton.removeAttribute("disabled");
  }
}

function GetVisibleLogins() {
  return signonsTreeView._filterSet.length
    ? signonsTreeView._filterSet
    : signons;
}

function GetTreeSelections() {
  const selections = [];
  const select = signonsTree.view.selection;
  if (select) {
    const count = select.getRangeCount();
    const min = {};
    const max = {};
    for (let i = 0; i < count; i++) {
      select.getRangeAt(i, min, max);
      for (let k = min.value; k <= max.value; k++) {
        if (k != -1) {
          selections[selections.length] = k;
        }
      }
    }
  }
  return selections;
}

function SignonSelected() {
  const selections = GetTreeSelections();
  if (selections.length) {
    removeButton.removeAttribute("disabled");
  } else {
    removeButton.setAttribute("disabled", true);
  }
}

async function DeleteSignon() {
  const syncNeeded = signonsTreeView._filterSet.length != 0;
  const tree = signonsTree;
  const view = signonsTreeView;
  const table = GetVisibleLogins();

  // Turn off tree selection notifications during the deletion
  tree.view.selection.selectEventsSuppressed = true;

  // remove selected items from list (by setting them to null) and place in deleted list
  const selections = GetTreeSelections();
  for (let s = selections.length - 1; s >= 0; s--) {
    const i = selections[s];
    deletedSignons.push(table[i]);
    table[i] = null;
  }

  // collapse list by removing all the null entries
  for (let j = 0; j < table.length; j++) {
    if (table[j] == null) {
      let k = j;
      while (k < table.length && table[k] == null) {
        k++;
      }
      table.splice(j, k - j);
      view.rowCount -= k - j;
      tree.rowCountChanged(j, j - k);
    }
  }

  // update selection and/or buttons
  if (table.length) {
    // update selection
    const nextSelection =
      selections[0] < table.length ? selections[0] : table.length - 1;
    tree.view.selection.select(nextSelection);
  } else {
    // disable buttons
    removeButton.setAttribute("disabled", "true");
    removeAllButton.setAttribute("disabled", "true");
  }
  tree.view.selection.selectEventsSuppressed = false;
  await FinalizeSignonDeletions(syncNeeded);
}

async function DeleteAllSignons() {
  // Confirm the user wants to remove all passwords
  const dummy = { value: false };
  const [title, message] = await document.l10n.formatValues([
    { id: "remove-all-passwords-title" },
    { id: "remove-all-passwords-prompt" },
  ]);
  if (
    Services.prompt.confirmEx(
      window,
      title,
      message,
      Services.prompt.STD_YES_NO_BUTTONS + Services.prompt.BUTTON_POS_1_DEFAULT,
      null,
      null,
      null,
      null,
      dummy
    ) == 1
  ) {
    // 1 == "No" button
    return;
  }

  const syncNeeded = signonsTreeView._filterSet.length != 0;
  const view = signonsTreeView;
  const table = GetVisibleLogins();

  // remove all items from table and place in deleted table
  for (let i = 0; i < table.length; i++) {
    deletedSignons.push(table[i]);
  }
  table.length = 0;

  // clear out selections
  view.selection.select(-1);

  // update the tree view and notify the tree
  view.rowCount = 0;

  signonsTree.rowCountChanged(0, -deletedSignons.length);
  signonsTree.invalidate();

  // disable buttons
  removeButton.setAttribute("disabled", "true");
  removeAllButton.setAttribute("disabled", "true");
  await FinalizeSignonDeletions(syncNeeded);
}

async function TogglePasswordVisible() {
  if (showingPasswords || (await masterPasswordLogin(AskUserShowPasswords))) {
    showingPasswords = !showingPasswords;
    document.l10n.setAttributes(
      togglePasswordsButton,
      showingPasswords ? "hide-passwords" : "show-passwords"
    );
    document.getElementById("passwordCol").hidden = !showingPasswords;
    if (filterField.value) {
      await FilterPasswords();
    }
  }

  // Notify observers that the password visibility toggling is
  // completed.  (Mostly useful for tests)
  Services.obs.notifyObservers(null, "passwordmgr-password-toggle-complete");
}

async function AskUserShowPasswords() {
  const dummy = { value: false };

  // Confirm the user wants to display passwords
  return (
    Services.prompt.confirmEx(
      window,
      null,
      await document.l10n.formatValue("no-master-password-prompt"),
      Services.prompt.STD_YES_NO_BUTTONS,
      null,
      null,
      null,
      null,
      dummy
    ) == 0
  ); // 0=="Yes" button
}

async function FinalizeSignonDeletions(syncNeeded) {
  reloadDisplay = false;
  for (let s = 0; s < deletedSignons.length; s++) {
    Services.logins.removeLogin(deletedSignons[s]);
  }
  reloadDisplay = true;
  // If the deletion has been performed in a filtered view, reflect the deletion in the unfiltered table.
  // See bug 405389.
  if (syncNeeded) {
    try {
      signons = await Services.logins.getAllLogins();
    } catch (e) {
      signons = [];
    }
  }
  deletedSignons.length = 0;
}

function HandleSignonKeyPress(e) {
  // If editing is currently performed, don't do anything.
  if (signonsTree.getAttribute("editing")) {
    return;
  }
  if (
    e.keyCode == KeyboardEvent.DOM_VK_DELETE ||
    (AppConstants.platform == "macosx" &&
      e.keyCode == KeyboardEvent.DOM_VK_BACK_SPACE)
  ) {
    DeleteSignon();
    e.preventDefault();
  }
}

function getColumnByName(column) {
  switch (column) {
    case "origin":
      return document.getElementById("providerCol");
    case "username":
      return document.getElementById("userCol");
    case "password":
      return document.getElementById("passwordCol");
    case "timeCreated":
      return document.getElementById("timeCreatedCol");
    case "timeLastUsed":
      return document.getElementById("timeLastUsedCol");
    case "timePasswordChanged":
      return document.getElementById("timePasswordChangedCol");
    case "timesUsed":
      return document.getElementById("timesUsedCol");
  }
  return undefined;
}

function SignonColumnSort(column) {
  const sortedCol = getColumnByName(column);
  const lastSortedCol = getColumnByName(lastSignonSortColumn);

  // clear out the sortDirection attribute on the old column
  lastSortedCol.removeAttribute("sortDirection");

  // determine if sort is to be ascending or descending
  lastSignonSortAscending =
    column == lastSignonSortColumn ? !lastSignonSortAscending : true;

  // sort
  lastSignonSortColumn = column;
  SortTree(lastSignonSortColumn, lastSignonSortAscending);

  // set the sortDirection attribute to get the styling going
  // first we need to get the right element
  sortedCol.setAttribute(
    "sortDirection",
    lastSignonSortAscending ? "ascending" : "descending"
  );
}

async function SignonClearFilter() {
  signonsTreeView._filterSet = [];

  // Just reload the list to make sure deletions are respected
  await LoadSignons();

  document.l10n.setAttributes(signonsIntro, "logins-description-all");
  document.l10n.setAttributes(removeAllButton, "remove-all");
}

function FocusFilterBox() {
  if (filterField.getAttribute("focused") != "true") {
    filterField.focus();
  }
}

function SignonMatchesFilter(aSignon, aFilterValue) {
  if (aSignon.origin.toLowerCase().includes(aFilterValue)) {
    return true;
  }
  if (
    aSignon.username &&
    aSignon.username.toLowerCase().includes(aFilterValue)
  ) {
    return true;
  }
  if (
    aSignon.httpRealm &&
    aSignon.httpRealm.toLowerCase().includes(aFilterValue)
  ) {
    return true;
  }
  if (
    showingPasswords &&
    aSignon.password &&
    aSignon.password.toLowerCase().includes(aFilterValue)
  ) {
    return true;
  }

  return false;
}

function _filterPasswords(aFilterValue) {
  aFilterValue = aFilterValue.toLowerCase();
  return signons.filter(s => SignonMatchesFilter(s, aFilterValue));
}

async function FilterPasswords() {
  if (filterField.value == "") {
    await SignonClearFilter();
    return;
  }

  const newFilterSet = _filterPasswords(filterField.value, signonsTreeView);
  signonsTreeView._filterSet = newFilterSet;

  // Clear the display
  const oldRowCount = signonsTreeView.rowCount;
  signonsTreeView.rowCount = 0;
  signonsTree.rowCountChanged(0, -oldRowCount);
  // Set up the filtered display
  signonsTreeView.rowCount = signonsTreeView._filterSet.length;
  signonsTree.rowCountChanged(0, signonsTreeView.rowCount);

  document.l10n.setAttributes(signonsIntro, "logins-description-filtered");
  document.l10n.setAttributes(removeAllButton, "remove-all-shown");
  if (signonsTreeView._filterSet.length == 0) {
    removeAllButton.setAttribute("disabled", "true");
  } else {
    removeAllButton.removeAttribute("disabled");
  }
}

function CopyProviderUrl() {
  // Copy selected provider url to clipboard
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  const row = signonsTree.currentIndex;
  const url = signonsTreeView.getCellText(row, { id: "providerCol" });
  clipboard.copyString(url);
}

async function CopyPassword() {
  // Don't copy passwords if we aren't already showing the passwords & a master
  // password hasn't been entered.
  if (!showingPasswords && !(await masterPasswordLogin())) {
    return;
  }
  // Copy selected signon's password to clipboard
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  const row = signonsTree.currentIndex;
  const password = signonsTreeView.getCellText(row, { id: "passwordCol" });
  clipboard.copyString(password);
}

function CopyUsername() {
  // Copy selected signon's username to clipboard
  const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
    Ci.nsIClipboardHelper
  );
  const row = signonsTree.currentIndex;
  const username = signonsTreeView.getCellText(row, { id: "userCol" });
  clipboard.copyString(username);
}

function EditCellInSelectedRow(columnName) {
  const row = signonsTree.currentIndex;
  const columnElement = getColumnByName(columnName);
  signonsTree.startEditing(
    row,
    signonsTree.columns.getColumnFor(columnElement)
  );
}

function UpdateContextMenu() {
  const singleSelection = signonsTreeView.selection.count == 1;
  const menuItems = new Map();
  const menupopup = document.getElementById("signonsTreeContextMenu");
  for (const menuItem of menupopup.querySelectorAll("menuitem")) {
    menuItems.set(menuItem.id, menuItem);
  }

  if (!singleSelection) {
    for (const menuItem of menuItems.values()) {
      menuItem.setAttribute("disabled", "true");
    }
    return;
  }

  const selectedRow = signonsTree.currentIndex;

  // Disable "Copy Username" if the username is empty.
  if (signonsTreeView.getCellText(selectedRow, { id: "userCol" }) != "") {
    menuItems.get("context-copyusername").removeAttribute("disabled");
  } else {
    menuItems.get("context-copyusername").setAttribute("disabled", "true");
  }

  menuItems.get("context-copyproviderurl").removeAttribute("disabled");
  menuItems.get("context-editusername").removeAttribute("disabled");
  menuItems.get("context-copypassword").removeAttribute("disabled");

  // Disable "Edit Password" if the password column isn't showing.
  if (!document.getElementById("passwordCol").hidden) {
    menuItems.get("context-editpassword").removeAttribute("disabled");
  } else {
    menuItems.get("context-editpassword").setAttribute("disabled", "true");
  }
}

async function masterPasswordLogin(noPasswordCallback) {
  // This doesn't harm if passwords are not encrypted
  const tokendb = Cc["@mozilla.org/security/pk11tokendb;1"].createInstance(
    Ci.nsIPK11TokenDB
  );
  const token = tokendb.getInternalKeyToken();

  const isOSAuthEnabled = LoginHelper.getOSAuthEnabled(
    LoginHelper.OS_AUTH_FOR_PASSWORDS_PREF
  );

  // If there is no primary password, still give the user a chance to opt-out of displaying passwords
  if (token.checkPassword("")) {
    // The OS re-authentication on Linux isn't working (Bug 1527745),
    // still add the confirm dialog for Linux.
    if (isOSAuthEnabled) {
      // Require OS authentication before the user can show the passwords or copy them.
      let messageId = "password-os-auth-dialog-message";
      if (AppConstants.platform == "macosx") {
        // MacOS requires a special format of this dialog string.
        // See preferences.ftl for more information.
        messageId += "-macosx";
      }
      const [messageText, captionText] = await document.l10n.formatMessages([
        {
          id: messageId,
        },
        {
          id: "password-os-auth-dialog-caption",
        },
      ]);
      const win = Services.wm.getMostRecentWindow("");
      const loggedIn = await OSKeyStore.ensureLoggedIn(
        messageText.value,
        captionText.value,
        win,
        false
      );
      if (!loggedIn.authenticated) {
        return false;
      }
      return true;
    }
    return noPasswordCallback ? noPasswordCallback() : true;
  }

  // So there's a primary password. But since checkPassword didn't succeed, we're logged out (per nsIPK11Token.idl).
  try {
    // Relogin and ask for the primary password.
    token.login(true); // 'true' means always prompt for token password. User will be prompted until
    // clicking 'Cancel' or entering the correct password.
  } catch (e) {
    // An exception will be thrown if the user cancels the login prompt dialog.
    // User is also logged out of Software Security Device.
  }

  return token.isLoggedIn();
}

function escapeKeyHandler() {
  // If editing is currently performed, don't do anything.
  if (signonsTree.getAttribute("editing")) {
    return;
  }
  window.close();
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// toolkit/content/treeUtils.js
/* globals gTreeUtils */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

var NOTIFICATION_FLUSH_PERMISSIONS = "flush-pending-permissions";

window.addEventListener("load", () => {
  gPermissionManager.onLoad();
});
window.addEventListener("unload", () => {
  gPermissionManager.uninit();
});
window.addEventListener("keypress", event => {
  gPermissionManager.onWindowKeyPress(event);
});

/**
 * Magic URI base used so the permission manager can store
 * remote content permissions for a given email address.
 */
var MAILURI_BASE = "chrome://messenger/content/email=";

function Permission(principal, type, capability) {
  this.principal = principal;
  this.origin = principal.origin;
  this.type = type;
  this.capability = capability;
}

var gPermissionManager = {
  _type: "",
  _permissions: [],
  _permissionsToAdd: new Map(),
  _permissionsToDelete: new Map(),
  _tree: null,
  _observerRemoved: false,

  _view: {
    QueryInterface: ChromeUtils.generateQI(["nsITreeView"]),
    _rowCount: 0,
    get rowCount() {
      return this._rowCount;
    },
    getCellText(aRow, aColumn) {
      if (aColumn.id == "siteCol") {
        return gPermissionManager._permissions[aRow].origin.replace(
          MAILURI_BASE,
          ""
        );
      } else if (aColumn.id == "statusCol") {
        return gPermissionManager._permissions[aRow].capability;
      }
      return "";
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
    setTree() {},
    getImageSrc() {},
    getProgressMode() {},
    getCellValue() {},
    cycleHeader() {},
    getRowProperties() {
      return "";
    },
    getColumnProperties() {
      return "";
    },
    getCellProperties(row, column) {
      if (column.element.getAttribute("id") == "siteCol") {
        return "ltr";
      }
      return "";
    },
  },

  async _getCapabilityString(aCapability) {
    var stringKey = null;
    switch (aCapability) {
      case Ci.nsIPermissionManager.ALLOW_ACTION:
        stringKey = "permission-can-label";
        break;
      case Ci.nsIPermissionManager.DENY_ACTION:
        stringKey = "permission-cannot-label";
        break;
      case Ci.nsICookiePermission.ACCESS_ALLOW_FIRST_PARTY_ONLY:
        stringKey = "permission-can-access-first-party-label";
        break;
      case Ci.nsICookiePermission.ACCESS_SESSION:
        stringKey = "permission-can-session-label";
        break;
    }
    const string = await document.l10n.formatValue(stringKey);
    return string;
  },

  async addPermission(aCapability) {
    var textbox = document.getElementById("url");
    var input_url = textbox.value.trim();
    let principal;
    try {
      // The origin accessor on the principal object will throw if the
      // principal doesn't have a canonical origin representation. This will
      // help catch cases where the URI parser parsed something like
      // `localhost:8080` as having the scheme `localhost`, rather than being
      // an invalid URI. A canonical origin representation is required by the
      // permission manager for storage, so this won't prevent any valid
      // permissions from being entered by the user.
      let uri;
      try {
        uri = Services.io.newURI(input_url);
        principal = Services.scriptSecurityManager.createContentPrincipal(
          uri,
          {}
        );
        // If we have ended up with an unknown scheme, the following will throw.
        principal.origin;
      } catch (ex) {
        const scheme =
          this._type != "image" || !input_url.includes("@")
            ? "http://"
            : MAILURI_BASE;
        uri = Services.io.newURI(scheme + input_url);
        principal = Services.scriptSecurityManager.createContentPrincipal(
          uri,
          {}
        );
        // If we have ended up with an unknown scheme, the following will throw.
        principal.origin;
      }
    } catch (ex) {
      const [title, message] = await document.l10n.formatValues([
        { id: "invalid-uri-title" },
        { id: "invalid-uri-message" },
      ]);
      Services.prompt.alert(window, title, message);
      return;
    }

    var capabilityString = await this._getCapabilityString(aCapability);

    // check whether the permission already exists, if not, add it
    let permissionExists = false;
    let capabilityExists = false;
    for (var i = 0; i < this._permissions.length; ++i) {
      // Thunderbird compares origins, not principals here.
      if (this._permissions[i].principal.origin == principal.origin) {
        permissionExists = true;
        capabilityExists = this._permissions[i].capability == capabilityString;
        if (!capabilityExists) {
          this._permissions[i].capability = capabilityString;
        }
        break;
      }
    }

    const permissionParams = {
      principal,
      type: this._type,
      capability: aCapability,
    };
    if (!permissionExists) {
      this._permissionsToAdd.set(principal.origin, permissionParams);
      this._addPermission(permissionParams);
    } else if (!capabilityExists) {
      this._permissionsToAdd.set(principal.origin, permissionParams);
      this._handleCapabilityChange();
    }

    textbox.value = "";
    textbox.focus();

    // covers a case where the site exists already, so the buttons don't disable
    this.onHostInput(textbox);

    // enable "remove all" button as needed
    document.getElementById("removeAllPermissions").disabled =
      this._permissions.length == 0;
  },

  _removePermission(aPermission) {
    this._removePermissionFromList(aPermission.principal);

    // If this permission was added during this session, let's remove
    // it from the pending adds list to prevent calls to the
    // permission manager.
    const isNewPermission = this._permissionsToAdd.delete(
      aPermission.principal.origin
    );

    if (!isNewPermission) {
      this._permissionsToDelete.set(aPermission.principal.origin, aPermission);
    }
  },

  _handleCapabilityChange() {
    // Re-do the sort, if the status changed from Block to Allow
    // or vice versa, since if we're sorted on status, we may no
    // longer be in order.
    if (this._lastPermissionSortColumn == "statusCol") {
      this._resortPermissions();
    }
    this._tree.invalidate();
  },

  _addPermission(aPermission) {
    this._addPermissionToList(aPermission);
    ++this._view._rowCount;
    this._tree.rowCountChanged(this._view.rowCount - 1, 1);
    // Re-do the sort, since we inserted this new item at the end.
    this._resortPermissions();
  },

  _resortPermissions() {
    gTreeUtils.sort(
      this._tree,
      this._view,
      this._permissions,
      this._lastPermissionSortColumn,
      this._permissionsComparator,
      this._lastPermissionSortColumn,
      !this._lastPermissionSortAscending
    ); // keep sort direction
  },

  onHostInput(aSiteField) {
    document.getElementById("btnSession").disabled = !aSiteField.value;
    document.getElementById("btnBlock").disabled = !aSiteField.value;
    document.getElementById("btnAllow").disabled = !aSiteField.value;
  },

  onWindowKeyPress(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_ESCAPE) {
      window.close();
    }
  },

  onHostKeyPress(aEvent) {
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN) {
      document.getElementById("btnAllow").click();
    }
  },

  onLoad() {
    var params = window.arguments[0];
    this.init(params);
  },

  init(aParams) {
    if (this._type) {
      // reusing an open dialog, clear the old observer
      this.uninit();
    }

    this._type = aParams.permissionType;
    this._manageCapability = aParams.manageCapability;

    var permissionsText = document.getElementById("permissionsText");
    while (permissionsText.hasChildNodes()) {
      permissionsText.lastChild.remove();
    }
    permissionsText.appendChild(document.createTextNode(aParams.introText));

    document.title = aParams.windowTitle;

    document.getElementById("btnBlock").hidden = !aParams.blockVisible;
    document.getElementById("btnSession").hidden = !aParams.sessionVisible;
    document.getElementById("btnAllow").hidden = !aParams.allowVisible;

    var urlFieldVisible =
      aParams.blockVisible || aParams.sessionVisible || aParams.allowVisible;

    var urlField = document.getElementById("url");
    urlField.value = aParams.prefilledHost;
    urlField.hidden = !urlFieldVisible;

    this.onHostInput(urlField);

    var urlLabel = document.getElementById("urlLabel");
    urlLabel.hidden = !urlFieldVisible;

    const treecols = document.getElementsByTagName("treecols")[0];
    treecols.addEventListener("click", event => {
      if (event.target.nodeName != "treecol" || event.button != 0) {
        return;
      }

      const sortField = event.target.getAttribute("data-field-name");
      if (!sortField) {
        return;
      }

      gPermissionManager.onPermissionSort(sortField);
    });

    Services.obs.notifyObservers(
      null,
      NOTIFICATION_FLUSH_PERMISSIONS,
      this._type
    );
    Services.obs.addObserver(this, "perm-changed");

    this._loadPermissions().then(() => urlField.focus());
  },

  uninit() {
    if (!this._observerRemoved) {
      Services.obs.removeObserver(this, "perm-changed");

      this._observerRemoved = true;
    }
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "perm-changed") {
      var permission = aSubject.QueryInterface(Ci.nsIPermission);

      // Ignore unrelated permission types.
      if (permission.type != this._type) {
        return;
      }

      if (aData == "added") {
        this._addPermission(permission);
      } else if (aData == "changed") {
        for (var i = 0; i < this._permissions.length; ++i) {
          if (permission.matches(this._permissions[i].principal, true)) {
            this._permissions[i].capability = this._getCapabilityString(
              permission.capability
            );
            break;
          }
        }
        this._handleCapabilityChange();
      } else if (aData == "deleted") {
        this._removePermissionFromList(permission);
      }
    }
  },

  onPermissionSelected() {
    var hasSelection = this._tree.view.selection.count > 0;
    var hasRows = this._tree.view.rowCount > 0;
    document.getElementById("removePermission").disabled =
      !hasRows || !hasSelection;
    document.getElementById("removeAllPermissions").disabled = !hasRows;
  },

  onPermissionDeleted() {
    if (!this._view.rowCount) {
      return;
    }
    var removedPermissions = [];
    gTreeUtils.deleteSelectedItems(
      this._tree,
      this._view,
      this._permissions,
      removedPermissions
    );
    for (var i = 0; i < removedPermissions.length; ++i) {
      var p = removedPermissions[i];
      this._removePermission(p);
    }
    document.getElementById("removePermission").disabled =
      !this._permissions.length;
    document.getElementById("removeAllPermissions").disabled =
      !this._permissions.length;
  },

  onAllPermissionsDeleted() {
    if (!this._view.rowCount) {
      return;
    }
    var removedPermissions = [];
    gTreeUtils.deleteAll(
      this._tree,
      this._view,
      this._permissions,
      removedPermissions
    );
    for (var i = 0; i < removedPermissions.length; ++i) {
      var p = removedPermissions[i];
      this._removePermission(p);
    }
    document.getElementById("removePermission").disabled = true;
    document.getElementById("removeAllPermissions").disabled = true;
  },

  onPermissionKeyPress(aEvent) {
    if (
      aEvent.keyCode == KeyEvent.DOM_VK_DELETE ||
      (AppConstants.platform == "macosx" &&
        aEvent.keyCode == KeyEvent.DOM_VK_BACK_SPACE)
    ) {
      this.onPermissionDeleted();
    }
  },

  _lastPermissionSortColumn: "",
  _lastPermissionSortAscending: false,
  _permissionsComparator(a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  },

  onPermissionSort(aColumn) {
    this._lastPermissionSortAscending = gTreeUtils.sort(
      this._tree,
      this._view,
      this._permissions,
      aColumn,
      this._permissionsComparator,
      this._lastPermissionSortColumn,
      this._lastPermissionSortAscending
    );
    this._lastPermissionSortColumn = aColumn;
  },

  onApplyChanges() {
    // Stop observing permission changes since we are about
    // to write out the pending adds/deletes and don't need
    // to update the UI
    this.uninit();

    for (const permissionParams of this._permissionsToAdd.values()) {
      Services.perms.addFromPrincipal(
        permissionParams.principal,
        permissionParams.type,
        permissionParams.capability
      );
    }

    for (const p of this._permissionsToDelete.values()) {
      Services.perms.removeFromPrincipal(p.principal, p.type);
    }

    window.close();
  },

  async _loadPermissions() {
    this._tree = document.getElementById("permissionsTree");
    this._permissions = [];

    for (const perm of Services.perms.all) {
      await this._addPermissionToList(perm);
    }

    this._view._rowCount = this._permissions.length;

    // sort and display the table
    this._tree.view = this._view;
    this.onPermissionSort("origin");

    // disable "remove all" button if there are none
    document.getElementById("removeAllPermissions").disabled =
      this._permissions.length == 0;
  },

  async _addPermissionToList(aPermission) {
    if (
      aPermission.type == this._type &&
      (!this._manageCapability ||
        aPermission.capability == this._manageCapability)
    ) {
      var principal = aPermission.principal;
      var capabilityString = await this._getCapabilityString(
        aPermission.capability
      );
      var p = new Permission(principal, aPermission.type, capabilityString);
      this._permissions.push(p);
    }
  },

  _removePermissionFromList(aPrincipal) {
    for (let i = 0; i < this._permissions.length; ++i) {
      // Thunderbird compares origins, not principals here.
      if (this._permissions[i].principal.origin == aPrincipal.origin) {
        this._permissions.splice(i, 1);
        this._view._rowCount--;
        this._tree.rowCountChanged(this._view.rowCount - 1, -1);
        this._tree.invalidate();
        break;
      }
    }
  },

  setOrigin(aOrigin) {
    document.getElementById("url").value = aOrigin;
  },
};

function setOrigin(aOrigin) {
  gPermissionManager.setOrigin(aOrigin);
}

function initWithParams(aParams) {
  gPermissionManager.init(aParams);
}

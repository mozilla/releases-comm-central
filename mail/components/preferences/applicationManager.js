/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// applications.js
/* globals gGeneralPane */

window.addEventListener("load", event => {
  gAppManagerDialog.init();
});

var gAppManagerDialog = {
  _removed: [],

  init() {
    this.handlerInfo = window.arguments[0];
    var bundle = document.getElementById("appManagerBundle");
    gGeneralPane._prefsBundle = document.getElementById("bundlePreferences");
    var description = this.handlerInfo.typeDescription;
    var key =
      this.handlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo
        ? "handleFile"
        : "handleProtocol";
    var contentText = bundle.getFormattedString(key, [description]);
    contentText = bundle.getFormattedString("descriptionApplications", [
      contentText,
    ]);
    document.getElementById("appDescription").textContent = contentText;

    const list = document.getElementById("appList");
    const listFragment = document.createDocumentFragment();
    for (const app of this.handlerInfo.possibleApplicationHandlers.enumerate()) {
      if (!gGeneralPane.isValidHandlerApp(app)) {
        continue;
      }

      const item = document.createXULElement("richlistitem");
      item.classList.add("typeLabel");
      listFragment.append(item);
      item.app = app;

      const image = document.createElement("img");
      image.classList.add("typeIcon");
      image.setAttribute("src", gGeneralPane._getIconURLForHandlerApp(app));
      image.setAttribute("alt", "");
      item.appendChild(image);

      const label = document.createElement("span");
      label.classList.add("typeDescription");
      label.textContent = app.name;
      item.appendChild(label);
    }
    list.append(listFragment);

    // Triggers onSelect which populates label.
    list.selectedIndex = 0;
  },

  onOK() {
    if (!this._removed.length) {
      // return early to avoid calling the |store| method.
      return;
    }

    for (var i = 0; i < this._removed.length; ++i) {
      this.handlerInfo.removePossibleApplicationHandler(this._removed[i]);
    }

    this.handlerInfo.store();
  },

  remove() {
    var list = document.getElementById("appList");
    this._removed.push(list.selectedItem.app);
    var index = list.selectedIndex;
    list.selectedItem.remove();
    if (list.getRowCount() == 0) {
      // The list is now empty, make the bottom part disappear
      document.getElementById("appDetails").hidden = true;
    } else {
      // Select the item at the same index, if we removed the last
      // item of the list, select the previous item
      if (index == list.getRowCount()) {
        --index;
      }
      list.selectedIndex = index;
    }
  },

  onSelect() {
    var list = document.getElementById("appList");
    if (!list.selectedItem) {
      document.getElementById("remove").disabled = true;
      return;
    }
    document.getElementById("remove").disabled = false;
    var app = list.selectedItem.app;
    var address = "";
    if (app instanceof Ci.nsILocalHandlerApp) {
      address = app.executable.path;
    } else if (app instanceof Ci.nsIWebHandlerApp) {
      address = app.uriTemplate;
    } else if (app instanceof Ci.nsIWebContentHandlerInfo) {
      address = app.uri;
    }
    document.getElementById("appLocation").value = address;
    var bundle = document.getElementById("appManagerBundle");
    var appType =
      app instanceof Ci.nsILocalHandlerApp
        ? "descriptionLocalApp"
        : "descriptionWebApp";
    document.getElementById("appType").value = bundle.getString(appType);
  },
};

document.addEventListener("dialogaccept", () => gAppManagerDialog.onOK());

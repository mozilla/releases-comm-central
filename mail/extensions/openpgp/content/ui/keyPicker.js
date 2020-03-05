/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var gKeyPicker = {
  _bundle: null,
  _list: null,

  gParams: null,

  onLoad() {
    this.gParams = window.arguments[0];
    document.mozSubdialogReady = this.init();
  },

  async init() {
    this._list = document.getElementById("keyIDBox");

    let frag = document.createDocumentFragment();

    for (let key of this.gParams.keys) {
      let richlistitem = this._createListItem(key);
      frag.appendChild(richlistitem);
    }

    this._list.appendChild(frag);

    document.getElementById("identityAddress").value = this.gParams.identity;
  },

  _createListItem(key) {
    let richlistitem = document.createXULElement("richlistitem");

    let row = document.createXULElement("hbox");
    row.setAttribute("flex", "1");

    let hbox = document.createXULElement("hbox");
    let user = document.createXULElement("label");
    user.setAttribute("value", key.userId);
    hbox.setAttribute("width", "0");
    hbox.setAttribute("class", "info-name");
    hbox.setAttribute("flex", "3");
    hbox.appendChild(user);
    row.appendChild(hbox);

    hbox = document.createXULElement("hbox");
    let id = document.createXULElement("label");
    id.setAttribute("value", key.keyId);
    hbox.setAttribute("width", "0");
    hbox.setAttribute("class", "info-name");
    hbox.setAttribute("flex", "1");
    hbox.appendChild(id);
    row.appendChild(hbox);

    hbox = document.createXULElement("hbox");
    let created = document.createXULElement("label");
    created.setAttribute("value", key.created);
    hbox.setAttribute("width", "0");
    hbox.setAttribute("class", "info-name");
    hbox.setAttribute("flex", "1");
    hbox.appendChild(created);
    row.appendChild(hbox);

    hbox = document.createXULElement("hbox");
    let expiry = document.createXULElement("label");
    expiry.setAttribute("value", key.expiry);
    hbox.setAttribute("width", "0");
    hbox.setAttribute("class", "info-name");
    hbox.setAttribute("flex", "1");
    hbox.appendChild(expiry);
    row.appendChild(hbox);

    richlistitem.appendChild(row);
    return richlistitem;
  },

  onApplyChanges() {
    this.gParams.canceled = false;
    this.gParams.index = this._list.selectedIndex;

    window.close();
  },
};

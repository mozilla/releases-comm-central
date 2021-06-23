/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var { ChatIcons } = ChromeUtils.import("resource:///modules/chatIcons.jsm");

var addBuddy = {
  onload() {
    let accountList = document.getElementById("accountlist");
    for (let acc of Services.accounts.getAccounts()) {
      if (!acc.connected) {
        continue;
      }
      let proto = acc.protocol;
      let item = accountList.appendItem(acc.name, acc.id, proto.name);
      item.setAttribute("image", ChatIcons.getProtocolIconURI(proto));
      item.setAttribute("class", "menuitem-iconic");
    }
    if (!accountList.itemCount) {
      document
        .getElementById("addBuddyDialog")
        .querySelector("dialog")
        .cancelDialog();
      throw new Error("No connected account!");
    }
    accountList.selectedIndex = 0;
  },

  oninput() {
    document
      .querySelector("dialog")
      .getButton("accept").disabled = !addBuddy.getValue("name");
  },

  getValue(aId) {
    return document.getElementById(aId).value;
  },

  create() {
    let account = Services.accounts.getAccountById(
      this.getValue("accountlist")
    );
    let group = document.getElementById("chatBundle").getString("defaultGroup");
    account.addBuddy(Services.tags.createTag(group), this.getValue("name"));
  },
};

document.addEventListener("dialogaccept", addBuddy.create.bind(addBuddy));

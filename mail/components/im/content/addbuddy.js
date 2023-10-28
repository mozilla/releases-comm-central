/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

var addBuddy = {
  onload() {
    const accountList = document.getElementById("accountlist");
    for (const acc of IMServices.accounts.getAccounts()) {
      if (!acc.connected) {
        continue;
      }
      const proto = acc.protocol;
      const item = accountList.appendItem(acc.name, acc.id, proto.name);
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
    document.querySelector("dialog").getButton("accept").disabled =
      !addBuddy.getValue("name");
  },

  getValue(aId) {
    return document.getElementById(aId).value;
  },

  create() {
    const account = IMServices.accounts.getAccountById(
      this.getValue("accountlist")
    );
    const group = Services.strings
      .createBundle("chrome://messenger/locale/chat.properties")
      .GetStringFromName("defaultGroup");
    account.addBuddy(IMServices.tags.createTag(group), this.getValue("name"));
  },
};

document.addEventListener("dialogaccept", addBuddy.create.bind(addBuddy));

window.addEventListener("load", event => {
  addBuddy.onload();
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


var addBuddy = {
  onload: function ab_onload() {
    this.buildAccountList();
    this.buildTagList();
  },

  buildAccountList: function ab_buildAccountList() {
    var accountList = document.getElementById("accountlist");
    for (let acc in getIter(Services.accounts.getAccounts())) {
      if (!acc.connected)
        continue;
      var proto = acc.protocol;
      var item = accountList.appendItem(acc.name, acc.id, proto.name);
      item.setAttribute("image", proto.iconBaseURI + "icon.png");
      item.setAttribute("class", "menuitem-iconic");
    }
    if (!accountList.itemCount) {
      document.getElementById("addBuddyDialog").cancelDialog();
      throw "No connected account!";
    }
    accountList.selectedIndex = 0;
  },

  buildTagList: function ab_buildTagList() {
    var tagList = document.getElementById("taglist");
    Services.tags.getTags().forEach(function(tag) {
      tagList.appendItem(tag.name, tag.id);
    });
    tagList.selectedIndex = 0;
  },

  oninput: function ab_oninput() {
    document.documentElement.getButton("accept").disabled =
      !addBuddy.getValue("name");
  },

  getValue: function ab_getValue(aId) { return document.getElementById(aId).value; },

  create: function ab_create() {
    var account = Services.accounts.getAccountById(this.getValue("accountlist"));
    var name = this.getValue("name");

    var tag;
    var taglist = document.getElementById("taglist");
    var items = taglist.getElementsByAttribute("label", taglist.label);
    if (items.length)
      tag = Services.tags.getTagById(items[0].value);
    else
      tag = Services.tags.createTag(taglist.label);

    account.addBuddy(tag, name);
  }
};

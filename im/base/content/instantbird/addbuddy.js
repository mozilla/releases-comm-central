
var addBuddy = {
  onload: function ab_onload() {
    this.pcs = Components.classes["@instantbird.org/purple/core;1"]
                         .getService(Ci.purpleICoreService);
    this.buildAccountList();
    this.buildTagList();
  },

  buildAccountList: function ab_buildAccountList() {
    var accountList = document.getElementById("accountlist");
    for (let acc in this.getAccounts()) {
      if (!acc.connected)
        continue;
      var proto = acc.protocol;
      var item = accountList.appendItem(acc.name, acc.id, proto.name);
      item.setAttribute("image", "chrome://instantbird/skin/prpl/" + proto.id + ".png");
      item.setAttribute("class", "menuitem-iconic");
    }
    if (!accountList.itemCount) {
      window.close();
      alert("No connected account!");
      return;
    }
    accountList.selectedIndex = 0;
  },

  buildTagList: function ab_buildTagList() {
    var tagList = document.getElementById("taglist");
    for (let tag in this.getTags())
      tagList.appendItem(tag.name, tag.id);
    tagList.selectedIndex = 0;
  },

  getValue: function ab_getValue(aId) {
    var elt = document.getElementById(aId);
    return elt.value;
  },

  create: function ab_create() {
    var account = this.pcs.getAccountById(this.getValue("accountlist"));
    var tag = this.pcs.getTagById(this.getValue("taglist"));
    this.pcs.addBuddy(account, tag, this.getValue("name"));
  },

  getAccounts: function ab_getAccounts() {
    return getIter(this.pcs.getAccounts, Ci.purpleIAccount);
  },
  getTags: function ab_getTags() {
    var DBConn = this.pcs.storageConnection;
    var statement = DBConn.createStatement("SELECT id, name FROM tags");
    while (statement.executeStep())
      yield { id: statement.getInt32(0),
              name: statement.getUTF8String(1) };
  }
};

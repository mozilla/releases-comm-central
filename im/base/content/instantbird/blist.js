const events = ["buddy-signed-on",
                "buddy-signed-off",
                "buddy-removed",
                "buddy-away",
                "buddy-idle",
                "account-connected",
                "account-disconnected",
                "new-text",
                "new-conversation",
                "purple-quit"];

var buddyList = {
  observe: function bl_observe(aBuddy, aTopic, aMsg) {
    //dump("received signal: " + aTopic + "\n");

    if (aTopic == "purple-quit") {
      window.close();
      return;
    }

    if (aTopic == "new-text" || aTopic == "new-conversation") {
/*
      var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                        .getService(Components.interfaces.nsIWindowMediator);
      var win = wm.getMostRecentWindow("Messenger:convs");
*/
      if (this.win && this.win.closed)
        this.win = null;

      if (!this.win) {
        this.win = window.open(convWindow, "Conversations", "chrome,resizable");
        this.win.pendingNotifications = [{object: aBuddy, topic: aTopic, msg: aMsg}];
      }
      else if (this.win.pendingNotifications)
        this.win.pendingNotifications.push({object: aBuddy, topic: aTopic, msg: aMsg});

      return;
    }

    if (aTopic == "account-connected" || aTopic == "account-disconnected") {
      this.checkNotDisconnected();
      return;
    }

    var pab = aBuddy.QueryInterface(Ci.purpleIAccountBuddy);
    var group = pab.tag;
    var groupId = "group" + group.id;
    var groupElt = document.getElementById(groupId);
    if (aTopic == "buddy-signed-on") {
      if (!groupElt) {
        groupElt = document.createElement("group");
        var parent = document.getElementById("buddylistbox");
        parent.appendChild(groupElt);
        groupElt.build(group);
      }
      groupElt.addBuddy(pab);
      return;
    }

    if (aTopic == "buddy-signed-off" ||
        (aTopic == "buddy-removed" && groupElt)) {
      groupElt.signedOff(pab);
    }

    if (aTopic == "buddy-idle" || aTopic == "buddy-away")
      groupElt.updateBuddy(pab);
  },

  getAccounts: function bl_getAccounts() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    return getIter(pcs.getAccounts, Ci.purpleIAccount);
  },
  checkNotDisconnected: function bl_checkNotDisconnected() {
    var addBuddyItem = document.getElementById("addBuddyMenuItem");

    for (let acc in this.getAccounts())
      if (acc.connected || acc.connecting) {
        addBuddyItem.disabled = false;
        return;
      }

    addBuddyItem.disabled = true;
    menus.accounts();
  },

  load: function bl_load() {
    initPurpleCore();
    buddyList.checkNotDisconnected();
    addObservers(buddyList, events);
    this.addEventListener("unload", buddyList.unload, false);
  },
  unload: function bl_unload() {
    removeObservers(buddyList, events);
    uninitPurpleCore();
  },

  getAway: function bl_getAway() {
    // prompt the user to enter an away message
    var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                           .getService(Components.interfaces.nsIPromptService);
    var bundle = document.getElementById("awayBundle");
    var message = {value: bundle.getString("away.default.message")};
    if (!prompts.prompt(window, bundle.getString("away.prompt.title"),
                        bundle.getString("away.prompt.message"), message,
                        null, {value: false}))
      return; // the user canceled

    // actually get away
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    pcs.away(message.value);

    // display the notification on the buddy list
    var buttons = [{
      accessKey: "",
      label: bundle.getString("away.back.button"),
      popup: null,
      callback: buddyList.getBack
    }];
    var nbox = document.getElementById("buddyListMsg");
    var notif = nbox.appendNotification(message.value, null,
                                        "chrome://instantbird/skin/away-16.png",
                                        nbox.PRIORITY_INFO_MEDIUM, buttons);
    notif.setAttribute("hideclose", "true");
    document.getElementById("getAwayMenuItem").disabled = true;
  },
  getBack: function bl_getBack() {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Components.interfaces.purpleICoreService);
    pcs.back(null);
    document.getElementById("getAwayMenuItem").disabled = false;
  }
};

function initPurpleCore()
{
  try {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    pcs.init();
  }
  catch (e) {
    alert(e);
  }
}

function uninitPurpleCore()
{
  try {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    pcs.quit();
  }
  catch (e) {
    alert(e);
  }
}

this.addEventListener("load", buddyList.load, false);

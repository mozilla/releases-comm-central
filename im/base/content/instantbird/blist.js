const events = ["buddy-signed-on",
                "buddy-signed-off",
                "buddy-removed",
                "purple-quit"];

var buddyList = {
  observe: function bl_observe(aBuddy, aTopic, aMsg) {
    //dump("received signal: " + aTopic + "\n");

    if (aTopic == "purple-quit") {
      window.close();
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
  },
  load: function bl_load() {
    addObservers(buddyList, events);
    this.addEventListener("unload", buddyList.unload, false);
  },
  unload: function bl_unload() {
    removeObservers(buddyList, events);
  }
};

this.addEventListener("load", buddyList.load, false);

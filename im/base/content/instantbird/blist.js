const events = ["buddy-signed-on", "purple-quit"];

var buddyList = {
  observe: function bl_observe(aBuddy, aTopic, aMsg) {
    //dump("received signal: " + aTopic + "\n");
    if (aTopic == "buddy-signed-on") {
      var elt = document.createElement("buddy");
      var parent = document.getElementById("buddylistbox");
      parent.appendChild(elt);
      elt.build(aBuddy.QueryInterface(Ci.purpleIBuddy));
      return;
    }

    if (aTopic == "purple-quit")
      window.close();
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

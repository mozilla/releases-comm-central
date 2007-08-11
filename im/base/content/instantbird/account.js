const Ci = Components.interfaces;

var account = {
  onload: function account_onload() {
    var protoList = document.getElementById("protolist");
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    var protocols = pcs.getProtocols();
    while (protocols.hasMoreElements()) {
      var proto = protocols.getNext().QueryInterface(Ci.purpleIProtocol);
      var id = proto.id;
      var item = protoList.appendItem(proto.name, id, id);
      item.setAttribute("image", "chrome://instantbird/skin/prpl/" + id + ".png");
      item.setAttribute("class", "menuitem-iconic");
    }
    protoList.selectedIndex = 0;
  }
};

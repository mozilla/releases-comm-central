const configWindow = "chrome://global/content/config.xul";

// For Venkman

function toOpenWindowByType(inType, uri) {
  var winopts = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar";
  window.open(uri, "_blank", winopts);
}

// End { For Venkman }

var debug = {
  config: function debug_config() {
    if (!menus.focus("Preferences:ConfigManager"))
      window.open(configWindow, "Config",
                  "chrome,resizable");
  },

  venkman: function debug_venkman() {
    start_venkman();
  },

  inspector: function debug_inspector() {
    inspectDOMDocument();
  },

  garbageCollect: function debug_garbageCollect() {
    window.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindowUtils)
          .garbageCollect();
  },

  load: function debug_load() {
    setTimeout(function() {
      // Load the Window DataSource so that browser windows opened subsequent to DOM
      // Inspector show up in the DOM Inspector's window list.
      var windowDS = Components.classes["@mozilla.org/rdf/datasource;1?name=window-mediator"]
                               .getService(Components.interfaces.nsIWindowDataSource);
    }, 0);
  }
};

window.addEventListener("load", debug.load, false);

function debug_enumerateProtocols()
{
  dump("trying to enumerate protocols:\n");
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Ci.purpleICoreService);
  for (let proto in getIter(pcs.getProtocols())) {
    dump(" " + proto.name + " " + proto.id + "\n");
    for (let opt in getIter(proto.getOptions())) {
      var type = { };
      type[opt.typeBool] = ["bool", opt.getBool];
      type[opt.typeInt] = ["int", opt.getInt];
      type[opt.typeString] = ["string", opt.getString];
      dump("  ("+ type[opt.type][0] + ") "  +
           opt.name + (opt.masked ? "(masked)" : "") + "\t" +
           type[opt.type][1]() + "\n");
    }
  }
}

function debug_connectAccount(aProto, aName, aPassword)
{
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Ci.purpleICoreService);

  var proto = pcs.getProtocolById(aProto);
  if (!proto)
    throw "Couldn't get protocol " + aProto;

  var acc = pcs.createAccount(aName, proto);
  acc.password = aPassword;
  dump("trying to connect to " + proto.name +
       " (" + proto.id + ") with " + aName + "\n");
  acc.connect();
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var configWindow = "chrome://global/content/config.xul";

var debug = {
  aboutMemory: function debug_aboutMemory() {
    openDialog("about:memory");
  },

  config: function debug_config() {
    Core.showWindow("Preferences:ConfigManager", configWindow, "Config",
                    "chrome,resizable,centerscreen");
  },

  inspector: function debug_inspector() {
    inspectDOMDocument(document);
  },

  garbageCollect: function debug_garbageCollect() {
    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
          .getInterface(Components.interfaces.nsIDOMWindowUtils)
          .garbageCollect();
  },

  forceOnline: function debug_forceOnline() {
    var ios = Services.io;
    ios.manageOfflineStatus = false;
    ios.offline = false;
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

window.addEventListener("load", debug.load);

function debug_enumerateProtocols()
{
  dump("trying to enumerate protocols:\n");
  for (let proto in getIter(Services.core.getProtocols())) {
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
  var proto = Services.core.getProtocolById(aProto);
  if (!proto)
    throw "Couldn't get protocol " + aProto;

  var acc = Services.accounts.createAccount(aName, proto);
  acc.password = aPassword;
  dump("trying to connect to " + proto.name +
       " (" + proto.id + ") with " + aName + "\n");
  acc.connect();
}

function debug_dumpBuddyList()
{
  let formatBuddy = (buddy => "  " + buddy.name + "\n   " + buddy.getAccounts().map(a => a.name).join(" "));
  let formatGroup = (aGroup => " Group " + aGroup.id + ": " + aGroup.name + "\n" + aGroup.getBuddies().map(formatBuddy).join("\n"));
  dump("Buddy list:\n\n" + Services.tags.getTags().map(formatGroup).join("\n\n") + "\n\n");
}

function dumpStack(offset, max_depth)
{
  if (!offset || offset<0) offset = 0;
  if (!max_depth) max_depth = 10;
  var frame = Components.stack;
  while(--max_depth && (frame=frame.caller)) {
    if (!offset)
      dump(frame+"\n");
    else
      --offset;
  }
  dump("\n");
}

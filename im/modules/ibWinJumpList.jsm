/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["WinJumpList"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imStatusUtils.jsm");

var WinJumpList = {
  winJumpListBuilder: null,

  /*
    Jumplist entries can be of the following 'type' (required attribute):
      type: "shortcut"        // nsIJumpListShortcut
        label: <string>,      //  label shown in the jumplist
        description: <string> //  longer description, shown in a tooltip
        parameter: <string>   //  commandline parameter for this action
        iconIndex: <int>      //  number of icon resource in executable
        id: <string>          //  Only used to identify a certain element
                              //   if an extension wants to insert an
                              //   item at a specific position
     or
      type: "separator"       // nsIJumpListSeparator, no way to customize this
        id: <string>          //  see description of shortcut id
  */
  // Default jumplist entries for changing the status.
  jumplistEntries: [
    { type: "shortcut",
      id: "status_available",
      get label() { return Status.toLabel("available"); },
      description: null,
      parameter: "-status available",
      iconIndex: 1
    },
    { type: "shortcut",
      id: "status_unavailable",
      get label() { return Status.toLabel("unavailable"); },
      description: null,
      parameter: "-status unavailable",
      iconIndex: 2
    },
    { type: "shortcut",
      id: "status_offline",
      get label() { return Status.toLabel("offline"); },
      description: null,
      parameter: "-status offline",
      iconIndex: 3
    }
  ],

  // This is called by the Instantbird core and does not need to be re-called by
  // any other code working with jump lists.
  init: function WJL_init() {
    let builder = Cc["@mozilla.org/windows-taskbar;1"]
                     .getService(Ci.nsIWinTaskbar).createJumpListBuilder();
    if (!builder || !builder.available)
      return;

    this.winJumpListBuilder = builder;

    // Set the jump list using the default jumplistEntries.
    this.set();
  },

  set: function WJL_set() {
    // Return early if winJumpListBuilder doesn't exist.
    if (!this.winJumpListBuilder)
      return;

    // Remove the current jump list so it can be replaced.
    this.reset();

    let items = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);

    for (let currentItem of this.jumplistEntries) {
      let item;
      if (currentItem.type == "separator")
        item = this._getSeparatorItem();
      else if (currentItem.type == "shortcut") {
        item = this._getHandlerAppItem(currentItem.label,
                                       currentItem.description,
                                       currentItem.parameter,
                                       currentItem.iconIndex);
      }
      else
        throw "Unknown jumplist item type: " + currentItem.type;

      items.appendElement(item, false);
    }

    try {
      // Initialize the array.
      let items2 = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
      this.winJumpListBuilder.initListBuild(items2);

      this.winJumpListBuilder.addListToBuild(
        Ci.nsIJumpListBuilder.JUMPLIST_CATEGORY_TASKS, items);

      // Send the list to Windows
      this.winJumpListBuilder.commitListBuild();
    } catch (e) {
      Cu.reportError(e);
    }
  },

  reset: function WJL_reset() {
    // Remove the jump list.
    if (this.winJumpListBuilder)
      this.winJumpListBuilder.deleteActiveList();
  },

  _getSeparatorItem: function WJL__getSeparatorItem() {
    return Cc["@mozilla.org/windows-jumplistseparator;1"]
              .createInstance(Ci.nsIJumpListSeparator);
  },

  _getHandlerAppItem: function WJL__getHandlerAppItem(aName, aDescription,
                                                      aArgs, aIconIndex) {
    var file = Services.dirsvc.get("XCurProcD", Ci.nsILocalFile);

    // XXX where can we grab this from in the build? Do we need to?
    file.append("instantbird.exe");

    var handlerApp = Cc["@mozilla.org/uriloader/local-handler-app;1"]
                        .createInstance(Ci.nsILocalHandlerApp);
    handlerApp.executable = file;
    // Handlers default to the leaf name if a name is not specified.
    if (aName && aName.length != 0)
      handlerApp.name = aName;
    handlerApp.detailedDescription = aDescription;
    handlerApp.appendParameter(aArgs);

    var item = Cc["@mozilla.org/windows-jumplistshortcut;1"]
                  .createInstance(Ci.nsIJumpListShortcut);
    item.app = handlerApp;
    item.iconIndex = aIconIndex;
    return item;
  }
};

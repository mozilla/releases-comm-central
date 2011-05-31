/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Instantbird.
 *
 * The Initial Developer of the Original Code is
 * Patrick Cloke <clokep@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Benedikt Pfeifer <benediktp@ymail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = ["WinJumpList"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/imServices.jsm");

XPCOMUtils.defineLazyGetter(this, "bundle", function()
  Services.strings.createBundle("chrome://instantbird/locale/winjumplist.properties")
);

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
      get label() bundle.GetStringFromName("available.label"),
      get description() bundle.GetStringFromName("available.tooltip"),
      parameter: "-status available",
      iconIndex: 1
    },
    { type: "shortcut",
      id: "status_away",
      get label() bundle.GetStringFromName("away.label"),
      get description() bundle.GetStringFromName("away.tooltip"),
      parameter: "-status away",
      iconIndex: 2
    },
    { type: "shortcut",
      id: "status_offline",
      get label() bundle.GetStringFromName("offline.label"),
      get description() bundle.GetStringFromName("offline.tooltip"),
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

    for each (let currentItem in this.jumplistEntries) {
      let item;
      if (currentItem.type == "separator")
        item = this._getSeparatorItem();
      else if (currentItem.type == "shortcut") {
        item = this._getHandlerAppItem(currentItem.label,
                                       currentItem.description,
                                       currentItem.parameter,
                                       currentItem.iconIndex);
      }
      else if (currentItem.type == "link")
        item = this._getLinkItem(currentItem.uri, currentItem.uriTitle);
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

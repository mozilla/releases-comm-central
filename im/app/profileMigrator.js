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
 * The Original Code is the Instantbird messenging client, released
 * 2007.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
const Cc = Components.classes;
const Ci = Components.interfaces;

function InstantbirdProfileMigrator() { }

InstantbirdProfileMigrator.prototype = {
  import: function() {
    var root = Cc["@mozilla.org/file/directory_service;1"].getService(Ci.nsIProperties)
                                                          .get("DefProfRt", Ci.nsIFile);
    if (root.leafName == "Profiles")
      root.leafName = "Instantbird";
    else
      root.append("instantbird");
    var profilesIni = root.clone();
    profilesIni.append("profiles.ini");
    if (!profilesIni.exists())
      return;

    var parser = Cc["@mozilla.org/xpcom/ini-parser-factory;1"].getService(Ci.nsIINIParserFactory)
                                                              .createINIParser(profilesIni);
    var profileService = Cc["@mozilla.org/toolkit/profile-service;1"].getService(Ci.nsIToolkitProfileService);
    profileService.startWithLastProfile = parser.getString("General", "StartWithLastProfile") == "1";

    for (var i = 0; 1; ++i) {
      var section = "Profile" + i;
      var name;
      try {
        name = parser.getString(section, "Name");
      } catch(e) {
        break;
      }
      var isRelative = parser.getString(section, "IsRelative");
      var path = parser.getString(section, "Path");
      var prof;
      if (isRelative == "1") {
        prof = root.clone().QueryInterface(Ci.nsILocalFile);
        prof.setRelativeDescriptor(root, path);
      }
      else {
        prof = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile)
                                              .initWithPath(path);
      }
      var currentProfile = profileService.createProfile(prof, null, name);

      try {
        if (parser.getString(section, "Default") == "1")
          profileService.selectedProfile = currentProfile;
      } catch(e) {}
    }
  },
  migrate: function(aStartup) { },

  classDescription: "Instantbird Profile Migrator",
  classID: Components.ID("028ab7f2-5c83-4643-b846-09119c702faa"),
  contractID: "@mozilla.org/toolkit/profile-migrator;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProfileMigrator]),
}

function NSGetModule(aCompMgr, aFileSpec) {
  return XPCOMUtils.generateModule([InstantbirdProfileMigrator]);
}

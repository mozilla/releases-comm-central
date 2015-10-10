/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
var Cc = Components.classes;
var Ci = Components.interfaces;

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
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIProfileMigrator])
};

var NSGetFactory =
  XPCOMUtils.generateNSGetFactory([InstantbirdProfileMigrator]);

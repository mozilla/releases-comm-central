/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ThunderbirdProfileImporter"];

/**
 * An object to represent a source profile to import from.
 * @typedef {Object} SourceProfile
 * @property {string} name - The profile name.
 * @property {nsIFile} dir - The profile location.
 */

/**
 * A class that can import things from another thunderbird profile dir into the
 * current profile.
 */
class ThunderbirdProfileImporter {
  useFilePicker = true;

  /**
   * @type {SourceProfile[]} - Other thunderbird profiles found on this machine.
   */
  get sourceProfiles() {
    let profileService = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);
    let sourceProfiles = [];
    for (let profile of profileService.profiles) {
      if (profile == profileService.currentProfile) {
        continue;
      }
      sourceProfiles.push({
        name: profile.name,
        dir: profile.rootDir,
      });
    }
    return sourceProfiles;
  }

  /**
   * Actually start importing things to the current profile.
   */
  startImport() {}
}

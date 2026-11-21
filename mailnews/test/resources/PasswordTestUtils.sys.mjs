/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

export class PasswordTestUtils {
  /**
   * Use the given logins file, and the key4.db next to it, as the profile's
   * login storage. Must be called before the login manager is first used, and
   * after the test has called do_get_profile().
   *
   * @param {nsIFile} signonsFile - A logins.json style file.
   * @returns {Promise} Resolves when the login storage is usable.
   */
  static async setupLoginStorage(signonsFile) {
    const keyDB = signonsFile.parent.clone();
    keyDB.append("key4.db");
    await IOUtils.copy(
      keyDB.path,
      PathUtils.join(PathUtils.profileDir, "key4.db")
    );
    await IOUtils.copy(
      signonsFile.path,
      PathUtils.join(PathUtils.profileDir, "logins.json")
    );
    return Services.logins.initializationPromise;
  }
}

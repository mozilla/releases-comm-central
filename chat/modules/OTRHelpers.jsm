/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");

var OTRHelpers = {
  profilePath(filename) {
    return PathUtils.join(
      Services.dirsvc.get("ProfD", Ci.nsIFile).path,
      filename
    );
  },

  *getAccounts() {
    for (let account of Services.accounts.getAccounts()) {
      yield account;
    }
  },

  readTextFile(filename) {
    return IOUtils.readUTF8(filename);
  },

  writeTextFile(filename, data) {
    // https://dutherenverseauborddelatable.wordpress.com/2014/02/05/is-my-data-on-the-disk-safety-properties-of-os-file-writeatomic/
    return IOUtils.writeUTF8(filename, data, { tmpPath: `${filename}.tmp` });
  },
};

// exports

const EXPORTED_SYMBOLS = ["OTRHelpers"];

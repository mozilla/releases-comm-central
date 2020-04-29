/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");

var OTRHelpers = {
  profilePath(filename) {
    return OS.Path.join(OS.Constants.Path.profileDir, filename);
  },

  *getAccounts() {
    for (let account of Services.accounts.getAccounts()) {
      yield account;
    }
  },

  readTextFile(filename) {
    let decoder = new TextDecoder();
    return OS.File.read(filename).then(function(array) {
      return decoder.decode(array);
    });
  },

  writeTextFile(filename, data) {
    let encoder = new TextEncoder();
    let array = encoder.encode(data);
    // https://dutherenverseauborddelatable.wordpress.com/2014/02/05/is-my-data-on-the-disk-safety-properties-of-os-file-writeatomic/
    return OS.File.writeAtomic(filename, array, { tmpPath: `${filename}.tmp` });
  },
};

// exports

const EXPORTED_SYMBOLS = ["OTRHelpers"];

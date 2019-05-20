/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
  * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var MODULE_NAME = "cloudfile-helpers";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers"];

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.jsm");
var os = ChromeUtils.import("chrome://mozmill/content/stdlib/os.jsm");

var kMockContractIDPrefix = "@mozilla.org/mail/mockCloudFile;1?id=";

var kDefaults = {
  type: "default",
  iconURL: "chrome://messenger/content/extension.svg",
  accountKey: null,
  settingsURL: "",
  managementURL: "",
  authErr: cloudFileAccounts.constants.authErr,
  offlineErr: cloudFileAccounts.constants.offlineErr,
  uploadErr: cloudFileAccounts.constants.uploadErr,
  uploadWouldExceedQuota: cloudFileAccounts.constants.uploadWouldExceedQuota,
  uploadExceedsFileLimit: cloudFileAccounts.constants.uploadExceedsFileLimit,
  uploadCancelled: cloudFileAccounts.constants.uploadCancelled,
};

var fdh;

function setupModule(module) {
  fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
}

function installInto(module) {
  setupModule(module);
  module.gMockCloudfileManager = gMockCloudfileManager;
  module.MockCloudfileAccount = MockCloudfileAccount;
  module.getFile = getFile;
  module.collectFiles = collectFiles;
}


function getFile(aFilename, aRoot) {
  let path = os.getFileForPath(aRoot);
  let file = os.getFileForPath(os.abspath(aFilename, path));
  fdh.assert_true(file.exists, "File " + aFilename + " does not exist.");
  return file;
}

/**
 * Helper function for getting the nsIFile's for some files located
 * in a subdirectory of the test directory.
 *
 * @param aFiles an array of filename strings for files underneath the test
 *               file directory.
 * @param aFileRoot the file who's parent directory we should start looking
 *                  for aFiles in.
 *
 * Example:
 * let files = collectFiles(['./data/testFile1', './data/testFile2'],
 *                          __file__);
 */
function collectFiles(aFiles, aFileRoot) {
  return aFiles.map(filename => getFile(filename, aFileRoot));
}

function MockCloudfileAccount() {
  for (let someDefault in kDefaults)
    this[someDefault] = kDefaults[someDefault];
}

MockCloudfileAccount.prototype = {
  init(aAccountKey) {
    this.accountKey = aAccountKey;
  },

  uploadFile(aFile) {
    return new Promise(resolve => fdh.mc.window.setTimeout(resolve));
  },

  urlForFile(aFile) {
    return `http://www.example.com/${this.accountKey}/${aFile.leafName}`;
  },

  cancelFileUpload(aFile) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  deleteFile(aFile) {
    return new Promise(resolve => fdh.mc.window.setTimeout(resolve));
  },

  get displayName() {
    return cloudFileAccounts.getDisplayName(this.accountKey);
  },
};

var gMockCloudfileManager = {
  _mock_map: {},

  register(aID, aOverrides) {
    if (!aID)
      aID = "default";

    if (!aOverrides)
      aOverrides = {};

    cloudFileAccounts.registerProvider(aID, {
      type: aID,
      displayName: aID,
      iconURL: "chrome://messenger/content/extension.svg",
      initAccount(accountKey) {
        let account = new MockCloudfileAccount();

        for (let someDefault in kDefaults)
          account[someDefault] = kDefaults[someDefault];

        for (let override in aOverrides)
          account[override] = aOverrides[override];

        account.init(accountKey);
        return account;
      },
    });
  },

  unregister(aID) {
    if (!aID)
      aID = "default";

    cloudFileAccounts.unregisterProvider(aID);
  },
};

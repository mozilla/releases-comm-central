/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "gMockCloudfileManager",
  "MockCloudfileAccount",
  "getFile",
  "collectFiles",
];

var fdh = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

var kDefaults = {
  type: "default",
  iconURL: "chrome://messenger/content/extension.svg",
  accountKey: null,
  managementURL: "",
  authErr: cloudFileAccounts.constants.authErr,
  offlineErr: cloudFileAccounts.constants.offlineErr,
  uploadErr: cloudFileAccounts.constants.uploadErr,
  uploadWouldExceedQuota: cloudFileAccounts.constants.uploadWouldExceedQuota,
  uploadExceedsFileLimit: cloudFileAccounts.constants.uploadExceedsFileLimit,
  uploadCancelled: cloudFileAccounts.constants.uploadCancelled,
};

function getFile(aFilename, aRoot) {
  var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(aRoot);
  file.append(aFilename);
  Assert.ok(file.exists, "File " + aFilename + " does not exist.");
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
  for (let someDefault in kDefaults) {
    this[someDefault] = kDefaults[someDefault];
  }
}

MockCloudfileAccount.prototype = {
  nextId: 1,

  init(aAccountKey) {
    this.accountKey = aAccountKey;
  },

  uploadFile(window, aFile) {
    return new Promise((resolve, reject) => {
      gMockCloudfileManager.inProgressUploads.add({
        resolve,
        reject,
        resolveData: {
          id: this.nextId++,
          url: this.urlForFile(aFile),
          path: aFile.path,
          leafName: aFile.leafName,
        },
      });
    });
  },

  urlForFile(aFile) {
    return `http://www.example.com/${this.accountKey}/${aFile.leafName}`;
  },

  cancelFileUpload(window, aUploadId) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  deleteFile(window, aUploadId) {
    return new Promise(resolve => fdh.mc.window.setTimeout(resolve));
  },

  get displayName() {
    return cloudFileAccounts.getDisplayName(this.accountKey);
  },
};

var gMockCloudfileManager = {
  _mock_map: {},

  register(aID, aOverrides) {
    if (!aID) {
      aID = "default";
    }

    if (!aOverrides) {
      aOverrides = {};
    }

    cloudFileAccounts.registerProvider(aID, {
      type: aID,
      displayName: aID,
      iconURL: "chrome://messenger/content/extension.svg",
      initAccount(accountKey) {
        let account = new MockCloudfileAccount();

        for (let someDefault in kDefaults) {
          account[someDefault] = kDefaults[someDefault];
        }

        for (let override in aOverrides) {
          account[override] = aOverrides[override];
        }

        account.init(accountKey);
        return account;
      },
    });
  },

  unregister(aID) {
    if (!aID) {
      aID = "default";
    }

    cloudFileAccounts.unregisterProvider(aID);
  },

  inProgressUploads: new Set(),
  resolveUploads() {
    for (let upload of this.inProgressUploads.values()) {
      upload.resolve(upload.resolveData);
    }
    this.inProgressUploads.clear();
  },
  rejectUploads() {
    for (let upload of this.inProgressUploads.values()) {
      upload.reject(cloudFileAccounts.constants.uploadErr);
    }
    this.inProgressUploads.clear();
  },
};

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as fdh from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { cloudFileAccounts } from "resource:///modules/cloudFileAccounts.sys.mjs";

var kDefaults = {
  type: "default",
  displayName: "default",
  iconURL: "chrome://messenger/content/extension.svg",
  accountKey: null,
  managementURL: "",
  reuseUploads: true,
  authErr: cloudFileAccounts.constants.authErr,
  offlineErr: cloudFileAccounts.constants.offlineErr,
  uploadErr: cloudFileAccounts.constants.uploadErr,
  uploadWouldExceedQuota: cloudFileAccounts.constants.uploadWouldExceedQuota,
  uploadExceedsFileLimit: cloudFileAccounts.constants.uploadExceedsFileLimit,
  uploadCancelled: cloudFileAccounts.constants.uploadCancelled,
};

export function getFile(aFilename, aRoot) {
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
export function collectFiles(aFiles, aFileRoot) {
  return aFiles.map(filename => getFile(filename, aFileRoot));
}

export function MockCloudfileAccount() {
  for (const someDefault in kDefaults) {
    this[someDefault] = kDefaults[someDefault];
  }
}

MockCloudfileAccount.prototype = {
  _nextId: 1,
  _uploads: new Map(),

  init(aAccountKey, aOverrides = {}) {
    for (const override in aOverrides) {
      this[override] = aOverrides[override];
    }
    this.accountKey = aAccountKey;

    Services.prefs.setCharPref(
      "mail.cloud_files.accounts." + aAccountKey + ".displayName",
      aAccountKey
    );
    Services.prefs.setCharPref(
      "mail.cloud_files.accounts." + aAccountKey + ".type",
      aAccountKey
    );
    cloudFileAccounts._accounts.set(aAccountKey, this);
  },

  renameFile(window, uploadId, newName) {
    if (this.renameError) {
      throw Components.Exception(
        this.renameError.message,
        this.renameError.result
      );
    }

    const upload = this._uploads.get(uploadId);
    upload.url = `https://www.example.com/${this.accountKey}/${newName}`;
    upload.name = newName;
    return upload;
  },

  isReusedUpload() {
    return false;
  },

  uploadFile(window, aFile) {
    if (this.uploadError) {
      return Promise.reject(
        Components.Exception(this.uploadError.message, this.uploadError.result)
      );
    }

    return new Promise((resolve, reject) => {
      const upload = {
        // Values used in the WebExtension CloudFile type.
        id: this._nextId++,
        url: this.urlForFile(aFile),
        name: aFile.leafName,
        // Properties of the local file.
        path: aFile.path,
        size: aFile.exists() ? aFile.fileSize : 0,
        // Use aOverrides to set these.
        serviceIcon: this.serviceIcon || this.iconURL,
        serviceName: this.serviceName || this.displayName,
        serviceUrl: this.serviceUrl || "",
        downloadPasswordProtected: this.downloadPasswordProtected || false,
        downloadLimit: this.downloadLimit || 0,
        downloadExpiryDate: this.downloadExpiryDate || null,
        // Usage tracking.
        immutable: false,
      };
      this._uploads.set(upload.id, upload);
      gMockCloudfileManager.inProgressUploads.add({
        resolve,
        reject,
        resolveData: upload,
      });
    });
  },

  urlForFile(aFile) {
    return `https://www.example.com/${this.accountKey}/${aFile.leafName}`;
  },

  cancelFileUpload() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  deleteFile() {
    return new Promise(resolve => fdh.mc.setTimeout(resolve));
  },
};

export var gMockCloudfileManager = {
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
      initAccount(accountKey, aAccountOverrides = {}) {
        const account = new MockCloudfileAccount();
        for (const override in aOverrides) {
          if (!aAccountOverrides.hasOwnProperty(override)) {
            aAccountOverrides[override] = aOverrides[override];
          }
        }
        account.init(accountKey, aAccountOverrides);
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
    const uploads = [];
    for (const upload of this.inProgressUploads.values()) {
      uploads.push(upload.resolveData);
      upload.resolve(upload.resolveData);
    }
    this.inProgressUploads.clear();
    return uploads;
  },
  rejectUploads() {
    for (const upload of this.inProgressUploads.values()) {
      upload.reject(
        Components.Exception(
          "Upload error.",
          cloudFileAccounts.constants.uploadErr
        )
      );
    }
    this.inProgressUploads.clear();
  },
};

export class CloudFileTestProvider {
  constructor(name = "CloudFileTestProvider") {
    this.extension = null;
    this.name = name;
  }

  get providerType() {
    return `ext-${this.extension.id}`;
  }

  /**
   * Register an extension based cloudFile provider.
   *
   * @param testScope - scope of the test, mostly "this"
   * @param [background] - optional background script, overriding the default
   */
  async register(testScope, background) {
    if (!testScope) {
      throw new Error("Missing testScope for CloudFileTestProvider.init().");
    }

    async function default_background() {
      function fileListener(account, { name }) {
        return { url: "https://example.com/" + name };
      }
      browser.cloudFile.onFileUpload.addListener(fileListener);
    }

    this.extension = testScope.ExtensionTestUtils.loadExtension({
      files: {
        "background.js": background || default_background,
      },
      manifest: {
        cloud_file: {
          name: this.name,
          management_url: "/content/management.html",
        },
        applications: { gecko: { id: `${this.name}@mochi.test` } },
        background: { scripts: ["background.js"] },
      },
    });

    await this.extension.startup();
  }

  async unregister() {
    cloudFileAccounts.unregisterProvider(this.providerType);
    await this.extension.unload();
  }

  async createAccount(displayName) {
    const account = await cloudFileAccounts.createAccount(this.providerType);
    cloudFileAccounts.setDisplayName(account, displayName);
    return account;
  }

  removeAccount(aKeyOrAccount) {
    return cloudFileAccounts.removeAccount(aKeyOrAccount);
  }
}

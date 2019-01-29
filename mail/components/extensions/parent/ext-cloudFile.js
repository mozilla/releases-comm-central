/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {ExtensionParent} = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");
var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.js");

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

async function promiseFileRead(nsifile) {
  let blob = await File.createFromNsIFile(nsifile);

  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.addEventListener("loadend", () => {
      resolve(reader.result);
    });
    reader.addEventListener("onerror", reject);

    reader.readAsArrayBuffer(blob);
  });
}

class CloudFileProvider extends EventEmitter {
  constructor(extension) {
    super();

    this.extension = extension;
    this.configured = false;
    this.accountKey = false;
    this.lastError = "";
    this.settingsURL = this.extension.manifest.cloud_file.settings_url;
    this.managementURL = this.extension.manifest.cloud_file.management_url;
    this.quota = {
      uploadSizeLimit: -1,
      spaceRemaining: -1,
      spaceUsed: -1,
    };

    this._nextId = 1;
    this._fileUrls = new Map();
    this._fileIds = new Map();
  }

  get type() {
    return `ext-${this.extension.id}`;
  }
  get displayName() {
    return this.extension.manifest.cloud_file.name;
  }
  get serviceURL() {
    return this.extension.manifest.cloud_file.service_url;
  }
  get iconClass() {
    if (this.extension.manifest.icons) {
      let { icon } = ExtensionParent.IconDetails.getPreferredIcon(
        this.extension.manifest.icons, this.extension, 32
      );
      return this.extension.getURL(icon);
    }
    return "chrome://messenger/content/extension.svg";
  }
  get fileUploadSizeLimit() {
    return this.quota.uploadSizeLimit;
  }
  get remainingFileSpace() {
    return this.quota.spaceRemaining;
  }
  get fileSpaceUsed() {
    return this.quota.spaceUsed;
  }
  get createNewAccountUrl() {
    return this.extension.manifest.cloud_file.new_account_url;
  }

  init(accountKey) {
    this.accountKey = accountKey;
    Services.prefs.setCharPref(
      `mail.cloud_files.accounts.${accountKey}.displayName`, this.displayName
    );
  }

  async uploadFile(file, callback) {
    let id = this._nextId++;
    let results;

    try {
      let buffer = await promiseFileRead(file);

      this._fileIds.set(file.path, id);
      results = await this.emit("uploadFile", {
        id,
        name: file.leafName,
        data: buffer,
      });
    } catch (ex) {
      if (ex.result == 0x80530014) { // NS_ERROR_DOM_ABORT_ERR
        callback.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.uploadCanceled);
      } else {
        console.error(ex);
        callback.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.uploadErr);
      }
      return;
    }

    if (results && results.length > 0) {
      if (results[0].aborted) {
        callback.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.uploadCanceled);
        return;
      }

      let url = results[0].url;
      this._fileUrls.set(file.path, url);
      callback.onStopRequest(null, null, Cr.NS_OK);
    } else {
      callback.onStopRequest(null, null, Ci.nsIMsgCloudFileProvider.uploadErr);
      throw new ExtensionUtils.ExtensionError(
        `Missing cloudFile.onFileUpload listener for ${this.extension.id}`
      );
    }
  }

  urlForFile(file) {
    return this._fileUrls.get(file.path);
  }

  cancelFileUpload(file) {
    this.emit("uploadAbort", {
      id: this._fileIds.get(file.path),
    });
  }

  refreshUserInfo(withUI, callback) {
    if (Services.io.offline) {
      throw Ci.nsIMsgCloudFileProvider.offlineErr;
    }
    callback.onStopRequest(null, null, Cr.NS_OK);
  }

  async deleteFile(file, callback) {
    let results;
    try {
      if (this._fileIds.has(file.path)) {
        let id = this._fileIds.get(file.path);
        results = await this.emit("deleteFile", { id });
      }
    } catch (ex) {
      callback.onStopRequest(null, null, Cr.NS_ERROR_FAILURE);
    }

    if (results && results.length > 0) {
      callback.onStopRequest(null, null, Cr.NS_OK);
    } else {
      callback.onStopRequest(null, null, Cr.NS_ERROR_FAILURE);
      throw new ExtensionUtils.ExtensionError(
        `Missing cloudFile.onFileDeleted listener for ${this.extension.id}`
      );
    }
  }

  createNewAccount(...args) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  }

  createExistingAccount(callback) {
    if (Services.io.offline) {
      throw Ci.nsIMsgCloudFileProvider.offlineErr;
    }
    // We're assuming everything is ok here. Maybe expose this in the future if there is a need
    callback.onStopRequest(null, this, Cr.NS_OK);
  }

  providerUrlForError(error) {
    return "";
  }

  overrideUrls(count, urls) {
  }

  register() {
    cloudFileAccounts.registerProvider(this);
  }

  unregister() {
    cloudFileAccounts.unregisterProvider(this.type);
  }
}
CloudFileProvider.prototype.QueryInterface = ChromeUtils.generateQI([Ci.nsIMsgCloudFileProvider]);

function convertCloudFileAccount(nativeAccount) {
  return {
    id: nativeAccount.accountKey,
    name: nativeAccount.displayName,
    configured: nativeAccount.configured,
    uploadSizeLimit: nativeAccount.fileUploadSizeLimit,
    spaceRemaining: nativeAccount.remainingFileSpace,
    spaceUsed: nativeAccount.fileSpaceUsed,
    managementUrl: nativeAccount.managementURL,
    settingsUrl: nativeAccount.settingsURL,
  };
}

this.cloudFile = class extends ExtensionAPI {
  onManifestEntry(entryName) {
    if (entryName == "cloud_file" && !this.provider) {
      this.provider = new CloudFileProvider(this.extension);
      this.provider.register();
    }
  }

  onShutdown() {
    if (this.provider) {
      this.provider.unregister();
    }
  }

  getAPI(context) {
    let self = this;
    return {
      cloudFile: {
        onFileUpload: new EventManager({
          context,
          name: "cloudFile.onFileUpload",
          register: fire => {
            let listener = (event, { id, name, data }) => {
              let account = convertCloudFileAccount(self.provider);
              return fire.async(account, { id, name, data });
            };

            self.provider.on("uploadFile", listener);
            return () => {
              self.provider.off("uploadFile", listener);
            };
          },
        }).api(),

        onFileUploadAbort: new EventManager({
          context,
          name: "cloudFile.onFileUploadAbort",
          register: fire => {
            let listener = (event, { id }) => {
              let account = convertCloudFileAccount(self.provider);
              return fire.async(account, id);
            };

            self.provider.on("uploadAbort", listener);
            return () => {
              self.provider.off("uploadAbort", listener);
            };
          },
        }).api(),

        onFileDeleted: new EventManager({
          context,
          name: "cloudFile.onFileDeleted",
          register: fire => {
            let listener = (event, { id }) => {
              let account = convertCloudFileAccount(self.provider);
              return fire.async(account, id);
            };

            self.provider.on("deleteFile", listener);
            return () => {
              self.provider.off("deleteFile", listener);
            };
          },
        }).api(),

        onAccountAdded: new EventManager({
          context,
          name: "cloudFile.onAccountAdded",
          register: fire => {
            let listener = (event, nativeAccount) => {
              if (nativeAccount.type != this.provider.type) {
                return null;
              }

              return fire.async(convertCloudFileAccount(nativeAccount));
            };

            cloudFileAccounts.on("accountAdded", listener);
            return () => {
              cloudFileAccounts.off("accountAdded", listener);
            };
          },
        }).api(),

        onAccountDeleted: new EventManager({
          context,
          name: "cloudFile.onAccountDeleted",
          register: fire => {
            let listener = (event, key, type) => {
              if (this.provider.type != type) {
                return null;
              }

              return fire.async(key);
            };

            cloudFileAccounts.on("accountDeleted", listener);
            return () => {
              cloudFileAccounts.off("accountDeleted", listener);
            };
          },
        }).api(),

        async getAccount(accountId) {
          let account = cloudFileAccounts.getAccount(accountId);

          if (!account || account.type != self.provider.type) {
            return undefined;
          }

          return convertCloudFileAccount(account);
        },

        async getAllAccounts() {
          return cloudFileAccounts.getAccountsForType(self.provider.type).map(convertCloudFileAccount);
        },

        async updateAccount(accountId, updateProperties) {
          let account = cloudFileAccounts.getAccount(accountId);

          if (!account || account.type != self.provider.type) {
            return undefined;
          }
          if (updateProperties.configured !== null) {
            account.configured = updateProperties.configured;
          }
          if (updateProperties.uploadSizeLimit !== null) {
            account.quota.uploadSizeLimit = updateProperties.uploadSizeLimit;
          }
          if (updateProperties.spaceRemaining !== null) {
            account.quota.spaceRemaining = updateProperties.spaceRemaining;
          }
          if (updateProperties.spaceUsed !== null) {
            account.quota.spaceUsed = updateProperties.spaceUsed;
          }
          if (updateProperties.managementUrl !== null) {
            account.managementURL = updateProperties.managementUrl;
          }
          if (updateProperties.settingsUrl !== null) {
            account.settingsURL = updateProperties.settingsUrl;
          }

          return convertCloudFileAccount(account);
        },
      },
    };
  }
};

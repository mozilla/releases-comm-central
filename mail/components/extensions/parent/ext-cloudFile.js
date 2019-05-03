/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {ExtensionParent} = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");
var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.jsm");

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

class CloudFileAccount {
  constructor(accountKey, extension) {
    this.accountKey = accountKey;
    this.extension = extension;
    this._configured = false;
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
    return Services.prefs.getCharPref(
      `mail.cloud_files.accounts.${this.accountKey}.displayName`,
      this.extension.manifest.cloud_file.name
    );
  }
  get iconURL() {
    if (this.extension.manifest.icons) {
      let { icon } = ExtensionParent.IconDetails.getPreferredIcon(
        this.extension.manifest.icons, this.extension, 32
      );
      return this.extension.baseURI.resolve(icon);
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
  get configured() {
    return this._configured;
  }
  set configured(value) {
    value = !!value;
    if (value != this._configured) {
      this._configured = value;
      cloudFileAccounts.emit("accountConfigured", this);
    }
  }
  get createNewAccountUrl() {
    return this.extension.manifest.cloud_file.new_account_url;
  }

  async uploadFile(file) {
    let id = this._nextId++;
    let results;

    try {
      let buffer = await promiseFileRead(file);

      this._fileIds.set(file.path, id);
      results = await this.extension.emit("uploadFile", this, {
        id,
        name: file.leafName,
        data: buffer,
      });
    } catch (ex) {
      if (ex.result == 0x80530014) { // NS_ERROR_DOM_ABORT_ERR
        throw cloudFileAccounts.constants.uploadCancelled;
      } else {
        console.error(ex);
        throw cloudFileAccounts.constants.uploadErr;
      }
    }

    if (results && results.length > 0) {
      if (results[0].aborted) {
        throw cloudFileAccounts.constants.uploadCancelled;
      }

      let url = results[0].url;
      this._fileUrls.set(file.path, url);
    } else {
      console.error(`Missing cloudFile.onFileUpload listener for ${this.extension.id}`);
      throw cloudFileAccounts.constants.uploadErr;
    }
  }

  urlForFile(file) {
    return this._fileUrls.get(file.path);
  }

  cancelFileUpload(file) {
    this.extension.emit("uploadAbort", this, {
      id: this._fileIds.get(file.path),
    });
  }

  async deleteFile(file) {
    let results;
    try {
      if (this._fileIds.has(file.path)) {
        let id = this._fileIds.get(file.path);
        results = await this.extension.emit("deleteFile", this, { id });
      }
    } catch (ex) {
      throw Cr.NS_ERROR_FAILURE;
    }

    if (!results || results.length == 0) {
      console.error(`Missing cloudFile.onFileDeleted listener for ${this.extension.id}`);
      throw Cr.NS_ERROR_FAILURE;
    }
  }
}

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
  get providerType() {
    return `ext-${this.extension.id}`;
  }

  onManifestEntry(entryName) {
    if (entryName == "cloud_file") {
      let {extension} = this;
      cloudFileAccounts.registerProvider(this.providerType, {
        type: this.providerType,
        displayName: extension.manifest.cloud_file.name,
        get iconURL() {
          if (extension.manifest.icons) {
            let { icon } = ExtensionParent.IconDetails.getPreferredIcon(
              extension.manifest.icons, extension, 32
            );
            return extension.baseURI.resolve(icon);
          }
          return "chrome://messenger/content/extension.svg";
        },
        get serviceURL() {
          return extension.manifest.cloud_file.service_url;
        },
        initAccount(accountKey) {
          return new CloudFileAccount(accountKey, extension);
        },
      });
    }
  }

  onShutdown(reason) {
    if (reason == "APP_SHUTDOWN") {
      return;
    }
    cloudFileAccounts.unregisterProvider(this.providerType);
  }

  getAPI(context) {
    let self = this;
    return {
      cloudFile: {
        onFileUpload: new EventManager({
          context,
          name: "cloudFile.onFileUpload",
          register: fire => {
            let listener = (event, account, { id, name, data }) => {
              account = convertCloudFileAccount(account);
              return fire.async(account, { id, name, data });
            };

            context.extension.on("uploadFile", listener);
            return () => {
              context.extension.off("uploadFile", listener);
            };
          },
        }).api(),

        onFileUploadAbort: new EventManager({
          context,
          name: "cloudFile.onFileUploadAbort",
          register: fire => {
            let listener = (event, account, { id }) => {
              account = convertCloudFileAccount(account);
              return fire.async(account, id);
            };

            context.extension.on("uploadAbort", listener);
            return () => {
              context.extension.off("uploadAbort", listener);
            };
          },
        }).api(),

        onFileDeleted: new EventManager({
          context,
          name: "cloudFile.onFileDeleted",
          register: fire => {
            let listener = (event, account, { id }) => {
              account = convertCloudFileAccount(account);
              return fire.async(account, id);
            };

            context.extension.on("deleteFile", listener);
            return () => {
              context.extension.off("deleteFile", listener);
            };
          },
        }).api(),

        onAccountAdded: new EventManager({
          context,
          name: "cloudFile.onAccountAdded",
          register: fire => {
            let listener = (event, nativeAccount) => {
              if (nativeAccount.type != this.providerType) {
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
              if (this.providerType != type) {
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

          if (!account || account.type != self.providerType) {
            return undefined;
          }

          return convertCloudFileAccount(account);
        },

        async getAllAccounts() {
          return cloudFileAccounts.getAccountsForType(self.providerType).map(convertCloudFileAccount);
        },

        async updateAccount(accountId, updateProperties) {
          let account = cloudFileAccounts.getAccount(accountId);

          if (!account || account.type != self.providerType) {
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

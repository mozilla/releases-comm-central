/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);
var { cloudFileAccounts } = ChromeUtils.import(
  "resource:///modules/cloudFileAccounts.jsm"
);

// eslint-disable-next-line mozilla/reject-importGlobalProperties
Cu.importGlobalProperties(["File", "FileReader"]);

async function promiseFileRead(nsifile) {
  let blob = await File.createFromNsIFile(nsifile);

  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.addEventListener("loadend", event => {
      if (event.target.error) {
        reject(event.target.error);
      } else {
        resolve(event.target.result);
      }
    });

    reader.readAsArrayBuffer(blob);
  });
}

class CloudFileAccount {
  constructor(accountKey, extension) {
    this.accountKey = accountKey;
    this.extension = extension;
    this._configured = false;
    this.lastError = "";
    this.managementURL = this.extension.manifest.cloud_file.management_url;
    this.dataFormat = this.extension.manifest.cloud_file.data_format;
    this.browserStyle = this.extension.manifest.cloud_file.browser_style;
    this.quota = {
      uploadSizeLimit: -1,
      spaceRemaining: -1,
      spaceUsed: -1,
    };

    this._nextId = 1;
    this._uploads = new Map();
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
        this.extension.manifest.icons,
        this.extension,
        32
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

  /**
   * @typedef FileUpload
   * // Values used in the WebExtension CloudFile type.
   * @property {string} id - uploadId of the file
   * @property {string} name - name of the file
   * @property {string} url - url of the uploaded file
   * // Properties of the local file.
   * @property {string} leafName - name of the local file
   * @property {string} path - path of the local file
   * @property {string} size - size of the local file
   * // Template information.
   * @property {string} serviceName - name of the upload service provider
   * @property {string} serviceIcon - icon of the upload service provider
   * @property {string} serviceURL - web interface of the upload service provider
   */

  /**
   * Initiate a WebExtension cloudFile upload by preparing a CloudFile object &
   * and triggering an onFileUpload event.
   *
   * @param {Object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {nsIFile} file File to be uploaded.
   * @param {String} [name] Name of the file after it has been uploaded. Defaults
   *   to the original filename of the uploaded file.
   * @returns {FileUpload} Information about the uploaded file.
   */
  async uploadFile(window, file, name = file.leafName) {
    let data;
    if (this.dataFormat == "File") {
      data = await File.createFromNsIFile(file);
    } else {
      data = await promiseFileRead(file);
      console.warn(
        "Using ArrayBuffer as cloud_file.data_format is deprecated and will be removed in Thunderbird 102."
      );
    }

    if (
      this.remainingFileSpace != -1 &&
      file.fileSize > this.remainingFileSpace
    ) {
      console.error(
        `Can't upload file. Only ${this.remainingFileSpace}KB left of quota.`
      );
      throw Components.Exception(
        "Quota Error.",
        cloudFileAccounts.constants.uploadWouldExceedQuota
      );
    }

    if (
      this.fileUploadSizeLimit != -1 &&
      file.fileSize > this.fileUploadSizeLimit
    ) {
      throw Components.Exception(
        "File Size Error.",
        cloudFileAccounts.constants.uploadExceedsFileLimit
      );
    }

    let id = this._nextId++;
    let upload = {
      // Values used in the WebExtension CloudFile type.
      id,
      name,
      url: null,
      // Properties of the local file.
      leafName: file.leafName,
      path: file.path,
      size: file.fileSize,
      // Template information.
      serviceName: this.displayName,
      serviceIcon: this.iconURL,
      serviceURL: this.extension.manifest.cloud_file.service_url,
    };

    this._uploads.set(id, upload);
    let results;
    try {
      results = await this.extension.emit(
        "uploadFile",
        this,
        { id, name, data },
        window
      );
    } catch (ex) {
      this._uploads.delete(id);
      if (ex.result == 0x80530014) {
        // NS_ERROR_DOM_ABORT_ERR
        throw Components.Exception(
          "Upload cancelled.",
          cloudFileAccounts.constants.uploadCancelled
        );
      } else {
        console.error(ex);
        throw Components.Exception(
          "Upload error.",
          cloudFileAccounts.constants.uploadErr
        );
      }
    }

    if (
      results &&
      results.length > 0 &&
      results[0] &&
      (results[0].aborted || results[0].url || results[0].error)
    ) {
      if (results[0].error) {
        this._uploads.delete(id);
        if (typeof results[0].error == "boolean") {
          throw Components.Exception(
            "Upload error.",
            cloudFileAccounts.constants.uploadErr
          );
        } else {
          throw Components.Exception(
            results[0].error,
            cloudFileAccounts.constants.uploadErrWithCustomMessage
          );
        }
      }

      if (results[0].aborted) {
        this._uploads.delete(id);
        throw Components.Exception(
          "Upload cancelled.",
          cloudFileAccounts.constants.uploadCancelled
        );
      }

      if (results[0].templateInfo) {
        if (results[0].templateInfo.service_name) {
          upload.serviceName = results[0].templateInfo.service_name;
        }
        if (results[0].templateInfo.service_icon) {
          upload.serviceIcon = this.extension.baseURI.resolve(
            results[0].templateInfo.service_icon
          );
        }
        if (results[0].templateInfo.service_url != null) {
          upload.serviceURL = results[0].templateInfo.service_url;
        }
      }

      upload.url = results[0].url;

      return { ...upload };
    }

    console.error(
      `Missing cloudFile.onFileUpload listener for ${this.extension.id} (or it is not returning url or aborted)`
    );
    this._uploads.delete(id);
    throw Components.Exception(
      "Upload error.",
      cloudFileAccounts.constants.uploadErr
    );
  }

  /**
   * Initiate a WebExtension cloudFile rename by triggering an onFileRename event.
   *
   * @param {Object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {Integer} uploadId Id of the uploaded file.
   * @param {String} newName The requested new name of the file.
   * @returns {FileUpload} Information about the renamed file.
   */
  async renameFile(window, uploadId, newName) {
    if (!this._uploads.has(uploadId)) {
      throw Components.Exception(
        "Rename error.",
        cloudFileAccounts.constants.renameErr
      );
    }

    let upload = this._uploads.get(uploadId);
    let results;
    try {
      results = await this.extension.emit(
        "renameFile",
        this,
        uploadId,
        newName,
        window
      );
    } catch (ex) {
      throw Components.Exception(
        "Rename error.",
        cloudFileAccounts.constants.renameErr
      );
    }

    if (!results || results.length == 0) {
      throw Components.Exception(
        "Rename not supported.",
        cloudFileAccounts.constants.renameNotSupported
      );
    }

    if (results[0]) {
      if (results[0].error) {
        if (typeof results[0].error == "boolean") {
          throw Components.Exception(
            "Rename error.",
            cloudFileAccounts.constants.renameErr
          );
        } else {
          throw Components.Exception(
            results[0].error,
            cloudFileAccounts.constants.renameErrWithCustomMessage
          );
        }
      }

      if (results[0].url) {
        upload.url = results[0].url;
      }
    }

    upload.name = newName;
    return upload;
  }

  urlForFile(uploadId) {
    return this._uploads.get(uploadId).url;
  }

  /**
   * Cancel a WebExtension cloudFile upload by triggering an onFileUploadAbort
   * event.
   *
   * @param {Object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {nsIFile} file File to be uploaded.
   */
  async cancelFileUpload(window, file) {
    let path = file.path;
    let uploadId = -1;
    for (let upload of this._uploads.values()) {
      if (!upload.url && upload.path == path) {
        uploadId = upload.id;
        break;
      }
    }

    let result;
    if (uploadId != -1) {
      result = await this.extension.emit("uploadAbort", this, uploadId, window);
    }

    if (result && result.length > 0) {
      return true;
    }

    console.error(
      `Missing cloudFile.onFileUploadAbort listener for ${this.extension.id}`
    );
    return false;
  }

  getPreviousUploads() {
    return [...this._uploads.values()].map(u => {
      return { ...u };
    });
  }

  /**
   * Delete a WebExtension cloudFile upload by triggering an onFileDeleted event.
   *
   * @param {Object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {Integer} uploadId Id of the uploaded file.
   */
  async deleteFile(window, uploadId) {
    let results;
    try {
      if (this._uploads.has(uploadId)) {
        results = await this.extension.emit(
          "deleteFile",
          this,
          uploadId,
          window
        );
      }
      this._uploads.delete(uploadId);
    } catch (ex) {
      throw Components.Exception(
        `Unknown error: ${ex.message}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    if (!results || results.length == 0) {
      throw Components.Exception(
        `Missing cloudFile.onFileDeleted listener for ${this.extension.id}`,
        Cr.NS_ERROR_FAILURE
      );
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
  };
}

this.cloudFile = class extends ExtensionAPI {
  get providerType() {
    return `ext-${this.extension.id}`;
  }

  onManifestEntry(entryName) {
    if (entryName == "cloud_file") {
      let { extension } = this;
      cloudFileAccounts.registerProvider(this.providerType, {
        type: this.providerType,
        displayName: extension.manifest.cloud_file.name,
        get iconURL() {
          if (extension.manifest.icons) {
            let { icon } = ExtensionParent.IconDetails.getPreferredIcon(
              extension.manifest.icons,
              extension,
              32
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

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    cloudFileAccounts.unregisterProvider(this.providerType);
  }

  getAPI(context) {
    let self = this;
    let { extension } = context;
    let { tabManager } = extension;

    return {
      cloudFile: {
        onFileUpload: new EventManager({
          context,
          name: "cloudFile.onFileUpload",
          register: fire => {
            let listener = (event, account, { id, name, data }, tab) => {
              tab = tab ? tabManager.convert(tab) : null;
              account = convertCloudFileAccount(account);
              return fire.async(account, { id, name, data }, tab);
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
            let listener = (event, account, id, tab) => {
              tab = tab ? tabManager.convert(tab) : null;
              account = convertCloudFileAccount(account);
              return fire.async(account, id, tab);
            };

            context.extension.on("uploadAbort", listener);
            return () => {
              context.extension.off("uploadAbort", listener);
            };
          },
        }).api(),

        onFileRename: new EventManager({
          context,
          name: "cloudFile.onFileRename",
          register: fire => {
            let listener = (event, account, id, newName, tab) => {
              tab = tab ? tabManager.convert(tab) : null;
              account = convertCloudFileAccount(account);
              return fire.async(account, id, newName, tab);
            };

            context.extension.on("renameFile", listener);
            return () => {
              context.extension.off("renameFile", listener);
            };
          },
        }).api(),

        onFileDeleted: new EventManager({
          context,
          name: "cloudFile.onFileDeleted",
          register: fire => {
            let listener = (event, account, id, tab) => {
              tab = tab ? tabManager.convert(tab) : null;
              account = convertCloudFileAccount(account);
              return fire.async(account, id, tab);
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
          return cloudFileAccounts
            .getAccountsForType(self.providerType)
            .map(convertCloudFileAccount);
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

          return convertCloudFileAccount(account);
        },
      },
    };
  }
};

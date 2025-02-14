/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { cloudFileAccounts } = ChromeUtils.importESModule(
  "resource:///modules/cloudFileAccounts.sys.mjs"
);

XPCOMUtils.defineLazyGlobalGetters(this, ["File", "FileReader"]);

class CloudFileAccount {
  constructor(accountKey, extension) {
    this.accountKey = accountKey;
    this.extension = extension;
    this._configured = false;
    this.lastError = "";
    this.managementURL = this.extension.manifest.cloud_file.management_url;
    this.reuseUploads = this.extension.manifest.cloud_file.reuse_uploads;
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
      const { icon } = ExtensionParent.IconDetails.getPreferredIcon(
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
   * @typedef CloudFileDate
   * @property {integer} timestamp - milliseconds since epoch
   * @property {DateTimeFormat} format - format object of Intl.DateTimeFormat
   */

  /**
   * @typedef CloudFileUpload
   * // Values used in the WebExtension CloudFile type.
   * @property {string} id - uploadId of the file
   * @property {string} name - name of the file
   * @property {string} url - url of the uploaded file
   * // Properties of the local file.
   * @property {string} path - path of the local file
   * @property {string} size - size of the local file
   * // Template information.
   * @property {string} serviceName - name of the upload service provider
   * @property {string} serviceIcon - icon of the upload service provider
   * @property {string} serviceUrl - web interface of the upload service provider
   * @property {boolean} downloadPasswordProtected - link is password protected
   * @property {integer} downloadLimit - download limit of the link
   * @property {CloudFileDate} downloadExpiryDate - expiry date of the link
   * // Usage tracking.
   * @property {boolean} immutable - if the cloud file url may be changed
   */

  /**
   * Marks the specified upload as immutable.
   *
   * @param {integer} id - id of the upload
   */
  markAsImmutable(id) {
    if (this._uploads.has(id)) {
      const upload = this._uploads.get(id);
      upload.immutable = true;
      this._uploads.set(id, upload);
    }
  }

  /**
   * Returns a new upload entry, based on the provided file and data.
   *
   * @param {nsIFile} file
   * @param {CloudFileUpload} data
   * @returns {CloudFileUpload}
   */
  newUploadForFile(file, data = {}) {
    const id = this._nextId++;
    const upload = {
      // Values used in the WebExtension CloudFile type.
      id,
      name: data.name ?? file.leafName,
      url: data.url ?? null,
      // Properties of the local file.
      path: file.path,
      size: file.exists() ? file.fileSize : data.size || 0,
      // Template information.
      serviceName: data.serviceName ?? this.displayName,
      serviceIcon: data.serviceIcon ?? this.iconURL,
      serviceUrl: data.serviceUrl ?? "",
      downloadPasswordProtected: data.downloadPasswordProtected ?? false,
      downloadLimit: data.downloadLimit ?? 0,
      downloadExpiryDate: data.downloadExpiryDate ?? null,
      // Usage tracking.
      immutable: data.immutable ?? false,
    };

    this._uploads.set(id, upload);
    return upload;
  }

  /**
   * Initiate a WebExtension cloudFile upload by preparing a CloudFile object &
   * and triggering an onFileUpload event.
   *
   * @param {object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {nsIFile} file File to be uploaded.
   * @param {string} [name] Name of the file after it has been uploaded. Defaults
   *   to the original filename of the uploaded file.
   * @param {CloudFileUpload} relatedCloudFileUpload Information about an already
   *   uploaded file this upload is related to, e.g. renaming a repeatedly used
   *   cloud file or updating the content of a cloud file.
   * @returns {CloudFileUpload} Information about the uploaded file.
   */
  async uploadFile(window, file, name = file.leafName, relatedCloudFileUpload) {
    const data = await File.createFromNsIFile(file);

    if (
      this.remainingFileSpace != -1 &&
      file.fileSize > this.remainingFileSpace
    ) {
      throw Components.Exception(
        `Quota error: Can't upload file. Only ${this.remainingFileSpace}KB left of quota.`,
        cloudFileAccounts.constants.uploadWouldExceedQuota
      );
    }

    if (
      this.fileUploadSizeLimit != -1 &&
      file.fileSize > this.fileUploadSizeLimit
    ) {
      throw Components.Exception(
        `Upload error: File size is ${file.fileSize}KB and exceeds the file size limit of ${this.fileUploadSizeLimit}KB`,
        cloudFileAccounts.constants.uploadExceedsFileLimit
      );
    }

    const upload = this.newUploadForFile(file, { name });
    const id = upload.id;
    let relatedFileInfo;
    if (relatedCloudFileUpload) {
      relatedFileInfo = {
        id: relatedCloudFileUpload.id,
        name: relatedCloudFileUpload.name,
        url: relatedCloudFileUpload.url,
        templateInfo: relatedCloudFileUpload.templateInfo,
        dataChanged: relatedCloudFileUpload.path != upload.path,
      };
    }

    let results;
    try {
      results = await this.extension.emit(
        "uploadFile",
        this,
        { id, name, data },
        window,
        relatedFileInfo
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
        throw Components.Exception(
          `Upload error: ${ex.message}`,
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
        upload.templateInfo = results[0].templateInfo;

        if (results[0].templateInfo.service_name) {
          upload.serviceName = results[0].templateInfo.service_name;
        }
        if (results[0].templateInfo.service_icon) {
          upload.serviceIcon = this.extension.baseURI.resolve(
            results[0].templateInfo.service_icon
          );
        }
        if (results[0].templateInfo.service_url) {
          upload.serviceUrl = results[0].templateInfo.service_url;
        }
        if (results[0].templateInfo.download_password_protected) {
          upload.downloadPasswordProtected =
            results[0].templateInfo.download_password_protected;
        }
        if (results[0].templateInfo.download_limit) {
          upload.downloadLimit = results[0].templateInfo.download_limit;
        }
        if (results[0].templateInfo.download_expiry_date) {
          // Event return value types are not checked by the WebExtension framework,
          // manual verification is required.
          if (
            results[0].templateInfo.download_expiry_date.timestamp &&
            Number.isInteger(
              results[0].templateInfo.download_expiry_date.timestamp
            )
          ) {
            upload.downloadExpiryDate =
              results[0].templateInfo.download_expiry_date;
          } else {
            console.warn(
              "Invalid CloudFileTemplateInfo.download_expiry_date object, the timestamp property is required and it must be of type integer."
            );
          }
        }
      }

      upload.url = results[0].url;

      return { ...upload };
    }

    this._uploads.delete(id);
    throw Components.Exception(
      `Upload error: Missing cloudFile.onFileUpload listener for ${this.extension.id} (or it is not returning url or aborted)`,
      cloudFileAccounts.constants.uploadErr
    );
  }

  /**
   * Checks if the url of the given upload has been used already.
   *
   * @param {CloudFileUpload} cloudFileUpload
   */
  isReusedUpload(cloudFileUpload) {
    if (!cloudFileUpload) {
      return false;
    }

    // Find matching url in known uploads and check if it is immutable.
    const isImmutableUrl = url => {
      return [...this._uploads.values()].some(u => u.immutable && u.url == url);
    };

    // Check all open windows if the url is used elsewhere.
    const isDuplicateUrl = url => {
      const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
      if (composeWindows.length == 0) {
        return false;
      }
      const countsPerWindow = composeWindows.map(window => {
        const bucket = window.document.getElementById("attachmentBucket");
        if (!bucket) {
          return 0;
        }
        return [...bucket.childNodes].filter(
          node => node.attachment.contentLocation == url
        ).length;
      });

      return countsPerWindow.reduce((prev, curr) => prev + curr) > 1;
    };

    return (
      isImmutableUrl(cloudFileUpload.url) || isDuplicateUrl(cloudFileUpload.url)
    );
  }

  /**
   * Initiate a WebExtension cloudFile rename by triggering an onFileRename event.
   *
   * @param {object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {Integer} uploadId Id of the uploaded file.
   * @param {string} newName The requested new name of the file.
   * @returns {CloudFileUpload} Information about the renamed file.
   */
  async renameFile(window, uploadId, newName) {
    if (!this._uploads.has(uploadId)) {
      throw Components.Exception(
        "Rename error.",
        cloudFileAccounts.constants.renameErr
      );
    }

    const upload = this._uploads.get(uploadId);
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
        `Rename error: ${ex.message}`,
        cloudFileAccounts.constants.renameErr
      );
    }

    if (!results || results.length == 0) {
      throw Components.Exception(
        `Rename error: Missing cloudFile.onFileRename listener for ${this.extension.id}`,
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
   * @param {object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {nsIFile} file File to be uploaded.
   */
  async cancelFileUpload(window, file) {
    const path = file.path;
    let uploadId = -1;
    for (const upload of this._uploads.values()) {
      if (!upload.url && upload.path == path) {
        uploadId = upload.id;
        break;
      }
    }

    if (uploadId == -1) {
      console.error(`No upload in progress for file ${file.path}`);
      return false;
    }

    const result = await this.extension.emit(
      "uploadAbort",
      this,
      uploadId,
      window
    );
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
   * @param {object} window Window object of the window, where the upload has
   *   been initiated. Must be null, if the window is not supported by the
   *   WebExtension windows/tabs API. Currently, this should only be set by the
   *   compose window.
   * @param {Integer} uploadId Id of the uploaded file.
   */
  async deleteFile(window, uploadId) {
    if (!this.extension.emitter.has("deleteFile")) {
      throw Components.Exception(
        `Delete error: Missing cloudFile.onFileDeleted listener for ${this.extension.id}`,
        cloudFileAccounts.constants.deleteErr
      );
    }

    try {
      if (this._uploads.has(uploadId)) {
        const upload = this._uploads.get(uploadId);
        if (!this.isReusedUpload(upload)) {
          await this.extension.emit("deleteFile", this, uploadId, window);
          this._uploads.delete(uploadId);
        }
      }
    } catch (ex) {
      throw Components.Exception(
        `Delete error: ${ex.message}`,
        cloudFileAccounts.constants.deleteErr
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

this.cloudFile = class extends ExtensionAPIPersistent {
  get providerType() {
    return `ext-${this.extension.id}`;
  }

  onManifestEntry(entryName) {
    if (entryName == "cloud_file") {
      const { extension } = this;
      cloudFileAccounts.registerProvider(this.providerType, {
        type: this.providerType,
        displayName: extension.manifest.cloud_file.name,
        get iconURL() {
          if (extension.manifest.icons) {
            const { icon } = ExtensionParent.IconDetails.getPreferredIcon(
              extension.manifest.icons,
              extension,
              32
            );
            return extension.baseURI.resolve(icon);
          }
          return "chrome://messenger/content/extension.svg";
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

  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onFileUpload({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(
        _event,
        account,
        { id, name, data },
        tab,
        relatedFileInfo
      ) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        tab = tab ? tabManager.convert(tab) : null;
        account = convertCloudFileAccount(account);
        return fire.async(account, { id, name, data }, tab, relatedFileInfo);
      }
      extension.on("uploadFile", listener);
      return {
        unregister: () => {
          extension.off("uploadFile", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onFileUploadAbort({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(_event, account, id, tab) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        tab = tab ? tabManager.convert(tab) : null;
        account = convertCloudFileAccount(account);
        return fire.async(account, id, tab);
      }
      extension.on("uploadAbort", listener);
      return {
        unregister: () => {
          extension.off("uploadAbort", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onFileRename({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(_event, account, id, newName, tab) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        tab = tab ? tabManager.convert(tab) : null;
        account = convertCloudFileAccount(account);
        return fire.async(account, id, newName, tab);
      }
      extension.on("renameFile", listener);
      return {
        unregister: () => {
          extension.off("renameFile", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onFileDeleted({ fire }) {
      const { extension } = this;
      const { tabManager } = extension;
      async function listener(_event, account, id, tab) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        tab = tab ? tabManager.convert(tab) : null;
        account = convertCloudFileAccount(account);
        return fire.async(account, id, tab);
      }
      extension.on("deleteFile", listener);
      return {
        unregister: () => {
          extension.off("deleteFile", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onAccountAdded({ fire }) {
      const self = this;
      async function listener(_event, nativeAccount) {
        if (nativeAccount.type != self.providerType) {
          return null;
        }
        if (fire.wakeup) {
          await fire.wakeup();
        }
        return fire.async(convertCloudFileAccount(nativeAccount));
      }
      cloudFileAccounts.on("accountAdded", listener);
      return {
        unregister: () => {
          cloudFileAccounts.off("accountAdded", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },

    onAccountDeleted({ fire }) {
      const self = this;
      async function listener(_event, key, type) {
        if (self.providerType != type) {
          return null;
        }
        if (fire.wakeup) {
          await fire.wakeup();
        }
        return fire.async(key);
      }
      cloudFileAccounts.on("accountDeleted", listener);
      return {
        unregister: () => {
          cloudFileAccounts.off("accountDeleted", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
  };

  getAPI(context) {
    const self = this;

    return {
      cloudFile: {
        onFileUpload: new EventManager({
          context,
          module: "cloudFile",
          event: "onFileUpload",
          extensionApi: this,
        }).api(),

        onFileUploadAbort: new EventManager({
          context,
          module: "cloudFile",
          event: "onFileUploadAbort",
          extensionApi: this,
        }).api(),

        onFileRename: new EventManager({
          context,
          module: "cloudFile",
          event: "onFileRename",
          extensionApi: this,
        }).api(),

        onFileDeleted: new EventManager({
          context,
          module: "cloudFile",
          event: "onFileDeleted",
          extensionApi: this,
        }).api(),

        onAccountAdded: new EventManager({
          context,
          module: "cloudFile",
          event: "onAccountAdded",
          extensionApi: this,
        }).api(),

        onAccountDeleted: new EventManager({
          context,
          module: "cloudFile",
          event: "onAccountDeleted",
          extensionApi: this,
        }).api(),

        async getAccount(accountId) {
          const account = cloudFileAccounts.getAccount(accountId);

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
          const account = cloudFileAccounts.getAccount(accountId);

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

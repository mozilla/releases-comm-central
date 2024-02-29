/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadPaths: "resource://gre/modules/DownloadPaths.sys.mjs",
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  GlodaUtils: "resource:///modules/gloda/GlodaUtils.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
});

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    "nsIHandlerService",
  ],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

ChromeUtils.defineLazyGetter(lazy, "messengerBundle", () => {
  return Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
});

/**
 * A class to handle attachment information and actions.
 */
export class AttachmentInfo {
  /**
   * A cache of message/rfc822 attachments saved to temporary files for display.
   * Saving the same attachment again is avoided.
   *
   * @type {Map<string, nsIFile>}
   */
  #temporaryFiles = new Map();

  /**
   * A function to call when checking to see if an attachment exists or not, so
   * that the display can be updated.
   *
   * @type {Function}
   */
  #updateAttachmentsDisplayFn = null;

  /**
   * Create a new attachment object which goes into the data attachment array.
   * This method checks whether the passed attachment is empty or not.
   *
   * @param {object} options
   * @param {string} options.contentType - The attachment's mimetype.
   * @param {string} options.url - The URL for the attachment.
   * @param {string} options.name - The name to be displayed for this attachment
   *   (usually the filename).
   * @param {string} options.uri - The URI for the message containing the
   *   attachment.
   * @param {boolean} options.isExternalAttachment - True if the attachment has
   *   been detached to file or is a link attachment.
   * @param {object} options.message - The message object associated to this
   *   attachment.
   * @param {function} [updateAttachmentsDisplayFn] - An optional callback
   *   function that is called to update the attachment display at appropriate
   *   times.
   */
  constructor({
    contentType,
    url,
    name,
    uri,
    isExternalAttachment,
    message,
    updateAttachmentsDisplayFn,
  }) {
    this.message = message;
    this.contentType = contentType;
    this.name = name;
    this.url = url;
    this.uri = uri;
    this.isExternalAttachment = isExternalAttachment;
    this.#updateAttachmentsDisplayFn = updateAttachmentsDisplayFn;
    // A |size| value of -1 means we don't have a valid size. Check again if
    // |sizeResolved| is false. For internal attachments and link attachments
    // with a reported size, libmime streams values to addAttachmentField()
    // which updates this object. For external file attachments, |size| is updated
    // in the #() function when the list is built. Deleted attachments
    // are resolved to -1.
    this.size = -1;
    this.sizeResolved = this.isDeleted;

    // Remove [?&]part= from remote urls, after getting the partID.
    // Remote urls, unlike non external mail part urls, may also contain query
    // strings starting with ?; PART_RE does not handle this.
    if (this.isLinkAttachment || this.isFileAttachment) {
      let match = url.match(/[?&]part=[^&]+$/);
      match = match && match[0];
      this.partID = match && match.split("part=")[1];
      this.url = url.replace(match, "");
    } else {
      const match = lazy.GlodaUtils.PART_RE.exec(url);
      this.partID = match && match[1];
    }
  }

  /**
   * Save this attachment to a file.
   *
   * @param {nsIMessenger} messenger
   *   The messenger object associated with the window.
   */
  async save(messenger) {
    if (!this.hasFile) {
      return;
    }

    const empty = await this.isEmpty();
    if (empty) {
      return;
    }

    messenger.saveAttachment(
      this.contentType,
      this.url,
      encodeURIComponent(this.name),
      this.uri,
      this.isExternalAttachment
    );
  }

  /**
   * Open this attachment.
   *
   * @param {integer} [browsingContextId]
   *   The browsingContext of the browser that this attachment is being opened
   *   from.
   */
  async open(browsingContext) {
    if (!this.hasFile) {
      return;
    }

    const win = browsingContext.topChromeWindow;
    const empty = await this.isEmpty();
    if (empty) {
      const prompt = lazy.messengerBundle.GetStringFromName(
        this.isExternalAttachment
          ? "externalAttachmentNotFound"
          : "emptyAttachment"
      );
      Services.prompt.alert(win, null, prompt);
    } else {
      // @see MsgComposeCommands.js which has simililar opening functionality
      const dotPos = this.name.lastIndexOf(".");
      const extension =
        dotPos >= 0 ? this.name.substring(dotPos + 1).toLowerCase() : "";
      if (this.contentType == "application/pdf" || extension == "pdf") {
        const handlerInfo = lazy.gMIMEService.getFromTypeAndExtension(
          this.contentType,
          extension
        );
        // Only open a new tab for pdfs if we are handling them internally.
        if (
          !handlerInfo.alwaysAskBeforeHandling &&
          handlerInfo.preferredAction == Ci.nsIHandlerInfo.handleInternally
        ) {
          // Add the content type to avoid a "how do you want to open this?"
          // dialog. The type may already be there, but that doesn't matter.
          let url = this.url;
          if (!url.includes("type=")) {
            url += url.includes("?") ? "&" : "?";
            url += "type=application/pdf";
          }
          let tabmail = win.document.getElementById("tabmail");
          if (!tabmail) {
            // If no tabmail available in this window, try and find it in
            // another.
            const win = Services.wm.getMostRecentWindow("mail:3pane");
            tabmail = win?.document.getElementById("tabmail");
          }
          if (tabmail) {
            tabmail.openTab("contentTab", {
              url,
              background: false,
              linkHandler: "single-page",
            });
            tabmail.ownerGlobal.focus();
            return;
          }
          // If no tabmail, open PDF same as other attachments.
        }
      }

      // Just use the old method for handling messages, it works.

      let { name, url } = this;

      const sourceURI = Services.io.newURI(url);
      async function saveToFile(path, isTmp = false) {
        const buffer = await new Promise((resolve, reject) => {
          lazy.NetUtil.asyncFetch(
            {
              uri: sourceURI,
              loadUsingSystemPrincipal: true,
            },
            (inputStream, status) => {
              if (Components.isSuccessCode(status)) {
                resolve(lazy.NetUtil.readInputStream(inputStream));
              } else {
                reject(
                  new Components.Exception(`Failed to fetch ${path}`, status)
                );
              }
            }
          );
        });
        await IOUtils.write(path, new Uint8Array(buffer));

        if (!isTmp) {
          // Create a download so that saved files show up under... Saved Files.
          const file = await IOUtils.getFile(path);
          lazy.Downloads.createDownload({
            source: {
              url: sourceURI.spec,
            },
            target: file,
            startTime: new Date(),
          })
            .then(async download => {
              await download.start();
              const list = await lazy.Downloads.getList(lazy.Downloads.ALL);
              await list.add(download);
            })
            .catch(console.error);
        }
      }

      if (this.contentType == "message/rfc822") {
        let tempFile = this.#temporaryFiles.get(url);
        if (!tempFile?.exists()) {
          tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
          tempFile.append("subPart.eml");
          tempFile.createUnique(0, 0o600);
          await saveToFile(tempFile.path, true);

          this.#temporaryFiles.set(url, tempFile);
        }

        lazy.MailUtils.openEMLFile(
          win,
          tempFile,
          Services.io.newFileURI(tempFile)
        );
        return;
      }

      // Get the MIME info from the service.

      let mimeInfo;
      try {
        mimeInfo = lazy.gMIMEService.getFromTypeAndExtension(
          this.contentType,
          extension
        );
      } catch (ex) {
        // If the call above fails, which can happen on Windows where there's
        // nothing registered for the file type, assume this generic type.
        mimeInfo = lazy.gMIMEService.getFromTypeAndExtension(
          "application/octet-stream",
          ""
        );
      }
      // The default action is saveToDisk, which is not what we want.
      // If we don't have a stored handler, ask before handling.
      if (!lazy.gHandlerService.exists(mimeInfo)) {
        mimeInfo.alwaysAskBeforeHandling = true;
        mimeInfo.preferredAction = Ci.nsIHandlerInfo.alwaysAsk;
      }

      // If we know what to do, do it.

      name = lazy.DownloadPaths.sanitize(name);

      const createTemporaryFileAndOpen = async mimeInfo => {
        const tmpPath = PathUtils.join(
          Services.dirsvc.get("TmpD", Ci.nsIFile).path,
          "pid-" + Services.appinfo.processID
        );
        await IOUtils.makeDirectory(tmpPath, { permissions: 0o700 });
        const tempFile = Cc["@mozilla.org/file/local;1"].createInstance(
          Ci.nsIFile
        );
        tempFile.initWithPath(tmpPath);

        tempFile.append(name);
        tempFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
        tempFile.remove(false);

        Cc["@mozilla.org/uriloader/external-helper-app-service;1"]
          .getService(Ci.nsPIExternalAppLauncher)
          .deleteTemporaryFileOnExit(tempFile);

        await saveToFile(tempFile.path, true);
        // Before opening from the temp dir, make the file read-only so that
        // users don't edit and lose their edits...
        await IOUtils.setPermissions(tempFile.path, 0o400); // Set read-only
        this._openFile(mimeInfo, tempFile);
      };

      const openLocalFile = mimeInfo => {
        const fileHandler = Services.io
          .getProtocolHandler("file")
          .QueryInterface(Ci.nsIFileProtocolHandler);

        try {
          const externalFile = fileHandler.getFileFromURLSpec(this.displayUrl);
          this._openFile(mimeInfo, externalFile);
        } catch (ex) {
          console.error(
            "AttachmentInfo.open: file - " + this.displayUrl + ", " + ex
          );
        }
      };

      if (!mimeInfo.alwaysAskBeforeHandling) {
        switch (mimeInfo.preferredAction) {
          case Ci.nsIHandlerInfo.saveToDisk:
            if (Services.prefs.getBoolPref("browser.download.useDownloadDir")) {
              const destFile = new lazy.FileUtils.File(
                await lazy.Downloads.getPreferredDownloadsDirectory()
              );
              destFile.append(name);
              destFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o755);
              destFile.remove(false);
              await saveToFile(destFile.path);
            } else {
              const filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
                Ci.nsIFilePicker
              );
              filePicker.defaultString = this.name;
              filePicker.defaultExtension = extension;
              filePicker.init(
                win.browsingContext,
                lazy.messengerBundle.GetStringFromName("SaveAttachment"),
                Ci.nsIFilePicker.modeSave
              );
              const rv = await new Promise(resolve => filePicker.open(resolve));
              if (rv != Ci.nsIFilePicker.returnCancel) {
                await saveToFile(filePicker.file.path);
              }
            }
            return;
          case Ci.nsIHandlerInfo.useHelperApp:
          case Ci.nsIHandlerInfo.useSystemDefault:
            // Attachments can be detached and, if this is the case, opened from
            // their location on disk instead of copied to a temporary file.
            if (this.isExternalAttachment) {
              openLocalFile(mimeInfo);
              return;
            }

            await createTemporaryFileAndOpen(mimeInfo);
            return;
        }
      }

      // Ask what to do, then do it.
      const appLauncherDialog = Cc[
        "@mozilla.org/helperapplauncherdialog;1"
      ].createInstance(Ci.nsIHelperAppLauncherDialog);
      appLauncherDialog.show(
        {
          QueryInterface: ChromeUtils.generateQI(["nsIHelperAppLauncher"]),
          MIMEInfo: mimeInfo,
          source: Services.io.newURI(this.url),
          suggestedFileName: this.name,
          cancel(reason) {},
          promptForSaveDestination() {
            appLauncherDialog.promptForSaveToFileAsync(
              this,
              win,
              this.suggestedFileName,
              "." + extension, // Dot stripped by promptForSaveToFileAsync.
              false
            );
          },
          launchLocalFile() {
            openLocalFile(mimeInfo);
          },
          async setDownloadToLaunch(handleInternally, file) {
            await createTemporaryFileAndOpen(mimeInfo);
          },
          async saveDestinationAvailable(file) {
            if (file) {
              await saveToFile(file.path);
            }
          },
          setWebProgressListener(webProgressListener) {},
          targetFile: null,
          targetFileIsExecutable: null,
          timeDownloadStarted: null,
          contentLength: this.size,
          browsingContextId: browsingContext.id,
        },
        win,
        null
      );
    }
  }

  /**
   * Unless overridden by a test, opens a saved attachment when called by `open`.
   *
   * @param {nsIMIMEInfo} mimeInfo
   * @param {nsIFile} file
   */
  _openFile(mimeInfo, file) {
    mimeInfo.launchWithFile(file);
  }

  /**
   * Detach this attachment from the message.
   *
   * @param {nsIMessenger} messenger
   *   The messenger object associated with the window.
   * @param {boolean} aSaveFirst - true if the attachment should be saved
   *                               before detaching, false otherwise.
   */
  detach(messenger, aSaveFirst) {
    messenger.detachAttachment(
      this.contentType,
      this.url,
      encodeURIComponent(this.name),
      this.uri,
      aSaveFirst
    );
  }

  /**
   * This method checks whether the attachment has been deleted or not.
   *
   * @returns true if the attachment has been deleted, false otherwise.
   */
  get isDeleted() {
    return this.contentType == "text/x-moz-deleted";
  }

  /**
   * This method checks whether the attachment is a detached file.
   *
   * @returns true if the attachment is a detached file, false otherwise.
   */
  get isFileAttachment() {
    return this.isExternalAttachment && this.url.startsWith("file:");
  }

  /**
   * This method checks whether the attachment is an http link.
   *
   * @returns true if the attachment is an http link, false otherwise.
   */
  get isLinkAttachment() {
    return this.isExternalAttachment && /^https?:/.test(this.url);
  }

  /**
   * This method checks whether the attachment has an associated file or not.
   * Deleted attachments or detached attachments with missing external files
   * do *not* have a file.
   *
   * @returns true if the attachment has an associated file, false otherwise.
   */
  get hasFile() {
    if (this.sizeResolved && this.size == -1) {
      return false;
    }

    return true;
  }

  /**
   * Return display url, decoded and converted to utf8 from IDN punycode ascii,
   * if the attachment is external (http or file schemes).
   *
   * @returns {string} url.
   */
  get displayUrl() {
    if (this.isExternalAttachment) {
      // For status bar url display purposes, we want the displaySpec.
      // The ?part= has already been removed.
      return decodeURI(Services.io.newURI(this.url).displaySpec);
    }

    return this.url;
  }

  /**
   * This method checks whether the attachment url location exists and
   * is accessible. For http and file urls, fetch() will have the size
   * in the content-length header.
   *
   * @returns {Boolean}
   *   true if the attachment is empty or error, false otherwise.
   */
  async isEmpty() {
    if (this.isDeleted) {
      return true;
    }

    const isFetchable = url => {
      const uri = Services.io.newURI(url);
      return !(uri.username || uri.userPass);
    };

    // We have a resolved size.
    if (this.sizeResolved) {
      return this.size < 1;
    }

    if (!isFetchable(this.url)) {
      return false;
    }

    let empty = true;
    let size = -1;
    const options = { method: "GET" };

    const request = new Request(this.url, options);

    if (this.isExternalAttachment && this.#updateAttachmentsDisplayFn) {
      this.#updateAttachmentsDisplayFn(this, true);
    }

    await fetch(request)
      .then(response => {
        if (!response.ok) {
          console.warn(
            "AttachmentInfo.#: fetch response error - " +
              response.statusText +
              ", response.url - " +
              response.url
          );
          return null;
        }

        if (this.isLinkAttachment) {
          if (response.status < 200 || response.status > 304) {
            console.warn(
              "AttachmentInfo.#: link fetch response status - " +
                response.status +
                ", response.url - " +
                response.url
            );
            return null;
          }
        }

        return response;
      })
      .then(async response => {
        if (this.isExternalAttachment) {
          size = response ? response.headers.get("content-length") : -1;
        } else {
          // Check the attachment again if addAttachmentField() sets a
          // libmime -1 return value for size in this object.
          // Note: just test for a non zero size, don't need to drain the
          // stream. We only get here if the url is fetchable.
          // The size for internal attachments is not calculated here but
          // will come from libmime.
          const reader = response.body.getReader();
          const result = await reader.read();
          reader.cancel();
          size = result && result.value ? result.value.length : -1;
        }

        if (size > 0) {
          empty = false;
        }
      })
      .catch(error => {
        console.warn(`AttachmentInfo.#: ${error.message} url - ${this.url}`);
      });

    this.sizeResolved = true;

    if (this.isExternalAttachment) {
      // For link attachments, we may have had a published value or -1
      // indicating unknown value. We now know the real size, so set it and
      // update the ui. For detached file attachments, get the size here
      // instead of the old xpcom way.
      this.size = size;
      this.#updateAttachmentsDisplayFn?.(this, false);
    }

    return empty;
  }

  /**
   * Open a file attachment's containing folder.
   */
  openFolder() {
    if (!this.isFileAttachment || !this.hasFile) {
      return;
    }

    // The file url is stored in the attachment info part with unix path and
    // needs to be converted to os path for nsIFile.
    const fileHandler = Services.io
      .getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler);
    try {
      fileHandler.getFileFromURLSpec(this.displayUrl).reveal();
    } catch (ex) {
      console.error(
        "AttachmentInfo.openFolder: file - " + this.displayUrl + ", " + ex
      );
    }
  }
}

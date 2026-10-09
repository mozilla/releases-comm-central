/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  parserUtils: ["@mozilla.org/parserutils;1", Ci.nsIParserUtils],
  streamConverterService: [
    "@mozilla.org/streamConverters;1",
    Ci.nsIStreamConverterService,
  ],
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/messenger.ftl"], true)
);
ChromeUtils.defineLazyGetter(lazy, "log", () =>
  console.createInstance({
    prefix: "MessageSaver",
    maxLogLevel: "Warn",
  })
);

/**
 * The file types a message can be saved as, in file picker filter order.
 */
const FILE_TYPES = ["eml", "html", "txt"];

/**
 * Saving of messages to files, as EML, HTML or plain text.
 */
export class MessageSaver {
  /**
   * Let the user pick a file, then save a message to it.
   *
   * @param {BrowsingContext} browsingContext - The browsing context to use.
   * @param {string} uri - URI of the message to save.
   * @param {string} [defaultName] - The default file name for the file picker.
   * @returns {?string} the path of the saved message. null if not saved.
   */
  static async saveAs(browsingContext, uri, defaultName) {
    const [title, defaultFileName, emlFilesLabel] =
      await lazy.l10n.formatValues([
        { id: "messenger-save-message-as" },
        { id: "messenger-default-save-message-file-name" },
        { id: "messenger-eml-files-filter" },
      ]);
    let fileName = (defaultName || defaultFileName).replace(
      /(.{60}).{4,}(.{22})$/u,
      "$1...$2"
    );

    // Save as "All Files" by default. We want .eml by default, but the pickers
    // on some platforms don't switch extensions based on the file type
    // (bug 508597).
    let filterIndex = FILE_TYPES.length;

    // If saving fails, let the user pick again, keeping their choices.
    while (true) {
      const fp = Cc["@mozilla.org/filepicker;1"].createInstance(
        Ci.nsIFilePicker
      );
      fp.init(browsingContext, title, Ci.nsIFilePicker.modeSave);
      fp.defaultString = fileName;
      // Filters must be appended in FILE_TYPES order, as filterIndex is used.
      fp.appendFilter(emlFilesLabel, "*.eml");
      fp.appendFilters(Ci.nsIFilePicker.filterHTML);
      fp.appendFilters(Ci.nsIFilePicker.filterText);
      fp.appendFilters(Ci.nsIFilePicker.filterAll);
      fp.filterIndex = filterIndex;
      fp.defaultExtension = "eml";
      try {
        fp.displayDirectory = Services.prefs.getComplexValue(
          "messenger.save.dir",
          Ci.nsIFile
        );
      } catch (e) {} // Pref may not be set, yet.

      const result = await new Promise(resolve => fp.open(resolve));
      if (result == Ci.nsIFilePicker.returnCancel) {
        return null;
      }

      const file = fp.file;
      Services.prefs.setComplexValue(
        "messenger.save.dir",
        Ci.nsIFile,
        file.parent
      );
      const type =
        FILE_TYPES[fp.filterIndex] ??
        MessageSaver.#fileTypeFromName(file.leafName);
      try {
        await MessageSaver.saveToFile(uri, file.path, type);
        return file.path;
      } catch (e) {
        lazy.log.warn(`Saving ${uri} to ${file.path} FAILED.`, e);
        Services.prompt.alert(
          browsingContext.window,
          title,
          await lazy.l10n.formatValue("messenger-save-message-failed")
        );
        fileName = file.leafName;
        filterIndex = fp.filterIndex;
      }
    }
  }

  /**
   * Save a message to a given file. An existing file is overwritten, and a
   * partially written file is removed on failure.
   *
   * @param {string} uri - URI of the message to save.
   * @param {string} path - Path to save to.
   * @param {"eml"|"html"|"txt"} [type] - The file type to save as. Determined
   *   by the file extension if not given.
   */
  static async saveToFile(
    uri,
    path,
    type = MessageSaver.#fileTypeFromName(path)
  ) {
    try {
      switch (type) {
        case "eml": {
          const { promise, resolve, reject } = Promise.withResolvers();
          MailServices.messageServiceFromURI(uri).saveMessageToDisk(
            uri,
            await IOUtils.getFile(path),
            {
              OnStartRunningUrl() {},
              OnStopRunningUrl(url, status) {
                if (Components.isSuccessCode(status)) {
                  resolve();
                } else {
                  reject(
                    new Components.Exception("Saving message failed", status)
                  );
                }
              },
            },
            true,
            null
          );
          await promise;
          break;
        }
        case "html": {
          const html = await MessageSaver.#streamAsHtml(uri);
          await IOUtils.write(path, await html.bytes());
          break;
        }
        case "txt": {
          const html = await MessageSaver.#streamAsHtml(uri);
          const wrapLength =
            Services.prefs.getIntPref("mailnews.wraplength", 72) || 990;
          const wrapWidth = Math.min(Math.max(wrapLength, 10), 990);
          const text = lazy.parserUtils.convertToPlainText(
            await html.text(),
            Ci.nsIDocumentEncoder.OutputPersistNBSP,
            wrapWidth
          );
          await IOUtils.writeUTF8(path, text);
          break;
        }
      }
    } catch (e) {
      await IOUtils.remove(path, { ignoreAbsent: true }).catch(() => {});
      throw e;
    } finally {
      Services.obs.notifyObservers(null, "message-saved");
    }
  }

  /**
   * Let the user pick a folder, then save messages to it.
   *
   * @param {BrowsingContext} browsingContext - The browsing context to use.
   * @param {string[]} uris - URIs of the messages to save.
   * @param {string[]} fileNames - The file names to use, one for each message.
   * @returns {?string} the path of the folder the messages were saved to.
   *   null if not saved.
   */
  static async saveMessages(browsingContext, uris, fileNames) {
    const fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(
      browsingContext,
      await lazy.l10n.formatValue("messenger-choose-folder"),
      Ci.nsIFilePicker.modeGetFolder
    );
    try {
      fp.displayDirectory = Services.prefs.getComplexValue(
        "messenger.save.dir",
        Ci.nsIFile
      );
    } catch (e) {} // Pref may not be set, yet.

    const result = await new Promise(resolve => fp.open(resolve));
    if (result == Ci.nsIFilePicker.returnCancel) {
      return null;
    }

    const dir = fp.file;
    Services.prefs.setComplexValue("messenger.save.dir", Ci.nsIFile, dir);
    try {
      for (const [i, uri] of uris.entries()) {
        const path = PathUtils.join(
          dir.path,
          fileNames[i].replace(/(.{60}).{4,}(.{22})$/u, "$1...$2")
        );
        if (
          (await IOUtils.exists(path)) &&
          !Services.prompt.confirm(
            browsingContext.window,
            null,
            await lazy.l10n.formatValue("messenger-file-exists", {
              filename: path,
            })
          )
        ) {
          continue;
        }
        await MessageSaver.saveToFile(uri, path);
      }
    } catch (e) {
      lazy.log.warn(`Saving messages to ${dir.path} FAILED.`, e);
      Services.prompt.alert(
        browsingContext.window,
        null,
        await lazy.l10n.formatValue("messenger-save-message-failed")
      );
      return null;
    }
    return dir.path;
  }

  /**
   * @param {string} name - File name or path.
   * @returns {"eml"|"html"|"txt"} the file type to save as, based on the
   *   extension.
   */
  static #fileTypeFromName(name) {
    if (/\.html?$/i.test(name)) {
      return "html";
    }
    if (/\.txt$/i.test(name)) {
      return "txt";
    }
    return "eml";
  }

  /**
   * Stream a message converted to HTML for saving.
   *
   * @param {string} uri - URI of the message.
   * @returns {Blob} the UTF-8 encoded HTML.
   */
  static #streamAsHtml(uri) {
    const saveAsUri = uri + (uri.includes("?") ? "&" : "?") + "header=saveas";
    const { promise, resolve, reject } = Promise.withResolvers();
    const chunks = [];
    const listener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIStreamListener",
        "nsIRequestObserver",
      ]),
      onStartRequest() {},
      onDataAvailable(request, stream, offset, count) {
        chunks.push(NetUtil.readInputStream(stream, count));
      },
      onStopRequest(request, status) {
        if (Components.isSuccessCode(status)) {
          resolve(new Blob(chunks));
        } else {
          reject(new Components.Exception("Streaming message failed", status));
        }
      },
    };
    MailServices.messageServiceFromURI(uri).streamMessage(
      saveAsUri,
      lazy.streamConverterService.asyncConvertData(
        "message/rfc822",
        "text/html",
        listener,
        // The MIME converter determines the output format from this URI.
        Services.io.newURI(saveAsUri)
      ),
      null,
      null,
      false,
      ""
    );
    return promise;
  }
}

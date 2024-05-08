/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailUtils } from "resource:///modules/MailUtils.sys.mjs";
import {
  SearchSupport,
  StreamListenerBase,
} from "resource:///modules/SearchSupport.sys.mjs";

const MSG_DB_LARGE_COMMIT = 1;
const CRLF = "\r\n";

/**
 * Required to access the 64-bit registry, even though we're probably a 32-bit
 * program
 */
const ACCESS_WOW64_64KEY = 0x0100;

/**
 * All the registry keys required for integration
 */
const gRegKeys = [
  // This is the property handler
  {
    root: Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE,
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\PropertySystem\\PropertyHandlers\\.wdseml",
    name: "",
    value: "{5FA29220-36A1-40f9-89C6-F4B384B7642E}",
  },
  // These two are the association with the MIME IFilter
  {
    root: Ci.nsIWindowsRegKey.ROOT_KEY_CLASSES_ROOT,
    key: ".wdseml",
    name: "Content Type",
    value: "message/rfc822",
  },
  {
    root: Ci.nsIWindowsRegKey.ROOT_KEY_CLASSES_ROOT,
    key: ".wdseml\\PersistentHandler",
    name: "",
    value: "{5645c8c4-e277-11cf-8fda-00aa00a14f93}",
  },
  // This is the association with the Windows mail preview handler
  {
    root: Ci.nsIWindowsRegKey.ROOT_KEY_CLASSES_ROOT,
    key: ".wdseml\\shellex\\{8895B1C6-B41F-4C1C-A562-0D564250836F}",
    name: "",
    value: "{b9815375-5d7f-4ce2-9245-c9d4da436930}",
  },
  // This is the association made to display results under email
  {
    root: Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE,
    key: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\explorer\\KindMap",
    name: ".wdseml",
    value: "email;communication",
  },
];

class WinSearchStreamListener extends StreamListenerBase {
  /**
   * Buffer to store the message
   */
  #message = "";

  onStartRequest() {
    try {
      const outputFileStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      outputFileStream.init(this._outputFile, -1, -1, 0);
      this._outputStream = Cc[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Ci.nsIConverterOutputStream);
      this._outputStream.init(outputFileStream, "UTF-8");
    } catch (ex) {
      this._onDoneStreaming(false);
    }
  }

  onStopRequest() {
    try {
      // XXX Once the JS emitter gets checked in, this code should probably be
      // switched over to use that
      // Decode using getMsgTextFromStream
      const stringStream = Cc[
        "@mozilla.org/io/string-input-stream;1"
      ].createInstance(Ci.nsIStringInputStream);
      stringStream.setData(this.#message, this.#message.length);
      const contentType = {};
      const folder = this._msgHdr.folder;
      const text = folder.getMsgTextFromStream(
        stringStream,
        this._msgHdr.charset,
        65536,
        50000,
        false,
        false,
        contentType
      );

      // To get the Received header, we need to parse the message headers.
      // We only need the first header, which contains the latest received
      // date
      const headers = this.#message.split(/\r\n\r\n|\r\r|\n\n/, 1)[0];
      const mimeHeaders = Cc[
        "@mozilla.org/messenger/mimeheaders;1"
      ].createInstance(Ci.nsIMimeHeaders);
      mimeHeaders.initialize(headers);
      const receivedHeader = mimeHeaders.extractHeader("Received", false);

      this._outputStream.writeString("From: " + this._msgHdr.author + CRLF);
      // If we're a newsgroup, then add the name of the folder as the
      // newsgroups header
      if (folder instanceof Ci.nsIMsgNewsFolder) {
        this._outputStream.writeString("Newsgroups: " + folder.name + CRLF);
      } else {
        this._outputStream.writeString("To: " + this._msgHdr.recipients + CRLF);
      }
      this._outputStream.writeString("CC: " + this._msgHdr.ccList + CRLF);
      this._outputStream.writeString("Subject: " + this._msgHdr.subject + CRLF);
      if (receivedHeader) {
        this._outputStream.writeString("Received: " + receivedHeader + CRLF);
      }
      this._outputStream.writeString(
        "Date: " + new Date(this._msgHdr.date / 1000).toUTCString() + CRLF
      );
      this._outputStream.writeString(
        "Content-Type: " + contentType.value + "; charset=utf-8" + CRLF + CRLF
      );

      this._outputStream.writeString(text + CRLF + CRLF);

      this._msgHdr.setUint32Property(
        this._searchIntegration._hdrIndexedProperty,
        this._reindexTime
      );
      folder.msgDatabase.commit(MSG_DB_LARGE_COMMIT);

      this.#message = "";
      this._searchIntegration._log.info("Successfully written file");
    } catch (ex) {
      this._searchIntegration._log.error(ex);
      this._onDoneStreaming(false);
      return;
    }
    this._onDoneStreaming(true);
  }

  onDataAvailable(request, inputStream, offset, count) {
    try {
      const inStream = Cc[
        "@mozilla.org/scriptableinputstream;1"
      ].createInstance(Ci.nsIScriptableInputStream);
      inStream.init(inputStream);

      // It is necessary to read in data from the input stream
      const inData = inStream.read(count);

      // Ignore stuff after the first 50K or so
      if (this.#message && this.#message.length > 50000) {
        return;
      }

      this.#message += inData;
    } catch (ex) {
      this._searchIntegration._log.error(ex);
      this._onDoneStreaming(false);
    }
  }
}

/**
 * @namespace Windows Search-specific desktop search integration functionality
 */
export class SearchIntegration extends SearchSupport {
  constructor() {
    super();

    this._initLogging();

    // The search module is currently only enabled on Vista and above,
    // and the app can only be installed on Windows 7 and above.
    this.osVersionTooLow = false;

    let serviceRunning = false;
    try {
      serviceRunning = this._winSearchHelper.serviceRunning;
    } catch (e) {}
    // If the service isn't running, then we should stay in backoff mode
    if (!serviceRunning) {
      this._log.info("Windows Search service not running");
      this.osComponentsNotRunning = true;
      this._initSupport(false);
      return;
    }

    const enabled = this.prefEnabled;

    if (enabled) {
      this._log.info("Initializing Windows Search integration");
    }
    this._initSupport(enabled);
  }

  // The property of the header and (sometimes) folders that's used to check
  // if a message is indexed
  _hdrIndexedProperty = "winsearch_reindex_time";

  // The file extension that is used for support files of this component
  _fileExt = ".wdseml";

  // The Windows Search pref base
  _prefBase = "mail.winsearch.";

  // Helper (native) component
  #winSearchHelper = null;
  get _winSearchHelper() {
    if (!this.#winSearchHelper) {
      this.#winSearchHelper = Cc[
        "@mozilla.org/mail/windows-search-helper;1"
      ].getService(Ci.nsIMailWinSearchHelper);
    }
    return this.#winSearchHelper;
  }

  // Whether the folders are already in the crawl scope
  get _foldersInCrawlScope() {
    return this._winSearchHelper.foldersInCrawlScope;
  }

  /**
   * Whether all the required registry keys are present
   * We'll be optimistic here and assume that once the registry keys have been
   * added, they won't be removed, at least while Thunderbird is open
   */
  #regKeysPresent = false;
  get _regKeysPresent() {
    if (!this.#regKeysPresent) {
      for (let i = 0; i < gRegKeys.length; i++) {
        const regKey = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
          Ci.nsIWindowsRegKey
        );
        try {
          regKey.open(
            gRegKeys[i].root,
            gRegKeys[i].key,
            regKey.ACCESS_READ | ACCESS_WOW64_64KEY
          );
        } catch (e) {
          return false;
        }
        const valuePresent =
          regKey.hasValue(gRegKeys[i].name) &&
          regKey.readStringValue(gRegKeys[i].name) == gRegKeys[i].value;
        regKey.close();
        if (!valuePresent) {
          return false;
        }
      }
      this.#regKeysPresent = true;
    }
    return true;
  }

  // Use the folder's path (i.e., in profile dir) as is
  _getSearchPathForFolder(aFolder) {
    return aFolder.filePath;
  }

  // Use the search path as is
  _getFolderForSearchPath(aDir) {
    return MailUtils.getFolderForFileInProfile(aDir);
  }

  _pathNeedsReindexing() {
    // only needed on MacOSX (see bug 670566).
    return false;
  }

  /**
   * Add necessary hooks to Windows
   *
   * @returns false if registration did not succeed, because the elevation
   * request was denied
   */
  register() {
    // If any of the two are not present, we need to elevate.
    if (!this._foldersInCrawlScope || !this._regKeysPresent) {
      try {
        this._winSearchHelper.runSetup(true);
      } catch (e) {
        return false;
      }
    }

    if (!this._winSearchHelper.isFileAssociationSet) {
      try {
        this._winSearchHelper.setFileAssociation();
      } catch (e) {
        this._log.warn("File association not set");
      }
    }
    // Also set the FANCI bit to 0 for the profile directory
    const profD = Services.dirsvc.get("ProfD", Ci.nsIFile);
    this._winSearchHelper.setFANCIBit(profD, false, true);

    return true;
  }

  /**
   * Remove integration from Windows. The only thing removed is the directory
   * from the index list. This will ask for elevation.
   *
   * @returns false if deregistration did not succeed, because the elevation
   * request was denied
   */
  deregister() {
    try {
      this._winSearchHelper.runSetup(false);
    } catch (e) {
      return false;
    }

    return true;
  }

  // The stream listener to read messages
  _streamListener = new WinSearchStreamListener(this);
}

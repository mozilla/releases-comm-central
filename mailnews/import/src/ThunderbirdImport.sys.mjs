/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/importDialog.ftl"], true)
);

/**
 * The importing process is managed by importDialog.js and nsImportMail.cpp.
 *
 * @implements {nsIImportMail}
 */
class ThunderbirdImportMail {
  QueryInterface = ChromeUtils.generateQI(["nsIImportMail"]);

  GetDefaultLocation(location, found, userVerify) {
    userVerify.value = true;
  }

  /**
   * Create a nsIImportMailboxDescriptor instance.
   *
   * @param {string} path - The mailbox path.
   * @param {string} name - The mailbox name.
   * @param {number} depth - The depth of the mailbox folder.
   * @returns {nsIImportMailboxDescriptor}
   */
  _createMailboxDescriptor(path, name, depth) {
    const importService = Cc[
      "@mozilla.org/import/import-service;1"
    ].createInstance(Ci.nsIImportService);
    const descriptor = importService.CreateNewMailboxDescriptor();
    descriptor.size = 100;
    descriptor.depth = depth;
    descriptor.SetDisplayName(name);
    descriptor.file.initWithPath(path);

    return descriptor;
  }

  /**
   * Recursively find mailboxes in a directory.
   *
   * @param {nsIFile} directory - The directory to find mailboxes.
   * @param {number} depth - The depth of the current directory.
   * @returns {nsIImportMailboxDescriptor[]} - All mailboxes found.
   */
  _collectMailboxesInDirectory(directory, depth) {
    const result = [];
    let name = directory.leafName;
    if (depth > 0 && !name.endsWith(".msf") && !name.endsWith(".dat")) {
      if (name.endsWith(".sbd")) {
        name = name.slice(0, name.lastIndexOf("."));
      }
      const descriptor = this._createMailboxDescriptor(
        directory.path,
        name,
        depth
      );
      result.push(descriptor);
    }
    if (directory.isDirectory()) {
      for (const entry of directory.directoryEntries) {
        if (
          (depth == 0 &&
            entry.leafName != "ImapMail" &&
            entry.leafName != "Mail") ||
          (depth == 1 && entry.leafName == "Feeds")
        ) {
          continue;
        }
        result.push(...this._collectMailboxesInDirectory(entry, depth + 1));
      }
    }
    return result;
  }

  findMailboxes(location) {
    return this._collectMailboxesInDirectory(location, 0);
  }

  ImportMailbox(source, dstFolder, errorLog, successLog) {
    if (source.file.isFile()) {
      source.file.copyTo(
        dstFolder.filePath.parent,
        dstFolder.filePath.leafName
      );
      successLog.value = `Import ${source.file.leafName} succeeded.\n`;
    }
  }
}

/**
 * With this class, Thunderbird is shown as an option in the importDialog.xhtml.
 * Currently supports importing mail, see the GetImportInterface function.
 *
 * @implements {nsIImportModule}
 */
export class ThunderbirdImport {
  QueryInterface = ChromeUtils.generateQI(["nsIImportModule"]);

  get name() {
    return lazy.l10n.formatValueSync("thunderbird-import-name");
  }

  get description() {
    return lazy.l10n.formatValueSync("thunderbird-import-description");
  }

  get supports() {
    return "mail";
  }

  get supportsUpgrade() {
    return false;
  }

  GetImportInterface(type) {
    if (type == "mail") {
      const importService = Cc[
        "@mozilla.org/import/import-service;1"
      ].createInstance(Ci.nsIImportService);
      const genericInterface = importService.CreateNewGenericMail();
      genericInterface.SetData("mailInterface", new ThunderbirdImportMail());
      const name = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      name.data = "Thunderbird";
      genericInterface.SetData("name", name);
      return genericInterface;
    }
    return null;
  }
}

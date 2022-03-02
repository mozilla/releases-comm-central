/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["AddrBookFileImporter"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
  exportAttributes: "resource:///modules/AddrBookUtils.jsm",
});

XPCOMUtils.defineLazyGetter(this, "d3", () => {
  let d3Scope = Cu.Sandbox(null);
  Services.scriptloader.loadSubScript(
    "chrome://global/content/third_party/d3/d3.js",
    d3Scope
  );
  return Cu.waiveXrays(d3Scope.d3);
});

/**
 * A module to import address book files.
 */
class AddrBookFileImporter {
  /**
   * @param {string} type - Source file type, currently supporting "csv",
   *   "ldif", "vcard" and "mab".
   */
  constructor(type) {
    this._type = type;
  }

  /**
   * Callback for progress updates.
   * @param {number} current - Current imported items count.
   * @param {number} total - Total items count.
   */
  onProgress = () => {};

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });

  /**
   * Actually start importing records into a directory.
   * @param {nsIFile} sourceFile - The source file to import from.
   * @param {nsIAbDirectory} targetDirectory - The directory to import into.
   */
  async startImport(sourceFile, targetDirectory) {
    this._logger.debug(
      `Importing ${this._type} file from ${sourceFile.path} into ${targetDirectory.dirName}`
    );
    this._sourceFile = sourceFile;
    this._targetDirectory = targetDirectory;

    switch (this._type) {
      case "csv":
        await this._importCsvFile();
        break;
      case "ldif":
        await this._importLdifFile();
        break;
      case "vcard":
        await this._importVCardFile();
        break;
      case "mab":
        await this._importMabFile();
        break;
      default:
        throw Components.Exception(
          `Importing ${this._type} file is not supported`,
          Cr.NS_ERROR_NOT_IMPLEMENTED
        );
    }
  }

  /**
   * Import the .csv/.tsv source file into the target directory.
   */
  async _importCsvFile() {
    let content = await IOUtils.readUTF8(this._sourceFile.path);

    let csvRows = d3.csv.parseRows(content);
    let tsvRows = d3.tsv.parseRows(content);
    // If we have more CSV columns, then it's a CSV file, otherwise a TSV file.
    let rows = csvRows[0].length > tsvRows[0].length ? csvRows : tsvRows;

    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/importMsgs.properties"
    );
    let supportedFieldNames = [];
    let supportedProperties = [];
    // Collect field names in an exported CSV file, and their corresponding
    // nsIAbCard property names.
    for (let [property, stringId] of exportAttributes) {
      if (stringId) {
        supportedProperties.push(property);
        supportedFieldNames.push(
          bundle.GetStringFromID(stringId).toLowerCase()
        );
      }
    }
    let properties = [];
    // Get the nsIAbCard properties corresponding to the user supplied file.
    for (let field of rows[0]) {
      let index = supportedFieldNames.indexOf(field.toLowerCase());
      properties.push(supportedProperties[index]);
    }

    let totalLines = rows.length - 1;
    let currentLine = 0;

    for (let row of rows.slice(1)) {
      currentLine++;
      let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
        Ci.nsIAbCard
      );
      for (let i = 0; i < row.length; i++) {
        let property = properties[i];
        if (!property) {
          continue;
        }
        // Set the field value to the property.
        card.setProperty(property, row[i]);
      }
      this._targetDirectory.addCard(card);
      if (currentLine % 10 == 0) {
        this.onProgress(currentLine, totalLines);
        // Give UI a chance to update the progress bar.
        await new Promise(resolve => setTimeout(resolve));
      }
    }
    this.onProgress(totalLines, totalLines);
  }

  /**
   * Import the .ldif source file into the target directory.
   */
  async _importLdifFile() {
    this.onProgress(2, 10);
    let ldifService = Cc["@mozilla.org/addressbook/abldifservice;1"].getService(
      Ci.nsIAbLDIFService
    );
    let progress = {};
    ldifService.importLDIFFile(
      this._targetDirectory,
      this._sourceFile,
      false,
      progress
    );
    this.onProgress(10, 10);
  }

  /**
   * Import the .vcf source file into the target directory.
   */
  async _importVCardFile() {
    let vcardService = Cc[
      "@mozilla.org/addressbook/msgvcardservice;1"
    ].getService(Ci.nsIMsgVCardService);

    let content = await IOUtils.readUTF8(this._sourceFile.path);
    let lines = content
      .trim()
      .replaceAll("\r\n", "\n")
      .split("\n");

    let totalLines = lines.length;
    let currentLine = 0;
    let record = [];

    for (let line of lines) {
      currentLine++;
      if (!line) {
        continue;
      }

      if (line.toLowerCase() == "begin:vcard") {
        if (record.length) {
          throw Components.Exception(
            "Expecting END:VCARD but got BEGIN:VCARD",
            Cr.NS_ERROR_ILLEGAL_VALUE
          );
        }
        record.push(line);
        continue;
      } else if (!record.length) {
        throw Components.Exception(
          `Expecting BEGIN:VCARD but got ${line}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
      }

      record.push(line);

      if (line.toLowerCase() == "end:vcard") {
        this._targetDirectory.addCard(
          vcardService.vCardToAbCard(record.join("\n") + "\n")
        );
        record = [];
        this.onProgress(currentLine, totalLines);
        // Give UI a chance to update the progress bar.
        await new Promise(resolve => setTimeout(resolve));
      }
    }
    this.onProgress(totalLines, totalLines);
  }

  /**
   * Import the .mab source file into the target directory.
   */
  async _importMabFile() {
    this.onProgress(2, 10);
    let importMab = Cc[
      "@mozilla.org/import/import-ab-file;1?type=mab"
    ].createInstance(Ci.nsIImportABFile);
    importMab.readFileToDirectory(this._sourceFile, this._targetDirectory);
    this.onProgress(10, 10);
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { AddrBookFileImporter } = ChromeUtils.import(
  "resource:///modules/AddrBookFileImporter.jsm"
);

/**
 * Create a temporary address book, import a source file into it, then test the
 * cards are correct.
 *
 * @param {string} type - A source file type supported by AddrBookFileImporter.
 * @param {string} filePath - The path of a source file.
 * @param {string} refDataKey - The key of an object in addressbook.json.
 * @param {string[]} [csvFieldMap] - Map of CSV fields to address book fields.
 */
async function test_importAbFile(type, filePath, refDataKey, csvFieldMap) {
  // Create an address book and init the importer.
  const dirId = MailServices.ab.newAddressBook(
    `tmp-${type}`,
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  const targetDir = MailServices.ab.getDirectoryFromId(dirId);
  const importer = new AddrBookFileImporter(type);

  // Start importing.
  const sourceFile = do_get_file(filePath);
  if (type == "csv") {
    const unmatched = await importer.parseCsvFile(sourceFile);
    if (unmatched.length) {
      importer.setCsvFields(csvFieldMap);
    }
  }
  await importer.startImport(sourceFile, targetDir);

  // Read in the reference data.
  const refFile = do_get_file("resources/addressbook.json");
  const refData = JSON.parse(await IOUtils.readUTF8(refFile.path))[refDataKey];

  // Compare with the reference data.
  for (let i = 0; i < refData.length; i++) {
    const card = targetDir.childCards[i];
    for (const [key, value] of Object.entries(refData[i])) {
      if (key == "LastModifiedDate") {
        continue;
      }
      if (key == "_vCard") {
        equal(
          card
            .getProperty(key, "")
            .replace(
              /UID:[a-f0-9-]{36}/i,
              "UID:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            ),
          `BEGIN:VCARD\r\n${value.join("\r\n")}\r\nEND:VCARD\r\n`,
          "_vCard should be correct"
        );
      } else {
        equal(card.getProperty(key, ""), value, `${key} should be correct`);
      }
    }
  }
}

/** Test importing .csv file works. */
add_task(async function test_importCsvFile() {
  // A comma separated file.
  await test_importAbFile(
    "csv",
    "resources/basic_csv_addressbook.csv",
    "csv_import"
  );

  // A semicolon separated file.
  await test_importAbFile("csv", "resources/csv_semicolon.csv", "csv_import");

  // A comma separated file without header row.
  Services.prefs.setBoolPref("mail.import.csv.skipfirstrow", false);
  await test_importAbFile("csv", "resources/csv_no_header.csv", "csv_import", [
    2, // DisplayName
    0, // FirstName
    1, // LastName
    4, // PrimaryEmail
  ]);
  Services.prefs.clearUserPref("mail.import.csv.skipfirstrow");

  // A comma separated file with some fields containing quotes.
  await test_importAbFile("csv", "resources/quote.csv", "quote_csv");

  // Non-UTF8 csv file.
  await test_importAbFile(
    "csv",
    "resources/shiftjis_addressbook.csv",
    "shiftjis_csv"
  );
  await test_importAbFile(
    "csv",
    "resources/utf16_addressbook.csv",
    "utf16_csv"
  );
});

/** Test importing .vcf file works. */
add_task(async function test_importVCardFile() {
  return test_importAbFile(
    "vcard",
    "resources/basic_vcard_addressbook.vcf",
    "vcard_import"
  );
});

/** Test importing .vcf file with \r\r\n as line breaks works. */
add_task(async function test_importDosVCardFile() {
  return test_importAbFile(
    "vcard",
    "resources/dos_vcard_addressbook.vcf",
    "dos_vcard_import"
  );
});

/** Test importing .ldif file works. */
add_task(async function test_importLdifFile() {
  return test_importAbFile(
    "ldif",
    "resources/basic_ldif_addressbook.ldif",
    "basic_addressbook"
  );
});

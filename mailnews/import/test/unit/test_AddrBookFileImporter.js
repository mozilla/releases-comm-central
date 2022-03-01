/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { AddrBookFileImporter } = ChromeUtils.import(
  "resource:///modules/AddrBookFileImporter.jsm"
);

/**
 * Create a temporary address book, import a source file into it, then test the
 * cards are correct.
 * @param {string} type - A source file type supported by AddrBookFileImporter.
 * @param {string} testFile - The path of a source file.
 * @param {string} refDataKey - The key of an object in addressbook.json.
 */
async function test_importAbFile(type, testFile, refDataKey) {
  // Create an address book and init the importer.
  let dirId = MailServices.ab.newAddressBook(
    `tmp-${type}`,
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  let targetDir = MailServices.ab.getDirectoryFromId(dirId);
  let importer = new AddrBookFileImporter(type);

  // Start importing.
  await importer.startImport(do_get_file(testFile), targetDir);

  // Read in the reference data.
  let refFile = do_get_file("resources/addressbook.json");
  let refData = JSON.parse(await IOUtils.readUTF8(refFile.path))[refDataKey];

  // Compare with the reference data.
  for (let i = 0; i < refData.length; i++) {
    let card = targetDir.childCards[i];
    for (let [key, value] of Object.entries(refData[i])) {
      if (["LastModifiedDate"].includes(key)) {
        continue;
      }
      equal(value, card.getProperty(key, ""), `${key} should be correct`);
    }
  }
}

/** Test importing .vcf file works. */
add_task(async function test_importVCardFile() {
  return test_importAbFile(
    "vcard",
    "resources/basic_vcard_addressbook.vcf",
    "vcard_import"
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

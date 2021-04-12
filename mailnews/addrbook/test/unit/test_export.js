/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  exportDirectoryToDelimitedText,
  exportDirectoryToLDIF,
  exportDirectoryToVCard,
} = ChromeUtils.import("resource:///modules/AddrBookUtils.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

add_task(async () => {
  let dirPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  let book = MailServices.ab.getDirectoryFromId(dirPrefId);

  let contact1 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact1.UID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
  contact1.displayName = "contact number one";
  contact1.firstName = "contact";
  contact1.lastName = "one";
  contact1.primaryEmail = "contact1@invalid";
  contact1 = book.addCard(contact1);

  let contact2 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact2.UID = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy";
  contact2.displayName = "contact number two";
  contact2.firstName = "contact";
  contact2.lastName = "two";
  contact2.primaryEmail = "contact2@invalid";
  contact2.setProperty("JobTitle", `"worker"`);
  contact2.setProperty("Custom1", "custom, 1");
  contact2.setProperty("Custom2", "custom\t2");
  contact2.setProperty("Custom3", "custom\r3");
  contact2.setProperty("Custom4", "custom\n4");
  contact2.setProperty("Notes", "here's some unicode text…");
  contact2 = book.addCard(contact2);

  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "new list";
  list = book.addMailList(list);
  list.addCard(contact1);

  await compareAgainstFile(
    "export.csv",
    exportDirectoryToDelimitedText(book, ",")
  );
  await compareAgainstFile(
    "export.txt",
    exportDirectoryToDelimitedText(book, "\t")
  );
  await compareAgainstFile("export.vcf", exportDirectoryToVCard(book));
  // modifytimestamp is always changing, replace it with a fixed value.
  await compareAgainstFile(
    "export.ldif",
    exportDirectoryToLDIF(book).replace(
      /modifytimestamp: \d+/g,
      "modifytimestamp: 12345"
    )
  );
});

async function compareAgainstFile(fileName, actual) {
  info(`checking against ${fileName}`);

  // The test files are UTF-8 encoded and have Windows line endings. The
  // exportDirectoryTo* functions are platform-dependent, except for VCard
  // which always uses Windows line endings.

  let file = do_get_file(`data/${fileName}`);
  let expected = await IOUtils.readUTF8(file.path);

  if (AppConstants.platform != "win" && fileName != "export.vcf") {
    expected = expected.replace(/\r\n/g, "\n");
  }

  // From here on, \r is just another character. It will be the last character
  // on lines where Windows line endings exist.
  let expectedLines = expected.split("\n");
  let actualLines = actual.split("\n");
  equal(actualLines.length, expectedLines.length, "correct number of lines");

  for (let l = 0; l < expectedLines.length; l++) {
    let expectedLine = expectedLines[l];
    let actualLine = actualLines[l];
    if (actualLine == expectedLine) {
      ok(true, `line ${l + 1} matches`);
    } else {
      for (let c = 0; c < expectedLine.length && c < actualLine.length; c++) {
        if (actualLine[c] != expectedLine[c]) {
          // This call to equal automatically prints some extra characters of
          // context. Hopefully that helps with debugging.
          equal(
            actualLine.substring(c - 10, c + 10),
            expectedLine.substring(c - 10, c + 10),
            `line ${l + 1} does not match at character ${c + 1}`
          );
        }
      }
      equal(
        expectedLine.length,
        actualLine.length,
        `line ${l + 1} lengths differ`
      );
    }
  }
}

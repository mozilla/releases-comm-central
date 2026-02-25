/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that message headers are correctly decoded and normalised before
 * entering the database.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

let folder;
const generator = new MessageGenerator();

add_setup(function () {
  do_get_profile();
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder = rootFolder.createLocalSubfolder("test");
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
});

add_task(function testSender() {
  function test(from, expectedSender, charset) {
    const message = folder.addMessage(
      generator
        .makeMessage({
          from,
          clobberHeaders: { "Content-type": `text/plain; charset=${charset}` },
        })
        .toMessageString()
    );
    Assert.equal(
      message.author,
      expectedSender,
      "author should be decoded and normalised"
    );
    Assert.equal(
      message.mime2DecodedAuthor,
      expectedSender,
      "mime2DecodedAuthor should match author"
    );
  }

  // Unquoted name.
  test("John Doe <db@tinderbox.invalid>", "John Doe <db@tinderbox.invalid>");

  // Quoted name.
  test(
    '"Doe, John" <db@tinderbox.invalid>',
    '"Doe, John" <db@tinderbox.invalid>'
  );

  // Two names.
  test(
    "John Doe <db@tinderbox.invalid>, Sally Ann <db@null.invalid>",
    "John Doe <db@tinderbox.invalid>, Sally Ann <db@null.invalid>"
  );

  // Encoded UTF-8.
  test(
    "=?UTF-8?Q?David_H=C3=A5s=C3=A4ther?= <db@null.invalid>",
    "David Håsäther <db@null.invalid>"
  );

  // Temporarily disabled, bug 2019183.
  // Same as above, but with decomposed characters.
  // test(
  //   "=?UTF-8?Q?David_Ha=CC=8Asa=CC=88ther?= <db@null.invalid>",
  //   "David Håsäther <db@null.invalid>"
  // );

  // Unencoded UTF-8.
  test("David Håsäther <db@null.invalid>", "David Håsäther <db@null.invalid>");

  // ISO-8859-1.
  test(
    "\xC2\xAB\xCE\xA0\xCE\x9F\xCE\x9B\xCE\x99\xCE\xA4\xCE\x97\xCE\xA3\xC2\xBB",
    "«ΠΟΛΙΤΗΣ»"
  );

  test(
    "John Doe \xF5  <db@null.invalid>",
    "John Doe õ  <db@null.invalid>",
    "ISO-8859-1"
  );

  // ISO-8859-2 message.
  test(
    "John Doe \xF5 <db@null.invalid>",
    "John Doe ő <db@null.invalid>",
    "ISO-8859-2"
  );

  // Encoded UTF-8 in a ISO-8859-2 message.
  test(
    "=?UTF-8?Q?H=C3=A5s=C3=A4ther=2C_David?= <db@null.invalid>",
    "Håsäther, David <db@null.invalid>",
    "ISO-8859-2"
  );
});

add_task(function testRecipients() {
  const message = folder.addMessage(
    generator
      .makeMessage({
        to: "=?UTF-8?Q?Chlo=C3=AB's_Caf=C3=A9?= <db@null.invalid>",
        cc: "Pedro's Pi\xF1ata <db@null.invalid>",
        clobberHeaders: {
          Bcc: "=?UTF-8?Q?Hidden_Jalapen=CC=83o_<db@null.invalid>?=",
        },
      })
      .toMessageString()
  );
  Assert.equal(message.recipients, "Chloë's Café <db@null.invalid>");
  Assert.equal(message.ccList, "Pedro's Piñata <db@null.invalid>");
  // Temporarily disabled, bug 2019183.
  // Assert.equal(message.bccList, "Hidden Jalapeño <db@null.invalid>");
});

add_task(function testSubject() {
  function test(subject, expectedSubject, charset) {
    const message = folder.addMessage(
      generator
        .makeMessage({
          subject,
          clobberHeaders: { "Content-type": `text/plain; charset=${charset}` },
        })
        .toMessageString()
    );
    Assert.equal(
      message.subject,
      expectedSubject,
      "subject should be decoded and normalised"
    );
    Assert.equal(
      message.mime2DecodedSubject,
      expectedSubject,
      "mime2DecodedSubject should match subject"
    );
  }

  // Entirely ASCII.
  test("My Hovercraft Full Of Eels", "My Hovercraft Full Of Eels");

  // Temporarily disabled, bug 2019183.
  // Encoded UTF-8 with composed and decomposed characters.
  // test(
  //   "=?UTF-8?Q?The_G=C3=A2teau_for_the_Cha=CC=82teau?=",
  //   "The Gâteau for the Château"
  // );

  // ISO-8859-1.
  test("Cr\xE8me Br\xFBl\xE9e Recipe", "Crème Brûlée Recipe");

  // ISO-8859-13.
  test(
    "Nau mai ki T\xE2maki Makau Rau",
    "Nau mai ki Tāmaki Makau Rau",
    "ISO-8859-13"
  );
});

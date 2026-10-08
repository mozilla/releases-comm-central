/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests detecting inline PGP in MIME tree parts.
 */

"use strict";

const { MimeTreeDecrypter, stripHTMLFromArmoredBlocks } =
  ChromeUtils.importESModule(
    "chrome://openpgp/content/modules/MimeTree.sys.mjs"
  );

/**
 * Check whether an HTML part is detected as inline encrypted.
 *
 * @param {string} body - The HTML body of the part.
 * @returns {boolean} whether the part is inline encrypted.
 */
function isEncryptedHTML(body) {
  return new MimeTreeDecrypter().isEncryptedINLINE({
    body,
    headers: new Map([["content-type", { type: "text/html" }]]),
  });
}

add_task(function testEncryptedHTML() {
  Assert.ok(
    isEncryptedHTML(
      "-----BEGIN PGP <b>MESSAGE</b>-----<br>\n<br>\ndata<br>\n" +
        "-----END PGP MESSAGE-----<br>\n"
    ),
    "tags in the armored block should be ignored"
  );
  Assert.ok(
    !isEncryptedHTML("<p>Hello</p>"),
    "a part without an armored block should not be encrypted"
  );
});

add_task(function testCraftedHTML() {
  Assert.ok(
    !isEncryptedHTML(
      "-----BEGIN PGP MESSAGE-----" +
        "<".repeat(100000) +
        "\n-----END PGP MESSAGE-----\n"
    ),
    "many unclosed < should be handled"
  );
  Assert.ok(
    !isEncryptedHTML("-----BEGIN PGP x-----END PGP ".repeat(60000)),
    "many armored blocks should be handled"
  );
});

add_task(function testStripClearsigned() {
  Assert.equal(
    stripHTMLFromArmoredBlocks(
      "<p>Hi</p>-----BEGIN PGP SIGNED MESSAGE-----<br>\nHash: SHA256<br>\n" +
        "<br>\nHello &amp; <b>bye</b><br>\n" +
        "-----BEGIN PGP SIGNATURE-----<br>\nabc<br>\n" +
        "-----END PGP SIGNATURE-----<br>\n<p>Bye</p>"
    ),
    "<p>Hi</p>-----BEGIN PGP SIGNED MESSAGE-----\nHash: SHA256\n" +
      "\nHello  bye\n" +
      "-----BEGIN PGP SIGNATURE-----\nabc\n" +
      "-----END PGP SIGNATURE-----<br>\n<p>Bye</p>",
    "the signed text and the signature should both be stripped"
  );
});

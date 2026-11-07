/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests body search in S/MIME messages whose base64 body is truncated or
 * contains characters outside the base64 alphabet: the part up to the end of
 * the valid base64 is searched, nothing after it.
 */

const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const SMIME_DATA = "../../../../mailnews/test/data/smime/";

// The content of both messages is "This is a test message from Alice to Bob."
const ENVELOPED_MESSAGE = "alice.env.eml";
const SIGNED_MESSAGE = "alice.sig.SHA256.opaque.eml";

// Base64 characters cut from the end of the enveloped message, which has 875
// characters without its padding. The cuts leave 3, 0, 1 and 2 characters
// after the last complete group of four, and the deeper ones remove encrypted
// content from the end.
const ENVELOPED_CUTS = [4, 3, 2, 1, 24, 48, 72];

// Base64 characters kept of the signed message. The signed content starts
// at octet 84 of the message, and 140 characters decode to 105 octets, which
// end after "This is a test messag". 141 characters leave a single character
// after the last complete group of four.
const SIGNED_CUTS = [140, 141, 142, 143];

let inbox;

/**
 * Reads a message of the S/MIME test data and splits it into its header
 * block, with the empty line, and its base64 body without line breaks.
 *
 * @param {string} fileName - A file in mailnews/test/data/smime.
 * @returns {Promise<string[]>}
 */
async function readMessage(fileName) {
  const message = await IOUtils.readUTF8(
    do_get_file(SMIME_DATA + fileName).path
  );
  const separator = message.match(/\r?\n\r?\n/);
  const headerLength = separator.index + separator[0].length;
  return [
    message.slice(0, headerLength),
    message.slice(headerLength).replace(/\s/g, ""),
  ];
}

/**
 * Adds a message to the inbox.
 *
 * @param {string} headers - The header block of a test message.
 * @param {string} subject - The new subject of the message.
 * @param {string} body - The body text, broken into lines of 64 characters.
 */
function addMessage(headers, subject, body) {
  inbox.addMessage(
    headers.replace(/^Subject:.*$/m, `Subject: ${subject}`) +
      body.replace(/.{1,64}/g, "$&\r\n")
  );
}

/**
 * Searches the inbox for messages whose body contains the text.
 *
 * @param {string} text
 * @returns {Promise<string[]>} The subjects of the messages found, sorted.
 */
async function searchBody(text) {
  const session = Cc["@mozilla.org/messenger/searchSession;1"].createInstance(
    Ci.nsIMsgSearchSession
  );
  session.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, inbox);
  const term = session.createTerm();
  term.attrib = Ci.nsMsgSearchAttrib.Body;
  const value = term.value;
  value.attrib = Ci.nsMsgSearchAttrib.Body;
  value.str = text;
  term.value = value;
  term.op = Ci.nsMsgSearchOp.Contains;
  term.booleanAnd = false;
  session.appendTerm(term);

  const subjects = [];
  await new Promise(resolve => {
    session.registerListener({
      onSearchHit(msgHdr) {
        subjects.push(msgHdr.mime2DecodedSubject);
      },
      onSearchDone: resolve,
      onNewSearch() {},
    });
    session.search(null);
  });
  return subjects.sort();
}

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    do_get_file(SMIME_DATA + "TestCA.pem"),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(do_get_file(SMIME_DATA + "Bob.p12"), "nss");
  localAccountUtils.loadLocalMailAccount();
  inbox = localAccountUtils.inboxFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  const [envelopedHeaders, enveloped] = await readMessage(ENVELOPED_MESSAGE);
  addMessage(envelopedHeaders, "enveloped", enveloped);
  const envelopedLength = enveloped.replace(/=+$/, "").length;
  for (const cut of ENVELOPED_CUTS) {
    addMessage(
      envelopedHeaders,
      `enveloped cut ${cut}`,
      enveloped.slice(0, envelopedLength - cut)
    );
  }

  const [signedHeaders, signed] = await readMessage(SIGNED_MESSAGE);
  addMessage(signedHeaders, "signed", signed);
  for (const cut of SIGNED_CUTS) {
    addMessage(signedHeaders, `signed cut ${cut}`, signed.slice(0, cut));
  }
  // The rest of the message after a character outside the base64 alphabet,
  // or after padding in the middle of the body, is not decoded: the first
  // message decodes to 107 octets, the second one to 106.
  addMessage(
    signedHeaders,
    "signed with invalid character",
    signed.slice(0, 143) + "*" + signed.slice(143)
  );
  addMessage(
    signedHeaders,
    "signed with padding",
    signed.slice(0, 142) + "=" + signed.slice(142)
  );

  addMessage(
    envelopedHeaders,
    "not base64",
    "!! This is a test message from Alice to Bob, not encoded. !!"
  );
});

add_task(async function test_found_up_to_the_end_of_valid_base64() {
  // A truncated enveloped message yields the content decrypted before the
  // cut, a truncated or damaged signed message the content decoded before it.
  const expectedHits = new Map([
    [
      "This is a test message from Alice to Bob",
      [
        "enveloped",
        "enveloped cut 1",
        "enveloped cut 2",
        "enveloped cut 3",
        "enveloped cut 4",
        "signed",
      ],
    ],
    [
      "This is a test message",
      [
        "enveloped",
        "enveloped cut 1",
        "enveloped cut 2",
        "enveloped cut 24",
        "enveloped cut 3",
        "enveloped cut 4",
        "signed",
        "signed cut 142",
        "signed cut 143",
        "signed with invalid character",
        "signed with padding",
      ],
    ],
    [
      "This is a test messag",
      [
        "enveloped",
        "enveloped cut 1",
        "enveloped cut 2",
        "enveloped cut 24",
        "enveloped cut 3",
        "enveloped cut 4",
        "signed",
        "signed cut 140",
        "signed cut 141",
        "signed cut 142",
        "signed cut 143",
        "signed with invalid character",
        "signed with padding",
      ],
    ],
    [
      "This is a test",
      [
        "enveloped",
        "enveloped cut 1",
        "enveloped cut 2",
        "enveloped cut 24",
        "enveloped cut 3",
        "enveloped cut 4",
        "enveloped cut 48",
        "signed",
        "signed cut 140",
        "signed cut 141",
        "signed cut 142",
        "signed cut 143",
        "signed with invalid character",
        "signed with padding",
      ],
    ],
    // Nothing after the end of the valid base64, and nothing from a body that
    // does not start with base64.
    [
      "Alice",
      [
        "enveloped",
        "enveloped cut 1",
        "enveloped cut 2",
        "enveloped cut 3",
        "enveloped cut 4",
        "signed",
      ],
    ],
  ]);
  for (const [text, subjects] of expectedHits) {
    Assert.deepEqual(await searchBody(text), subjects, `found "${text}"`);
  }
});

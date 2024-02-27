/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { convertMailStoreTo } = ChromeUtils.import(
  "resource:///modules/mailstoreConverter.jsm"
);

Services.prefs.setCharPref(
  "mail.serverDefaultStoreContractID",
  "@mozilla.org/msgstore/berkeleystore;1"
);

// Test data for round-trip test.
const testEmails = [
  // Base64 encoded bodies.
  "../../../data/01-plaintext.eml",
  "../../../data/02-plaintext+attachment.eml",
  "../../../data/03-HTML.eml",
  "../../../data/04-HTML+attachment.eml",
  "../../../data/05-HTML+embedded-image.eml",
  "../../../data/06-plaintext+HMTL.eml",
  "../../../data/07-plaintext+(HTML+embedded-image).eml",
  "../../../data/08-plaintext+HTML+attachment.eml",
  "../../../data/09-(HTML+embedded-image)+attachment.eml",
  "../../../data/10-plaintext+(HTML+embedded-image)+attachment.eml",

  // Bodies with non-ASCII characters in UTF-8 and other charsets.
  "../../../data/11-plaintext.eml",
  "../../../data/12-plaintext+attachment.eml", // using ISO-8859-7 (Greek)
  "../../../data/13-HTML.eml",
  "../../../data/14-HTML+attachment.eml",
  "../../../data/15-HTML+embedded-image.eml",
  "../../../data/16-plaintext+HMTL.eml", // text part is base64 encoded
  "../../../data/17-plaintext+(HTML+embedded-image).eml", // HTML part is base64 encoded
  "../../../data/18-plaintext+HTML+attachment.eml",
  "../../../data/19-(HTML+embedded-image)+attachment.eml",
  "../../../data/20-plaintext+(HTML+embedded-image)+attachment.eml", // using windows-1252

  // Bodies with non-ASCII characters in UTF-8 and other charsets, all encoded with quoted printable.
  "../../../data/21-plaintext.eml",
  "../../../data/22-plaintext+attachment.eml", // using ISO-8859-7 (Greek)
  "../../../data/23-HTML.eml",
  "../../../data/24-HTML+attachment.eml",
  "../../../data/25-HTML+embedded-image.eml",
  "../../../data/26-plaintext+HMTL.eml", // text part is base64 encoded
  "../../../data/27-plaintext+(HTML+embedded-image).eml", // HTML part is base64 encoded
  "../../../data/28-plaintext+HTML+attachment.eml",
  "../../../data/29-(HTML+embedded-image)+attachment.eml",
  "../../../data/30-plaintext+(HTML+embedded-image)+attachment.eml", // using windows-1252
];

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  add_task(async function () {
    await doMboxTest("test1", "../../../data/mbox_modern", 2);
    await doMboxTest("test2", "../../../data/mbox_mboxrd", 2);
    await doMboxTest("test3", "../../../data/mbox_unquoted", 2);
    await roundTripTest();
    // Ideas for more tests:
    // - check a really big mbox
    // - check with really huge message (larger than one chunk)
    // - check mbox with "From " line on chunk boundary
    // - add tests for maildir->mbox conversion
    // - check that conversions preserve message body (ie that the
    //   "From " line escaping scheme is reversible)
  });

  run_next_test();
}

/**
 * Helper to create a server, account and inbox, and install an
 * mbox file.
 *
 * @param {string} srvName - A unique server name to use for the test.
 * @param {string} mboxFilename - mbox file to install and convert.
 * @returns {nsIMsgIncomingServer} a server.
 */
function setupServer(srvName, mboxFilename) {
  // {nsIMsgIncomingServer} pop server for the test.
  const server = MailServices.accounts.createIncomingServer(
    srvName,
    "localhost",
    "pop3"
  );
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  server.QueryInterface(Ci.nsIPop3IncomingServer);
  server.valid = true;

  const inbox = account.incomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );

  // install the mbox file
  const mboxFile = do_get_file(mboxFilename);
  mboxFile.copyTo(inbox.filePath.parent, inbox.filePath.leafName);

  // TODO: is there some way to make folder rescan the mbox?
  // We don't need it for this, but would be nice to do things properly.
  return server;
}

/**
 * Perform an mbox->maildir conversion test.
 *
 * @param {string} srvName - A unique server name to use for the test.
 * @param {string} mboxFilename - mbox file to install and convert.
 * @param {number} expectCnt - Number of messages expected.
 * @returns {nsIMsgIncomingServer} a server.
 */
async function doMboxTest(srvName, mboxFilename, expectCnt) {
  // set up an account+server+inbox and copy in the test mbox file
  const server = setupServer(srvName, mboxFilename);

  const mailstoreContractId = Services.prefs.getCharPref(
    "mail.server." + server.key + ".storeContractID"
  );

  await convertMailStoreTo(mailstoreContractId, server, new EventTarget());

  // Converted. Now find resulting Inbox/cur directory so
  // we can count the messages there.

  const inbox = server.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  // NOTE: the conversion updates the path of the root folder,
  // but _not_ the path of the inbox...
  // Ideally, we'd just use inbox.filePath here, but
  // instead we'll have compose the path manually.

  const curDir = server.rootFolder.filePath;
  curDir.append(inbox.filePath.leafName);
  curDir.append("cur");

  // Sanity check.
  Assert.ok(curDir.isDirectory(), "'cur' directory created");

  // Check number of messages in Inbox/cur is what we expect.
  const cnt = [...curDir.directoryEntries].length;

  Assert.equal(
    cnt,
    expectCnt,
    "expected number of messages (" + mboxFilename + ")"
  );
}

/**
 * Create a temporary directory. The caller is responsible for deleting it.
 *
 * @param {string} prefix - Generated dir name will be of the form:
 *                          "<prefix><random_sequence>".
 * @returns {string} full path of new directory.
 */
async function tempDir(prefix) {
  if (!prefix) {
    prefix = "";
  }
  const tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
  // @see https://github.com/eslint/eslint/issues/17807
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const name = prefix + Math.floor(Math.random() * 0xffffffff).toString(16);
    const fullPath = PathUtils.join(tmpDir, name);
    try {
      await IOUtils.makeDirectory(fullPath, { ignoreExisting: false });
      return fullPath;
    } catch (e) {
      // If directory already exists, try another name. Else bail out.
      if (
        !(DOMException.isInstance(e) && e.name === "NoModificationAllowedError")
      ) {
        throw e;
      }
    }
  }
}

/**
 * Test that messages survive unscathed in a roundtrip conversion,
 * maildir -> mbox -> maildir.
 * The final mailbox should have an identical set of files to the initial one,
 * albeit with different filenames.
 * Purely filesystem based.
 *
 * Would be nice to do a mbox->maildir->mbox roundtrip too, but that'd involve
 * parsing the mbox files to compare them (can't just compare mbox files because
 * message order and "From " lines can change).
 */
async function roundTripTest() {
  // Set up initial maildir structure
  const initialRoot = await tempDir("initial");

  const inbox = PathUtils.join(initialRoot, "INBOX");
  await IOUtils.makeDirectory(inbox);
  // Create a couple of subdirs under INBOX
  const subdir = PathUtils.join(initialRoot, "INBOX.sbd");
  await IOUtils.makeDirectory(subdir);
  const foodir = PathUtils.join(subdir, "foo");
  await IOUtils.makeDirectory(foodir);
  const bardir = PathUtils.join(subdir, "bar");
  await IOUtils.makeDirectory(bardir);

  // Populate all the folders with some test emails.
  const absolutePaths = testEmails.map(path => do_get_file(path).path);
  await populateMaildir(inbox, absolutePaths);
  await populateMaildir(foodir, absolutePaths);
  await populateMaildir(bardir, absolutePaths);

  // Add a pick of "special" files, which should survive the trip verbatim.
  for (const special of ["filterlog.html", "feeds.json", "rules.dat"]) {
    const f = PathUtils.join(initialRoot, special);
    await IOUtils.writeUTF8(f, f); // Use the filename for content.
  }

  // Create root dirs for intermediate and final result.
  const mboxRoot = await tempDir("mbox");
  const finalRoot = await tempDir("final");

  // Convert: maildir -> mbox -> maildir
  await doConvert("maildir", initialRoot, "mbox", mboxRoot);
  await doConvert("mbox", mboxRoot, "maildir", finalRoot);

  // compare results - use checksums, because filenames will differ.
  await recursiveMaildirCompare(initialRoot, finalRoot);
}

/**
 * Helper to adapt the callbacks from converterWorker into a promise.
 *
 * @param {string} srcType - type of source ("maildir", "mbox")
 * @param {string} srcRoot - root directory containing the src folders.
 * @param {string} destType - type of destination ("maildir", "mbox")
 * @param {string} destRoot - root directory to place converted store.
 * @returns {Promise} resolved when when conversion is complete.
 */
function doConvert(srcType, srcRoot, destType, destRoot) {
  return new Promise(function (resolve, reject) {
    const worker = new ChromeWorker("resource:///modules/converterWorker.js");
    worker.addEventListener("message", function (ev) {
      if (ev.data.msg == "success") {
        resolve();
      }
    });
    worker.addEventListener("error", function (ev) {
      reject(ev.message);
    });
    // Go.
    worker.postMessage({
      srcType,
      destType,
      srcRoot,
      destRoot,
    });
  });
}

/**
 * Copy a list of email files (.eml) files into a maildir, creating "cur"
 * and "tmp" subdirs if required.
 *
 * @param {string} maildir - Path to the maildir directory.
 * @param {Array<string>} emailFiles - paths of source .eml files to copy.
 */
async function populateMaildir(maildir, emailFiles) {
  const cur = PathUtils.join(maildir, "cur");
  await IOUtils.makeDirectory(cur);
  await IOUtils.makeDirectory(PathUtils.join(maildir, "tmp"));

  // Normally maildir files would have a name derived from their msg-id field,
  // but here we'll just use a timestamp-based one to save parsing them.
  let ident = Date.now();
  for (const src of emailFiles) {
    const dest = PathUtils.join(cur, ident.toString() + ".eml");
    ident += 1;
    await IOUtils.copy(src, dest);
  }
}

/*
 * List files in a directory (excludes subdirectories).
 *
 * @param {String} dirPath - Full path of directory.
 * @returns {Array<String} full paths of the files.
 */
async function listFiles(dirPath) {
  const files = [];
  // Note: IOUtils has no dir iterator at time of writing.
  for (const path of await IOUtils.getChildren(dirPath)) {
    const fileInfo = await IOUtils.stat(path);
    if (fileInfo.type !== "directory") {
      files.push(path);
    }
  }
  return files;
}

/*
 * Calculate md5 checksum for a file.
 *
 * @param {String} fileName - Full path to file.
 * @returns {String} checksum of the file contents.
 */
async function md5Sum(fileName) {
  const md5 = Cc["@mozilla.org/security/hash;1"].createInstance(
    Ci.nsICryptoHash
  );
  md5.init(Ci.nsICryptoHash.MD5);
  const raw = await IOUtils.read(fileName);
  md5.update(raw, raw.byteLength);
  return md5.finish(true);
}

/**
 * Compare all maildir directories in two directory trees.
 * The comparison is per-maildir, by looking at the checksums of their emails.
 * Asserts a test fail if any differences are found.
 *
 * @param {string} rootA - path to root of maildir store A.
 * @param {string} rootB - path to root of maildir store B.
 */
async function recursiveMaildirCompare(rootA, rootB) {
  const subdirs = [];
  const maildirs = [];
  const otherFiles = [];
  for (const path of await IOUtils.getChildren(rootA)) {
    const stat = await IOUtils.stat(path);
    const name = PathUtils.filename(path);
    if (stat.type === "directory") {
      if (name.endsWith(".sbd")) {
        subdirs.push(name);
      } else {
        // Assume all other dirs are maildirs.
        maildirs.push(name);
      }
    } else {
      otherFiles.push(name);
    }
  }

  // Compare the maildirs we found here.
  const md5DirContents = async function (dirPath) {
    const checksums = [];
    for (const f of await listFiles(dirPath)) {
      checksums.push(await md5Sum(f));
    }
    return checksums;
  };

  for (const name of maildirs) {
    const checksumsA = await md5DirContents(PathUtils.join(rootA, name, "cur"));
    const checksumsB = await md5DirContents(PathUtils.join(rootB, name, "cur"));

    checksumsA.sort();
    checksumsB.sort();
    let match = checksumsA.length == checksumsB.length;
    for (let i = 0; match && i < checksumsA.length; i++) {
      match = checksumsA[i] == checksumsB[i];
    }
    Assert.ok(match, "roundtrip preserves messages in maildir " + name);
  }

  // Make sure any "special" files survived the trip intact.
  for (const name of otherFiles) {
    const checksumA = await md5Sum(PathUtils.join(rootA, name));
    const pathB = PathUtils.join(rootB, name);
    const checksumB = (await IOUtils.exists(pathB))
      ? await md5Sum(pathB)
      : null;
    Assert.equal(checksumA, checksumB, "roundtrip preserves " + name);
  }

  // Recurse down into .sbd dirs.
  for (const name of subdirs) {
    await recursiveMaildirCompare(
      PathUtils.join(rootA, name),
      PathUtils.join(rootB, name)
    );
  }
}

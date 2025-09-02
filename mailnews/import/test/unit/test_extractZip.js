/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { BaseProfileImporter } = ChromeUtils.importESModule(
  "resource:///modules/BaseProfileImporter.sys.mjs"
);

function createZipProfile(entries) {
  const tmpZipFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tmpZipFile.append("profile.zip");
  tmpZipFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
  tmpZipFile.remove(false);
  info(`Created a temporary zip file at ${tmpZipFile.path}`);

  const zipWriter = Cc["@mozilla.org/zipwriter;1"].createInstance(
    Ci.nsIZipWriter
  );
  // MODE_WRONLY (0x02) and MODE_CREATE (0x08)
  zipWriter.open(tmpZipFile, 0x02 | 0x08);
  for (const entry of entries) {
    const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    stream.setByteStringData("this content doesn't matter");
    zipWriter.addEntryStream(
      entry,
      Date.now() * 1000,
      Ci.nsIZipWriter.COMPRESSION_NONE,
      stream,
      false
    );
  }
  zipWriter.close();

  return tmpZipFile;
}

/**
 * Tests extracting from the root of a zip file.
 */
add_task(async function testExtractFromRoot() {
  const zipFile = createZipProfile(["foo.txt", "bar/nope.png", "baz/quux.js"]);
  const importer = new (class extends BaseProfileImporter {
    IGNORE_DIRS = ["bar"];
  })();
  const extractDir = await importer.extractZipFile(zipFile, () => {});
  Assert.ok(extractDir.exists(), `directory ${extractDir.path} should exist`);

  const foo = extractDir.clone();
  foo.append("foo.txt");
  Assert.ok(foo.isFile(), `file ${foo.path} should exist`);

  const bar = extractDir.clone();
  bar.append("bar");
  Assert.ok(
    !bar.exists(),
    `directory ${bar.path} should not exist, because we're ignoring it`
  );

  const quux = extractDir.clone();
  quux.append("baz");
  Assert.ok(quux.isDirectory(), `directory ${quux.path} should exist`);
  quux.append("quux.js");
  Assert.ok(quux.isFile(), `file ${quux.path} should exist`);
});

/**
 * Tests extracting from a zip file with a top-level directory. We're using
 * BaseProfileImporter, which says all zip files are valid, so the contents of
 * the directory will be extracted, but not the directory itself.
 */
add_task(async function testExtractFromLevel1() {
  const zipFile = createZipProfile([
    "inner/foo.txt",
    "inner/bar/nope.png",
    "inner/baz/quux.js",
  ]);
  const importer = new (class extends BaseProfileImporter {
    IGNORE_DIRS = ["bar"];
  })();
  const extractDir = await importer.extractZipFile(zipFile, () => {});
  Assert.ok(extractDir.exists(), `directory ${extractDir.path} should exist`);

  const foo = extractDir.clone();
  foo.append("foo.txt");
  Assert.ok(foo.isFile(), `file ${foo.path} should exist`);

  const bar = extractDir.clone();
  bar.append("bar");
  Assert.ok(
    !bar.exists(),
    `directory ${bar.path} should not exist, because we're ignoring it`
  );

  const quux = extractDir.clone();
  quux.append("baz");
  Assert.ok(quux.isDirectory(), `directory ${quux.path} should exist`);
  quux.append("quux.js");
  Assert.ok(quux.isFile(), `file ${quux.path} should exist`);
});

/**
 * Tests extracting from a zip file with a top-level directory. We'll say that
 * the directory does NOT contain a valid profile, so the directory AND its
 * contents will be extracted.
 */
add_task(async function testExtractFromLevel0() {
  const zipFile = createZipProfile([
    "inner/foo.txt",
    "inner/bar/nope.png",
    "inner/baz/quux.js",
  ]);
  const importer = new (class extends BaseProfileImporter {
    IGNORE_DIRS = ["bar"];
    validateZipSource(_zipReader, _prefix = "") {
      return false;
    }
  })();
  const extractDir = await importer.extractZipFile(zipFile, () => {});
  Assert.ok(extractDir.exists(), `directory ${extractDir.path} should exist`);

  const inner = extractDir.clone();
  inner.append("inner");
  Assert.ok(inner.isDirectory(), `directory ${inner.path} should exist`);

  const foo = inner.clone();
  foo.append("foo.txt");
  Assert.ok(foo.isFile(), `file ${foo.path} should exist`);

  const bar = inner.clone();
  bar.append("bar");
  // Only top-level directories can be ignored.
  Assert.ok(
    bar.isDirectory(),
    `directory ${bar.path} should exist, because we're not ignoring it`
  );
  bar.append("nope.png");
  Assert.ok(bar.isFile(), `file ${bar.path} should exist`);

  const quux = inner.clone();
  quux.append("baz");
  Assert.ok(quux.isDirectory(), `directory ${quux.path} should exist`);
  quux.append("quux.js");
  Assert.ok(quux.isFile(), `file ${quux.path} should exist`);
});

/**
 * Test progress updates.
 */
add_task(async function testExtractManyFiles() {
  const files = [];
  for (let i = 0x61; i <= 0x7a; i++) {
    files.push(`${String.fromCharCode(i).repeat(3)}.txt`);
  }
  const zipFile = createZipProfile(files);
  const importer = new BaseProfileImporter();
  const progressReports = [];
  const extractDir = await importer.extractZipFile(
    zipFile,
    function (progress) {
      Assert.greater(progress, 0, "progress should be more than 0");
      Assert.lessOrEqual(progress, 1, "progress should be less or equal to 1");
      progressReports.push(progress);
    }
  );
  Assert.ok(extractDir.exists(), `directory ${extractDir.path} should exist`);
  Assert.greater(
    progressReports.length,
    1,
    "progress should have been reported during extraction"
  );
  Assert.equal(
    progressReports.at(-1),
    1,
    "progress should have been reported at the end of extraction"
  );
});

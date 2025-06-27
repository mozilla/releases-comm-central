/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { repairMbox } = ChromeUtils.importESModule(
  "resource:///modules/MboxRepair.sys.mjs"
);

const gRepairPath = PathUtils.join(PathUtils.tempDir, "classicMacOS");

/** Test bare CR line endings are changed to LF */
add_task(async function testRepairClassicMacOS() {
  const testDataPath = do_get_file("../../../data/bugmail10").path;
  const data = await IOUtils.read(testDataPath);
  Assert.ok(data.includes(0x0a), "should include LF at start");
  const data2 = new Uint8Array();
  let j = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] == 0x0d) {
      // Skip CRs part of CRLFs.
      continue;
    }
    if (data[i] == 0x0a) {
      data2[j++] = 0x0d; // LF -> CR (so we have something to repair)
    } else {
      data2[j++] = data[i];
    }
  }
  await IOUtils.write(gRepairPath, data2, { overwrite: true });

  await repairMbox(gRepairPath);
  const dataAfter = await IOUtils.read(gRepairPath);
  Assert.ok(!dataAfter.includes(0x0d), "should not contain CR after repair");
  await IOUtils.remove(gRepairPath);
});

/** Test an unaffected mbox is left untouched. */
add_task(async function testRepairOkMbox() {
  const testDataPath = do_get_file("../../../data/bugmail10").path;
  await IOUtils.copy(testDataPath, gRepairPath);
  await repairMbox(gRepairPath);
  const data = await IOUtils.read(gRepairPath);
  // Data has CRLF. Should not be changed.
  Assert.ok(data.includes(0x0d), "should include CR at start");
  Assert.ok(data.includes(0x0a), "should include LF at start");
  await repairMbox(gRepairPath);

  const dataAfter = await IOUtils.read(gRepairPath);
  Assert.equal(
    JSON.stringify(data),
    JSON.stringify(dataAfter),
    "data should not be changed"
  );
  await IOUtils.remove(gRepairPath);
});

/** Test straddled CR (CR is the last character in the buffer). */
add_task(async function testStraddledCR() {
  const testData = new Uint8Array(1024 * 1024);
  testData.fill(0x3f); // Fill with "?"
  testData[testData.length - 1] = 0x0d; // CR last
  await IOUtils.write(gRepairPath, testData);
  await repairMbox(gRepairPath);
  const data = await IOUtils.read(gRepairPath);
  Assert.equal(data.length, testData.length, "data length should not change");
  // The CR was last in file. Would get converted.
  Assert.strictEqual(data.at(-1), 0x0a, "should have converted last CR to LF");

  const idx = testData.length;
  await IOUtils.write(gRepairPath, testData);
  testData[0] = 0x0a; // Add LF at next chunk.
  await IOUtils.write(gRepairPath, testData, { mode: "append" });
  // We now have a LF first in the next chunk.
  await repairMbox(gRepairPath);
  const data2 = await IOUtils.read(gRepairPath);
  Assert.strictEqual(data2.at(idx - 1), 0x0d, "should keep straddled CR");
  Assert.strictEqual(data2.at(-1), 0x0a, "should have converted last CR to LF");

  await IOUtils.remove(gRepairPath);
});

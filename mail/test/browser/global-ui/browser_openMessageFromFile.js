/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MockFilePicker } = ChromeUtils.importESModule(
  "resource://testing-common/MockFilePicker.sys.mjs"
);

add_task(async function test_openMessageFromFilePicker() {
  const expectedFilterLabel = await document.l10n.formatValue(
    "messenger-eml-files-filter"
  );
  MockFilePicker.init();
  MockFilePicker.returnValue = MockFilePicker.returnCancel;

  let filterLabel;
  let filterPattern;
  MockFilePicker.appendFilterCallback = (_picker, label, pattern) => {
    filterLabel = label;
    filterPattern = pattern;
  };
  const pickerOpened = new Promise(resolve => {
    MockFilePicker.afterOpenCallback = resolve;
  });

  try {
    await window.MsgOpenFromFile();
    const picker = await pickerOpened;
    Assert.equal(picker.mode, Ci.nsIFilePicker.modeOpen);
    Assert.equal(filterLabel, expectedFilterLabel);
    Assert.equal(filterPattern, "*.eml");
  } finally {
    MockFilePicker.cleanup();
  }
});

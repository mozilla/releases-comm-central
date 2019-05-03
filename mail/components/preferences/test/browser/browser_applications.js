/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes("paneApplications", "attachmentsOutTab", {
    checkboxID: "enableThreshold",
    pref: "mail.compose.big_attachments.notify",
    enabledElements: ["#cloudFileThreshold"],
  });
});

add_task(async () => {
  await testRadioButtons("paneApplications", "attachmentsInTab", {
    pref: "browser.download.useDownloadDir",
    states: [{
      id: "saveTo",
      prefValue: true,
      enabledElements: ["#downloadFolder", "#chooseFolder"],
    }, {
      id: "alwaysAsk",
      prefValue: false,
    }],
  });
});

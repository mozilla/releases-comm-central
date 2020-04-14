/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  await testCheckboxes(
    "paneSecurity",
    "junkTab",
    {
      checkboxID: "manualMark",
      pref: "mail.spam.manualMark",
      enabledElements: ["#manualMarkMode radio"],
    },
    {
      checkboxID: "markAsReadOnSpam",
      pref: "mail.spam.markAsReadOnSpam",
    },
    {
      checkboxID: "enableJunkLogging",
      pref: "mail.spam.logging.enabled",
      enabledElements: ["#openJunkLogButton"],
    }
  );

  await testCheckboxes("paneSecurity", "phishingTab", {
    checkboxID: "enablePhishingDetector",
    pref: "mail.phishing.detection.enabled",
  });

  await testCheckboxes("paneSecurity", "antiVirusTab", {
    checkboxID: "enableAntiVirusQuarantine",
    pref: "mailnews.downloadToTempFile",
  });
});

add_task(async () => {
  Services.prefs.setBoolPref("mail.spam.manualMark", true);

  await testRadioButtons("paneSecurity", "junkTab", {
    pref: "mail.spam.manualMarkMode",
    states: [
      {
        id: "manualMarkMode0",
        prefValue: 0,
      },
      {
        id: "manualMarkMode1",
        prefValue: 1,
      },
    ],
  });
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let tests = [{
    checkboxID: "useAutoScroll",
    pref: "general.autoScroll",
  }, {
    checkboxID: "useSmoothScrolling",
    pref: "general.smoothScroll",
  }, {
    checkboxID: "alwaysCheckDefault",
    pref: "mail.shell.checkDefaultClient",
  }, {
    checkboxID: "enableGloda",
    pref: "mailnews.database.global.indexer.enabled",
  }, {
    checkboxID: "allowHWAccel",
    pref: "layers.acceleration.disabled",
    prefValues: [true, false],
  }];

  // We don't want to wake up the platform search for this test.
  // if (AppConstants.platform == "macosx") {
  //   tests.push({
  //     checkboxID: "searchIntegration",
  //     pref: "mail.spotlight.enable",
  //   });
  // } else if (AppConstants.platform == "win") {
  //   tests.push({
  //     checkboxID: "searchIntegration",
  //     pref: "mail.winsearch.enable",
  //   });
  // }

  await testCheckboxes("paneAdvanced", "advancedGeneralTab", ...tests);

  // Telemetry pref is locked.
  // await testCheckboxes("paneAdvanced", "dataChoicesTab", {
  //   checkboxID: "submitTelemetryBox",
  //   pref: "toolkit.telemetry.enabled",
  // });

  await testCheckboxes("paneAdvanced", "networkingTab", {
    checkboxID: "allowSmartSize",
    pref: "browser.cache.disk.smart_size.enabled",
    prefValues: [true, false],
    enabledElements: ["#cacheSize"],
  }, {
    checkboxID: "offlineCompactFolder",
    pref: "mail.prompt_purge_threshhold",
    enabledElements: ["#offlineCompactFolderMin"],
  });

  await testCheckboxes("paneAdvanced", "certificateTab", {
    checkboxID: "enableOCSP",
    pref: "security.OCSP.enabled",
    prefValues: [0, 1],
  });
});

add_task(async () => {
  await testRadioButtons("paneAdvanced", "advancedGeneralTab", {
    pref: "intl.regional_prefs.use_os_locales",
    states: [{
      id: "appLocale",
      prefValue: false,
    }, {
      id: "rsLocale",
      prefValue: true,
    }],
  });

  // Here we'd test the update choices, but I don't want to go near that.

  await testRadioButtons("paneAdvanced", "certificateTab", {
    pref: "security.default_personal_cert",
    states: [{
      id: "certSelectionAuto",
      prefValue: "Select Automatically",
    }, {
      id: "certSelectionAsk",
      prefValue: "Ask Every Time",
    }],
  });
});

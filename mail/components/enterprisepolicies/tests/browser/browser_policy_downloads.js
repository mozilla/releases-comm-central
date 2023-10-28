/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_defaultdownload() {
  await setupPolicyEngineWithJson({
    policies: {
      DefaultDownloadDirectory: "${home}/Downloads",
      PromptForDownloadLocation: false,
    },
  });

  window.openPreferencesTab("paneGeneral");
  await BrowserTestUtils.browserLoaded(
    window.preferencesTabType.tab.browser,
    undefined,
    url => url.startsWith("about:preferences")
  );
  const { contentDocument } = window.preferencesTabType.tab.browser;
  await TestUtils.waitForCondition(() =>
    contentDocument.getElementById("alwaysAsk")
  );
  await new Promise(resolve =>
    window.preferencesTabType.tab.browser.contentWindow.setTimeout(resolve)
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "alwaysAsk"
    ).disabled,
    true,
    "alwaysAsk should be disabled."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "saveTo"
    ).selected,
    true,
    "saveTo should be selected."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "saveTo"
    ).disabled,
    true,
    "saveTo should be disabled."
  );
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  is(
    Services.prefs.getStringPref("browser.download.dir"),
    home + "/Downloads",
    "browser.download.dir should be ${home}/Downloads."
  );
  is(
    Services.prefs.getBoolPref("browser.download.useDownloadDir"),
    true,
    "browser.download.useDownloadDir should be true."
  );
  is(
    Services.prefs.prefIsLocked("browser.download.useDownloadDir"),
    true,
    "browser.download.useDownloadDir should be locked."
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);
});

add_task(async function test_download() {
  await setupPolicyEngineWithJson({
    policies: {
      DownloadDirectory: "${home}/Documents",
    },
  });

  window.openPreferencesTab("paneGeneral");
  await BrowserTestUtils.browserLoaded(
    window.preferencesTabType.tab.browser,
    undefined,
    url => url.startsWith("about:preferences")
  );
  const { contentDocument } = window.preferencesTabType.tab.browser;
  await TestUtils.waitForCondition(() =>
    contentDocument.getElementById("alwaysAsk")
  );
  await new Promise(resolve =>
    window.preferencesTabType.tab.browser.contentWindow.setTimeout(resolve)
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "alwaysAsk"
    ).disabled,
    true,
    "alwaysAsk should be disabled."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "saveTo"
    ).selected,
    true,
    "saveTo should be selected."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "saveTo"
    ).disabled,
    true,
    "saveTo should be disabled."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "downloadFolder"
    ).disabled,
    true,
    "downloadFolder should be disabled."
  );
  is(
    window.preferencesTabType.tab.browser.contentDocument.getElementById(
      "chooseFolder"
    ).disabled,
    true,
    "chooseFolder should be disabled."
  );
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  is(
    Services.prefs.getStringPref("browser.download.dir"),
    home + "/Documents",
    "browser.download.dir should be ${home}/Documents."
  );
  is(
    Services.prefs.getBoolPref("browser.download.useDownloadDir"),
    true,
    "browser.download.useDownloadDir should be true."
  );
  is(
    Services.prefs.prefIsLocked("browser.download.useDownloadDir"),
    true,
    "browser.download.useDownloadDir should be locked."
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(window.preferencesTabType.tab);
});

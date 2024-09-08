/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

// Test if the correct What's New Page will be displayed
// when a major Thunderbird update is installed by a different profile.
// Also ensures no What's New Page will be displayed when an installed update
// has a new appVersion.
// Adapted from the Firefox test in toolkit/mozapps/update/test/browser/browser_showWhatsNewPageTest.js,
// replacing all platformVersion usage to appVersion and removing the update
// ping tests.

const UPDATE_PROVIDED_PAGE = "https://default.example.com/";
const UPDATE_PROVIDED_PAGE2 = "https://default2.example.com/";
const NO_POST_UPDATE_PAGE = "about:blank";

const PREF_MSTONE = "mailnews.start_page_override.mstone";

const DEFAULT_PLATFORM_VERSION = "2.0";
const DEFAULT_OLD_BUILD_ID = "20080811053724";
const DEFAULT_NEW_BUILD_ID = "20080811053725";

const gOrigAppInfo = Services.appinfo;

let uriResolver = Promise.withResolvers();

add_setup(() => {
  const origMstone = Services.prefs.getCharPref(PREF_MSTONE);
  /** @implements {nsIExternalProtocolService} */
  const mockExternalProtocolService = {
    QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
    externalProtocolHandlerExists() {},
    isExposedProtocol() {},
    loadURI(uri) {
      uriResolver.resolve(uri);
    },
  };

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(async () => {
    Services.appinfo = gOrigAppInfo;
    Services.prefs.setCharPref(PREF_MSTONE, origMstone);

    uriResolver?.resolve("done");
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
    await PlacesUtils.history.clear();
  });
});

/**
 * Loads an update into the update system and checks that the What's New Page
 * is shown correctly.
 *
 * @param origAppVersion
 *    Version information that should be written into prefs as the last version
 *    that this profile ran
 * @param updateAppVersion
 * @param updateWnp
 *    Information about an update to load into the update system via XML. If
 *    this were real instead of a test, this information would have come from
 *    Balrog.
 * @param setUpdateHistoryOnly
 *    Normally, this function loads the specified update information such that
 *    it appears that this update has just been installed. If this is set to
 *    `true`, the update will instead be loaded into the update history.
 * @param installedAppVersion
 *    Information about the version that Firefox is running at after the
 *    (simulated) update.
 *    These default to the corresponding `update*` values if they aren't
 *    specified.
 * @param expectedPostUpdatePage
 *    If provided, this will assert that the post update page shown after the
 *    update matches the one provided.
 */
async function WnpTest({
  origAppVersion,
  updateAppVersion,
  updateWnp,
  setUpdateHistoryOnly = false,
  installedAppVersion,
  expectedPostUpdatePage,
}) {
  uriResolver = Promise.withResolvers();

  if (origAppVersion) {
    logTestInfo(`Setting original appVersion to ${origAppVersion}`);
    Services.prefs.setCharPref(PREF_MSTONE, origAppVersion);
  } else {
    origAppVersion = Services.prefs.getCharPref(PREF_MSTONE);
    logTestInfo(`Loaded original appVersion as ${origAppVersion}`);
  }

  let activeUpdateXML = getLocalUpdatesXMLString("");
  let updateHistoryXML = getLocalUpdatesXMLString("");
  if (updateAppVersion) {
    updateAppVersion = updateAppVersion ?? DEFAULT_PLATFORM_VERSION;
    updateWnp = updateWnp ?? UPDATE_PROVIDED_PAGE;

    logTestInfo(
      `Faking update with ` +
        `appVersion=${updateAppVersion}, ` +
        `WNP=${updateWnp}`
    );

    const XML_UPDATE = `<?xml version="1.0"?>
    <updates xmlns="http://www.mozilla.org/2005/app-update">
      <update appVersion="${updateAppVersion}" buildID="9999999999999999" channel="nightly"
              displayVersion="Version ${updateAppVersion}" installDate="1238441400314"
              isCompleteUpdate="true" name="Update Test ${updateAppVersion}" type="minor"
              detailsURL="http://example.com/" previousAppVersion="1.0"
              serviceURL="https://example.com/" statusText="The Update was successfully installed"
              foregroundDownload="true"
              actions="showURL"
              openURL="${updateWnp}">
        <patch type="complete" URL="http://example.com/" size="775" selected="true" state="succeeded"/>
      </update>
    </updates>`;

    if (setUpdateHistoryOnly) {
      logTestInfo("Writing update into the update history");
      updateHistoryXML = XML_UPDATE;
    } else {
      logTestInfo("Writing update into the active update XML");
      activeUpdateXML = XML_UPDATE;
    }
  } else {
    logTestInfo("Not faking an update. Both update XMLs will be empty");
  }
  writeUpdatesToXMLFile(activeUpdateXML, true);
  writeUpdatesToXMLFile(updateHistoryXML, false);
  writeStatusFile(STATE_SUCCEEDED);

  // Wait until here to apply the default values for these, since we want the
  // default values to match the values in the update, even if those changed
  installedAppVersion = installedAppVersion ?? updateAppVersion;
  const appInfoProps = {};
  if (installedAppVersion) {
    appInfoProps.version = {
      configurable: true,
      enumerable: true,
      writable: false,
      value: installedAppVersion,
    };
  }
  Services.appinfo = Object.create(gOrigAppInfo, appInfoProps);
  logTestInfo(`Set appinfo to use version=${Services.appinfo.version}`);

  reloadUpdateManagerData(false);
  await window.specialTabs.showWhatsNewPage();

  if (expectedPostUpdatePage !== NO_POST_UPDATE_PAGE) {
    const postUpdatePage = await uriResolver.promise;
    is(
      postUpdatePage.spec,
      expectedPostUpdatePage,
      "Post Update Page should be correct"
    );
  } else {
    uriResolver.resolve("no wnp");
    const result = await uriResolver.promise;
    info(result.spec);
    is(result, "no wnp", "Should not have opened any page.");
  }
}

add_task(async function test_WhatsNewPage() {
  logTestInfo("Initial test");
  await WnpTest({
    origAppVersion: "1.0",
    updateAppVersion: "2.0",
    updateWnp: UPDATE_PROVIDED_PAGE,
    expectedPostUpdatePage: UPDATE_PROVIDED_PAGE,
  });

  // Write another update with the same appVersion.
  logTestInfo("Second update, same appVersion");
  await WnpTest({
    updateAppVersion: "2.0",
    expectedPostUpdatePage: NO_POST_UPDATE_PAGE,
  });

  // Make sure that if the platform version string in the installed browser
  // doesn't match the one in the XML for that update, we trust the one provided
  // by the browser.
  logTestInfo("Trust built in appVersion over Balrog, test 1");
  await WnpTest({
    origAppVersion: "2.0",
    updateAppVersion: "2.1",
    updateWnp: UPDATE_PROVIDED_PAGE2,
    installedAppVersion: "3.0",
    expectedPostUpdatePage: UPDATE_PROVIDED_PAGE2,
  });
  logTestInfo("Trust built in appVersion over Balrog, test 2");
  await WnpTest({
    origAppVersion: "2.0",
    updateAppVersion: "3.0",
    updateWnp: UPDATE_PROVIDED_PAGE2,
    installedAppVersion: "2.0",
    expectedPostUpdatePage: NO_POST_UPDATE_PAGE,
  });

  // Simulate loading a different profile that did not load during the previous updates.
  logTestInfo("Test that a different profile also gets the WNP");
  await WnpTest({
    origAppVersion: "2.0",
    updateAppVersion: "3.0",
    updateWnp: UPDATE_PROVIDED_PAGE,
    setUpdateHistoryOnly: true,
    expectedPostUpdatePage: UPDATE_PROVIDED_PAGE,
  });

  // Simulate an update where the appVersion is newer than the appVersion of the running Firefox instance
  // This ensures if the user downgrades, we don't show an inappropriate Whats New Page.
  logTestInfo("Test that a downgraded browser won't show a stale WNP");
  await WnpTest({
    origAppVersion: "1.0",
    updateAppVersion: "3.0",
    updateWnp: UPDATE_PROVIDED_PAGE,
    installedAppVersion: "2.0",
    expectedPostUpdatePage: NO_POST_UPDATE_PAGE,
  });
});

"use strict";

const ID = "permissions@test.mozilla.org";
const WARNING_ICON = "chrome://browser/skin/warning.svg";

add_task(async function test_unsigned() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["extensions.InstallTrigger.enabled", true],
      ["extensions.InstallTriggerImpl.enabled", true],
      ["extensions.webapi.testing", true],
      ["extensions.install.requireBuiltInCerts", false],
      // Relax the user input requirements while running this test.
      ["xpinstall.userActivation.required", false],
    ],
  });

  let testURI = makeURI("https://example.com/");
  PermissionTestUtils.add(testURI, "install", Services.perms.ALLOW_ACTION);
  registerCleanupFunction(() => PermissionTestUtils.remove(testURI, "install"));

  let tab = openContentTab("about:blank");
  BrowserTestUtils.loadURIString(
    tab.linkedBrowser,
    `${BASE}/file_install_extensions.html`
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  SpecialPowers.spawn(
    tab.linkedBrowser,
    [`${BASE}/browser_webext_unsigned.xpi`],
    async function (url) {
      content.wrappedJSObject.installTrigger(url);
    }
  );

  let panel = await promisePopupNotificationShown("addon-webext-permissions");

  // cancel the install
  let promise = promiseInstallEvent({ id: ID }, "onInstallCancelled");
  panel.secondaryButton.click();
  await promise;

  let addon = await AddonManager.getAddonByID(ID);
  is(addon, null, "Extension is not installed");

  let tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});

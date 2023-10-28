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

  const testURI = makeURI("https://example.com/");
  PermissionTestUtils.add(testURI, "install", Services.perms.ALLOW_ACTION);
  registerCleanupFunction(() => PermissionTestUtils.remove(testURI, "install"));

  const tab = openContentTab("about:blank");
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    `${BASE}/file_install_extensions.html`
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);

  SpecialPowers.spawn(
    tab.linkedBrowser,
    [`${BASE}/addons/browser_webext_unsigned.xpi`],
    async function (url) {
      content.wrappedJSObject.installTrigger(url);
    }
  );

  const panel = await promisePopupNotificationShown("addon-webext-permissions");

  // cancel the install
  const promise = promiseInstallEvent({ id: ID }, "onInstallCancelled");
  panel.secondaryButton.click();
  await promise;

  const addon = await AddonManager.getAddonByID(ID);
  is(addon, null, "Extension is not installed");

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tab);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);
const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);
const { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

do_get_profile();
AddonTestUtils.init(this);
AddonTestUtils.overrideCertDB();
AddonTestUtils.createAppInfo(
  "xpcshell@tests.mozilla.org",
  "XPCShell",
  "1",
  "1"
);

let server;

add_setup(async function () {
  await AddonTestUtils.promiseStartupManager();

  server = new HttpServer();
  server.start(-1);

  registerCleanupFunction(async () => {
    await new Promise(resolve => server.stop(resolve));
    await AddonTestUtils.promiseShutdownManager();
  });
});

add_task(async function test_addonInstaller_expected_details() {
  const cases = [
    { name: "matching-extension" },
    {
      name: "wrong-id",
      error: AddonManager.ERROR_INCORRECT_ID,
    },
    {
      name: "wrong-type",
      error: AddonManager.ERROR_UNEXPECTED_ADDON_TYPE,
    },
  ];

  for (const testCase of cases) {
    info(`Testing ${testCase.name}`);

    const id = `${testCase.name}@account-setup.test`;
    const expectedId =
      testCase.name == "wrong-id" ? "expected@account-setup.test" : id;

    const manifest = {
      name: testCase.name,
      version: "1.0",
      browser_specific_settings: { gecko: { id } },
    };

    // A theme has the correct ID but is not the expected extension type.
    if (testCase.name == "wrong-type") {
      manifest.theme = {
        colors: {
          frame: "#000000",
          tab_background_text: "#ffffff",
        },
      };
    }

    const xpi = AddonTestUtils.createTempWebExtensionFile({ manifest });
    const path = `/${testCase.name}.xpi`;
    const url = `http://localhost:${server.identity.primaryPort}${path}`;
    server.registerFile(path, xpi);

    const installer = new AccountCreationUtils.AddonInstaller(
      {
        name: testCase.name,
        id: expectedId,
        type: "extension",
        xpiURL: url,
      },
      new AbortController().signal
    );

    // Check the download error separately from the promise rejection.
    // In particular, the old promptHandler ID check must not satisfy this test.
    let downloadError;
    const listener = {
      onDownloadFailed(install) {
        if (install.sourceURI.spec == url) {
          downloadError = install.error;
        }
      },
    };

    AddonManager.addInstallListener(listener);
    try {
      if (testCase.error) {
        await Assert.rejects(
          installer.install(),
          () => true,
          `${testCase.name}: installation must reject`
        );
        Assert.equal(
          downloadError,
          testCase.error,
          `${testCase.name}: AddonManager must report the specific mismatch`
        );
        Assert.equal(
          await AddonManager.getAddonByID(id),
          null,
          `${testCase.name}: the downloaded add-on must not be installed`
        );
      } else {
        await installer.install();

        const addon = await AddonManager.getAddonByID(id);
        Assert.ok(addon, "The matching extension must install");
        Assert.equal(
          addon.type,
          "extension",
          "The installed add-on must have the expected type"
        );
        Assert.ok(addon.isActive, "The installed extension must be active");
      }
    } finally {
      AddonManager.removeInstallListener(listener);

      const addon = await AddonManager.getAddonByID(id);
      if (addon) {
        await addon.uninstall();
      }
    }
  }
});

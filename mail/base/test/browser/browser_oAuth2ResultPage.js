/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2PageGenerator } = ChromeUtils.importESModule(
  "moz-src:///comm/mailnews/base/src/OAuth2PageGenerator.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");

let serverUrl;
const tabmail = document.getElementById("tabmail");
const loadedPages = [];

add_setup(async () => {
  const server = new HttpServer();
  const successMarkup = await OAuth2PageGenerator.generateSuccessPage();
  server.registerPathHandler("/success", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write(successMarkup);
    loadedPages.push("success");
  });
  const failMarkup = await OAuth2PageGenerator.generateErrorPage();
  server.registerPathHandler("/fail", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write(failMarkup);
    loadedPages.push("fail");
  });
  server.start(-1);
  serverUrl = `http://localhost:${server.identity.primaryPort}/`;

  registerCleanupFunction(() => {
    server.stop();
    tabmail.closeOtherTabs(0);
  });
});

add_task(async function test_successPageClosesTab() {
  const tabClosePromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabClose"
  );
  const tab = tabmail.openTab("contentTab", { url: serverUrl + "success" });
  info("Tab open, waiting for it to close...");
  await tabClosePromise;
  Assert.deepEqual(loadedPages, ["success"], "Should have loaded the success page once");
  Assert.equal(tabmail.tabContainer.allTabs.length, 1, "Should only have one tab left");
  loadedPages.length = 0;
});

add_task(async function test_errorPageClosesTab() {
  const tabClosePromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabClose"
  );
  const tab = tabmail.openTab("contentTab", { url: serverUrl + "fail" });
  info("Tab open, waiting for it to close...");
  await tabClosePromise;
  Assert.deepEqual(loadedPages, ["fail"], "Should have loaded the error page once");
  Assert.equal(tabmail.tabContainer.allTabs.length, 1, "Should only have one tab left");
  loadedPages.length = 0;
});

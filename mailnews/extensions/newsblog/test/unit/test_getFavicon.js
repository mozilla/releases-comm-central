/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(function () {
  Services.prefs.setBoolPref("browser.chrome.site_icons", true);
  Services.prefs.setBoolPref("browser.chrome.favicons", true);
  Services.prefs.setBoolPref("places.history.enabled", true);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("browser.chrome.site_icons");
    Services.prefs.clearUserPref("browser.chrome.favicons");
    Services.prefs.clearUserPref("places.history.enabled");
  });
});

add_task(async function test_relative_favicon_on_nested_page() {
  httpServer.registerPathHandler("/nested/page.html", (request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.write(
      '<!doctype html><html><head><link rel="icon" href="icon.svg"></head></html>'
    );
  });
  httpServer.registerPathHandler("/nested/icon.svg", (request, response) => {
    response.setHeader("Content-Type", "image/svg+xml");
    response.write(
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>'
    );
  });

  const pageURL = `http://localhost:${SERVER_PORT}/nested/page.html`;
  const favicon = await FeedUtils.getFavicon(null, pageURL);

  Assert.ok(
    favicon.startsWith("data:image/svg+xml"),
    "relative favicon URL should resolve against the nested page URL"
  );
});

add_task(async function test_no_file_favicon() {
  const iconPath = PathUtils.join(PathUtils.profileDir, "icon.svg");
  await IOUtils.writeUTF8(
    iconPath,
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"></svg>'
  );
  const iconURL = PathUtils.toFileURI(iconPath);
  httpServer.registerPathHandler(
    "/file-icon/page.html",
    (request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.write(
        `<!doctype html><html><head><link rel="icon" href="${iconURL}"></head></html>`
      );
    }
  );

  Assert.equal(
    await FeedUtils.getFavicon(
      null,
      `http://localhost:${SERVER_PORT}/file-icon/page.html`
    ),
    "",
    "a file: favicon url from a web page should not be fetched"
  );
  const pagePath = PathUtils.join(PathUtils.profileDir, "page.html");
  await IOUtils.writeUTF8(
    pagePath,
    '<!doctype html><html><head><link rel="icon" href="icon.svg"></head></html>'
  );
  Assert.equal(
    await FeedUtils.getFavicon(null, PathUtils.toFileURI(pagePath)),
    "",
    "a favicon should not be fetched for a file: url"
  );
});

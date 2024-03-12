/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);
var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);
// ExtensionContent.jsm needs to know when it's running from xpcshell,
// to use the right timeout for content scripts executed at document_idle.
ExtensionTestUtils.mockAppInfo();

AddonTestUtils.maybeInit(this);
const server = AddonTestUtils.createHttpServer({ hosts: ["example.com"] });

server.registerPathHandler("/dummy", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write(
    "<!DOCTYPE html><html><head><meta charset='utf8'></head><body></body></html>"
  );
});

add_task(async function test_alias() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const pending = new Set(["contentscript", "webscript"]);

      browser.runtime.onMessage.addListener(message => {
        if (message == "contentscript") {
          pending.delete(message);
          browser.test.succeed("Content script has completed");
        } else if (message == "webscript") {
          pending.delete(message);
          browser.test.succeed("Web accessible script has completed");
        }

        if (pending.size == 0) {
          browser.test.notifyPass("ext_alias");
        }
      });

      browser.test.assertEq(
        "object",
        typeof browser,
        "Background script has browser object"
      );
      browser.test.assertEq(
        "object",
        typeof messenger,
        "Background script has messenger object"
      );
      browser.test.assertEq(
        "alias@xpcshell",
        messenger.runtime.getManifest().applications.gecko.id, // eslint-disable-line no-undef
        "Background script can access the manifest"
      );
    },
    manifest: {
      content_scripts: [
        {
          matches: ["http://example.com/dummy"],
          js: ["content.js"],
        },
      ],

      applications: { gecko: { id: "alias@xpcshell" } },
      web_accessible_resources: ["web.html", "web.js"],
    },
    files: {
      "content.js": `
        browser.test.assertEq("object", typeof browser, "Content script has browser object");
        browser.test.assertEq("object", typeof messenger, "Content script has messenger object");
        browser.test.assertEq(
          "alias@xpcshell",
          messenger.runtime.getManifest().applications.gecko.id,
          "Content script can access manifest"
        );

        // Unprivileged content in a frame
        let frame = document.createElement("iframe");
        frame.src = browser.runtime.getURL("web.html");
        document.body.appendChild(frame);

        browser.runtime.sendMessage("contentscript");
      `,
      "web.html": `<!DOCTYPE html>
        <html>
          <head>
            <meta charset='utf8'>
            <script defer="defer" src="web.js"></script>
          </head>
          <body>
          </body>
        </html>`,
      "web.js": `
        browser.test.assertEq("object", typeof browser, "Web accessible script has browser object");
        browser.test.assertEq("object", typeof messenger, "Web accessible script has messenger object");
        browser.test.assertEq(
          "alias@xpcshell",
          messenger.runtime.getManifest().applications.gecko.id,
          "Web accessible script can access manifest"
        );

        browser.runtime.sendMessage("webscript");
      `,
    },
  });

  await extension.startup();

  const contentPage = await ExtensionTestUtils.loadContentPage(
    "http://example.com/dummy"
  );
  await extension.awaitFinish("ext_alias");

  await contentPage.close();
  await extension.unload();
});

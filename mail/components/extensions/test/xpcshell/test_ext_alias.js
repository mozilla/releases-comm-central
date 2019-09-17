/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

ExtensionTestUtils.init(this);

// ExtensionContent.jsm needs to know when it's running from xpcshell,
// to use the right timeout for content scripts executed at document_idle.
ExtensionTestUtils.mockAppInfo();

const server = createHttpServer({ hosts: ["example.com"] });

server.registerPathHandler("/dummy", (request, response) => {
  response.setStatusLine(request.httpVersion, 200, "OK");
  response.setHeader("Content-Type", "text/html", false);
  response.write(
    "<!DOCTYPE html><html><head><meta charset='utf8'></head><body></body></html>"
  );
});

add_task(async function test_alias() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let pending = new Set(["contentscript", "proxyscript", "webscript"]);

      browser.runtime.onMessage.addListener(message => {
        if (message == "error-no-messenger") {
          browser.test.fail("Proxy script has messenger object");
        } else if (message == "error-missing-onmessage") {
          browser.test.fail("Proxy script can listen to messages");
        } else if (message == "error-missing-sendmessage") {
          browser.test.fail("Proxy script can send messages");
        } else if (message == "proxyscript") {
          pending.delete(message);
          browser.test.succeed(
            "Proxy script can access everything it needs to"
          );
        } else if (message == "contentscript") {
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

      await browser.proxy.register("proxy.js");
    },
    manifest: {
      content_scripts: [
        {
          matches: ["http://example.com/dummy"],
          js: ["content.js"],
        },
      ],

      applications: { gecko: { id: "alias@xpcshell" } },
      permissions: ["proxy"],
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
      "proxy.js": `
        if (typeof messenger == "undefined") {
          browser.runtime.sendMessage("error-no-messenger");
        } else if (typeof messenger.runtime.onMessage != "object") {
          browser.runtime.sendMessage("error-missing-onmessage");
        } else if (typeof messenger.runtime.sendMessage != "function") {
          browser.runtime.sendMessage("error-missing-sendmessage");
        } else {
          browser.runtime.sendMessage("proxyscript");
        }
      `,
      "web.html": `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset='utf8'>
            <script src="web.js"></script>
          </head>
          <body>
          </body>
        </html>
      `,
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

  // Deprecated proxy functions and events. This test will fail once
  // bug 1545811 is fixed, and the proxy parts should be removed then.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();

  const contentPage = await ExtensionTestUtils.loadContentPage(
    "http://example.com/dummy"
  );
  await extension.awaitFinish("ext_alias");
  ExtensionTestUtils.failOnSchemaWarnings(true);

  await contentPage.close();
  await extension.unload();
});

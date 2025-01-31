/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function test_webrtc_deny() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      var peerConn = new RTCPeerConnection({});
      peerConn.createDataChannel("files");

      await browser.test.assertRejects(
        peerConn.createOffer(),
        /The request is not allowed by the user agent or the platform in the current context/,
        "Should reject for not being implemented"
      );

      browser.test.notifyPass();
    },
    manifest: {
      manifest_version: 2,
      browser_specific_settings: {
        gecko: {
          id: "webrtc@mochi.test",
        },
      },
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});

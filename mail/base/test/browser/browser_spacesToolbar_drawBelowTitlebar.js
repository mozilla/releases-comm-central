/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subtest shared with tabs-in-titlebar tests.
Services.scriptloader.loadSubScript(
  new URL("head_spacesToolbar.js", gTestPath).href,
  this
);

registerCleanupFunction(async () => {
  // Reset the menubar visibility.
  const menubar = document.getElementById("toolbar-menubar");
  menubar.removeAttribute("autohide");
  menubar.removeAttribute("inactive");
  await new Promise(resolve => requestAnimationFrame(resolve));
});

add_task(async function testSpacesToolbarAlignment() {
  // Hide titlebar in toolbar, show menu.
  await sub_test_toolbar_alignment(false, false);
  // Hide titlebar in toolbar, hide menu.
  await sub_test_toolbar_alignment(false, true);
});

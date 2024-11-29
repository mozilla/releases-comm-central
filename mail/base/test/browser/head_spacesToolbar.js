/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

async function sub_test_toolbar_alignment(drawInTitlebar, hideMenu) {
  const menubar = document.getElementById("toolbar-menubar");
  const customtitlebar =
    document.documentElement.getAttribute("customtitlebar") == "true";
  Assert.equal(customtitlebar, drawInTitlebar);

  if (hideMenu) {
    menubar.setAttribute("autohide", true);
    menubar.setAttribute("inactive", true);
  } else {
    menubar.removeAttribute("autohide");
    menubar.removeAttribute("inactive");
  }
  await new Promise(resolve => requestAnimationFrame(resolve));

  const size = document
    .getElementById("spacesToolbar")
    .getBoundingClientRect().width;

  Assert.equal(
    document.getElementById("titlebar").getBoundingClientRect().left,
    size,
    "The correct style was applied to the #titlebar"
  );
  Assert.equal(
    document.getElementById("toolbar-menubar").getBoundingClientRect().left,
    size,
    "The correct style was applied to the #toolbar-menubar"
  );
}

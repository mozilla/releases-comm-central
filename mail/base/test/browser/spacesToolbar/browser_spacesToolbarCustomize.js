/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the spaces toolbar customization features.
 */

const BACKGROUND = "#f00000";
const ICON = "#00ff0b";
const ACCENT = "#0300ff";
const ACCENT_ICON = "#fff600";

const INPUTS = {
  spacesBackgroundColor: BACKGROUND,
  spacesIconsColor: ICON,
  spacesAccentTextColor: ACCENT,
  spacesAccentBgColor: ACCENT_ICON,
};

registerCleanupFunction(async () => {
  // Reset all colors.
  window.gSpacesToolbar.resetColorCustomization();
  window.gSpacesToolbar.closeCustomize();
});

async function sub_test_open_customize_panel() {
  // Open the panel.
  const menu = document.getElementById("spacesToolbarContextMenu");
  const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("spacesToolbar"),
    { type: "contextmenu" },
    window
  );
  await shownPromise;

  const panel = document.getElementById("spacesToolbarCustomizationPanel");
  const panelShownPromise = BrowserTestUtils.waitForEvent(panel, "popupshown");
  menu.activateItem(document.getElementById("spacesToolbarContextCustomize"));
  await panelShownPromise;
}

function sub_test_apply_colors_to_inputs() {
  for (const key in INPUTS) {
    const input = document.getElementById(`${key}`);
    input.value = INPUTS[key];
    // We need to force dispatch the onchange event otherwise the listener won't
    // fire since we're programmatically changing the color value.
    input.dispatchEvent(new Event("change"));
  }
}

/**
 * Check the current state of the custom color properties applied to the
 * document style.
 *
 * @param {boolean} empty - If the style properties should be empty or filled.
 */
function sub_test_check_for_style_properties(empty) {
  const style = document.documentElement.style;
  if (empty) {
    Assert.equal(style.getPropertyValue("--spaces-bg-color"), "");
    Assert.equal(style.getPropertyValue("--spaces-button-text-color"), "");
    Assert.equal(
      style.getPropertyValue("--spaces-button-active-text-color"),
      ""
    );
    Assert.equal(style.getPropertyValue("--spaces-button-active-bg-color"), "");
    return;
  }

  Assert.equal(style.getPropertyValue("--spaces-bg-color"), BACKGROUND);
  Assert.equal(style.getPropertyValue("--spaces-button-text-color"), ICON);
  Assert.equal(
    style.getPropertyValue("--spaces-button-active-text-color"),
    ACCENT
  );
  Assert.equal(
    style.getPropertyValue("--spaces-button-active-bg-color"),
    ACCENT_ICON
  );
}

add_task(async function testSpacesToolbarCustomizationPanel() {
  // Make sure we're starting from a clean state.
  window.gSpacesToolbar.resetColorCustomization();

  await sub_test_open_customize_panel();

  // Current colors should be clear.
  sub_test_check_for_style_properties(true);

  // Test color preview.
  sub_test_apply_colors_to_inputs();
  sub_test_check_for_style_properties();

  // Reset should clear all applied colors.
  window.gSpacesToolbar.resetColorCustomization();
  window.gSpacesToolbar.closeCustomize();
  sub_test_check_for_style_properties(true);

  await sub_test_open_customize_panel();
  // Set colors again.
  sub_test_apply_colors_to_inputs();

  // "Done" should close the panel and apply all colors.
  window.gSpacesToolbar.closeCustomize();
  sub_test_check_for_style_properties();

  // Open the panel and click reset.
  await sub_test_open_customize_panel();
  window.gSpacesToolbar.resetColorCustomization();
  sub_test_check_for_style_properties(true);

  // "Done" should restore the custom colors.
  window.gSpacesToolbar.closeCustomize();
  sub_test_check_for_style_properties(true);
});

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  const account = createAccount();
  addIdentity(account);
  const rootFolder = account.incomingServer.rootFolder;

  const files = {
    "background.js": async () => {
      const WHITE = [255, 255, 255, 255];
      const GREY = [127, 127, 127, 255];
      const GREEN = [0, 128, 0, 255];
      const BLUE = [0, 0, 255, 255];
      const RED = [217, 0, 0, 255];

      function compare(expected, actual, description) {
        if (Array.isArray(expected)) {
          window.assertDeepEqual(expected, actual, description);
        } else {
          browser.test.assertEq(expected, actual, description);
        }
      }

      async function checkProperty(property, expectedDefault, ...expected) {
        browser.test.log(
          `${property}: ${expectedDefault}, ${expected.join(", ")}`
        );
        compare(
          expectedDefault,
          await browser.browserAction[property]({}),
          `Default value for ${property} should be correct`
        );
        for (let i = 0; i < 3; i++) {
          compare(
            expected[i],
            await browser.browserAction[property]({ tabId: tabIDs[i] }),
            `Specific value for ${property} of tab #${i} should be correct`
          );
        }
      }

      async function checkRealState(property, ...expected) {
        await window.sendMessage(whichTest, property, expected);
      }

      const tabs = await browser.mailTabs.query({});
      browser.test.assertEq(3, tabs.length);
      const tabIDs = tabs.map(t => t.id);

      let whichTest = "checkProperty";

      // Test enable property.
      await checkProperty("isEnabled", true, true, true, true);
      await checkRealState("enabled", true, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, false, false, false);
      await checkRealState("enabled", false, false, false);
      await browser.browserAction.enable(tabIDs[0]);
      await checkProperty("isEnabled", false, true, false, false);
      await checkRealState("enabled", true, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, true, true, true);
      await checkRealState("enabled", true, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, true, false, false);
      await checkRealState("enabled", true, false, false);
      await browser.browserAction.disable(tabIDs[0]);
      await checkProperty("isEnabled", false, false, false, false);
      await checkRealState("enabled", false, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, false, true, true);
      await checkRealState("enabled", false, true, true);

      // Test badge text.
      await checkProperty("getBadgeText", "", "", "", "");
      await checkRealState("badgeText", null, null, null);
      await browser.browserAction.setBadgeText({ text: "default" });
      await checkProperty(
        "getBadgeText",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("badgeText", "default", "default", "default");
      await browser.browserAction.setBadgeText({
        text: "tab0",
        tabId: tabIDs[0],
      });
      await checkProperty(
        "getBadgeText",
        "default",
        "tab0",
        "default",
        "default"
      );
      await checkRealState("badgeText", "tab0", "default", "default");
      await browser.browserAction.setBadgeText({ text: null });
      await checkProperty("getBadgeText", "", "tab0", "", "");
      await checkRealState("badgeText", "tab0", null, null);
      await browser.browserAction.setBadgeText({
        text: "tab1",
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeText", "", "tab0", "tab1", "");
      await checkRealState("badgeText", "tab0", "tab1", null);
      await browser.browserAction.setBadgeText({ text: "new" });
      await checkProperty("getBadgeText", "new", "tab0", "tab1", "new");
      await checkRealState("badgeText", "tab0", "tab1", "new");
      await browser.browserAction.setBadgeText({
        text: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeText", "new", "new", "tab1", "new");
      await checkRealState("badgeText", "new", "tab1", "new");
      await browser.browserAction.setBadgeText({
        text: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeText", "new", "new", "new", "new");
      await checkRealState("badgeText", "new", "new", "new");

      // Test badge text color.
      await checkProperty("getBadgeTextColor", WHITE, WHITE, WHITE, WHITE);
      await checkRealState("badgeTextColor", null, null, null);
      await browser.browserAction.setBadgeTextColor({ color: GREY });
      await checkProperty("getBadgeTextColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeTextColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: GREEN,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeTextColor", GREY, GREEN, GREY, GREY);
      await checkRealState("badgeTextColor", GREEN, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({ color: null });
      await checkProperty("getBadgeTextColor", WHITE, GREEN, WHITE, WHITE);
      await checkRealState("badgeTextColor", GREEN, null, null);
      await browser.browserAction.setBadgeTextColor({
        color: BLUE,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeTextColor", WHITE, GREEN, BLUE, WHITE);
      await checkRealState("badgeTextColor", GREEN, BLUE, null);
      await browser.browserAction.setBadgeTextColor({ color: GREY });
      await checkProperty("getBadgeTextColor", GREY, GREEN, BLUE, GREY);
      await checkRealState("badgeTextColor", GREEN, BLUE, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeTextColor", GREY, GREY, BLUE, GREY);
      await checkRealState("badgeTextColor", GREY, BLUE, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeTextColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeTextColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({ color: null });
      await checkProperty("getBadgeTextColor", WHITE, WHITE, WHITE, WHITE);
      await checkRealState("badgeTextColor", null, null, null);

      // Test badge background color.
      await checkProperty("getBadgeBackgroundColor", RED, RED, RED, RED);
      await checkRealState("badgeBackgroundColor", null, null, null);
      await browser.browserAction.setBadgeBackgroundColor({ color: GREY });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: GREEN,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREEN, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREEN, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({ color: null });
      await checkProperty("getBadgeBackgroundColor", RED, GREEN, RED, RED);
      await checkRealState("badgeBackgroundColor", GREEN, null, null);
      await browser.browserAction.setBadgeBackgroundColor({
        color: BLUE,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeBackgroundColor", RED, GREEN, BLUE, RED);
      await checkRealState("badgeBackgroundColor", GREEN, BLUE, null);
      await browser.browserAction.setBadgeBackgroundColor({ color: GREY });
      await checkProperty("getBadgeBackgroundColor", GREY, GREEN, BLUE, GREY);
      await checkRealState("badgeBackgroundColor", GREEN, BLUE, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, BLUE, GREY);
      await checkRealState("badgeBackgroundColor", GREY, BLUE, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({ color: null });
      await checkProperty("getBadgeBackgroundColor", RED, RED, RED, RED);
      await checkRealState("badgeBackgroundColor", null, null, null);

      // Test title property (since a label has not been set, this sets the
      // tooltip and the actual label of the button).
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");
      await browser.browserAction.setTitle({ tabId: tabIDs[2], title: "tab2" });
      await checkProperty("getTitle", "default", "default", "default", "tab2");
      await checkRealState("tooltip", "default", "default", "tab2");
      await checkRealState("label", "default", "default", "tab2");
      await browser.browserAction.setTitle({ title: "new" });
      await checkProperty("getTitle", "new", "new", "new", "tab2");
      await checkRealState("tooltip", "new", "new", "tab2");
      await checkRealState("label", "new", "new", "tab2");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: "tab1" });
      await checkProperty("getTitle", "new", "new", "tab1", "tab2");
      await checkRealState("tooltip", "new", "tab1", "tab2");
      await checkRealState("label", "new", "tab1", "tab2");
      await browser.browserAction.setTitle({ tabId: tabIDs[2], title: null });
      await checkProperty("getTitle", "new", "new", "tab1", "new");
      await checkRealState("tooltip", "new", "tab1", "new");
      await checkRealState("label", "new", "tab1", "new");
      await browser.browserAction.setTitle({ title: null });
      await checkProperty("getTitle", "default", "default", "tab1", "default");
      await checkRealState("tooltip", "default", "tab1", "default");
      await checkRealState("label", "default", "tab1", "default");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: null });
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");

      // Test label property (tooltip should not change).
      await checkProperty("getLabel", null, null, null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");
      await browser.browserAction.setLabel({ tabId: tabIDs[2], label: "" });
      await checkProperty("getLabel", null, null, null, "");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "");
      await browser.browserAction.setLabel({ tabId: tabIDs[2], label: "tab2" });
      await checkProperty("getLabel", null, null, null, "tab2");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "tab2");
      await browser.browserAction.setLabel({ label: "new" });
      await checkProperty("getLabel", "new", "new", "new", "tab2");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "new", "new", "tab2");
      await browser.browserAction.setLabel({ tabId: tabIDs[1], label: "tab1" });
      await checkProperty("getLabel", "new", "new", "tab1", "tab2");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "new", "tab1", "tab2");
      await browser.browserAction.setLabel({ tabId: tabIDs[2], label: null });
      await checkProperty("getLabel", "new", "new", "tab1", "new");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "new", "tab1", "new");
      await browser.browserAction.setLabel({ label: null });
      await checkProperty("getLabel", null, null, "tab1", null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "tab1", "default");
      await browser.browserAction.setLabel({ tabId: tabIDs[1], label: null });
      await checkProperty("getLabel", null, null, null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");

      // Check that properties are updated without switching tabs. We might be
      // relying on the tab switch to update the properties.

      // Tab 0's enabled state doesn't reflect the default any more, so we
      // can't just run the code above again.

      browser.test.log("checkPropertyCurrent");
      whichTest = "checkPropertyCurrent";

      // Test enable property.
      await checkProperty("isEnabled", true, false, true, true);
      await checkRealState("enabled", false, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, false, false, false);
      await checkRealState("enabled", false, false, false);
      await browser.browserAction.enable(tabIDs[0]);
      await checkProperty("isEnabled", false, true, false, false);
      await checkRealState("enabled", true, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, true, true, true);
      await checkRealState("enabled", true, true, true);
      await browser.browserAction.disable();
      await checkProperty("isEnabled", false, true, false, false);
      await checkRealState("enabled", true, false, false);
      await browser.browserAction.disable(tabIDs[0]);
      await checkProperty("isEnabled", false, false, false, false);
      await checkRealState("enabled", false, false, false);
      await browser.browserAction.enable();
      await checkProperty("isEnabled", true, false, true, true);
      await checkRealState("enabled", false, true, true);

      // Test badge text.
      await checkProperty("getBadgeText", "new", "new", "new", "new");
      await checkRealState("badgeText", "new", "new", "new");
      await browser.browserAction.setBadgeText({ text: "default" });
      await checkProperty(
        "getBadgeText",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("badgeText", "default", "default", "default");
      await browser.browserAction.setBadgeText({
        text: "tab0",
        tabId: tabIDs[0],
      });
      await checkProperty(
        "getBadgeText",
        "default",
        "tab0",
        "default",
        "default"
      );
      await checkRealState("badgeText", "tab0", "default", "default");
      await browser.browserAction.setBadgeText({ text: null });
      await checkProperty("getBadgeText", "", "tab0", "", "");
      await checkRealState("badgeText", "tab0", null, null);
      await browser.browserAction.setBadgeText({
        text: "tab1",
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeText", "", "tab0", "tab1", "");
      await checkRealState("badgeText", "tab0", "tab1", null);
      await browser.browserAction.setBadgeText({ text: "new" });
      await checkProperty("getBadgeText", "new", "tab0", "tab1", "new");
      await checkRealState("badgeText", "tab0", "tab1", "new");
      await browser.browserAction.setBadgeText({
        text: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeText", "new", "new", "tab1", "new");
      await checkRealState("badgeText", "new", "tab1", "new");
      await browser.browserAction.setBadgeText({
        text: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeText", "new", "new", "new", "new");
      await checkRealState("badgeText", "new", "new", "new");

      // Test badge text color.
      await checkProperty("getBadgeTextColor", WHITE, WHITE, WHITE, WHITE);
      await checkRealState("badgeTextColor", null, null, null);
      await browser.browserAction.setBadgeTextColor({ color: GREY });
      await checkProperty("getBadgeTextColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeTextColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: GREEN,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeTextColor", GREY, GREEN, GREY, GREY);
      await checkRealState("badgeTextColor", GREEN, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({ color: null });
      await checkProperty("getBadgeTextColor", WHITE, GREEN, WHITE, WHITE);
      await checkRealState("badgeTextColor", GREEN, null, null);
      await browser.browserAction.setBadgeTextColor({
        color: BLUE,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeTextColor", WHITE, GREEN, BLUE, WHITE);
      await checkRealState("badgeTextColor", GREEN, BLUE, null);
      await browser.browserAction.setBadgeTextColor({ color: GREY });
      await checkProperty("getBadgeTextColor", GREY, GREEN, BLUE, GREY);
      await checkRealState("badgeTextColor", GREEN, BLUE, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeTextColor", GREY, GREY, BLUE, GREY);
      await checkRealState("badgeTextColor", GREY, BLUE, GREY);
      await browser.browserAction.setBadgeTextColor({
        color: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeTextColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeTextColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeTextColor({ color: null });
      await checkProperty("getBadgeTextColor", WHITE, WHITE, WHITE, WHITE);
      await checkRealState("badgeTextColor", null, null, null);

      // Test badge background color.
      await checkProperty("getBadgeBackgroundColor", RED, RED, RED, RED);
      await checkRealState("badgeBackgroundColor", null, null, null);
      await browser.browserAction.setBadgeBackgroundColor({ color: GREY });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: GREEN,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREEN, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREEN, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({ color: null });
      await checkProperty("getBadgeBackgroundColor", RED, GREEN, RED, RED);
      await checkRealState("badgeBackgroundColor", GREEN, null, null);
      await browser.browserAction.setBadgeBackgroundColor({
        color: BLUE,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeBackgroundColor", RED, GREEN, BLUE, RED);
      await checkRealState("badgeBackgroundColor", GREEN, BLUE, null);
      await browser.browserAction.setBadgeBackgroundColor({ color: GREY });
      await checkProperty("getBadgeBackgroundColor", GREY, GREEN, BLUE, GREY);
      await checkRealState("badgeBackgroundColor", GREEN, BLUE, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: null,
        tabId: tabIDs[0],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, BLUE, GREY);
      await checkRealState("badgeBackgroundColor", GREY, BLUE, GREY);
      await browser.browserAction.setBadgeBackgroundColor({
        color: null,
        tabId: tabIDs[1],
      });
      await checkProperty("getBadgeBackgroundColor", GREY, GREY, GREY, GREY);
      await checkRealState("badgeBackgroundColor", GREY, GREY, GREY);
      await browser.browserAction.setBadgeBackgroundColor({ color: null });
      await checkProperty("getBadgeBackgroundColor", RED, RED, RED, RED);
      await checkRealState("badgeBackgroundColor", null, null, null);

      // Test title property (since a label has not been set, this sets the
      // tooltip and the actual label of the button).
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");
      await browser.browserAction.setTitle({ tabId: tabIDs[0], title: "tab0" });
      await checkProperty("getTitle", "default", "tab0", "default", "default");
      await checkRealState("tooltip", "tab0", "default", "default");
      await checkRealState("label", "tab0", "default", "default");
      await browser.browserAction.setTitle({ title: "new" });
      await checkProperty("getTitle", "new", "tab0", "new", "new");
      await checkRealState("tooltip", "tab0", "new", "new");
      await checkRealState("label", "tab0", "new", "new");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: "tab1" });
      await checkProperty("getTitle", "new", "tab0", "tab1", "new");
      await checkRealState("tooltip", "tab0", "tab1", "new");
      await checkRealState("label", "tab0", "tab1", "new");
      await browser.browserAction.setTitle({ tabId: tabIDs[0], title: null });
      await checkProperty("getTitle", "new", "new", "tab1", "new");
      await checkRealState("tooltip", "new", "tab1", "new");
      await checkRealState("label", "new", "tab1", "new");
      await browser.browserAction.setTitle({ title: null });
      await checkProperty("getTitle", "default", "default", "tab1", "default");
      await checkRealState("tooltip", "default", "tab1", "default");
      await checkRealState("label", "default", "tab1", "default");
      await browser.browserAction.setTitle({ tabId: tabIDs[1], title: null });
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");

      // Test label property (tooltip should not change).
      await checkProperty("getLabel", null, null, null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");
      await browser.browserAction.setLabel({ tabId: tabIDs[0], label: "" });
      await checkProperty("getLabel", null, "", null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "", "default", "default");
      await browser.browserAction.setLabel({ tabId: tabIDs[0], label: "tab0" });
      await checkProperty("getLabel", null, "tab0", null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "tab0", "default", "default");
      await browser.browserAction.setLabel({ label: "new" });
      await checkProperty("getLabel", "new", "tab0", "new", "new");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "tab0", "new", "new");
      await browser.browserAction.setLabel({ tabId: tabIDs[1], label: "tab1" });
      await checkProperty("getLabel", "new", "tab0", "tab1", "new");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "tab0", "tab1", "new");
      await browser.browserAction.setLabel({ tabId: tabIDs[0], label: null });
      await checkProperty("getLabel", "new", "new", "tab1", "new");
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "new", "tab1", "new");
      await browser.browserAction.setLabel({ label: null });
      await checkProperty("getLabel", null, null, "tab1", null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "tab1", "default");
      await browser.browserAction.setLabel({ tabId: tabIDs[1], label: null });
      await checkProperty("getLabel", null, null, null, null);
      await checkRealState("tooltip", "default", "default", "default");
      await checkRealState("label", "default", "default", "default");

      await browser.tabs.remove(tabIDs[1]);
      await browser.tabs.remove(tabIDs[2]);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
    manifest: {
      applications: {
        gecko: {
          id: "browser_action_properties@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      browser_action: {
        default_title: "default",
      },
    },
  });

  const tabmail = document.getElementById("tabmail");
  tabmail.openTab("mail3PaneTab", {
    folderURI: rootFolder.URI,
    background: false,
  });
  tabmail.openTab("mail3PaneTab", {
    folderURI: rootFolder.URI,
    background: false,
  });

  const mailTabs = tabmail.tabInfo;
  is(mailTabs.length, 3, "Expect 3 tabs");
  tabmail.switchToTab(mailTabs[0]);

  await extension.startup();

  const button = document.querySelector(
    `.unified-toolbar [extension="browser_action_properties@mochi.test"]`
  );

  extension.onMessage("checkProperty", async (property, expected) => {
    for (let i = 0; i < 3; i++) {
      tabmail.switchToTab(mailTabs[i]);
      await new Promise(resolve => requestAnimationFrame(resolve));
      switch (property) {
        case "enabled":
          is(button.disabled, !expected[i], `button ${i} enabled state`);
          break;
        case "tooltip":
          is(
            button.getAttribute("title"),
            expected[i],
            `button ${i} tooltip title`
          );
          break;
        case "label":
          if (expected[i] == "") {
            ok(
              button.classList.contains("prefer-icon-only"),
              `button ${i} has hidden label`
            );
          } else {
            is(button.getAttribute("label"), expected[i], `button ${i} label`);
          }
          break;
        case "badgeText":
          is(button.badge, expected[i], `button ${i} badge text`);
          break;
        case "badgeTextColor":
          if (!expected[i]) {
            is(
              button.style.getPropertyValue(
                "--toolbar-button-badge-text-color"
              ),
              "",
              `button ${i} badge text color`
            );
          } else {
            is(
              button.style.getPropertyValue(
                "--toolbar-button-badge-text-color"
              ),
              `rgba(${expected[i][0]}, ${expected[i][1]}, ${expected[i][2]}, ${
                expected[i][3] / 255
              })`,
              `button ${i} badge text color`
            );
          }
          break;
        case "badgeBackgroundColor":
          if (!expected[i]) {
            is(
              button.style.getPropertyValue("--toolbar-button-badge-bg-color"),
              "",
              `button ${i} badge background color`
            );
          } else {
            is(
              button.style.getPropertyValue("--toolbar-button-badge-bg-color"),
              `rgba(${expected[i][0]}, ${expected[i][1]}, ${expected[i][2]}, ${
                expected[i][3] / 255
              })`,
              `button ${i} badge background color`
            );
          }
          break;
      }
    }

    tabmail.switchToTab(mailTabs[0]);
    extension.sendMessage();
  });

  extension.onMessage("checkPropertyCurrent", async (property, expected) => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    switch (property) {
      case "enabled":
        is(button.disabled, !expected[0], `button 0 enabled state`);
        break;
      case "tooltip":
        is(button.getAttribute("title"), expected[0], `button 0 tooltip title`);
        break;
      case "label":
        if (expected[0] == "") {
          ok(
            button.classList.contains("prefer-icon-only"),
            `button 0 has hidden label`
          );
        } else {
          is(button.getAttribute("label"), expected[0], `button 0 label`);
        }
        break;
      case "badgeText":
        is(button.badge, expected[0], `button 0 badge text`);
        break;
      case "badgeTextColor":
        if (!expected[0]) {
          is(
            button.style.getPropertyValue("--toolbar-button-badge-text-color"),
            "",
            `button 0 badge text color`
          );
        } else {
          is(
            button.style.getPropertyValue("--toolbar-button-badge-text-color"),
            `rgba(${expected[0][0]}, ${expected[0][1]}, ${expected[0][2]}, ${
              expected[0][3] / 255
            })`,
            `button 0 badge text color`
          );
        }
        break;
      case "badgeBackgroundColor":
        if (!expected[0]) {
          is(
            button.style.getPropertyValue("--toolbar-button-badge-bg-color"),
            "",
            `button 0 badge background color`
          );
        } else {
          is(
            button.style.getPropertyValue("--toolbar-button-badge-bg-color"),
            `rgba(${expected[0][0]}, ${expected[0][1]}, ${expected[0][2]}, ${
              expected[0][3] / 255
            })`,
            `button 0 badge background color`
          );
        }
        break;
    }

    extension.sendMessage();
  });

  await extension.awaitFinish("finished");
  await extension.unload();

  tabmail.closeTab(mailTabs[2]);
  tabmail.closeTab(mailTabs[1]);
  is(tabmail.tabInfo.length, 1);
});

"use strict";

// This test checks whether browser.theme.onUpdated works
// when a static theme is applied

const ACCENT_COLOR = "#a14040";
const TEXT_COLOR = "#fac96e";
const BACKGROUND =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0" +
  "DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";

add_setup(() => {
  // Reduce animations to prevent intermittent fails due to late theme changes.
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

add_task(async function test_on_updated() {
  const theme = ExtensionTestUtils.loadExtension({
    manifest: {
      theme: {
        images: {
          theme_frame: "image1.png",
        },
        colors: {
          frame: ACCENT_COLOR,
          tab_background_text: TEXT_COLOR,
        },
      },
    },
    files: {
      "image1.png": BACKGROUND,
    },
  });

  const extension = ExtensionTestUtils.loadExtension({
    background() {
      browser.theme.onUpdated.addListener(updateInfo => {
        browser.test.sendMessage("theme-updated", updateInfo);
      });
    },
  });

  await extension.startup();

  info("Testing update event on static theme startup");
  let updatedPromise = extension.awaitMessage("theme-updated");
  await theme.startup();
  const { theme: receivedTheme, windowId } = await updatedPromise;
  Assert.ok(!windowId, "No window id in static theme update event");
  Assert.ok(
    receivedTheme.images.theme_frame.includes("image1.png"),
    "Theme theme_frame image should be applied"
  );
  Assert.equal(
    receivedTheme.colors.frame,
    ACCENT_COLOR,
    "Theme frame color should be applied"
  );
  Assert.equal(
    receivedTheme.colors.tab_background_text,
    TEXT_COLOR,
    "Theme tab_background_text color should be applied"
  );

  info("Testing update event on static theme unload");
  updatedPromise = extension.awaitMessage("theme-updated");
  await theme.unload();
  const updateInfo = await updatedPromise;
  Assert.ok(!windowId, "No window id in static theme update event on unload");
  Assert.equal(
    Object.keys(updateInfo.theme),
    0,
    "unloading theme sends empty theme in update event"
  );

  await extension.unload();
});

add_task(async function test_on_updated_eventpage() {
  await SpecialPowers.pushPrefEnv({
    set: [["extensions.eventPages.enabled", true]],
  });
  const theme = ExtensionTestUtils.loadExtension({
    manifest: {
      theme: {
        images: {
          theme_frame: "image1.png",
        },
        colors: {
          frame: ACCENT_COLOR,
          tab_background_text: TEXT_COLOR,
        },
      },
    },
    files: {
      "image1.png": BACKGROUND,
    },
  });

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": () => {
        // Whenever the extension starts or wakes up, the eventCounter is reset
        // and allows to observe the order of events fired. In case of a wake-up,
        // the first observed event is the one that woke up the background.
        let eventCounter = 0;

        browser.theme.onUpdated.addListener(async updateInfo => {
          browser.test.sendMessage("theme-updated", {
            eventCount: ++eventCounter,
            ...updateInfo,
          });
        });
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      browser_specific_settings: { gecko: { id: "themes@mochi.test" } },
    },
  });

  await extension.startup();
  assertPersistentListeners(extension, "theme", "onUpdated", {
    primed: false,
  });

  await extension.terminateBackground({ disableResetIdleForTest: true });
  assertPersistentListeners(extension, "theme", "onUpdated", {
    primed: true,
  });

  info("Testing update event on static theme startup");

  await theme.startup();

  const {
    eventCount,
    theme: receivedTheme,
    windowId,
  } = await extension.awaitMessage("theme-updated");
  Assert.equal(eventCount, 1, "Event counter should be correct");
  Assert.ok(!windowId, "No window id in static theme update event");
  Assert.ok(
    receivedTheme.images.theme_frame.includes("image1.png"),
    "Theme theme_frame image should be applied"
  );

  await theme.unload();
  await extension.awaitMessage("theme-updated");

  await extension.unload();
  await SpecialPowers.popPrefEnv();
});

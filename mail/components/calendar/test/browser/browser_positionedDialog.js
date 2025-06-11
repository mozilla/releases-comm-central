/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let dialogElement;
let triggerElement;
let containerElement;
let tabPosition;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/positionedDialog.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("positionedDialog.xhtml")
  );
  await SimpleTest.promiseFocus(tab.browser);
  // This test misbehaves if started immediately.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  browser = tab.browser;
  dialogElement = browser.contentWindow.document.querySelector("dialog");
  triggerElement =
    browser.contentWindow.document.querySelector(".dialog-trigger");
  containerElement =
    browser.contentWindow.document.getElementById("dialog-container");
  tabPosition = tabmail.getBoundingClientRect();

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

/**
 * Setup the trigger, container, and dialog for dialog position then
 * open the dialog and return its DomRect.
 *
 * @param {DOMRect} options - The trigger, container and dialog options to
 *  setup.
 * @returns {DOMRect}
 */
async function setupPositioning({ trigger, container, dialog }) {
  triggerElement.style.width = `${trigger.width}px`;
  triggerElement.style.height = `${trigger.height}px`;
  triggerElement.style.left = `${trigger.left}px`;
  triggerElement.style.top = `${trigger.top}px`;

  containerElement.style.width = `${container.width}px`;
  containerElement.style.height = `${container.height}px`;
  containerElement.style.left = `${container.left}px`;
  containerElement.style.top = `${container.top}px`;

  dialogElement.style.width = `${dialog.width}px`;
  dialogElement.style.height = `${dialog.height}px`;

  await new Promise(dialogElement.ownerGlobal.requestAnimationFrame);

  dialogElement.show({ target: triggerElement });

  return dialogElement.getBoundingClientRect();
}

const tests = [
  {
    label: "Horizontal",
    message: "Excess space inline-end",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 400,
      bottom: 500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 400,
    },
  },
  {
    label: "Horizontal",
    message: "Excess space inline-start",
    trigger: {
      height: 100,
      width: 100,
      left: 600,
      top: 400,
      bottom: 500,
      right: 700,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 488,
      y: 400,
    },
  },
  {
    label: "Horizontal",
    message: "Excess space equal",
    trigger: {
      height: 100,
      width: 100,
      left: 450,
      top: 450,
      bottom: 550,
      right: 550,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 338,
      y: 450,
    },
  },
  {
    label: "Horizontal",
    message: "Not enough start space",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 400,
      bottom: 500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 400,
    },
  },
  {
    label: "Horizontal",
    message: "Not enough end space",
    trigger: {
      height: 100,
      width: 100,
      left: 600,
      top: 400,
      bottom: 500,
      right: 700,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 100,
      margin: 12,
    },
    result: {
      x: 188,
      y: 400,
    },
  },
  {
    label: "Horizontal",
    message: "Narrow viewport",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 400,
      bottom: 500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 500,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 500,
    },
    dialog: {
      width: 400,
      height: 100,
      margin: 12,
    },
    result: {
      x: 50,
      y: 512,
    },
  },
  {
    label: "Horizontal",
    message: "Narrow viewport centered on trigger",
    trigger: {
      height: 100,
      width: 100,
      left: 250,
      top: 400,
      bottom: 500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 600,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 600,
    },
    dialog: {
      width: 300,
      height: 100,
      margin: 12,
    },
    result: {
      x: 150,
      y: 512,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Excess space inline-start",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 400,
      bottom: 500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 400,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Excess space block-start",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 700,
      bottom: 800,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 700,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Excess space block end",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 100,
      bottom: 200,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 100,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Trigger above",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 10,
      bottom: 110,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 12,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Trigger below",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 900,
      bottom: 1000,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 888,
    },
  },
  {
    label: "Vertical: Has Horizontal Space",
    message: "Trigger centered",
    trigger: {
      height: 100,
      width: 100,
      left: 400,
      top: 450,
      bottom: 550,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 512,
      y: 450,
    },
  },
  {
    label: "Vertical: Lacks Horizontal Space",
    message: "Trigger bottom",
    trigger: {
      height: 100,
      width: 100,
      left: 50,
      top: 800,
      bottom: 900,
      right: 150,
    },
    container: {
      height: 1000,
      width: 200,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 200,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 50,
      y: 688,
    },
  },
  {
    label: "Vertical: Lacks Horizontal Space",
    message: "Trigger top",
    trigger: {
      height: 100,
      width: 100,
      left: 50,
      top: 200,
      bottom: 300,
      right: 150,
    },
    container: {
      height: 1000,
      width: 200,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 200,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 50,
      y: 312,
    },
  },
  {
    label: "Vertical: Lacks Horizontal Space",
    message: "Trigger centered",
    trigger: {
      height: 100,
      width: 100,
      left: 50,
      top: 450,
      bottom: 550,
      right: 150,
    },
    container: {
      height: 1000,
      width: 200,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 200,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 50,
      y: 562,
    },
  },
  {
    label: "Vertical: Lacks Horizontal Space",
    message: "Short viewport",
    trigger: {
      height: 100,
      width: 100,
      left: 50,
      top: 250,
      bottom: 350,
      right: 150,
    },
    container: {
      height: 500,
      width: 200,
      left: 0,
      top: 0,
      bottom: 500,
      right: 200,
    },
    dialog: {
      width: 100,
      height: 400,
      margin: 12,
    },
    result: {
      x: 50,
      y: 50,
    },
  },
  {
    label: "Overflow",
    message: "Inline start",
    trigger: {
      height: 100,
      width: 400,
      left: -100,
      top: 200,
      bottom: 300,
      right: 300,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 312,
      y: 200,
    },
  },
  {
    label: "Overflow",
    message: "Inline start full",
    trigger: {
      height: 100,
      width: 400,
      left: -500,
      top: 200,
      bottom: 300,
      right: -100,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 12,
      y: 200,
    },
  },
  {
    label: "Overflow",
    message: "Inline end",
    trigger: {
      height: 100,
      width: 400,
      left: 900,
      top: 200,
      bottom: 300,
      right: 1300,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 488,
      y: 200,
    },
  },
  {
    label: "Overflow",
    message: "Inline end full",
    trigger: {
      height: 100,
      width: 400,
      left: 1100,
      top: 200,
      bottom: 300,
      right: 1400,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 588,
      y: 200,
    },
  },
  {
    label: "Overflow",
    message: "Block start",
    trigger: {
      height: 400,
      width: 400,
      left: 100,
      top: -100,
      bottom: 300,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 512,
      y: 12,
    },
  },
  {
    label: "Overflow",
    message: "Block start full",
    trigger: {
      height: 400,
      width: 400,
      left: 100,
      top: -500,
      bottom: -100,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 512,
      y: 12,
    },
  },
  {
    label: "Overflow",
    message: "Block etart",
    trigger: {
      height: 400,
      width: 400,
      left: 100,
      top: 900,
      bottom: 1300,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 512,
      y: 588,
    },
  },
  {
    label: "Overflow",
    message: "Block end full",
    trigger: {
      height: 400,
      width: 400,
      left: 100,
      top: 1100,
      bottom: 1500,
      right: 500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 512,
      y: 588,
    },
  },
  {
    label: "Container Offset",
    message: "Inline start",
    trigger: {
      height: 100,
      width: 100,
      left: 200,
      top: 100,
      bottom: 200,
      right: 300,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 100,
      top: 0,
      bottom: 1000,
      right: 1100,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 412,
      y: 100,
    },
  },
  {
    label: "Container Offset",
    message: "Block start",
    trigger: {
      height: 100,
      width: 100,
      left: 100,
      top: 200,
      bottom: 300,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 900,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 212,
      y: 300,
    },
  },
  {
    label: "Container Offset: Inline: Overflow:",
    message: "Inline start",
    trigger: {
      height: 100,
      width: 100,
      left: 50,
      top: 100,
      bottom: 200,
      right: 150,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 100,
      top: 0,
      bottom: 1000,
      right: 1100,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 262,
      y: 100,
    },
  },
  {
    label: "Container Offset: Inline: Overflow:",
    message: "Inline start full",
    trigger: {
      height: 100,
      width: 100,
      left: -50,
      top: 100,
      bottom: 200,
      right: 50,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 100,
      top: 0,
      bottom: 1000,
      right: 1100,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 162,
      y: 100,
    },
  },
  {
    label: "Container Offset: Inline: Overflow:",
    message: "Inline end",
    trigger: {
      height: 100,
      width: 100,
      left: 1050,
      top: 100,
      bottom: 200,
      right: 1150,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 100,
      top: 0,
      bottom: 1000,
      right: 1100,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 688,
      y: 100,
    },
  },
  {
    label: "Container Offset: Inline: Overflow:",
    message: "Inline end full",
    trigger: {
      height: 100,
      width: 100,
      left: 1150,
      top: 100,
      bottom: 200,
      right: 1250,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 100,
      top: 0,
      bottom: 1000,
      right: 1100,
    },
    dialog: {
      width: 400,
      height: 400,
      margin: 12,
    },
    result: {
      x: 688,
      y: 100,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Inline start",
    trigger: {
      height: 100,
      width: 100,
      left: -50,
      top: 200,
      bottom: 300,
      right: 50,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 62,
      y: 300,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Inline start full",
    trigger: {
      height: 100,
      width: 100,
      left: -150,
      top: 200,
      bottom: 200,
      right: -500,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 12,
      y: 300,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Inline end",
    trigger: {
      height: 100,
      width: 100,
      left: 100,
      top: 200,
      bottom: 300,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 212,
      y: 300,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Inline end full",
    trigger: {
      height: 100,
      width: 100,
      left: 100,
      top: -50,
      bottom: 50,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 212,
      y: 112,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Block end",
    trigger: {
      height: 100,
      width: 100,
      left: 100,
      top: 1050,
      bottom: 1150,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 212,
      y: 988,
    },
  },
  {
    label: "Container Offset: Block: Overflow:",
    message: "Block end full",
    trigger: {
      height: 100,
      width: 100,
      left: 100,
      top: 1150,
      bottom: 1250,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 212,
      y: 988,
    },
  },
  {
    label: "Trigger is not visible",
    message: "width = 0 and height = 0",
    trigger: {
      height: 0,
      width: 0,
      left: 100,
      top: 100,
      bottom: 200,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 100,
      bottom: 1100,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 450,
      y: 550,
    },
  },
  {
    label: "Trigger is not visible",
    message: "width = 0",
    trigger: {
      height: 100,
      width: 0,
      left: 100,
      top: 100,
      bottom: 200,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 450,
      y: 450,
    },
  },
  {
    label: "Trigger is not visible",
    message: "height = 0",
    trigger: {
      height: 0,
      width: 100,
      left: 100,
      top: 100,
      bottom: 200,
      right: 200,
    },
    container: {
      height: 1000,
      width: 1000,
      left: 0,
      top: 0,
      bottom: 1000,
      right: 1000,
    },
    dialog: {
      width: 100,
      height: 100,
      margin: 12,
    },
    result: {
      x: 450,
      y: 450,
    },
  },
];

add_task(async function test_positionedDialogPosition() {
  for (const test of tests) {
    const result = await setupPositioning(test);

    Assert.equal(
      result.x,
      test.result.x,
      `${test.label} - ${test.message} x value`
    );
    Assert.equal(
      result.y,
      test.result.y,
      `${test.label} - ${test.message} y value`
    );
  }
});

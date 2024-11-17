/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { open_message_from_file, get_about_message } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

let aboutMessage;
let msgc;

add_setup(async () => {
  Services.prefs.setBoolPref("mail.inline_attachments", true);
  const file = new FileUtils.File(
    getTestFilePath("data/image_sizing_test.eml")
  );
  msgc = await open_message_from_file(file);

  if (window.screen.availWidth > msgc.outerWidth && msgc.outerWidth < 500) {
    const resizePromise = BrowserTestUtils.waitForEvent(msgc, "resize");
    const w = Math.min(window.screen.availWidth, 550);
    const h = msgc.outerHeight;
    info(`Resizing window... to ${w}x${h}...`);
    msgc.resizeTo(w, h);
    await resizePromise;
    info("... resized!");
    await TestUtils.waitForTick();
  }

  aboutMessage = get_about_message(msgc);

  registerCleanupFunction(async () => {
    await BrowserTestUtils.closeWindow(msgc);
    Services.prefs.clearUserPref("mail.inline_attachments");
  });
});

add_task(async function test_imageOverflow() {
  const msgDoc =
    aboutMessage.document.getElementById("messagepane").contentDocument;

  await TestUtils.waitForCondition(
    () => msgDoc.body.clientWidth < 5000,
    `The message display needs to be less than 5000px wide: ${msgDoc.body.clientWidth}`
  );

  await TestUtils.waitForCondition(() =>
    Array.from(msgDoc.querySelectorAll("img")).every(img => img.complete)
  );

  const messageDisplayWidth = msgDoc.body.clientWidth;
  Assert.equal(
    msgDoc.body.scrollWidth,
    messageDisplayWidth,
    "msg doc should not have scrollbars"
  );

  const imageIds = [];

  for (const image of msgDoc.querySelectorAll("img")) {
    imageIds.push(image);
    const imageId = imageIds.indexOf(image);
    Assert.lessOrEqual(
      image.clientWidth,
      messageDisplayWidth,
      `Image ${imageId} should be resized to fit into the message display`
    );
    const isInLink = image.closest("[href]");
    Assert.equal(
      image.hasAttribute("shrinktofit"),
      !isInLink,
      `Image ${imageId} should have correct shrinktofit attribute state`
    );
    if (image.naturalWidth > messageDisplayWidth && !isInLink) {
      Assert.ok(
        image.hasAttribute("overflowing"),
        `Image ${imageId} should be marked as overflowing`
      );
    } else {
      Assert.ok(
        !image.hasAttribute("overflowing"),
        `Image ${imageId} should not be marked as overflowing`
      );
    }
  }

  msgDoc.defaultView.scrollBy({
    top: 5000,
    behavior: "instant",
  });

  const overflowingImages = msgDoc.querySelectorAll("img[overflowing]");
  Assert.equal(
    overflowingImages.length,
    2,
    "Should have two overflowing images"
  );

  for (const image of overflowingImages) {
    info(`Overflow behavior test for image ${imageIds.indexOf(image)}`);
    EventUtils.synthesizeMouse(image, 1, 1, {}, msgDoc.defaultView);
    await BrowserTestUtils.waitForMutationCondition(
      image,
      {
        attributeFilter: ["shrinktofit"],
      },
      () => !image.hasAttribute("shrinktofit")
    );
    Assert.ok(
      image.hasAttribute("overflowing"),
      "Click should keep overflowing attribute"
    );
    Assert.equal(
      image.clientWidth,
      image.naturalWidth,
      "Image should occupy its full width"
    );
    Assert.equal(
      image.clientHeight,
      image.naturalHeight,
      "Image should occupy its normal height"
    );
    Assert.greater(
      msgDoc.body.scrollWidth,
      messageDisplayWidth,
      "Should have a scrolling overflow"
    );

    EventUtils.synthesizeMouse(image, 1, 1, {}, msgDoc.defaultView);
    await BrowserTestUtils.waitForMutationCondition(
      image,
      {
        attributeFilter: ["shrinktofit"],
      },
      () => image.hasAttribute("shrinktofit")
    );
    Assert.ok(
      image.hasAttribute("overflowing"),
      "Click should keep overflowing attribute"
    );
    Assert.equal(
      image.clientWidth,
      messageDisplayWidth,
      "Image should occupy all available space without horizontal overflow"
    );
    Assert.less(
      image.clientHeight,
      image.naturalHeight,
      "Image height should naturally shrink"
    );
    Assert.equal(
      msgDoc.body.scrollWidth,
      messageDisplayWidth,
      "Should have no scrolling overflow"
    );
  }

  msgDoc.defaultView.scrollTo({
    top: 0,
    behavior: "instant",
  });
});

add_task(async function test_imageUnderflow() {
  const msgDoc =
    aboutMessage.document.getElementById("messagepane").contentDocument;

  const initialWidth = msgc.outerWidth;

  if (initialWidth > 350) {
    const resizePromise = BrowserTestUtils.waitForEvent(msgc, "resize");
    info(`Initial width too large; resizing to 350x${msgc.outerHeight}...`);
    msgc.resizeTo(350, msgc.outerHeight);
    await resizePromise;
    info("... resized!");
    //Assert.equal(msgc.outerWidth, 350, "resizeTo should have worked");
    await TestUtils.waitForTick();
  }

  await TestUtils.waitForCondition(
    () => msgDoc.body.clientWidth < 400,
    `The message display needs to be less than 400px wide: ${msgDoc.body.clientWidth}`
  );
  Assert.less(
    msgDoc.body.clientWidth,
    400,
    "message display width should be less than 400"
  );

  await TestUtils.waitForCondition(
    () => Array.from(msgDoc.querySelectorAll("img")).every(img => img.complete),
    "Every image should complete loading"
  );

  const messageDisplayWidth = msgDoc.body.clientWidth;
  Assert.equal(
    msgDoc.body.scrollWidth,
    messageDisplayWidth,
    "msg doc should not have scrollbars"
  );

  msgDoc.defaultView.scrollBy({
    top: 5000,
    behavior: "instant",
  });

  const image = msgDoc.getElementById("stretched");
  Assert.ok(
    image.hasAttribute("shrinktofit"),
    "img#stretched should have attr shrinktofit"
  );
  info("Zooming image #stretched");
  EventUtils.synthesizeMouse(image, 1, 1, {}, image.ownerGlobal);
  await BrowserTestUtils.waitForMutationCondition(
    image,
    {
      attributeFilter: ["shrinktofit"],
    },
    () => !image.hasAttribute("shrinktofit")
  );
  info("... zoomed on the image #stretched");

  info(`Resizing window to 450x${msgc.outerHeight}...`);
  const resizePromise2 = BrowserTestUtils.waitForEvent(msgc, "resize");
  msgc.resizeTo(450, msgc.outerHeight);
  await resizePromise2;
  await BrowserTestUtils.waitForMutationCondition(
    image,
    {
      attributeFilter: ["shrinktofit"],
    },
    () => image.hasAttribute("shrinktofit")
  );

  Assert.ok(
    !image.hasAttribute("overflowing"),
    "Image should no longer be overflowing"
  );

  const resizePromise3 = BrowserTestUtils.waitForEvent(msgc, "resize");
  info(`Resizing window to ${initialWidth}x${msgc.outerHeight}...`);
  msgc.resizeTo(initialWidth, msgc.outerHeight);
  await resizePromise3;
  msgDoc.defaultView.scrollTo({
    top: 0,
    behavior: "instant",
  });
}).skip(window.screen.availWidth < 450); // Need space to show the entire element

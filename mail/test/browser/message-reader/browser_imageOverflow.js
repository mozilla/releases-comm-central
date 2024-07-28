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
    getTestFilePath("data/Image sizing test.eml")
  );
  msgc = await open_message_from_file(file);

  if (window.screen.availWidth > msgc.outerWidth && msgc.outerWidth < 500) {
    const resizePromise = BrowserTestUtils.waitForEvent(msgc, "resize");
    msgc.resizeTo(Math.min(window.screen.availWidth, 550), msgc.outerHeight);
    await resizePromise;
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

  const messageDisplayWidth = msgDoc.body.clientWidth;
  Assert.less(
    messageDisplayWidth,
    5000,
    "The message display needs to be less than 5000px wide"
  );

  await TestUtils.waitForCondition(() =>
    Array.from(msgDoc.querySelectorAll("img")).every(img => img.complete)
  );

  Assert.equal(msgDoc.body.scrollWidth, messageDisplayWidth, "No scrollbars");

  const imageIds = [];

  for (const image of msgDoc.querySelectorAll("img")) {
    imageIds.push(image.src);
    const imageId = imageIds.indexOf(image.src);
    Assert.lessOrEqual(
      image.clientWidth,
      messageDisplayWidth,
      `Image ${imageId} should be resized to fit into the message display`
    );
    Assert.ok(
      image.hasAttribute("shrinktofit"),
      `Image ${imageId} should have shrinktofit attribute`
    );
    if (image.naturalWidth > messageDisplayWidth) {
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
    info(`Overflow behavior test for image ${imageIds.indexOf(image.src)}`);
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
    msgc.resizeTo(350, msgc.outerHeight);
    await resizePromise;
  }

  const messageDisplayWidth = msgDoc.body.clientWidth;
  Assert.less(
    messageDisplayWidth,
    400,
    "The message display needs to be less than 400px wide"
  );

  await TestUtils.waitForCondition(() =>
    Array.from(msgDoc.querySelectorAll("img")).every(img => img.complete)
  );

  Assert.equal(msgDoc.body.scrollWidth, messageDisplayWidth, "No scrollbars");

  msgDoc.defaultView.scrollBy({
    top: 5000,
    behavior: "instant",
  });

  const image = msgDoc.getElementById("stretched");

  EventUtils.synthesizeMouse(image, 1, 1, {}, msgDoc.defaultView);
  await BrowserTestUtils.waitForMutationCondition(
    image,
    {
      attributeFilter: ["shrinktofit"],
    },
    () => !image.hasAttribute("shrinktofit")
  );
  info("Zoomed on the image");

  msgc.resizeTo(450, msgc.outerHeight);
  info("Resizing window...");

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

  msgc.resizeTo(initialWidth, msgc.outerHeight);
  msgDoc.defaultView.scrollTo({
    top: 0,
    behavior: "instant",
  });
}).skip(window.screen.availWidth < 450); // Need space to show the entire element

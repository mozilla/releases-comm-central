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
  msgc.windowUtils.suppressAnimation(true);

  if (window.screen.availWidth > msgc.outerWidth && msgc.outerWidth < 700) {
    const resizePromise = BrowserTestUtils.waitForEvent(msgc, "resize");
    const w = Math.min(window.screen.availWidth, 750);
    const h = msgc.outerHeight;
    info(`Resizing window... to ${w}x${h}...`);
    msgc.resizeTo(w, h);
    await resizePromise;
    info("... resized!");
    await TestUtils.waitForTick();
  }

  aboutMessage = get_about_message(msgc);

  registerCleanupFunction(async () => {
    msgc.windowUtils.suppressAnimation(false);
    await BrowserTestUtils.closeWindow(msgc);
    Services.prefs.clearUserPref("mail.inline_attachments");
  });
});

/**
 * Tests what happens when clicking on images that are too large to display in
 * their natural size.
 */
add_task(async function test_imageOverflow() {
  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    async function () {
      const msgDoc = content.document;

      await ContentTaskUtils.waitForCondition(
        () => msgDoc.body.clientWidth < 5000,
        `The message display needs to be less than 5000px wide: ${msgDoc.body.clientWidth}`
      );

      await ContentTaskUtils.waitForCondition(() =>
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
        await ContentTaskUtils.waitForMutationCondition(
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
        await ContentTaskUtils.waitForMutationCondition(
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
        Assert.lessOrEqual(
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
    }
  );
});

/**
 * Tests what happens when the window containing a zoomed-in image expands to
 * more than the image's natural width. The image should not grow wider than
 * its natural size unless the width attribute says so, in which case it
 * should not grow wider than the message content.
 * Then when the window is shrunk to smaller than the image, the image should
 * be zoomed-out again to fill only the message width.
 */
add_task(async function test_imageUnderflow() {
  const initialWidth = msgc.outerWidth;

  if (initialWidth > 750) {
    const resizePromise = BrowserTestUtils.waitForEvent(msgc, "resize");
    info(`Initial width too large; resizing to 750x${msgc.outerHeight}...`);
    msgc.resizeTo(750, msgc.outerHeight);
    await resizePromise;
    info("... resized!");
    await TestUtils.waitForTick();
  }

  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    async function () {
      const msgDoc = content.document;

      await ContentTaskUtils.waitForCondition(
        () => msgDoc.body.clientWidth < 800,
        `The message display needs to be less than 800px wide: ${msgDoc.body.clientWidth}`
      );
      Assert.less(
        msgDoc.body.clientWidth,
        800,
        "message display width should be less than 800"
      );

      await ContentTaskUtils.waitForCondition(
        () =>
          Array.from(msgDoc.querySelectorAll("img")).every(img => img.complete),
        "Every image should complete loading"
      );

      const messageDisplayWidth = msgDoc.body.clientWidth;
      Assert.equal(
        msgDoc.body.scrollWidth,
        messageDisplayWidth,
        "msg doc should not have scrollbars"
      );

      content.scrollBy({
        top: 5000,
        behavior: "instant",
      });

      const image = msgDoc.getElementById("stretched");
      Assert.equal(
        image.clientWidth,
        messageDisplayWidth,
        "Image should occupy all available space without horizontal overflow"
      );
      Assert.ok(
        image.hasAttribute("overflowing"),
        "image should have overflowing attribute"
      );
      Assert.ok(
        image.hasAttribute("shrinktofit"),
        "image should have shrinktofit attribute"
      );

      info("Zooming image #stretched"); // #stretched is 800x16px
      await new Promise(resolve => content.setTimeout(resolve, 100));
      EventUtils.synthesizeMouse(image, 1, 1, {}, image.documentGlobal);
      await ContentTaskUtils.waitForMutationCondition(
        image,
        {
          attributeFilter: ["shrinktofit"],
        },
        () => !image.hasAttribute("shrinktofit")
      );
      info("... zoomed on the image #stretched");

      // The image should now be its natural size.

      Assert.equal(
        image.clientWidth,
        image.naturalWidth,
        "image should have its natural width"
      );
      Assert.equal(
        image.clientHeight,
        image.naturalHeight,
        "image should have its natural height"
      );
      Assert.ok(
        image.hasAttribute("overflowing"),
        "image should have overflowing attribute"
      );
      Assert.ok(
        !image.hasAttribute("shrinktofit"),
        "image should no longer have shrinktofit attribute"
      );
    }
  );

  // There are probably still cases where this is too little for this test to
  // pass. Optimally, we'd be resizing for the availableWidth calculation in
  // MailMessageChild to result in at least 800px guaranteed.
  info(`Expanding the window to 870x${msgc.outerHeight}...`);
  const resizePromise2 = BrowserTestUtils.waitForEvent(msgc, "resize");
  msgc.resizeTo(870, msgc.outerHeight);
  await resizePromise2;
  info("... expanded!");
  await TestUtils.waitForTick();

  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    async function () {
      const msgDoc = content.document;
      const image = msgDoc.getElementById("stretched");

      await ContentTaskUtils.waitForCondition(
        () => msgDoc.body.clientWidth > 800,
        `The message display needs to be greater than 800px wide: ${msgDoc.body.clientWidth}`
      );

      // The image should now have the shrinktofit attribute, because the
      // window is wider than the image's natural size. This image has
      // width="5000" set, so it's displayed wider than the natural size, but
      // no wider than the message window.

      const messageDisplayWidth = msgDoc.body.clientWidth;
      Assert.equal(
        image.clientWidth,
        messageDisplayWidth,
        "image should occupy all available space without horizontal overflow"
      );
      Assert.ok(
        !image.hasAttribute("overflowing"),
        "image should no longer have overflowing attribute"
      );
      Assert.ok(
        image.hasAttribute("shrinktofit"),
        "image should have shrinktofit attribute"
      );
    }
  );

  info(`Shrinking the window to 700x${msgc.outerHeight}...`);
  const resizePromise3 = BrowserTestUtils.waitForEvent(msgc, "resize");
  msgc.resizeTo(700, msgc.outerHeight);
  await resizePromise3;
  info("... shrunk!");
  await TestUtils.waitForTick();

  await SpecialPowers.spawn(
    aboutMessage.getMessagePaneBrowser(),
    [],
    async function () {
      const msgDoc = content.document;
      const image = msgDoc.getElementById("stretched");

      await ContentTaskUtils.waitForCondition(
        () => msgDoc.body.clientWidth < 800,
        `The message display needs to be less than 800px wide: ${msgDoc.body.clientWidth}`
      );

      const messageDisplayWidth = msgDoc.body.clientWidth;
      Assert.equal(
        image.clientWidth,
        messageDisplayWidth,
        "image should occupy all available space without horizontal overflow"
      );
      Assert.ok(
        image.hasAttribute("overflowing"),
        "image should have overflowing attribute"
      );
      Assert.ok(
        image.hasAttribute("shrinktofit"),
        "image should have shrinktofit attribute"
      );
    }
  );
}).skip(window.screen.availWidth < 870); // Need space to show the entire element

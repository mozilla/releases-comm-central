/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { VCardUtils } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);

/**
 * Tests that vCard photo data is correctly translated into a URL for display.
 */
add_task(async function testVCardPhotoURL() {
  const jpegPrefix = "data:image/jpeg;base64,/9j/4AAQSkZJRgABA";
  const pngPrefix = "data:image/png;base64,iVBORw0KGgoAAAANSU";

  for (const [fileName, expectedURL] of [
    // Version 3, binary data, binary value type
    ["v3-binary-jpeg.vcf", jpegPrefix],
    ["v3-binary-png.vcf", pngPrefix],
    // Version 3, URI data, binary value type (mismatch)
    ["v3-uri-binary-jpeg.vcf", jpegPrefix],
    ["v3-uri-binary-png.vcf", pngPrefix],
    // Version 3, URI data, URI value type
    ["v3-uri-uri-jpeg.vcf", jpegPrefix],
    ["v3-uri-uri-png.vcf", pngPrefix],
    // Version 4, URI data, URI value type
    ["v4-uri-jpeg.vcf", jpegPrefix],
    ["v4-uri-png.vcf", pngPrefix],
  ]) {
    info(`testing ${fileName}`);
    const file = do_get_file(`data/${fileName}`);
    const vCard = await IOUtils.readUTF8(file.path);
    const card = VCardUtils.vCardToAbCard(vCard);

    Assert.equal(card.photoURL.substring(0, 40), expectedURL);
  }
});

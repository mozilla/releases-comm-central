/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  TYPE_SVG,
  TYPE_ICO,
  TRUSTED_FAVICON_SCHEMES,
  blobAsDataURL,
} from "moz-src:///toolkit/modules/FaviconUtils.sys.mjs";

async function drawImageOnCanvas(canvas, image) {
  const data = await image.blob.bytes();
  const frame = new VideoFrame(data, {
    timestamp: 0,
    format: image.format,
    codedWidth: image.displayWidth,
    codedHeight: image.displayHeight,
  });

  canvas.width = frame.displayWidth;
  canvas.height = frame.displayHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(frame, 0, 0);
}

// Re-construct the ICO file with different sized PNG images.
// See https://en.wikipedia.org/wiki/ICO_(file_format).
function createICO(images) {
  const ICO_HEADER_SIZE = 6;
  const ICO_DIR_ENTRY_SIZE = 16;

  const metadataSize = ICO_HEADER_SIZE + ICO_DIR_ENTRY_SIZE * images.length;
  const size =
    metadataSize + images.reduce((acc, image) => acc + image.byteLength, 0);

  const buffer = new ArrayBuffer(size);
  const u8 = new Uint8Array(buffer);
  const view = new DataView(buffer);

  view.setUint16(0, 0, true); // idReserved
  view.setUint16(2, 1, true); // idType (1 = ICO)
  view.setUint16(4, images.length, true); // idCount

  let dataOffset = metadataSize; // Append image data directly after the meta data.
  for (let i = 0; i < images.length; i++) {
    const off = ICO_HEADER_SIZE + ICO_DIR_ENTRY_SIZE * i;

    // We use a zero width and height because we always use compressed PNGs,
    // which require this and have their own width/height information.
    view.setUint8(off, 0); // bWidth
    view.setUint8(off + 1, 0); // bHeight
    view.setUint8(off + 2, 0); // bColorCount
    view.setUint8(off + 3, 0); // bReserved
    view.setUint16(off + 4, 1, true); // wPlanes
    view.setUint16(off + 6, 32, true); // wBitCount
    view.setUint32(off + 8, images[i].byteLength, true); // dwBytesInRes
    view.setUint32(off + 12, dataOffset, true); // dwImageOffset

    // Copy the image's bytes into the ICO buffer.
    u8.set(images[i], dataOffset);

    dataOffset += images[i].byteLength;
  }

  return buffer;
}

export class LinkHandlerParent extends JSWindowActorParent {
  receiveMessage(msg) {
    const browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      return;
    }

    switch (msg.name) {
      case "Link:SetIcon":
        this.setIconFromLink(browser, msg.data);
        break;
    }
  }

  async setIconFromLink(browser, { iconURL, images, isRichIcon }) {
    const tabmail = browser.ownerDocument.getElementById("tabmail");
    if (!tabmail) {
      return;
    }

    const tab = tabmail.getTabForBrowser(browser);
    if (tab?.mode?.type != "contentTab") {
      return;
    }

    if (images) {
      const canvas = tabmail.ownerDocument.createElement("canvas");

      // We have multiple images, need to create an ICO file to collect them.
      if (images.length > 1) {
        // Convert all images to PNG bytes.
        const blobs = [];
        for (const image of images) {
          await drawImageOnCanvas(canvas, image);
          blobs.push(await new Promise(resolve => canvas.toBlob(resolve)));
        }
        const buffers = await Promise.all(blobs.map(blob => blob.bytes()));

        // Create an ICO "file" containing all the PNGs.
        const ico = createICO(buffers);

        // Convert the ICO bytes to a data URL.
        iconURL = await blobAsDataURL(new Blob([ico], { type: TYPE_ICO }));
      } else {
        await drawImageOnCanvas(canvas, images[0]);
        iconURL = canvas.toDataURL();
      }
    }

    // The browser might have gone away during `await` above.
    if (!tabmail.getTabForBrowser(browser)) {
      return;
    }

    let iconURI;
    try {
      iconURI = Services.io.newURI(iconURL);
    } catch (ex) {
      console.error(ex);
      return;
    }

    // The content process should send decoded images for all schemes except
    // for trusted schemes and SVGs, which should not be rasterized.
    if (
      !images &&
      !TRUSTED_FAVICON_SCHEMES.includes(iconURI.scheme) &&
      !iconURL.startsWith(`data:${TYPE_SVG};base64,`)
    ) {
      console.error(
        `Not allowed to set favicon "${iconURL}" with that scheme!`
      );
      return;
    }

    if (!iconURI.schemeIs("data")) {
      try {
        Services.scriptSecurityManager.checkLoadURIWithPrincipal(
          browser.contentPrincipal,
          iconURI,
          Services.scriptSecurityManager.ALLOW_CHROME
        );
      } catch (ex) {
        return;
      }
    }

    if (!isRichIcon) {
      tabmail.setTabFavIcon(
        tab,
        iconURL,
        "chrome://messenger/skin/icons/new/compact/draft.svg"
      );
    }
  }
}

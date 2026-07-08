/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global arguments */

const [resolve] = arguments;

function finish() {
  const bucket = document.getElementById("attachmentBucket");
  const items = [];
  for (let i = 0; i < bucket.itemCount; i++) {
    const item = bucket.getItemAtIndex(i);
    items.push({
      name: item.attachment.name,
      url: item.attachment.url,
    });
  }
  resolve(items);
}

if (window.composeEditorReady) {
  finish();
} else {
  window.addEventListener("compose-editor-ready", finish, { once: true });
}

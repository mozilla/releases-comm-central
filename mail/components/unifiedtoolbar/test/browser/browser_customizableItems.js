/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  getAvailableItemIdsForSpace,
  getDefaultItemIdsForSpace,
  registerExtension,
  unregisterExtension,
} = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");

add_task(async function test_extensionRegisterUnregisterDefault() {
  const extensionId = "thunderbird-compact-light@mozilla.org";
  await registerExtension(extensionId);

  const itemId = `ext-${extensionId}`;
  ok(
    getAvailableItemIdsForSpace("mail").includes(itemId),
    "Extension item available in mail space"
  );
  ok(
    getDefaultItemIdsForSpace("mail").includes(itemId),
    "Extension item in mail space by default"
  );
  ok(
    !getAvailableItemIdsForSpace().includes(itemId),
    "Extension item not available in all spaces"
  );

  unregisterExtension(extensionId);

  ok(
    !getAvailableItemIdsForSpace("mail").includes(itemId),
    "Extension item no longer available in mail space"
  );
  ok(
    !getDefaultItemIdsForSpace("mail").includes(itemId),
    "Extension item not in mail space by default"
  );
});

add_task(async function test_extensionRegisterAllSpaces() {
  const extensionId = "thunderbird-compact-light@mozilla.org";
  await registerExtension(extensionId, []);

  const itemId = `ext-${extensionId}`;
  ok(
    getAvailableItemIdsForSpace().includes(itemId),
    "Extension item available in all spaces"
  );
  ok(
    getDefaultItemIdsForSpace("default").includes(itemId),
    "Extension item in all spaces by default"
  );
  ok(
    !getAvailableItemIdsForSpace("mail").includes(itemId),
    "Extension item not available in mail space"
  );
  ok(
    getDefaultItemIdsForSpace("mail").includes(itemId),
    "Extension item in mail space by default"
  );

  unregisterExtension(extensionId);

  ok(
    !getAvailableItemIdsForSpace().includes(itemId),
    "Extension item no longer available in all spaces"
  );
  ok(
    !getDefaultItemIdsForSpace("default").includes(itemId),
    "Extension item not in any space by default"
  );
});

add_task(async function test_extensionRegisterMultipleSpaces() {
  const extensionId = "thunderbird-compact-light@mozilla.org";
  await registerExtension(extensionId, ["mail", "calendar", "default"]);

  const itemId = `ext-${extensionId}`;
  ok(
    getAvailableItemIdsForSpace("calendar").includes(itemId),
    "Extension item available in calendar space"
  );
  ok(
    getDefaultItemIdsForSpace("calendar").includes(itemId),
    "Extension item in calendar space by default"
  );
  ok(
    getAvailableItemIdsForSpace("mail").includes(itemId),
    "Extension item available in mail space"
  );
  ok(
    getDefaultItemIdsForSpace("mail").includes(itemId),
    "Extension item in mail space by default"
  );
  ok(
    !getAvailableItemIdsForSpace().includes(itemId),
    "Extension item not available in all spaces"
  );
  ok(
    getAvailableItemIdsForSpace("default").includes(itemId),
    "Extension item available in default space"
  );
  ok(
    getDefaultItemIdsForSpace("default").includes(itemId),
    "Extension item in default space"
  );

  unregisterExtension(extensionId);

  ok(
    !getAvailableItemIdsForSpace("mail").includes(itemId),
    "Extension item no longer available in mail space"
  );
  ok(
    !getDefaultItemIdsForSpace("mail").includes(itemId),
    "Extension item not in mail space by default"
  );
  ok(
    !getAvailableItemIdsForSpace("calendar").includes(itemId),
    "Extension item no longer available in calendar space"
  );
  ok(
    !getDefaultItemIdsForSpace("calendar").includes(itemId),
    "Extension item not in calendar space by default"
  );
  ok(
    !getAvailableItemIdsForSpace().includes(itemId),
    "Extension item not available in all spaces"
  );
  ok(
    !getAvailableItemIdsForSpace("default").includes(itemId),
    "Extension item not available in default space"
  );
  ok(
    !getDefaultItemIdsForSpace("default").includes(itemId),
    "Extension item not in default space"
  );
});

add_task(async function test_extensionRegisterStableOrder() {
  const extension1Id = "thunderbird-compact-light@mozilla.org";
  const extension2Id = "thunderbird-compact-dark@mozilla.org";
  await registerExtension(extension1Id);
  await registerExtension(extension2Id);

  const defaultItems = getDefaultItemIdsForSpace("mail");

  const firstExtensionId = defaultItems
    .find(itemId => itemId.startsWith("ext-"))
    .slice(4);

  unregisterExtension(firstExtensionId);

  ok(
    !getDefaultItemIdsForSpace("mail").includes(`ext-${firstExtensionId}`),
    "Extension that was the first in the default set not in default set"
  );

  await registerExtension(firstExtensionId);

  Assert.deepEqual(
    getDefaultItemIdsForSpace("mail"),
    defaultItems,
    "Default items order stable for extensions"
  );

  unregisterExtension(extension1Id);
  unregisterExtension(extension2Id);
});

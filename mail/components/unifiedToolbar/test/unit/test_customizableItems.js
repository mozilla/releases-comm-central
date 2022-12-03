/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { getItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.mjs"
);

add_task(function test_getItemIdsForSpace_anySpace() {
  const itemsForAnySpace = getItemIdsForSpace();
  Assert.ok(Array.isArray(itemsForAnySpace), "returns an array");
  for (const itemId of itemsForAnySpace) {
    Assert.equal(typeof itemId, "string", `item ID "${itemId}" is string`);
    Assert.greater(itemId.length, 0, `item ID is not empty`);
  }
});

add_task(function test_getItemIdsForSpace_emptySpace() {
  const itemsForEmptySpace = getItemIdsForSpace("test");
  Assert.deepEqual(itemsForEmptySpace, [], "Empty array for empty space");
});

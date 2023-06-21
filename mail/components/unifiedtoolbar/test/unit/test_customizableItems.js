/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  getAvailableItemIdsForSpace,
  getDefaultItemIdsForSpace,
  MULTIPLE_ALLOWED_ITEM_IDS,
  SKIP_FOCUS_ITEM_IDS,
} = ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");

const { default: CUSTOMIZABLE_ITEMS } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItemsDetails.mjs"
);

add_task(function test_getAvailableItemIdsForSpace_anySpace() {
  const itemsForAnySpace = getAvailableItemIdsForSpace();
  Assert.ok(Array.isArray(itemsForAnySpace), "returns an array");
  for (const itemId of itemsForAnySpace) {
    Assert.equal(typeof itemId, "string", `item ID "${itemId}" is string`);
    Assert.greater(itemId.length, 0, `item ID is not empty`);
  }
});

add_task(function test_getAvailableItemIdsForSpace_emptySpace() {
  const itemsForEmptySpace = getAvailableItemIdsForSpace("test");
  Assert.deepEqual(itemsForEmptySpace, [], "Empty array for empty space");
});

add_task(function test_getAvailableItemIdsForSpace_includingAgnostic() {
  const items = getAvailableItemIdsForSpace("mail", true);
  const itemsForAnySpace = getAvailableItemIdsForSpace();
  const itemsForMailSpace = getAvailableItemIdsForSpace("mail");

  Assert.ok(
    itemsForAnySpace.every(itemId => items.includes(itemId)),
    "All space agnostic items are included"
  );

  Assert.ok(
    itemsForMailSpace.every(itemId => items.includes(itemId)),
    "All mail space items are included"
  );
});

add_task(function test_getDefaultItemIdsForSpace_default() {
  const items = getDefaultItemIdsForSpace("default");

  Assert.ok(Array.isArray(items), "Should return an array");
  Assert.deepEqual(
    items,
    ["spacer", "search-bar", "spacer"],
    "Default space should contain the default item set"
  );
});

add_task(function test_getDefaultItemIdsForSpace_cloningArray() {
  const items1 = getDefaultItemIdsForSpace("default");
  const items2 = getDefaultItemIdsForSpace("default");
  const items3 = getDefaultItemIdsForSpace("mail");

  Assert.notStrictEqual(
    items1,
    items2,
    "The default sets should be different array instances"
  );
  Assert.notStrictEqual(
    items2,
    items3,
    "The second default set an mail space should be different array instances"
  );
  Assert.notStrictEqual(
    items3,
    items1,
    "The mail space and first default set should be different array instances"
  );

  Assert.deepEqual(
    items1,
    items2,
    "The two default pseudospace sets should contain the same items"
  );
});

add_task(function test_multipleAllowedItemIds() {
  Assert.equal(
    typeof MULTIPLE_ALLOWED_ITEM_IDS.has,
    "function",
    "Multiple allowed item IDs should be set-like"
  );
  Assert.ok(
    Array.from(MULTIPLE_ALLOWED_ITEM_IDS).every(
      itemId => typeof itemId === "string"
    ),
    "Every item in the set should be a string"
  );
  for (const item of CUSTOMIZABLE_ITEMS) {
    Assert.equal(
      MULTIPLE_ALLOWED_ITEM_IDS.has(item.id),
      Boolean(item.allowMultiple),
      `Set's state should matche the allowMultiple value of ${item.allowMultiple} for ${item.id}`
    );
  }
});

add_task(function test_skipFocusItemIds() {
  Assert.equal(
    typeof SKIP_FOCUS_ITEM_IDS.has,
    "function",
    "Skip focus item IDs should be set-like"
  );
  Assert.ok(
    Array.from(SKIP_FOCUS_ITEM_IDS).every(itemId => typeof itemId === "string"),
    "Every item in the set should be a string"
  );
  for (const item of CUSTOMIZABLE_ITEMS) {
    Assert.equal(
      SKIP_FOCUS_ITEM_IDS.has(item.id),
      Boolean(item.skipFocus),
      `Set's state should match the skipFocus value of ${item.skipFocus} for ${item.id}`
    );
  }
});

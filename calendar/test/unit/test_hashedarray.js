/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  HashedArray: "resource:///modules/calendar/calHashedArray.sys.mjs",
  SortedHashedArray: "resource:///modules/calendar/calHashedArray.sys.mjs",
});

function run_test() {
  test_array_base();
  test_array_sorted();
  test_hashAccessor();
}

/**
 * Helper function to create an item that has a sensible hash id, with the given
 * title identification.
 *
 * @param ident     The title to identify the item.
 * @returns The created item.
 */
function hashedCreateItem(ident) {
  const item = new CalEvent();
  item.calendar = { id: "test" };
  item.id = cal.getUUID();
  item.title = ident;
  return item;
}

/**
 * Comparator function to sort the items by their title
 *
 * @param a         Object to compare.
 * @param b         Object to compare with.
 * @returns 0, -1, or 1 (usual comptor meanings)
 */
function titleComptor(a, b) {
  if (a.title > b.title) {
    return 1;
  } else if (a.title < b.title) {
    return -1;
  }
  return 0;
}

/**
 * Checks if the hashed array accessor functions work for the status of the
 * items array.
 *
 * @param har           The Hashed Array
 * @param testItems     The array of test items
 * @param itemAccessor  The accessor func to retrieve the items
 * @throws Exception    If the arrays are not the same.
 */
function checkConsistancy(har, testItems, itemAccessor) {
  itemAccessor =
    itemAccessor ||
    function (item) {
      return item;
    };
  for (const idx in testItems) {
    const testItem = itemAccessor(testItems[idx]);
    equal(itemAccessor(har.itemByIndex(idx)).title, testItem.title);
    equal(itemAccessor(har.itemById(testItem.hashId)).title, testItem.title);
    equal(har.indexOf(testItems[idx]), idx);
  }
}

/**
 * Man, this function is really hard to keep general enough, I'm almost tempted
 * to duplicate the code. It checks if the remove and modify operations work for
 * the given hashed array.
 *
 * @param har               The Hashed Array
 * @param testItems         The js array with the items
 * @param postprocessFunc   (optional) The function to call after each
 *                            operation, but before checking consistency.
 * @param itemAccessor      (optional) The function to access the item for an
 *                            array element.
 * @param itemCreator       (optional) Function to create a new item for the
 *                            array.
 */
function testRemoveModify(har, testItems, postprocessFunc, itemAccessor, itemCreator) {
  postprocessFunc =
    postprocessFunc ||
    function (a, b) {
      return [a, b];
    };
  itemCreator = itemCreator || (title => hashedCreateItem(title));
  itemAccessor =
    itemAccessor ||
    function (item) {
      return item;
    };

  // Now, delete the second item and check again
  har.removeById(itemAccessor(testItems[1]).hashId);
  testItems.splice(1, 1);
  [har, testItems] = postprocessFunc(har, testItems);

  checkConsistancy(har, testItems, itemAccessor);

  // Try the same by index
  har.removeByIndex(2);
  testItems.splice(2, 1);
  [har, testItems] = postprocessFunc(har, testItems);
  checkConsistancy(har, testItems, itemAccessor);

  // Try modifying an item
  const newInstance = itemCreator("z-changed");
  itemAccessor(newInstance).id = itemAccessor(testItems[0]).id;
  testItems[0] = newInstance;
  har.modifyItem(newInstance);
  [har, testItems] = postprocessFunc(har, testItems);
  checkConsistancy(har, testItems, itemAccessor);
}

/**
 * Tests the basic HashedArray
 */
function test_array_base() {
  let har, testItems;

  // Test normal additions
  har = new HashedArray();
  testItems = ["a", "b", "c", "d"].map(hashedCreateItem);

  testItems.forEach(har.addItem, har);
  checkConsistancy(har, testItems);
  testRemoveModify(har, testItems);

  // Test adding in batch mode
  har = new HashedArray();
  testItems = ["e", "f", "g", "h"].map(hashedCreateItem);
  har.startBatch();
  testItems.forEach(har.addItem, har);
  har.endBatch();
  checkConsistancy(har, testItems);
  testRemoveModify(har, testItems);
}

/**
 * Tests the sorted SortedHashedArray
 */
function test_array_sorted() {
  let har, testItems, testItemsSorted;

  function sortedPostProcess(harParam, tiParam) {
    tiParam = tiParam.sort(titleComptor);
    return [harParam, tiParam];
  }

  // Test normal additions
  har = new SortedHashedArray(titleComptor);
  testItems = ["d", "c", "a", "b"].map(hashedCreateItem);
  testItemsSorted = testItems.sort(titleComptor);

  testItems.forEach(har.addItem, har);
  checkConsistancy(har, testItemsSorted);
  testRemoveModify(har, testItemsSorted, sortedPostProcess);

  // Test adding in batch mode
  har = new SortedHashedArray(titleComptor);
  testItems = ["e", "f", "g", "h"].map(hashedCreateItem);
  testItemsSorted = testItems.sort(titleComptor);
  har.startBatch();
  testItems.forEach(har.addItem, har);
  har.endBatch();
  checkConsistancy(har, testItemsSorted);
  testRemoveModify(har, testItemsSorted, sortedPostProcess);
}

/**
 * Tests SortedHashedArray with a custom hashAccessor.
 */
function test_hashAccessor() {
  const comptor = (a, b) => titleComptor(a.item, b.item);

  const har = new SortedHashedArray(comptor);
  har.hashAccessor = function (obj) {
    return obj.item.hashId;
  };

  function itemAccessor(obj) {
    if (!obj) {
      do_throw("WTF?");
    }
    return obj.item;
  }

  function itemCreator(title) {
    return { item: hashedCreateItem(title) };
  }

  function sortedPostProcess(harParam, tiParam) {
    tiParam = tiParam.sort(comptor);
    return [harParam, tiParam];
  }

  const testItems = ["d", "c", "a", "b"].map(itemCreator);

  const testItemsSorted = testItems.sort(comptor);
  testItems.forEach(har.addItem, har);
  checkConsistancy(har, testItemsSorted, itemAccessor);
  testRemoveModify(har, testItemsSorted, sortedPostProcess, itemAccessor, itemCreator);
}

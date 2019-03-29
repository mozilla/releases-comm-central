/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for iteratorUtils.jsm. Currently this tests:
 * - toArray
 * - toXPCOMArray
 * - fixIterator
 */

var iteratorUtils = {};
ChromeUtils.import("resource:///modules/iteratorUtils.jsm", iteratorUtils);

var gDOMParser = new DOMParser();

/**
 * Given the name of an XML file, returns the node representation of the file.
 */
function parse_xml_file(aFileName) {
  let file = do_get_file(aFileName);
  let stream = Cc["@mozilla.org/network/file-input-stream;1"]
                 .createInstance(Ci.nsIFileInputStream);
  stream.init(file, -1, -1, Ci.nsIFileInputStream.CLOSE_ON_EOF);
  return gDOMParser.parseFromStream(stream, "UTF-8", file.fileSize,
                                    "application/xml");
}

/**
 * Tests of the supported toArray and fixIterator arguments.
 */
function test_fixIterator() {
  let JSIteratorArray = iteratorUtils.toArray([1, 2, 3, 4, 5]);

  let JSArray = [];
  let i = 1;
  for (let val of JSIteratorArray) {
    Assert.equal(val, i++);
    JSArray.push(val);
  }

  i = 0;
  for (let val of iteratorUtils.fixIterator(JSArray)) {
    Assert.equal(val, JSArray[i++]);
  }
  Assert.ok(i > 0);

  let nsIArrayJSArray = [];
  for (let val of JSArray) {
    let nsIArrayMember = Cc["@mozilla.org/supports-PRUint8;1"]
                           .createInstance(Ci.nsISupportsPRUint8);
    nsIArrayMember.data = val;
    nsIArrayJSArray.push(nsIArrayMember);
  }

  let nsIArray = iteratorUtils.toXPCOMArray(nsIArrayJSArray, Ci.nsIMutableArray);
  Assert.equal(nsIArray.length, 5);

  i = 0;
  for (let val of iteratorUtils.fixIterator(nsIArray)) {
    Assert.equal(val, JSArray[i++]);
  }
  Assert.ok(i > 0);

  i = 0;
  for (let val of iteratorUtils.fixIterator(nsIArray.enumerate())) {
    Assert.equal(val, JSArray[i++]);
  }
  Assert.ok(i > 0);

  i = 0;
  let JSIteratorArray2 = iteratorUtils.toArray(iteratorUtils.fixIterator(nsIArray));
  for (let val of JSIteratorArray2) {
    Assert.equal(val, JSArray[i++]);
  }
  Assert.ok(i > 0);

  // Bug 1126509, test that fixIterator rejects unknown objects.
  let thrown = false;
  let tryIterate = { item: "An object, that is not supported by fixIterator." };
  try {
    for (let val of iteratorUtils.fixIterator(tryIterate)) { dump(val); }
  } catch (e) {
    // A specific exception is the correct behaviour here.
    if (e.message == "An unsupported object sent to fixIterator: [object Object]")
      thrown = true;
  }
  Assert.ok(thrown);

  thrown = false;
  try {
    for (let val of iteratorUtils.fixIterator(tryIterate)) { dump(val); }
  } catch (e) {
    // A specific exception is the correct behaviour here.
    if (e.message == "An unsupported object sent to fixIterator: [object Object]")
      thrown = true;
  }
  Assert.ok(thrown);

  thrown = false;
  try {
    iteratorUtils.toXPCOMArray(tryIterate, Ci.nsIArray);
  } catch (e) {
    // A specific exception is the correct behaviour here.
    if (e.message == "An unsupported interface requested from toXPCOMArray: nsIArray")
      thrown = true;
  }
  Assert.ok(thrown);
}

/**
 * Test that toArray works correctly with a NodeList.
 */
function test_toArray_NodeList() {
  let xml = parse_xml_file("nodelist_test.xml");
  let rootNode = xml.firstChild;
  // Sanity check -- rootNode should have tag "rootnode"
  Assert.equal(rootNode.tagName, "rootnode");
  // childNodes is a NodeList
  let childNodes = rootNode.childNodes;
  // Make sure we have at least one child node
  Assert.ok(childNodes.length > 0);
  let childArray = iteratorUtils.toArray(childNodes);
  Assert.equal(childNodes.length, childArray.length);
  for (let [i, node] of childArray.entries())
    Assert.equal(node, childArray[i]);
}

/**
 * Test that toArray works correctly with the build-in generator construct.
 */
function test_toArray_builtin_generator() {
  let arr = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  let generator = function* () {
    for (let elem of arr) {
      yield elem;
    }
  };
  // The resulting array should be the same as 'arr'.
  let generatorArray = iteratorUtils.toArray(generator);
  Assert.equal(arr.length, generatorArray.length);
  for (let i in arr) {
    Assert.equal(arr[i], generatorArray[i]);
  }

  // Bug 1126509, test that toArray rejects unknown objects.
  let thrown = false;
  let tryIterate = { item: "An object, that is not supported by toArray." };
  try {
    iteratorUtils.toArray(tryIterate);
  } catch (e) {
    // A specific exception is the correct behaviour here.
    if (e.message == "An unsupported object sent to toArray: [object Object]")
      thrown = true;
  }
  Assert.ok(thrown);
}

var Symbol_iterator = typeof Symbol === "function" && Symbol.iterator ?
  Symbol.iterator : "@@iterator";

/**
 * Test that toArray works correctly with a custom iterator.
 */
function test_toArray_custom_iterator() {
  let arr = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30];
  let iterator = {
    [Symbol_iterator]: function* testIterator() {
      // C-style for loop so that we don't confuse ourselves with yet another
      // iterator
      for (let i = 0; i < arr.length; i++)
        yield arr[i];
    },
  };
  let iteratorArray = iteratorUtils.toArray(iterator);
  Assert.equal(arr.length, iteratorArray.length);
  for (let [i, val] of arr.entries())
    Assert.equal(val, iteratorArray[i]);
}

var gTests = [
  test_fixIterator,
  test_toArray_NodeList,
  test_toArray_builtin_generator,
  test_toArray_custom_iterator,
];

function run_test() {
  for (let test of gTests)
    test();
}

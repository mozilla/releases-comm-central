/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource:///modules/ArrayBufferUtils.jsm");

function do_check_arraybuffer_eq(a, b) {
  let viewA = new Uint8Array(a);
  let viewB = new Uint8Array(b);

  let res = a.byteLength == b.byteLength;
  for (let i = 0; i < viewA.byteLength; ++i)
    res = res && viewA[i] == viewB[i];

  do_check_true(res);
}

function do_check_array_eq(a, b) {
  let res = a.length == b.length;
  for (let i = 0; i < a.length; ++i)
    res = res && a[i] == b[i];

  do_check_true(res);
}

function test_ArrayBufferToBytes() {
  let expectedBytes = [0, 1, 0, 10, 0, 100, 3, 232];
  let expectedBuf = new ArrayBuffer(8);
  let view = new DataView(expectedBuf);
  view.setUint16(0, 1);
  view.setUint16(2, 10);
  view.setUint16(4, 100);
  view.setUint16(6, 1000);

  let bytes = ArrayBufferToBytes(expectedBuf);
  do_check_array_eq(bytes, expectedBytes);

  run_next_test();
}

function test_BytesToArrayBuffer() {
  let expectedBytes = [0, 1, 0, 10, 0, 100, 3, 232];
  let expectedBuf = new ArrayBuffer(8);
  let view = new DataView(expectedBuf);
  view.setUint16(0, 1);
  view.setUint16(2, 10);
  view.setUint16(4, 100);
  view.setUint16(6, 1000);

  let buf = BytesToArrayBuffer(expectedBytes);
  do_check_arraybuffer_eq(buf, expectedBuf);

  run_next_test();
}

function test_StringToBytes() {
  let expectedBytes = [72, 101, 108, 108, 111, 32, 119, 111, 114, 108, 100, 33];
  let bytes = StringToBytes("Hello world!");
  do_check_array_eq(bytes, expectedBytes);

  run_next_test();
}

function test_ArrayBufferToString() {
  let testString = "Hello world!";
  let byteString = StringToBytes(testString);

  let buf = new ArrayBuffer(byteString.length);
  let view = new DataView(buf);
  for (let i = 0; i < byteString.length; ++i)
    view.setUint8(i, byteString[i]);

  let str = ArrayBufferToString(buf);
  do_check_eq(str, testString);

  run_next_test();
}

function test_ArrayBufferToHexString() {
  let buf = new ArrayBuffer(4);
  let view = new DataView(buf);
  view.setUint8(0, 0x00);
  view.setUint8(1, 0x10);
  view.setUint8(2, 0x01);
  view.setUint8(3, 0x11);

  let str = ArrayBufferToHexString(buf);
  do_check_eq(str, "0x00 10 01 11");

  run_next_test();
}

function run_test() {
  add_test(test_ArrayBufferToBytes);
  add_test(test_BytesToArrayBuffer);
  add_test(test_StringToBytes);
  add_test(test_ArrayBufferToString);
  add_test(test_ArrayBufferToHexString);

  run_next_test();
}

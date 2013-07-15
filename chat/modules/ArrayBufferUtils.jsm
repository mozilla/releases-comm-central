/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * JavaScript ArrayBuffers are missing a variety of useful methods which are
 * provided by this module.
 */

const EXPORTED_SYMBOLS = ["copyBytes", "ArrayBufferToBytes",
  "BytesToArrayBuffer", "StringToBytes", "ArrayBufferToString",
  "ArrayBufferToHexString"];

/*
 * aTarget / aSource are ArrayBuffers.
 *
 * Note that this is very similar to ArrayBuffer.slice except that it allows
 * for an offset in the target as well as the source.
 */
function copyBytes(aTarget, aSource, aTargetOffset = 0, aSourceOffset = 0,
                   aLength = aSource.byteLength) {
  // The rest just gets the data copied into it.
  let view = new Uint8Array(aTarget, aTargetOffset);
  view.set(new Uint8Array(aSource, aSourceOffset, aLength));
}

function ArrayBufferToBytes(aBuf) [b for (b of new Uint8Array(aBuf))];

function BytesToArrayBuffer(aBytes = []) {
  let buf = new ArrayBuffer(aBytes.length);
  let view = new Uint8Array(buf);
  view.set(aBytes);
  return buf;
}

function StringToBytes(aString) [aString.charCodeAt(i) for (i in aString)];

function ArrayBufferToString(aData)
  [String.fromCharCode(b) for (b of new Uint8Array(aData))].join("");

function ArrayBufferToHexString(aData)
  "0x" + [("0" + b.toString(16)).slice(-2) for (b of new Uint8Array(aData))].join(" ");

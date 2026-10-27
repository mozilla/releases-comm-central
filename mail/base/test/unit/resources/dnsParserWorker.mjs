/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Runs load_libresolv.lookup() against crafted DNS responses, with
 * res_search() replaced by a stub, and posts the results back.
 * The unixstyle of the OS is passed as the query string.
 */

import { load_libresolv } from "resource:///modules/DNS.worker.mjs";

const NS_T_MX = 15;
const NS_T_SRV = 33;
const QNAME = "a".repeat(42) + ".com";

function encodeName(domain) {
  const bytes = [];
  for (const label of domain.split(".")) {
    bytes.push(label.length, ...Array.from(label, c => c.charCodeAt(0)));
  }
  bytes.push(0);
  return bytes;
}

function u16(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

/**
 * @param {integer} type - The record type.
 * @param {integer[][]} rdatas - The data of each answer record.
 * @returns {integer[]} The DNS response.
 */
function buildResponse(type, rdatas) {
  const bytes = [
    ...u16(0),
    ...u16(0x8180),
    ...u16(1),
    ...u16(rdatas.length),
    ...u16(0),
    ...u16(0),
    ...encodeName(QNAME),
    ...u16(type),
    ...u16(1),
  ];
  for (const rdata of rdatas) {
    bytes.push(
      0xc0,
      0x0c,
      ...u16(type),
      ...u16(1),
      0,
      0,
      0x01,
      0x2c,
      ...u16(rdata.length),
      ...rdata
    );
  }
  return bytes;
}

function mxData(index) {
  return [...u16(index), ...encodeName(`mx${index}.example.com`)];
}

function mxRecords(count) {
  return Array.from({ length: count }, (_, i) => mxData(10 + i));
}

/**
 * @param {integer} type - The record type to look up.
 * @param {integer[]} response - The response res_search() should return.
 * @param {integer} [bufferSize] - Override for the answer buffer size.
 * @returns {object} The records, or the error message.
 */
function lookup(type, response, bufferSize) {
  const dns = new load_libresolv(self.location.search.slice(1));
  if (bufferSize) {
    dns.QUERYBUF_SIZE = bufferSize;
  }
  dns.res_search = (qname, nsclass, typeID, answer, anslen) => {
    const count = Math.min(response.length, anslen);
    for (let i = 0; i < count; i++) {
      answer[i] = response[i];
    }
    return response.length;
  };
  try {
    return { records: dns.lookup(QNAME, type) };
  } catch (e) {
    return { error: e.message };
  } finally {
    dns.close();
  }
}

self.postMessage({
  large: lookup(NS_T_MX, buildResponse(NS_T_MX, mxRecords(40))),
  exactBuffer: lookup(NS_T_MX, buildResponse(NS_T_MX, mxRecords(30)), 1024),
  truncated: lookup(NS_T_MX, buildResponse(NS_T_MX, mxRecords(40)), 1024),
  shortMX: lookup(NS_T_MX, buildResponse(NS_T_MX, [u16(10), mxData(20)])),
  shortSRV: lookup(
    NS_T_SRV,
    buildResponse(NS_T_SRV, [[...u16(10), ...u16(20), ...u16(443)]])
  ),
});

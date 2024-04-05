/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals ctypes */

// We are in a worker, wait for our message then execute the wanted method.

import { PromiseWorker } from "resource://gre/modules/workers/PromiseWorker.mjs";

// These constants are luckily shared, but with different names
const NS_T_TXT = 16; // DNS_TYPE_TXT
const NS_T_SRV = 33; // DNS_TYPE_SRV
const NS_T_MX = 15; // DNS_TYPE_MX

/**
 * DNS API for *nix.
 */
class load_libresolv {
  library = null;

  constructor(os) {
    this._open(os);
  }

  /**
   * Tries to find and load library.
   *
   * @param {string} os - Operating System.
   */
  _open(os) {
    function findLibrary() {
      let lastException = null;
      let candidates = [];
      if (os == "FreeBSD") {
        candidates = [{ name: "c", suffix: ".7" }];
      } else if (os == "OpenBSD") {
        candidates = [{ name: "c", suffix: "" }];
      } else {
        candidates = [
          { name: "resolv.9", suffix: "" },
          { name: "resolv", suffix: ".2" },
          { name: "resolv", suffix: "" },
        ];
      }
      const tried = [];
      for (const candidate of candidates) {
        try {
          const libName = ctypes.libraryName(candidate.name) + candidate.suffix;
          tried.push(libName);
          return ctypes.open(libName);
        } catch (ex) {
          lastException = ex;
        }
      }
      throw new Error(`Couldn't find libresolv; tried: ${tried}`, {
        cause: lastException,
      });
    }

    /**
     * Declaring functions to be able to call them.
     *
     * @param {string[]} aSymbolNames - OS function names.
     * @param {*} aArgs - Arguments to the call.
     */
    function declare(aSymbolNames, ...aArgs) {
      let lastException = null;
      if (!Array.isArray(aSymbolNames)) {
        aSymbolNames = [aSymbolNames];
      }

      for (const symbolName of aSymbolNames) {
        try {
          return library.declare(symbolName, ...aArgs);
        } catch (ex) {
          lastException = ex;
        }
      }
      library.close();
      throw new Error(`Failed to declare: ${aSymbolNames}`, {
        cause: lastException,
      });
    }

    const library = (this.library = findLibrary());
    this.res_search = declare(
      ["res_9_search", "res_search", "__res_search"],
      ctypes.default_abi,
      ctypes.int,
      ctypes.char.ptr,
      ctypes.int,
      ctypes.int,
      ctypes.unsigned_char.ptr,
      ctypes.int
    );
    this.res_query = declare(
      ["res_9_query", "res_query", "__res_query"],
      ctypes.default_abi,
      ctypes.int,
      ctypes.char.ptr,
      ctypes.int,
      ctypes.int,
      ctypes.unsigned_char.ptr,
      ctypes.int
    );
    this.dn_expand = declare(
      ["res_9_dn_expand", "dn_expand", "__dn_expand"],
      ctypes.default_abi,
      ctypes.int,
      ctypes.unsigned_char.ptr,
      ctypes.unsigned_char.ptr,
      ctypes.unsigned_char.ptr,
      ctypes.char.ptr,
      ctypes.int
    );
    this.dn_skipname = declare(
      ["res_9_dn_skipname", "dn_skipname", "__dn_skipname"],
      ctypes.default_abi,
      ctypes.int,
      ctypes.unsigned_char.ptr,
      ctypes.unsigned_char.ptr
    );
    this.ns_get16 = declare(
      ["res_9_ns_get16", "ns_get16", "_getshort"],
      ctypes.default_abi,
      ctypes.unsigned_int,
      ctypes.unsigned_char.ptr
    );
    this.ns_get32 = declare(
      ["res_9_ns_get32", "ns_get32", "_getlong"],
      ctypes.default_abi,
      ctypes.unsigned_long,
      ctypes.unsigned_char.ptr
    );

    this.QUERYBUF_SIZE = 1024;
    this.NS_MAXCDNAME = 255;
    this.NS_HFIXEDSZ = 12;
    this.NS_QFIXEDSZ = 4;
    this.NS_RRFIXEDSZ = 10;
    this.NS_C_IN = 1;
  }

  close() {
    this.library.close();
    this.library = null;
  }

  /**
   * Maps record to SRVRecord, TXTRecord, or MXRecord according to aTypeID and
   * returns it.
   *
   * @param {integer} aTypeID - Type, like NS_T_MX/NS_T_SRV/NS_T_MX.
   * @param {string} aAnswer - Data.
   * @param {index} aIdx - Size, e.g. NS_HFIXEDSZ.
   * @param {integer} aLength - Data length.
   * @returns {SRVRecord|TXTRecord|MXRecord}
   */
  _mapAnswer(aTypeID, aAnswer, aIdx, aLength) {
    if (aTypeID == NS_T_SRV) {
      const prio = this.ns_get16(aAnswer.addressOfElement(aIdx));
      const weight = this.ns_get16(aAnswer.addressOfElement(aIdx + 2));
      const port = this.ns_get16(aAnswer.addressOfElement(aIdx + 4));

      const hostbuf = ctypes.char.array(this.NS_MAXCDNAME)();
      const hostlen = this.dn_expand(
        aAnswer.addressOfElement(0),
        aAnswer.addressOfElement(aLength),
        aAnswer.addressOfElement(aIdx + 6),
        hostbuf,
        this.NS_MAXCDNAME
      );
      const host = hostlen > -1 ? hostbuf.readString() : null;
      return new SRVRecord(prio, weight, host, port);
    }
    if (aTypeID == NS_T_TXT) {
      // TODO should only read dataLength characters.
      const data = ctypes.unsigned_char.ptr(aAnswer.addressOfElement(aIdx + 1));
      return new TXTRecord(data.readString());
    }
    if (aTypeID == NS_T_MX) {
      const prio = this.ns_get16(aAnswer.addressOfElement(aIdx));

      const hostbuf = ctypes.char.array(this.NS_MAXCDNAME)();
      const hostlen = this.dn_expand(
        aAnswer.addressOfElement(0),
        aAnswer.addressOfElement(aLength),
        aAnswer.addressOfElement(aIdx + 2),
        hostbuf,
        this.NS_MAXCDNAME
      );
      const host = hostlen > -1 ? hostbuf.readString() : null;
      return new MXRecord(prio, host);
    }
    return null;
  }

  /**
   * Performs a DNS query for aTypeID on a certain address (aName) and returns
   * array of records of aTypeID.
   *
   * @param {string} aName - Address.
   * @param {integer} aTypeID - Type, like NS_T_MX/NS_T_SRV/NS_T_MX.
   * @returns {SRVRecord[]|TXTRecord[]|MXRecord[]}
   */
  lookup(aName, aTypeID) {
    const qname = ctypes.char.array()(aName);
    const answer = ctypes.unsigned_char.array(this.QUERYBUF_SIZE)();
    const length = this.res_search(
      qname,
      this.NS_C_IN,
      aTypeID,
      answer,
      this.QUERYBUF_SIZE
    );

    // There is an error.
    if (length < 0) {
      return [];
    }

    const results = [];
    let idx = this.NS_HFIXEDSZ;

    const qdcount = this.ns_get16(answer.addressOfElement(4));
    const ancount = this.ns_get16(answer.addressOfElement(6));

    for (let qdidx = 0; qdidx < qdcount && idx < length; qdidx++) {
      idx +=
        this.NS_QFIXEDSZ +
        this.dn_skipname(
          answer.addressOfElement(idx),
          answer.addressOfElement(length)
        );
    }

    for (let anidx = 0; anidx < ancount && idx < length; anidx++) {
      idx += this.dn_skipname(
        answer.addressOfElement(idx),
        answer.addressOfElement(length)
      );
      const rridx = idx;
      const type = this.ns_get16(answer.addressOfElement(rridx));
      const dataLength = this.ns_get16(answer.addressOfElement(rridx + 8));

      idx += this.NS_RRFIXEDSZ;

      if (type === aTypeID) {
        const resource = this._mapAnswer(aTypeID, answer, idx, length);
        resource.type = type;
        resource.nsclass = this.ns_get16(answer.addressOfElement(rridx + 2));
        resource.ttl = this.ns_get32(answer.addressOfElement(rridx + 4)) | 0;
        results.push(resource);
      }
      idx += dataLength;
    }
    return results;
  }
}

/**
 * DNS API for Windows.
 */
class load_dnsapi {
  library = null;

  constructor() {
    this._open();
  }

  /**
   * Tries to find and load library.
   */
  _open() {
    function declare(aSymbolName, ...aArgs) {
      try {
        return library.declare(aSymbolName, ...aArgs);
      } catch (ex) {
        throw new Error(`Failed to declare: ${aSymbolName}`, { cause: ex });
      }
    }

    const library = (this.library = ctypes.open(ctypes.libraryName("DnsAPI")));

    this.DNS_SRV_DATA = ctypes.StructType("DNS_SRV_DATA", [
      { pNameTarget: ctypes.jschar.ptr },
      { wPriority: ctypes.unsigned_short },
      { wWeight: ctypes.unsigned_short },
      { wPort: ctypes.unsigned_short },
      { Pad: ctypes.unsigned_short },
    ]);

    this.DNS_TXT_DATA = ctypes.StructType("DNS_TXT_DATA", [
      { dwStringCount: ctypes.unsigned_long },
      { pStringArray: ctypes.jschar.ptr.array(1) },
    ]);

    this.DNS_MX_DATA = ctypes.StructType("DNS_MX_DATA", [
      { pNameTarget: ctypes.jschar.ptr },
      { wPriority: ctypes.unsigned_short },
      { Pad: ctypes.unsigned_short },
    ]);

    this.DNS_RECORD = ctypes.StructType("_DnsRecord");
    this.DNS_RECORD.define([
      { pNext: this.DNS_RECORD.ptr },
      { pName: ctypes.jschar.ptr },
      { wType: ctypes.unsigned_short },
      { wDataLength: ctypes.unsigned_short },
      { Flags: ctypes.unsigned_long },
      { dwTtl: ctypes.unsigned_long },
      { dwReserved: ctypes.unsigned_long },
      { Data: this.DNS_SRV_DATA }, // it's a union, can be cast to many things
    ]);

    this.PDNS_RECORD = ctypes.PointerType(this.DNS_RECORD);
    this.DnsQuery_W = declare(
      "DnsQuery_W",
      ctypes.winapi_abi,
      ctypes.long,
      ctypes.jschar.ptr,
      ctypes.unsigned_short,
      ctypes.unsigned_long,
      ctypes.voidptr_t,
      this.PDNS_RECORD.ptr,
      ctypes.voidptr_t.ptr
    );
    this.DnsRecordListFree = declare(
      "DnsRecordListFree",
      ctypes.winapi_abi,
      ctypes.void_t,
      this.PDNS_RECORD,
      ctypes.int
    );

    this.ERROR_SUCCESS = ctypes.Int64(0);
    this.DNS_QUERY_STANDARD = 0;
    this.DnsFreeRecordList = 1;
  }

  close() {
    this.library.close();
    this.library = null;
  }

  /**
   * Maps record to SRVRecord, TXTRecord, or MXRecord according to aTypeID and
   * returns it.
   *
   * @param {integer} aTypeID - Type, like NS_T_MX/NS_T_SRV/NS_T_MX.
   * @param {object} aData - Raw data to map to a specific type.
   * @returns {SRVRecord|TXTRecord|MXRecord}
   */
  _mapAnswer(aTypeID, aData) {
    if (aTypeID == NS_T_SRV) {
      const srvdata = ctypes.cast(aData, this.DNS_SRV_DATA);

      return new SRVRecord(
        srvdata.wPriority,
        srvdata.wWeight,
        srvdata.pNameTarget.readString(),
        srvdata.wPort
      );
    }
    if (aTypeID == NS_T_TXT) {
      const txtdata = ctypes.cast(aData, this.DNS_TXT_DATA);
      if (txtdata.dwStringCount > 0) {
        return new TXTRecord(txtdata.pStringArray[0].readString());
      }
    }
    if (aTypeID == NS_T_MX) {
      const mxdata = ctypes.cast(aData, this.DNS_MX_DATA);

      return new MXRecord(mxdata.wPriority, mxdata.pNameTarget.readString());
    }
    return null;
  }

  /**
   * Performs a DNS query for aTypeID on a certain address (aName) and returns
   * array of records of aTypeID (e.g. SRVRecord, TXTRecord, or MXRecord).
   *
   * @param {string} aName - Address.
   * @param {integer} aTypeID - Type, like NS_T_MX/NS_T_SRV/NS_T_MX.
   * @returns {SRVRecord[]|TXTRecord[]|MXRecord[]}
   */
  lookup(aName, aTypeID) {
    const queryResultsSet = this.PDNS_RECORD();
    const qname = ctypes.jschar.array()(aName);
    const dnsStatus = this.DnsQuery_W(
      qname,
      aTypeID,
      this.DNS_QUERY_STANDARD,
      null,
      queryResultsSet.address(),
      null
    );

    // There is an error.
    if (ctypes.Int64.compare(dnsStatus, this.ERROR_SUCCESS) != 0) {
      return [];
    }

    const results = [];
    for (
      let presult = queryResultsSet;
      presult && !presult.isNull();
      presult = presult.contents.pNext
    ) {
      const result = presult.contents;
      if (result.wType == aTypeID) {
        const resource = this._mapAnswer(aTypeID, result.Data);
        resource.type = result.wType;
        resource.nsclass = 0;
        resource.ttl = result.dwTtl | 0;
        results.push(resource);
      }
    }

    this.DnsRecordListFree(queryResultsSet, this.DnsFreeRecordList);
    return results;
  }
}

/**
 * Represents and SRV record.
 * Used to make results of different libraries consistent for SRV queries.
 *
 * @param {integer} prio
 * @param {integer} weight
 * @param {string} host
 * @param {?integer} port
 */
function SRVRecord(prio, weight, host, port) {
  this.prio = prio;
  this.weight = weight;
  this.host = host.toLowerCase();
  this.port = port;
}

/**
 * Represents a TXT record.
 * Used to make results of different libraries consistent for TXT queries.
 *
 * @param {string} data
 */
function TXTRecord(data) {
  this.data = data;
}

/**
 * Represents an MX record.
 * Used to make results of different libraries consistent for MX queries.
 *
 * @param {integer} prio
 * @param {string} host
 */
function MXRecord(prio, host) {
  this.prio = prio;
  this.host = host.toLowerCase();
}

const worker = new PromiseWorker.AbstractWorker();
worker.dispatch = (method, args = []) => {
  return worker[method](...args); // Call worker.execute()
};
worker.execute = (os, method, args) => {
  const DNS = os == "WINNT" ? new load_dnsapi() : new load_libresolv(os);
  return DNS[method].apply(DNS, args);
};
worker.postMessage = function (...args) {
  self.postMessage(...args);
};
worker.close = function () {
  self.close();
};
self.addEventListener("message", msg => worker.handleMessage(msg));

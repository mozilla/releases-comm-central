/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * This module provides DNS query functionality via subprocesses.
 * Supported record types: MX, SRV
 *
 * The following tools are currently supported:
 *   Windows:    nslookup
 *   Unix/Linux: dig, kdig, host, nslookup
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailDns"];

const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;

const RESTYPE_WIN_NLSOOKUP = 1;
const RESTYPE_UNIX_NLSOOKUP = 2;
const RESTYPE_DIG = 3;
const RESTYPE_HOST = 4;
const RESTYPE_NOT_AVAILABLE = 99;

var gHandler = null,
  gResolverExecutable = null;

var EnigmailDns = {
  /**
   * Perform a DNS lookup
   *
   * @param {String} recordType: The resource record type to query. MX and SRV are currently supported.
   * @param {String} queryName:  The name to search for, e.g. "enigmail.net"
   *
   * @return {Promise<Array{String}>}: array of server(s) handling
   *
   */
  lookup: async function(recordType, queryName) {
    EnigmailLog.DEBUG(`dns.jsm: lookup(${recordType}, ${queryName})\n`);
    if (!determineResolver()) return null;

    switch (recordType.toUpperCase()) {
      case "MX":
      case "SRV":
        break;
      default:
        throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    }
    let dnsHandler = new gHandler(gResolverExecutable);
    return dnsHandler.execute(recordType, queryName);
  }
};

/**
 * Determine the DNS resolver tool to use (e.g. dig, nslookup)
 *
 * @return {Boolean}: true: tool found / false: no tool found
 */

function determineResolver() {
  if (!gHandler) {
    gHandler = GenericHandler;
    if (EnigmailOS.isWin32) {
      gResolverExecutable = EnigmailFiles.resolvePathWithEnv("nslookup");
      if (gResolverExecutable) {
        EnigmailLog.DEBUG(`dns.jsm: determineResolver: executable = ${gResolverExecutable.path}\n`);
        gHandler = NsLookupHandler_Windows;
      }
    }
    else {
      determineLinuxResolver();
    }

    if (!gResolverExecutable) EnigmailLog.DEBUG(`dns.jsm: determineResolver: no executable found\n`);

  }

  return gHandler !== GenericHandler;
}


function determineLinuxResolver() {
  EnigmailLog.DEBUG(`dns.jsm: determineLinuxResolver()\n`);
  const services = [{
    exe: "dig",
    class: DigHandler
  }, {
    exe: "kdig",
    class: DigHandler
  }, {
    exe: "host",
    class: HostHandler
  }, {
    exe: "nslookup",
    class: NsLookupHandler
  }];

  for (let i of services) {
    gResolverExecutable = EnigmailFiles.resolvePathWithEnv(i.exe);
    if (gResolverExecutable) {
      EnigmailLog.DEBUG(`dns.jsm: determineLinuxResolver: found ${i.class.handlerType}\n`);

      gHandler = i.class;
      return;
    }
  }
}

/**
 * Base class for executing DNS requests
 */
class GenericHandler {
  constructor(handlerFile) {
    this._handlerFile = handlerFile;
    this.recordType = "";
    this.hostName = "";
  }

  getCmdArgs() {
    return [];
  }

  execute(recordType, hostName) {
    return new Promise((resolve, reject) => {

      this.recordType = recordType.toUpperCase();
      this.hostName = hostName;
      let args = this.getCmdArgs();

      if (args.length === 0) {
        resolve([]);
        return;
      }

      let stdoutData = "",
        stderrData = "";
      let self = this;

      EnigmailLog.DEBUG(`dns.jsm: execute(): launching ${EnigmailFiles.formatCmdLine(this._handlerFile, args)}\n`);

      subprocess.call({
        command: this._handlerFile,
        arguments: args,
        environment: EnigmailCore.getEnvList(),
        charset: null,
        stdout: function(data) {
          //EnigmailLog.DEBUG(`dns.jsm: execute.stdout: got data ${data}\n`);
          stdoutData += data;
        },
        stderr: function(data) {
          //EnigmailLog.DEBUG(`dns.jsm: execute.stderr: got data ${data}\n`);
          stderrData += data;
        },
        done: function(result) {
          EnigmailLog.DEBUG(`dns.jsm: execute.done(${result.exitCode})\n`);
          try {
            if (result.exitCode === 0) {
              resolve(self.parseResult(stdoutData));
            }
            else {
              resolve([]);
            }
          }
          catch (ex) {
            reject(ex);
          }
        },
        mergeStderr: false
      });
    });
  }

  parseResult() {
    return [];
  }
}

/**
 * Handler class for "dig" and "kdig"
 */
class DigHandler extends GenericHandler {
  constructor(handlerFile) {
    super(handlerFile);
    this.handlerType = "dig";
  }

  getCmdArgs() {
    return ["-t", this.recordType, "+short", this.hostName];
  }

  parseResult(stdoutData) {
    let hosts = [];
    let lines = stdoutData.split(/[\r\n]+/);

    if (this.recordType === "MX") {
      for (let i = 0; i < lines.length; i++) {
        let m = lines[i].match(/^(\d+ )(.*)\./);

        if (m && m.length >= 3) hosts.push(m[2]);
      }
    }
    else if (this.recordType === "SRV") {
      for (let i = 0; i < lines.length; i++) {
        let m = lines[i].match(/^(\d+) (\d+) (\d+) ([^ ]+)\.$/);

        if (m && m.length >= 5) hosts.push(m[4] + ":" + m[3]);
      }
    }

    return hosts;
  }
}

/**
 * Handler class for "host"
 */

class HostHandler extends GenericHandler {
  constructor(handlerFile) {
    super(handlerFile);
    this.handlerType = "host";
  }

  getCmdArgs() {
    return ["-t", this.recordType, this.hostName];
  }

  parseResult(stdoutData) {
    if (stdoutData.search(/3\(NXDOMAIN\)/) >= 0) return [];

    let hosts = [];
    let lines = stdoutData.split(/[\r\n]+/);

    if (this.recordType === "MX") {
      for (let i = 0; i < lines.length; i++) {
        let m = lines[i].match(/^(.* )([^ ]+)\.$/);

        if (m && m.length >= 3) hosts.push(m[2]);
      }
    }
    else if (this.recordType === "SRV") {
      for (let i = 0; i < lines.length; i++) {
        let m = lines[i].match(/^(.*) (\d+) ([^ ]+)\.$/);

        if (m && m.length >= 4) hosts.push(m[3] + ":" + m[2]);
      }
    }

    return hosts;
  }
}

/**
 * Handler class for "nslookup" (on Linux/Unix)
 */

class NsLookupHandler extends GenericHandler {
  constructor(handlerFile) {
    super(handlerFile);
    this.handlerType = "nslookup";
  }

  getCmdArgs() {
    return ["-type=" + this.recordType, this.hostName];
  }

  parseResult(stdoutData) {
    let hosts = [];
    let lines = stdoutData.split(/[\r\n]+/);

    if (lines.length > 3 && lines[3].search(/: NXDOMAIN/) > 0) return [];

    if (this.recordType === "MX") {
      let reg = new RegExp("^" + this.hostName.toLowerCase() + "(.* )([^ \t]+.*[^\.])\\.?$");
      for (let i = 2; i < lines.length; i++) {
        let m = lines[i].match(reg);

        if (m && m.length >= 3) hosts.push(m[2]);
        if (lines[i].length < 5) break;
      }
    }
    else if (this.recordType === "SRV") {
      for (let i = 2; i < lines.length; i++) {
        let m = lines[i].match(/^(.*) (\d+) ([^ ]+)\.$/);

        if (m && m.length >= 3) hosts.push(m[3] + ":" + m[2]);
        if (lines[i].length < 5) break;
      }
    }

    return hosts;
  }
}

/**
 * Handler class for "nslookup" on Windows
 */

class NsLookupHandler_Windows extends NsLookupHandler {

  parseResult(stdoutData) {
    let hosts = [];
    let lines = stdoutData.split(/[\r\n]+/);

    if (this.recordType === "MX") {
      let reg = new RegExp("^" + this.hostName.toLowerCase() + "(.* )([^ \t]+.*[^\.])\\.?$");
      for (let i = 2; i < lines.length; i++) {
        let m = lines[i].match(reg);

        if (m && m.length >= 3) hosts.push(m[2]);
        if (lines[i].length < 5) break;
      }
    }
    else if (this.recordType === "SRV") {
      let svc = null;
      for (let i = 2; i < lines.length; i++) {
        if (lines[i].search(/SRV service location:$/) > 0) {
          svc = null;
          continue;
        }

        let m = lines[i].match(/^[\t ]+(port|svr hostname)([\t =]+)([^ \t]+)$/);

        if (m && m.length >= 4) {
          if (m[1] === "port" && svc === null) {
            svc = m[3];
          }
          else if (m[1] === "svr hostname" && svc) {
            hosts.push(m[3] + ":" + svc);
          }
        }
        if (lines[i].length < 5) break;
      }
    }

    return hosts;
  }
}

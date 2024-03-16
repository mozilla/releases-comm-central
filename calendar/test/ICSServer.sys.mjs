/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

import { CommonUtils } from "resource://services-common/utils.sys.mjs";
import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

export var ICSServer = {
  server: null,
  isOpen: false,

  ics: "",
  etag: "",
  open(username, password) {
    this.server = new HttpServer();
    this.server.start(-1);
    this.isOpen = true;

    this.username = username;
    this.password = password;
    this.server.registerPathHandler("/ping", this.ping);
    this.server.registerPathHandler(this.path, this.handleICS.bind(this));

    this.reset();
  },

  reset() {
    this.ics = "";
    this.etag = "";
  },

  close() {
    if (!this.isOpen) {
      return Promise.resolve();
    }
    return new Promise(resolve =>
      this.server.stop({
        onStopped: () => {
          this.isOpen = false;
          resolve();
        },
      })
    );
  },

  get origin() {
    return `http://localhost:${this.server.identity.primaryPort}`;
  },

  get path() {
    return "/test.ics";
  },

  get url() {
    return `${this.origin}${this.path}`;
  },

  get altPath() {
    return "/addressbooks/me/default/";
  },

  get altURL() {
    return `${this.origin}${this.altPath}`;
  },

  checkAuth(request, response) {
    if (!this.username || !this.password) {
      return true;
    }
    if (!request.hasHeader("Authorization")) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return false;
    }

    const value = request.getHeader("Authorization");
    if (!value.startsWith("Basic ")) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return false;
    }

    const [username, password] = atob(value.substring(6)).split(":");
    if (username != this.username || password != this.password) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return false;
    }

    return true;
  },

  ping(request, response) {
    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("pong");
  },

  handleICS(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    switch (request.method) {
      case "HEAD":
        this.headICS(request, response);
        return;
      case "GET":
        this.getICS(request, response);
        return;
      case "PUT":
        this.putICS(request, response);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 405, "Method Not Allowed");
    response.setHeader("Content-Type", "text/plain");
    response.write(`Method not allowed: ${request.method}`);
  },

  headICS(request, response) {
    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "text/calendar");
    response.setHeader("ETag", this.etag);
  },

  getICS(request, response) {
    this.headICS(request, response);
    response.write(this.ics);
  },

  async putICS(request, response) {
    response.processAsync();

    await this.putICSInternal(CommonUtils.readBytesFromInputStream(request.bodyInputStream));

    response.setStatusLine("1.1", 204, "No Content");
    response.setHeader("ETag", this.etag);

    response.finish();
  },

  async putICSInternal(ics) {
    this.ics = ics;

    const hash = await crypto.subtle.digest("sha-1", new TextEncoder().encode(this.ics));
    this.etag = Array.from(new Uint8Array(hash), c => c.toString(16).padStart(2, "0")).join("");
  },
};

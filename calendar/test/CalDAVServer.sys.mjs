/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const PREFIX_BINDINGS = {
  c: "urn:ietf:params:xml:ns:caldav",
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  cs: "http://calendarserver.org/ns/",
  d: "DAV:",
  // eslint-disable-next-line @microsoft/sdl/no-insecure-url
  i: "http://apple.com/ns/ical/",
};
const NAMESPACE_STRING = Object.entries(PREFIX_BINDINGS)
  .map(([prefix, url]) => `xmlns:${prefix}="${url}"`)
  .join(" ");

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { CommonUtils } from "resource://services-common/utils.sys.mjs";
import { HttpServer } from "resource://testing-common/httpd.sys.mjs";

const logger = console.createInstance({
  prefix: "CalDAVServer",
  maxLogLevel: "Log",
});

// The response bodies Google sends if you exceed its rate limit.
const MULTIGET_RATELIMIT_ERROR = `<?xml version="1.0" encoding="UTF-8"?>
<D:error xmlns:D="DAV:"/>
`;
const PROPFIND_RATELIMIT_ERROR = `<?xml version="1.0" encoding="UTF-8"?>
<errors xmlns="http://schemas.google.com/g/2005">
 <error>
  <domain>GData</domain>
  <code>rateLimitExceeded</code>
  <internalReason>Some text we're not looking at anyway</internalReason>
 </error>
</errors>
`;

export var CalDAVServer = {
  users: new Map(),
  items: new Map(),
  deletedItems: new Map(),
  changeCount: 0,
  server: null,
  isOpen: false,

  /**
   * The "current-user-privilege-set" in responses. Set to null to have no privilege set.
   */
  privileges: "<d:privilege><d:all/></d:privilege>",

  open(username, password) {
    this.server = new HttpServer();
    this.server.start(-1);
    this.port = this.server.identity.primaryPort;
    this.isOpen = true;

    this.users.set(username, password);
    this.server.registerPathHandler("/ping", this.ping);

    this.reset();
  },

  reset() {
    this.items.clear();
    this.deletedItems.clear();
    this.changeCount = 0;
    this.privileges = "<d:privilege><d:all/></d:privilege>";
    this.resetHandlers();
  },

  resetHandlers() {
    this.server.registerPathHandler("/.well-known/caldav", this.wellKnown.bind(this));
    this.server.registerPathHandler("/principals/", this.principals.bind(this));
    for (const username of this.users.keys()) {
      this.server.registerPathHandler(`/principals/${username}/`, this.myPrincipal.bind(this));
      this.server.registerPathHandler(`/calendars/${username}/`, this.myCalendars.bind(this));
      this.server.registerPathHandler(
        `/calendars/${username}/test/`,
        this.directoryHandler.bind(this)
      );
      this.server.registerPrefixHandler(
        `/calendars/${username}/test/`,
        this.itemHandler.bind(this)
      );
    }
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

  addUser(username, password) {
    this.users.set(username, password);
    this.resetHandlers();
  },

  checkAuth(request, response) {
    logger.log(`Checking authorization for ${request.method} ${request.path}`);

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
    const pathUsername = request.path.split("/")[2];
    if (
      (pathUsername && username != pathUsername) ||
      !this.users.has(username) ||
      password != this.users.get(username)
    ) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return false;
    }

    request.username = username;
    return true;
  },

  ping(request, response) {
    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "text/plain");
    response.write("pong");
  },

  wellKnown(request, response) {
    response.setStatusLine("1.1", 301, "Moved Permanently");
    response.setHeader("Location", "/principals/");
  },

  principals(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    const input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    const propNames = this._inputProps(input);
    const propValues = {
      "d:current-user-principal": `<href>/principals/${request.username}/</href>`,
    };

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/principals/</href>
          ${this._outputProps(propNames, propValues)}
        </response>
      </multistatus>`.replace(/>\s+</g, "><")
    );
  },

  myPrincipal(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    const input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    const propNames = this._inputProps(input);
    const propValues = {
      "d:resourcetype": "<principal/>",
      "c:calendar-home-set": `<d:href>/calendars/${request.username}/</d:href>`,
      "c:calendar-user-address-set": `<d:href preferred="1">mailto:${request.username}@invalid</d:href>`,
      "c:schedule-inbox-URL": `<d:href>/calendars/${request.username}/inbox/</d:href>`,
      "c:schedule-outbox-URL": `<d:href>/calendars/${request.username}/outbox/</d:href>`,
    };

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/principals/${request.username}/</href>
          ${this._outputProps(propNames, propValues)}
        </response>
      </multistatus>`.replace(/>\s+</g, "><")
    );
  },

  myCalendars(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    if (request.method == "OPTIONS") {
      response.setStatusLine("1.1", 200, "OK");
      response.setHeader("DAV", "1,2,3, calendar-access, calendar-schedule");
      return;
    }

    const input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    const propNames = this._inputProps(input);
    const propValues = {
      "d:resourcetype": "<collection/><c:calendar/>",
      "d:displayname": "CalDAV Test",
      "i:calendar-color": "#ff8000",
      "d:current-user-privilege-set": this.privileges,
    };

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/calendars/${request.username}/</href>
          ${this._outputProps(propNames, {
            "d:resourcetype": "<collection/>",
            "d:displayname": "#calendars",
          })}
        </response>
        <response>
          <href>/calendars/${request.username}/test/</href>
          ${this._outputProps(propNames, propValues)}
        </response>
      </multistatus>`.replace(/>\s+</g, "><")
    );
  },

  /** Handle any requests to the calendar itself. */

  directoryHandler(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    if (request.method == "OPTIONS") {
      response.setStatusLine("1.1", 204, "No Content");
      return;
    }

    let input = CommonUtils.readBytesFromInputStream(request.bodyInputStream);
    logger.log("C: " + input);
    input = new DOMParser().parseFromString(input, "text/xml");

    switch (input.documentElement.localName) {
      case "calendar-query":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.c);
        this.calendarQuery(input, request, response);
        return;
      case "calendar-multiget":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.c);
        this.calendarMultiGet(input, request, response);
        return;
      case "propfind":
        Assert.equal(request.method, "PROPFIND");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.propFind(input, request, response);
        return;
      case "sync-collection":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.syncCollection(input, request, response);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 404, "Not Found");
    response.setHeader("Content-Type", "text/plain");
    response.write(`No handler found for <${input.documentElement.localName}>`);
  },

  calendarQuery(input, request, response) {
    const propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (const [href, item] of this.items) {
      if (href.startsWith(request.path)) {
        output += this._itemResponse(href, item, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
    logger.log("S: " + output.replace(/>\s+</g, "><"));
  },

  async calendarMultiGet(input, request, response) {
    const propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let href of input.querySelectorAll("href")) {
      href = href.textContent;
      if (href.startsWith(request.path)) {
        const item = this.items.get(href);
        if (item) {
          output += this._itemResponse(href, item, propNames);
        }
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
    logger.log("S: " + output.replace(/>\s+</g, "><"));
  },

  propFind(input, request, response) {
    if (this.throwRateLimitErrors) {
      response.setStatusLine("1.1", 403, "Forbidden");
      response.setHeader("Content-Type", "text/xml");
      response.write(PROPFIND_RATELIMIT_ERROR);
      logger.log("S: " + PROPFIND_RATELIMIT_ERROR);
      return;
    }

    const propNames = this._inputProps(input);
    const propValues = {
      "d:resourcetype": "<d:collection/><c:calendar/>",
      "d:owner": `/principals/${request.username}/`,
      "d:current-user-principal": `<href>/principals/${request.username}/</href>`,
      "d:current-user-privilege-set": this.privileges,
      "d:supported-report-set":
        "<d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report>" +
        "<d:supported-report><d:report><sync-collection/></d:report></d:supported-report>",
      "c:supported-calendar-component-set": "",
      "d:getcontenttype": "text/calendar; charset=utf-8",
      "c:calendar-home-set": `<d:href>/calendars/${request.username}/</d:href>`,
      "c:calendar-user-address-set": `<d:href preferred="1">mailto:${request.username}@invalid</d:href>`,
      "c:schedule-inbox-url": `<d:href>/calendars/${request.username}/inbox/</d:href>`,
      "c:schedule-outbox-url": `<d:href>/calendars/${request.username}/outbox/</d:href>`,
      "cs:getctag": this.changeCount,
      "d:getetag": this.changeCount,
    };

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <response>
        <href>/calendars/${request.username}/test/</href>
        ${this._outputProps(propNames, propValues)}
      </response>`;
    const depth = request.hasHeader("Depth") ? request.getHeader("Depth") : 0;
    if (depth == 1) {
      for (const [href, item] of this.items) {
        if (href.startsWith(request.path)) {
          output += this._itemResponse(href, item, propNames);
        }
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
    logger.log("S: " + output.replace(/>\s+</g, "><"));
  },

  syncCollection(input, request, response) {
    if (this.throwRateLimitErrors) {
      response.setStatusLine("1.1", 403, "Forbidden");
      response.setHeader("Content-Type", "text/xml");
      response.write(MULTIGET_RATELIMIT_ERROR);
      logger.log("S: " + MULTIGET_RATELIMIT_ERROR);
      return;
    }

    // The maximum number of responses to make at any one request.
    const pageSize = 3;
    // The last-seen token. Changes before this won't be returned.
    let token = 0;
    // Which page of responses to return.
    let page = 0;

    const tokenStr = input.querySelector("sync-token")?.textContent.replace(/.*\//g, "");
    if (tokenStr?.includes("#")) {
      [token, page] = tokenStr.split("#");
      token = parseInt(token, 10);
      page = parseInt(page, 10);
    } else if (tokenStr) {
      token = parseInt(tokenStr, 10);
    }

    const nextPage = page + 1;

    // Collect all responses, even if we know some won't be returned.
    // This is a test, who cares about performance?
    const propNames = this._inputProps(input);
    const responses = [];
    for (const [href, item] of this.items) {
      if (href.startsWith(request.path) && item.changed > token) {
        responses.push(this._itemResponse(href, item, propNames));
      }
    }
    for (const [href, deleted] of this.deletedItems) {
      if (href.startsWith(request.path) && deleted > token) {
        responses.push(`<response>
          <status>HTTP/1.1 404 Not Found</status>
          <href>${href}</href>
          <propstat>
            <prop/>
            <status>HTTP/1.1 418 I'm a teapot</status>
          </propstat>
        </response>`);
      }
    }

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    // Use only the responses that match those requested.
    output += responses.slice(page * pageSize, nextPage * pageSize).join("");
    if (responses.length > nextPage * pageSize) {
      output += `<response>
          <status>HTTP/1.1 507 Insufficient Storage</status>
          <href>/calendars/${request.username}/test/</href>
        </response>`;
      output += `<sync-token>http://mochi.test/sync/${token}#${nextPage}</sync-token>`;
    } else {
      output += `<sync-token>http://mochi.test/sync/${this.changeCount}</sync-token>`;
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
    logger.log("S: " + output.replace(/>\s+</g, "><"));
  },

  _itemResponse(href, item, propNames) {
    const propValues = {
      "c:calendar-data": item.ics,
      "d:getetag": item.etag,
      "d:getcontenttype": "text/calendar; charset=utf-8; component=VEVENT",
    };

    const outString = `<response>
      <href>${href}</href>
      ${this._outputProps(propNames, propValues)}
    </response>`;
    return outString;
  },

  _inputProps(input) {
    const props = input.querySelectorAll("prop > *");
    const propNames = [];

    for (const p of props) {
      Assert.equal(p.childElementCount, 0);
      switch (p.localName) {
        case "calendar-home-set":
        case "calendar-user-address-set":
        case "schedule-inbox-URL":
        case "schedule-outbox-URL":
        case "supported-calendar-component-set":
        case "calendar-data":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.c);
          propNames.push(`c:${p.localName}`);
          break;
        case "getctag":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.cs);
          propNames.push(`cs:${p.localName}`);
          break;
        case "getetag":
        case "owner":
        case "current-user-principal":
        case "current-user-privilege-set":
        case "supported-report-set":
        case "displayname":
        case "resourcetype":
        case "sync-token":
        case "getcontenttype":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.d);
          propNames.push(`d:${p.localName}`);
          break;
        case "calendar-color":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.i);
          propNames.push(`i:${p.localName}`);
          break;
        default:
          Assert.report(true, undefined, undefined, `Unknown property requested: ${p.nodeName}`);
          break;
      }
    }

    return propNames;
  },

  _outputProps(propNames, propValues) {
    let output = "";

    const found = [];
    const notFound = [];
    for (const p of propNames) {
      if (p in propValues && propValues[p] != null) {
        found.push(`<${p}>${propValues[p]}</${p}>`);
      } else {
        notFound.push(`<${p}/>`);
      }
    }

    if (found.length > 0) {
      output += `<propstat>
        <prop>
          ${found.join("\n")}
        </prop>
        <status>HTTP/1.1 200 OK</status>
      </propstat>`;
    }
    if (notFound.length > 0) {
      output += `<propstat>
        <prop>
          ${notFound.join("\n")}
        </prop>
        <status>HTTP/1.1 404 Not Found</status>
      </propstat>`;
    }

    return output;
  },

  /** Handle any requests to calendar items. */

  itemHandler(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    if (!/\/[\w-]+\.ics$/.test(request.path)) {
      response.setStatusLine("1.1", 404, "Not Found");
      response.setHeader("Content-Type", "text/plain");
      response.write(`Item not found at ${request.path}`);
      return;
    }

    switch (request.method) {
      case "GET":
        this.getItem(request, response);
        return;
      case "PUT":
        this.putItem(request, response);
        return;
      case "DELETE":
        this.deleteItem(request, response);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 405, "Method Not Allowed");
    response.setHeader("Content-Type", "text/plain");
    response.write(`Method not allowed: ${request.method}`);
  },

  async getItem(request, response) {
    const item = this.items.get(request.path);
    if (!item) {
      response.setStatusLine("1.1", 404, "Not Found");
      response.setHeader("Content-Type", "text/plain");
      response.write(`Item not found at ${request.path}`);
      return;
    }

    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "text/calendar");
    response.setHeader("ETag", item.etag);
    response.write(item.ics);
  },

  async putItem(request, response) {
    if (request.hasHeader("If-Match")) {
      const item = this.items.get(request.path);
      if (!item || item.etag != request.getHeader("If-Match")) {
        response.setStatusLine("1.1", 412, "Precondition Failed");
        return;
      }
    }

    response.processAsync();

    const ics = CommonUtils.readBytesFromInputStream(request.bodyInputStream);
    await this.putItemInternal(request.path, ics);
    response.setStatusLine("1.1", 204, "No Content");

    response.finish();
  },

  async putItemInternal(name, ics) {
    const hash = await crypto.subtle.digest("sha-1", new TextEncoder().encode(ics));
    const etag = Array.from(new Uint8Array(hash), c => c.toString(16).padStart(2, "0")).join("");
    this.items.set(name, { etag, ics, changed: ++this.changeCount });
    this.deletedItems.delete(name);
  },

  deleteItem(request, response) {
    this.deleteItemInternal(request.path);
    response.setStatusLine("1.1", 204, "No Content");
  },

  deleteItemInternal(name) {
    this.items.delete(name);
    this.deletedItems.set(name, ++this.changeCount);
  },
};

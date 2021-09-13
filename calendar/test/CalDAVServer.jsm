/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CalDAVServer"];

Cu.importGlobalProperties(["crypto"]);

const PREFIX_BINDINGS = {
  c: "urn:ietf:params:xml:ns:caldav",
  cs: "http://calendarserver.org/ns/",
  d: "DAV:",
  i: "http://apple.com/ns/ical/",
};
const NAMESPACE_STRING = Object.entries(PREFIX_BINDINGS)
  .map(([prefix, url]) => `xmlns:${prefix}="${url}"`)
  .join(" ");

const { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
const { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
const { HttpServer } = ChromeUtils.import("resource://testing-common/httpd.js");

var CalDAVServer = {
  items: new Map(),
  deletedItems: new Map(),
  changeCount: 0,
  server: null,
  isOpen: false,

  open(username, password) {
    this.server = new HttpServer();
    this.server.start(-1);
    this.isOpen = true;

    this.username = username;
    this.password = password;
    this.server.registerPathHandler("/ping", this.ping);

    this.reset();
  },

  reset() {
    this.items.clear();
    this.deletedItems.clear();
    this.changeCount = 0;
    this.resetHandlers();
  },

  resetHandlers() {
    this.server.registerPathHandler("/.well-known/caldav", this.wellKnown.bind(this));
    this.server.registerPathHandler("/principals/", this.principals.bind(this));
    this.server.registerPathHandler("/principals/me/", this.myPrincipal.bind(this));
    this.server.registerPathHandler("/calendars/me/", this.myCalendars.bind(this));

    this.server.registerPathHandler(this.path, this.directoryHandler.bind(this));
    this.server.registerPrefixHandler(this.path, this.itemHandler.bind(this));
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
    return "/calendars/me/test/";
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

    let value = request.getHeader("Authorization");
    if (!value.startsWith("Basic ")) {
      response.setStatusLine("1.1", 401, "Unauthorized");
      response.setHeader("WWW-Authenticate", `Basic realm="test"`);
      return false;
    }

    let [username, password] = atob(value.substring(6)).split(":");
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

  wellKnown(request, response) {
    response.setStatusLine("1.1", 301, "Moved Permanently");
    response.setHeader("Location", "/principals/");
  },

  principals(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    let propNames = this._inputProps(input);
    let propValues = {
      "d:current-user-principal": "<href>/principals/me/</href>",
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

    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    let propNames = this._inputProps(input);
    let propValues = {
      "d:resourcetype": "<principal/>",
      "c:calendar-home-set": "<href>/calendars/me/</href>",
    };

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/principals/me/</href>
          ${this._outputProps(propNames, propValues)}
        </response>
      </multistatus>`.replace(/>\s+</g, "><")
    );
  },

  myCalendars(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    let propNames = this._inputProps(input);

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(
      `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/addressbooks/me/</href>
          ${this._outputProps(propNames, {
            "d:resourcetype": "<collection/>",
            "d:displayname": "#calendars",
          })}
        </response>
        <response>
          <href>${this.path}</href>
          ${this._outputProps(propNames, {
            "d:resourcetype": "<collection/><c:calendar/>",
            "d:displayname": "CalDAV Test",
            "i:calendar-color": "#ff8000",
          })}
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

    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    switch (input.documentElement.localName) {
      case "calendar-query":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.c);
        this.calendarQuery(input, response);
        return;
      case "calendar-multiget":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.c);
        this.calendarMultiGet(input, response);
        return;
      case "propfind":
        Assert.equal(request.method, "PROPFIND");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.propFind(input, request.hasHeader("Depth") ? request.getHeader("Depth") : 0, response);
        return;
      case "sync-collection":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.syncCollection(input, response);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 404, "Not Found");
    response.setHeader("Content-Type", "text/plain");
    response.write(`No handler found for <${input.documentElement.localName}>`);
  },

  calendarQuery(input, response) {
    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let [href, item] of this.items) {
      output += this._itemResponse(href, item, propNames);
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  async calendarMultiGet(input, response) {
    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let href of input.querySelectorAll("href")) {
      href = href.textContent;
      let item = this.items.get(href);
      if (item) {
        output += this._itemResponse(href, item, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  propFind(input, depth, response) {
    let propNames = this._inputProps(input);

    let propValues = {
      "d:resourcetype": "<d:collection/><c:calendar/>",
      "d:owner": "/principals/me/",
      "d:current-user-principal": "/principals/me/",
      "d:current-user-privilege-set": "<d:privilege><d:all/></d:privilege>",
      "d:supported-report-set":
        "<d:supported-report><d:report><c:calendar-multiget/></d:report></d:supported-report>",
      "c:supported-calendar-component-set": "",
      "d:getcontenttype": "text/calendar; charset=utf-8",
      "c:calendar-home-set": `<d:href>/calendars/me/</d:href>`,
      "c:calendar-user-address-set": `<d:href preferred="1">mailto:me@invalid</d:href>`,
      "c:schedule-inbox-url": `<d:href>/calendars/me/inbox/</d:href>`,
      "c:schedule-outbox-url": `<d:href>/calendars/me/outbox/</d:href>`,
      "cs:getctag": this.changeCount,
      "d:getetag": this.changeCount,
    };

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <response>
        <href>${this.path}</href>
        ${this._outputProps(propNames, propValues)}
      </response>`;
    if (depth == 1) {
      for (let [href, item] of this.items) {
        output += this._itemResponse(href, item, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  syncCollection(input, response) {
    let token = input.querySelector("sync-token").textContent.replace(/\D/g, "");
    let propNames = this._inputProps(input);

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let [href, item] of this.items) {
      if (item.changed > token) {
        output += this._itemResponse(href, item, propNames);
      }
    }
    for (let [href, deleted] of this.deletedItems) {
      if (deleted > token) {
        output += `<response>
          <status>HTTP/1.1 404 Not Found</status>
          <href>${href}</href>
          <propstat>
            <prop/>
            <status>HTTP/1.1 418 I'm a teapot</status>
          </propstat>
        </response>`;
      }
    }
    output += `<sync-token>http://mochi.test/sync/${this.changeCount}</sync-token>
    </multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  _itemResponse(href, item, propNames) {
    let propValues = {
      "c:calendar-data": item.ics,
      "d:getetag": item.etag,
      "d:getcontenttype": "text/calendar; charset=utf-8; component=VEVENT",
    };

    let outString = `<response>
      <href>${href}</href>
      ${this._outputProps(propNames, propValues)}
    </response>`;
    return outString;
  },

  _inputProps(input) {
    let props = input.querySelectorAll("prop > *");
    let propNames = [];

    for (let p of props) {
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

    let found = [];
    let notFound = [];
    for (let p of propNames) {
      if (p in propValues) {
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
    let item = this.items.get(request.path);
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
      let item = this.items.get(request.path);
      if (!item || item.etag != request.getHeader("If-Match")) {
        response.setStatusLine("1.1", 412, "Precondition Failed");
        return;
      }
    }

    response.processAsync();

    let ics = CommonUtils.readBytesFromInputStream(request.bodyInputStream);
    await this.putItemInternal(request.path, ics);
    response.setStatusLine("1.1", 204, "No Content");

    response.finish();
  },

  async putItemInternal(name, ics) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }

    let hash = await crypto.subtle.digest("sha-1", new TextEncoder().encode(ics));
    let etag = Array.from(new Uint8Array(hash), c => c.toString(16).padStart(2, "0")).join("");
    this.items.set(name, { etag, ics, changed: ++this.changeCount });
    this.deletedItems.delete(name);
  },

  deleteItem(request, response) {
    this.deleteItemInternal(request.path);
    response.setStatusLine("1.1", 204, "No Content");
  },

  deleteItemInternal(name) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }
    this.items.delete(name);
    this.deletedItems.set(name, ++this.changeCount);
  },
};

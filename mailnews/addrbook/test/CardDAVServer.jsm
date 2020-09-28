/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CardDAVServer"];

const PREFIX_BINDINGS = {
  card: "urn:ietf:params:xml:ns:carddav",
  cs: "http://calendarserver.org/ns/",
  d: "DAV:",
};
const NAMESPACE_STRING = Object.entries(PREFIX_BINDINGS)
  .map(([prefix, url]) => `xmlns:${prefix}="${url}"`)
  .join(" ");

const { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
const { CommonUtils } = ChromeUtils.import(
  "resource://services-common/utils.js"
);
const { HttpServer } = ChromeUtils.import("resource://testing-common/httpd.js");

var CardDAVServer = {
  cards: new Map(),
  deletedCards: new Map(),
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
    this.cards.clear();
    this.deletedCards.clear();
    this.changeCount = 0;
    this.resetHandlers();
  },

  resetHandlers() {
    // Address book discovery.

    this.server.registerPathHandler("/", this.wellKnown.bind(this));
    this.server.registerPathHandler(
      "/.well-known/carddav",
      this.wellKnown.bind(this)
    );
    this.server.registerPathHandler("/principals/", this.principals.bind(this));
    this.server.registerPathHandler(
      "/principals/me/",
      this.myPrincipal.bind(this)
    );
    this.server.registerPathHandler(
      "/addressbooks/me/",
      this.myAddressBooks.bind(this)
    );

    // Address book interaction.

    this.server.registerPathHandler(
      this.path,
      this.directoryHandler.bind(this)
    );
    this.server.registerPrefixHandler(this.path, this.cardHandler.bind(this));
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
    return "/addressbooks/me/test/";
  },

  get url() {
    return `${this.origin}${this.path}`;
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

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(`<multistatus xmlns="${PREFIX_BINDINGS.d}">
        <response>
          <href>/principals/</href>
          <propstat>
            <prop>
              <current-user-principal>
                <href>/principals/me/</href>
              </current-user-principal>
            </prop>
            <status>HTTP/1.1 200 OK</status>
          </propstat>
        </response>
      </multistatus>`);
  },

  myPrincipal(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(`<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/principals/me/</href>
          <propstat>
            <prop>
              <card:addressbook-home-set>
                <href>/addressbooks/me/</href>
              </card:addressbook-home-set>
            </prop>
            <status>HTTP/1.1 200 OK</status>
          </propstat>
        </response>
      </multistatus>`);
  },

  myAddressBooks(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(`<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/addressbooks/me/</href>
          <propstat>
            <prop>
              <resourcetype>
                <collection/>
              </resourcetype>
              <displayname>#addressbooks</displayname>
            </prop>
            <status>HTTP/1.1 200 OK</status>
          </propstat>
        </response>
        <response>
          <href>/addressbooks/me/default/</href>
          <propstat>
            <prop>
              <resourcetype>
                <collection/>
                <card:addressbook/>
              </resourcetype>
              <displayname>Not This One</displayname>
            </prop>
            <status>HTTP/1.1 200 OK</status>
          </propstat>
        </response>
        <response>
          <href>${this.path}</href>
          <propstat>
            <prop>
              <resourcetype>
                <collection/>
                <card:addressbook/>
              </resourcetype>
              <displayname>CardDAV Test</displayname>
            </prop>
            <status>HTTP/1.1 200 OK</status>
          </propstat>
        </response>
      </multistatus>`);
  },

  /** Handle any requests to the address book itself. */

  directoryHandler(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    switch (input.documentElement.localName) {
      case "addressbook-query":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.card);
        this.addressBookQuery(input, response);
        return;
      case "addressbook-multiget":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.card);
        this.addressBookMultiGet(input, response);
        return;
      case "propfind":
        Assert.equal(request.method, "PROPFIND");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.propFind(
          input,
          request.hasHeader("Depth") ? request.getHeader("Depth") : 0,
          response
        );
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

  addressBookQuery(input, response) {
    if (this.mimicYahoo) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }

    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let [href, card] of this.cards) {
      output += this._cardResponse(href, card, propNames);
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  addressBookMultiGet(input, response) {
    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let href of input.querySelectorAll("href")) {
      href = href.textContent;
      let card = this.cards.get(href);
      if (card) {
        output += this._cardResponse(href, card, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  propFind(input, depth, response) {
    let propNames = this._inputProps(input);

    if (this.mimicYahoo && !propNames.includes("cs:getctag")) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }

    let propValues = {
      "cs:getctag": this.changeCount,
      "d:displayname": "CardDAV Test",
      "d:resourcetype": "<collection/><card:addressbook/>",
    };
    if (!this.mimicYahoo) {
      propValues["d:sync-token"] = `http://mochi.test/sync/${this.changeCount}`;
    }

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <response>
        <href>${this.path}</href>
        ${this._outputProps(propNames, propValues)}
      </response>`;
    if (depth == 1) {
      for (let [href, card] of this.cards) {
        output += this._cardResponse(href, card, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  syncCollection(input, response) {
    let token = input
      .querySelector("sync-token")
      .textContent.replace(/\D/g, "");
    let propNames = this._inputProps(input);

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    for (let [href, card] of this.cards) {
      if (card.changed > token) {
        output += this._cardResponse(href, card, propNames);
      }
    }
    for (let [href, deleted] of this.deletedCards) {
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

  _cardResponse(href, card, propNames) {
    let propValues = {
      "card:address-data": card.vCard,
      "cs:getetag": card.etag,
      "d:resourcetype": null,
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
        case "address-data":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.card);
          propNames.push(`card:${p.localName}`);
          break;
        case "getctag":
        case "getetag":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.cs);
          propNames.push(`cs:${p.localName}`);
          break;
        case "displayname":
        case "resourcetype":
        case "sync-token":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.d);
          propNames.push(`d:${p.localName}`);
          break;
        default:
          Assert.report(
            true,
            undefined,
            undefined,
            `Unknown property requested: ${p.nodeName}`
          );
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

  /** Handle any requests to address book cards. */

  cardHandler(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    if (!/\/[\w-]+\.vcf$/.test(request.path)) {
      response.setStatusLine("1.1", 404, "Not Found");
      response.setHeader("Content-Type", "text/plain");
      response.write(`Card not found at ${request.path}`);
      return;
    }

    switch (request.method) {
      case "GET":
        this.getCard(request, response);
        return;
      case "PUT":
        this.putCard(request, response);
        return;
      case "DELETE":
        this.deleteCard(request, response);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 405, "Method Not Allowed");
    response.setHeader("Content-Type", "text/plain");
    response.write(`Method not allowed: ${request.method}`);
  },

  getCard(request, response) {
    let card = this.cards.get(request.path);
    if (!card) {
      response.setStatusLine("1.1", 404, "Not Found");
      response.setHeader("Content-Type", "text/plain");
      response.write(`Card not found at ${request.path}`);
      return;
    }

    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "text/vcard");
    response.setHeader("ETag", card.etag);
    response.write(card.vCard);
  },

  putCard(request, response) {
    if (request.hasHeader("If-Match")) {
      let card = this.cards.get(request.path);
      if (!card || card.etag != request.getHeader("If-Match")) {
        response.setStatusLine("1.1", 412, "Precondition Failed");
        return;
      }
    }

    let vCard = CommonUtils.readBytesFromInputStream(request.bodyInputStream);
    this.putCardInternal(request.path, vCard);
    response.setStatusLine("1.1", 204, "No Content");
  },

  putCardInternal(name, vCard) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }
    let etag = "" + vCard.length;
    this.cards.set(name, { etag, vCard, changed: ++this.changeCount });
    this.deletedCards.delete(name);
  },

  deleteCard(request, response) {
    this.deleteCardInternal(request.path);
    response.setStatusLine("1.1", 204, "No Content");
  },

  deleteCardInternal(name) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }
    this.cards.delete(name);
    this.deletedCards.set(name, ++this.changeCount);
  },
};

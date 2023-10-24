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

const { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
const { CommonUtils } = ChromeUtils.importESModule(
  "resource://services-common/utils.sys.mjs"
);
const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

var CardDAVServer = {
  books: {
    "/addressbooks/me/default/": "Not This One",
    "/addressbooks/me/test/": "CardDAV Test",
  },
  cards: new Map(),
  movedCards: new Map(),
  deletedCards: new Map(),
  changeCount: 0,
  server: null,
  isOpen: false,

  open(username, password, port = -1) {
    this.server = new HttpServer();
    this.server.start(port);
    this.port = this.server.identity.primaryPort;
    this.isOpen = true;

    this.username = username;
    this.password = password;
    this.server.registerPathHandler("/ping", this.ping);

    this.reset();
  },

  reopen() {
    this.server.start(this.port);
    this.isOpen = true;
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

    for (let path of Object.keys(this.books)) {
      this.server.registerPathHandler(path, this.directoryHandler.bind(this));
      this.server.registerPrefixHandler(path, this.cardHandler.bind(this));
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

  get path() {
    return "/addressbooks/me/test/";
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
      "card:addressbook-home-set": "<href>/addressbooks/me/</href>",
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

  myAddressBooks(request, response) {
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

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
        <response>
          <href>/addressbooks/me/</href>
          ${this._outputProps(propNames, {
            "d:resourcetype": "<collection/>",
            "d:displayname": "#addressbooks",
          })}
        </response>`;

    for (let [path, name] of Object.entries(this.books)) {
      output += `<response>
          <href>${path}</href>
          ${this._outputProps(propNames, {
            "d:resourcetype": "<collection/><card:addressbook/>",
            "d:displayname": name,
            "d:current-user-privilege-set":
              "<d:privilege><d:all/></d:privilege>",
          })}
        </response>`;
    }

    output += `</multistatus>`;
    response.write(output.replace(/>\s+</g, "><"));
  },

  /** Handle any requests to the address book itself. */

  directoryHandler(request, response) {
    if (!this.checkAuth(request, response)) {
      return;
    }

    let isRealDirectory = request.path == this.path;
    let input = new DOMParser().parseFromString(
      CommonUtils.readBytesFromInputStream(request.bodyInputStream),
      "text/xml"
    );

    switch (input.documentElement.localName) {
      case "addressbook-query":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.card);
        this.addressBookQuery(input, response, isRealDirectory);
        return;
      case "addressbook-multiget":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.card);
        this.addressBookMultiGet(input, response, isRealDirectory);
        return;
      case "propfind":
        Assert.equal(request.method, "PROPFIND");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.propFind(
          input,
          request.hasHeader("Depth") ? request.getHeader("Depth") : 0,
          response,
          isRealDirectory
        );
        return;
      case "sync-collection":
        Assert.equal(request.method, "REPORT");
        Assert.equal(input.documentElement.namespaceURI, PREFIX_BINDINGS.d);
        this.syncCollection(input, response, isRealDirectory);
        return;
    }

    Assert.report(true, undefined, undefined, "Should not have reached here");
    response.setStatusLine("1.1", 404, "Not Found");
    response.setHeader("Content-Type", "text/plain");
    response.write(`No handler found for <${input.documentElement.localName}>`);
  },

  addressBookQuery(input, response, isRealDirectory) {
    if (this.mimicYahoo) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }

    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    if (isRealDirectory) {
      for (let [href, card] of this.cards) {
        output += this._cardResponse(href, card, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  addressBookMultiGet(input, response, isRealDirectory) {
    let propNames = this._inputProps(input);
    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    if (isRealDirectory) {
      for (let href of input.querySelectorAll("href")) {
        href = href.textContent;
        if (this.movedCards.has(href)) {
          href = this.movedCards.get(href);
        }
        let card = this.cards.get(href);
        if (card) {
          output += this._cardResponse(href, card, propNames);
        }
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  propFind(input, depth, response, isRealDirectory) {
    let propNames = this._inputProps(input);

    if (this.mimicYahoo && !propNames.includes("cs:getctag")) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }

    let propValues = {
      "cs:getctag": this.changeCount,
      "d:displayname": isRealDirectory ? "CardDAV Test" : "Not This One",
      "d:resourcetype": "<collection/><card:addressbook/>",
      "d:current-user-privilege-set": "<d:privilege><d:all/></d:privilege>",
    };
    if (!this.mimicYahoo) {
      propValues["d:sync-token"] = `http://mochi.test/sync/${this.changeCount}`;
    }

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>
      <response>
        <href>${isRealDirectory ? this.path : this.altPath}</href>
        ${this._outputProps(propNames, propValues)}
      </response>`;
    if (depth == 1 && isRealDirectory) {
      for (let [href, card] of this.cards) {
        output += this._cardResponse(href, card, propNames);
      }
    }
    output += `</multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  syncCollection(input, response, isRealDirectory) {
    let token = input
      .querySelector("sync-token")
      .textContent.replace(/\D/g, "");
    if (!token) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }
    let propNames = this._inputProps(input);

    let output = `<multistatus xmlns="${PREFIX_BINDINGS.d}" ${NAMESPACE_STRING}>`;
    if (isRealDirectory) {
      for (let [href, card] of this.cards) {
        if (card.changed > token) {
          output += this._cardResponse(
            href,
            card,
            propNames,
            !this.mimicGoogle
          );
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
    }
    output += `<sync-token>http://mochi.test/sync/${this.changeCount}</sync-token>
    </multistatus>`;

    response.setStatusLine("1.1", 207, "Multi-Status");
    response.setHeader("Content-Type", "text/xml");
    response.write(output.replace(/>\s+</g, "><"));
  },

  _cardResponse(href, card, propNames, includeAddressData = true) {
    let propValues = {
      "d:getetag": card.etag,
      "d:resourcetype": null,
    };

    if (includeAddressData) {
      propValues["card:address-data"] = card.vCard;
    }

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
        case "addressbook-home-set":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.card);
          propNames.push(`card:${p.localName}`);
          break;
        case "getctag":
          Assert.equal(p.namespaceURI, PREFIX_BINDINGS.cs);
          propNames.push(`cs:${p.localName}`);
          break;
        case "current-user-principal":
        case "current-user-privilege-set":
        case "displayname":
        case "getetag":
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
      if (p in propValues && propValues[p] !== undefined) {
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

    let isRealDirectory = request.path.startsWith(this.path);
    if (!isRealDirectory || !/\/[\w-]+\.vcf$/.test(request.path)) {
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
    if (this.mimicGoogle && !/^N[;:]/im.test(vCard)) {
      response.setStatusLine("1.1", 400, "Bad Request");
      return;
    }

    this.putCardInternal(request.path, vCard);
    response.setStatusLine("1.1", 204, "No Content");

    if (this.responseDelay) {
      response.processAsync();
      this.responseDelay.promise.then(() => {
        delete this.responseDelay;
        response.finish();
      });
    }
  },

  putCardInternal(name, vCard) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }
    if (this.modifyCardOnPut && !this.cards.has(name)) {
      vCard = vCard.replace(/UID:(\S+)/, (match, uid) => {
        let newUID = [...uid].reverse().join("");
        let newName = this.path + newUID + ".vcf";
        this.movedCards.set(name, newName);
        name = newName;
        return "UID:" + newUID + "\r\nX-MODIFIED-BY-SERVER:1";
      });
    }
    if (this.mimicGoogle && vCard.includes("\nPHOTO")) {
      let [, version] = vCard.match(/VERSION:([34]\.0)/);
      if (version && version != "3.0") {
        let start = vCard.indexOf("\nPHOTO") + 1;
        let end = vCard.indexOf("\n", start) + 1;
        while (vCard[end] == " ") {
          end = vCard.indexOf("\n", end) + 1;
        }
        vCard = vCard.substring(0, start) + vCard.substring(end);
      }
    }
    let etag = "" + vCard.length;
    this.cards.set(name, { etag, vCard, changed: ++this.changeCount });
    this.deletedCards.delete(name);
  },

  deleteCard(request, response) {
    this.deleteCardInternal(request.path);
    response.setStatusLine("1.1", 204, "No Content");

    if (this.responseDelay) {
      response.processAsync();
      this.responseDelay.promise.then(() => {
        delete this.responseDelay;
        response.finish();
      });
    }
  },

  deleteCardInternal(name) {
    if (!name.startsWith("/")) {
      name = this.path + name;
    }
    this.cards.delete(name);
    this.deletedCards.set(name, ++this.changeCount);
  },
};

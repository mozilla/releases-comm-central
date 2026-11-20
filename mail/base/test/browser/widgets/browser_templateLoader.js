/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { getLazyTemplate, getTemplate } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/base/content/modules/TemplateLoader.mjs",
  { global: "current" }
);

const testElementTagName = "template-loader-test-element";

add_setup(function () {
  // Repeated runs reuse this window's custom element registry.
  if (!customElements.get(testElementTagName)) {
    customElements.define(testElementTagName, class extends HTMLElement {});
  }
});

add_task(function test_getTemplate() {
  const fragment = getTemplate(
    '<template><label for="name">Name</label><input id="name" disabled></template>'
  );

  Assert.equal(
    fragment.nodeType,
    Node.DOCUMENT_FRAGMENT_NODE,
    "The loader should return a document fragment"
  );

  const input = fragment.querySelector("input");
  const label = fragment.querySelector("label");

  Assert.ok(input, "The fragment should contain the input");
  Assert.ok(label, "The fragment should contain the label");
  Assert.equal(
    input.namespaceURI,
    "http://www.w3.org/1999/xhtml",
    "The input should use the HTML namespace"
  );
  Assert.ok(input.disabled, "HTML boolean attributes should be preserved");
  Assert.equal(label.control, input, "The label should refer to the input");
});

add_task(function test_independentCopies() {
  const template = getTemplate("<template><span>Original</span></template>");
  const first = document.importNode(template, true);
  const second = document.importNode(template, true);

  first.firstElementChild.textContent = "Changed";

  Assert.notEqual(first, second, "Each import should create a new fragment");
  Assert.equal(
    second.textContent,
    "Original",
    "Changing one copy should leave another copy unchanged"
  );

  const host = document.createElement("div");

  host.append(first);

  Assert.equal(
    template.textContent,
    "Original",
    "Changing and consuming a copy should leave the cached template unchanged"
  );
});

add_task(function test_targetDocument() {
  const targetDocument = document.implementation.createHTMLDocument();
  const template = getTemplate("<template><button>Action</button></template>");
  const fragment = targetDocument.importNode(template, true);

  Assert.equal(
    fragment.ownerDocument,
    targetDocument,
    "The fragment should belong to the supplied document"
  );
  Assert.equal(
    fragment.firstElementChild.ownerDocument,
    targetDocument,
    "The child nodes should belong to the supplied document"
  );
});

add_task(function test_mixedXHTMLTemplate() {
  const template = getTemplate(`
    <template xmlns="http://www.w3.org/1999/xhtml"
              xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
      <form>
        <input id="name" disabled="disabled" />
        <xul:label value="Name" />
      </form>
    </template>
  `);
  const fragment = document.importNode(template, true);
  const form = fragment.querySelector("form");
  const input = fragment.querySelector("input");
  const label = fragment.querySelector("label");

  Assert.ok(form, "The XML template should preserve its form");
  Assert.ok(input, "The XML template should preserve its input");
  Assert.ok(label, "The XML template should contain its XUL label");
  Assert.ok(
    HTMLInputElement.isInstance(input),
    "The template's default namespace should create an HTML input"
  );
  Assert.ok(input.disabled, "The XML input should preserve its disabled state");
  Assert.ok(
    XULElement.isInstance(label),
    "The xul prefix should create a real XUL element"
  );
  Assert.equal(
    label.namespaceURI,
    "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
    "The imported label should keep the XUL namespace"
  );
});

add_task(function test_xulTemplate() {
  const parser = new DOMParser();

  parser.forceEnableXULXBL();

  const targetDocument = parser.parseFromSafeString(
    '<window xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" />',
    "application/xml"
  );
  const template = getTemplate(
    `<template xmlns="http://www.w3.org/1999/xhtml"
               xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
      <xul:vbox><xul:label value="Original" /></xul:vbox>
      <input />
    </template>`
  );
  const first = targetDocument.importNode(template, true);
  const second = targetDocument.importNode(template, true);
  const box = first.querySelector("vbox");
  const input = first.querySelector("input");

  Assert.ok(box, "The XUL template should contain its box");
  Assert.ok(input, "The XUL template should contain its HTML input");
  Assert.ok(
    XULElement.isInstance(box),
    "The template's xul prefix should create a real XUL element"
  );
  Assert.equal(
    box.ownerDocument,
    targetDocument,
    "The imported XUL element should belong to the destination document"
  );
  Assert.ok(
    HTMLInputElement.isInstance(input),
    "The template's HTML input should keep its type in a XUL document"
  );

  first.querySelector("label").setAttribute("value", "Changed");

  Assert.equal(
    second.querySelector("label").getAttribute("value"),
    "Original",
    "Changing one XUL copy should leave the other copy unchanged"
  );
  Assert.equal(
    template.querySelector("label").getAttribute("value"),
    "Original",
    "Changing a XUL copy should leave the cached template unchanged"
  );
});

add_task(function test_xulTemplateWithoutHTMLNamespace() {
  Assert.throws(
    () =>
      getTemplate(`<template xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
        <xul:label />
      </template>`),
    /HTML <template>/,
    "An XML template without the HTML namespace should be rejected"
  );
});

add_task(function test_malformedXML() {
  Assert.throws(
    () =>
      getTemplate(`<template xmlns="http://www.w3.org/1999/xhtml"
                             xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
        <xul:label>
      </template>`),
    /well-formed XML/,
    "An unclosed XML element should produce a clear error"
  );
  Assert.throws(
    () =>
      getTemplate(`<template xmlns="http://www.w3.org/1999/xhtml"
                             xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
        <input disabled>
      </template>`),
    /well-formed XML/,
    "The XUL declaration should require XML syntax even without XUL elements"
  );
});

add_task(function test_ignoresDeclarationInComment() {
  const template = getTemplate(`<template>
    <!-- xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" -->
    <input disabled>
  </template>`);
  const input = template.querySelector("input");

  Assert.ok(input, "The template should preserve the HTML input");
  Assert.ok(
    input.disabled,
    "A declaration in a comment should leave HTML boolean attributes supported"
  );
});

add_task(function test_ignoresOtherNamespace() {
  const template = getTemplate(`<template xmlns:xul="urn:not-xul">
    <input disabled>
  </template>`);
  const input = template.querySelector("input");

  Assert.ok(input, "The template should preserve the HTML input");
  Assert.ok(
    input.disabled,
    "A different namespace URI should leave HTML boolean attributes supported"
  );
});

add_task(function test_emptyXMLDocument() {
  const targetDocument = document.implementation.createDocument(null, "");
  const template = getTemplate("<template><span>Content</span></template>");
  const fragment = targetDocument.importNode(template, true);

  Assert.equal(
    fragment.ownerDocument,
    targetDocument,
    "A destination without a root should own the imported fragment"
  );
  Assert.equal(
    fragment.firstElementChild.namespaceURI,
    "http://www.w3.org/1999/xhtml",
    "HTML content should keep its namespace when the destination has no root"
  );
});

add_task(function test_customElements() {
  const testElementClass = customElements.get(testElementTagName);
  const template = getTemplate(
    `<template><${testElementTagName}></${testElementTagName}></template>`
  );

  Assert.ok(
    !(template.firstElementChild instanceof testElementClass),
    "The cached template should leave custom elements unconstructed"
  );

  const fragment = document.importNode(template, true);

  Assert.ok(
    fragment.firstElementChild instanceof testElementClass,
    "The copy should use the target document's custom element definition"
  );
});

add_task(function test_emptyTemplate() {
  const template = getTemplate("<template></template>");

  Assert.equal(
    template.childNodes.length,
    0,
    "An empty template should return an empty fragment"
  );
});

add_task(function test_multipleTemplates() {
  const markup = "<template></template><template></template>";
  const xulMarkup = `
    <template xmlns="http://www.w3.org/1999/xhtml"
              xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"></template>
    <template xmlns="http://www.w3.org/1999/xhtml"
              xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"></template>
  `;

  Assert.throws(
    () => getTemplate(markup),
    /exactly one HTML <template>/,
    "HTML markup with multiple templates should be rejected"
  );
  Assert.throws(
    () => getTemplate(xulMarkup),
    /exactly one HTML <template>/,
    "XML markup with multiple templates should be rejected"
  );
});

add_task(function test_missingTemplate() {
  Assert.throws(
    () => getTemplate("<div>No template</div>"),
    /Template markup must contain exactly one HTML <template> element/,
    "Markup without a template should produce a clear error"
  );
});

add_task(function test_getLazyTemplate() {
  class TemplateHolder {
    static template;
    static {
      getLazyTemplate(this, "<template><span>Lazy</span></template>");
    }
  }

  const fragment = TemplateHolder.template;

  Assert.equal(
    fragment.textContent,
    "Lazy",
    "The getter should return the template contents"
  );
  Assert.strictEqual(
    TemplateHolder.template,
    fragment,
    "Later reads should return the cached fragment"
  );
});

add_task(function test_getLazyTemplateDefersParsing() {
  class InvalidTemplateHolder {
    static template;
    static {
      getLazyTemplate(this, "<div>No template</div>");
    }
  }

  Assert.throws(
    () => InvalidTemplateHolder.template,
    /Template markup must contain exactly one HTML <template> element/,
    "The first read should report invalid template markup"
  );
});

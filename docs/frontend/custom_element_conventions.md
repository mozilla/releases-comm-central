# Custom Element Conventions

- Whenever possible custom elements are defined each in their own ES module
  - The file name should match the element tag name, so `<my-element>` is in
    `my-element.mjs`
  - The class name should match the custom element tag name, just in PascalCase.
  - The custom element registers itself in the `customElements` registry at the
    end of the file. For example
    ```js
      customElements.define("my-element", MyElement);
    ```
  - If the element should be extended by other elements, it should be exported
    as a named export in the module.
- Any other custom elements the element depends on or uses in its template
  should be imported in the element's module.
- External features of the custom element (attributes, slots, parts, css custom
  properties, events etc.) are documented using these jsdoc tags:
  https://custom-elements-manifest.open-wc.org/analyzer/getting-started/#supported-jsdoc
- For events the `handleEvents` method callback should be used, and just the
  `this` reference is passed to `addEventListener`. See https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener#the_event_listener_callback
  - This also lets us modify event handling through inheritance.
  - Any events attached to elements that aren't within the custom element need
    to be removed in the `disconnectedCallback` (and should be registered again
    if the element gets re-attached).
- If the element doesn't attach a shadow root in its `connectedCallback`,
  consider using a `hasConnected` class field to detect if the main setup logic
  has already happened.
- Templates are currently managed in HTML markup and we just document the ID of
  the template that the custom element expects as `Template ID: #myElementTemplate`.
  Often the template is in an include file we include anywhere the custom element
  is used.
- Styles for the custom element are usually in a separate css file with the same
  name as the module. If the element has a shadow root, the stylesheet will be
  loaded into it.
- When interacting with other custom elements, you should follow these methods:
  - To send (or request) information to a child element, call a method on it.
  - To send information to a parent element (without the parent requesting it in
    a method call), emit the information in a custom event.
- If the state needs to be updated from a parent with an explicit function call,
  consider using an `initialize` method that is also called from the
  `connectedCallback`.
- XPCOM Observers registered with the `nsIObserverService` should generally be
  [weak observers](https://searchfox.org/mozilla-central/rev/93692d0756f01f99e2b028e40b45776fa0a397e9/xpcom/ds/nsIObserverService.idl#32-36).
  This is safe, because the custom element (and thus the observer) will usually
  be owned by a DOM scope. The observing element needs to explicitly declare the
  `nsISupportsWeakReference` and `nsIObserver` interfaces in the `QueryInterface` method.
  The observer should of course also be unregistered in the
  `disconnectedCallback`.
- Unless key repeats are desired, consider using `keyup` listeners for keyboard
  event handling.

## Custom Element Boilerplate

### my-element.mjs

```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Example component serving as a boilerplate demonstration.
 * You should never see this description in the wild.
 * Template ID: #myElementTemplate
 *
 * @attribute {string} label - Label of the button. Observed for changes.
 * @tagname my-element
 */
export class MyElement extends HTMLElement {
  static get observedAttributes() {
    return ["label"];
  }

  QueryInterface = ChromeUtils.generateQI([
    "nsIObserver",
    "nsISupportsWeakReference"
  ]);

  connectedCallback() {
    window.addEventListener("resize", this);
    Services.obs.addObserver(this, "some-topic", true);

    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "chrome://messenger/skin/shared/my-element.css";
    const template = document
      .getElementById("myElementTemplate")
      .content.cloneNode(true);

    template.querySelector("button").addEventListener("click", this);
    template.querySelector("button").textContent = this.getAttribute("label");

    shadowRoot.append(styles, template);

    document.l10n.connectRoot(shadowRoot);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this);
    Services.obs.removeObserver(this, "some-topic");
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  attributeChangedCallback(attribute) {
    switch (attribute) {
      case "label":
        this.shadowRoot.querySelector("button").textContent = this.getAttribute("label");
        break;
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        console.log("clicked!");
        break;
      case "resize":
        console.warn("Why would you want a resize listener?");
        break;
    }
  }

  observe(subject, topic, data) {
    switch(topic) {
      case "some-topic":
        console.log("observer notification");
        break;
    }
  }
}
customElements.define("my-element", MyElement);
```

### myElementTemplate.inc.xhtml

```html
<template id="myElementTemplate">
  <span data-l10n-id="my-element-string"></span>
  <button class="button" data-l10n-id="my-element-button"></button>
</template>
```

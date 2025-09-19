/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mailCommon.js
/* globals gViewWrapper: true */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DisplayNameUtils: "resource:///modules/DisplayNameUtils.sys.mjs",
  Gloda: "resource:///modules/gloda/GlodaPublic.sys.mjs",
  makeFriendlyDateAgo: "resource:///modules/TemplateUtils.sys.mjs",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.sys.mjs",
  mimeMsgToContentSnippetAndMeta:
    "resource:///modules/gloda/GlodaContent.sys.mjs",
});

/**
 * Base conversation view container.
 *
 * Template ID: #conversationViewTemplate
 */
class ConversationView extends HTMLElement {
  /** @type {HTMLSpanElement} */
  #total;

  /** @type {HTMLElement} */
  #title;

  /** @type {HTMLSpanElement} */
  #details;

  /** @type {HTMLElement} */
  #main;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    // Ensure this element is hidden when first loaded so we reveal it only
    // after the message data is properly loaded.
    this.hidden = true;

    const shadowRoot = this.attachShadow({ mode: "open" });

    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/conversation-view.css";
    shadowRoot.appendChild(style);

    // Load the template.
    const template = document.getElementById("conversationViewTemplate");
    const clonedNode = template.content.cloneNode(true);
    shadowRoot.appendChild(clonedNode);

    // Connect fluent strings.
    this.l10n = new DOMLocalization([
      "messenger/conversationview/conversationView.ftl",
    ]);
    this.l10n.connectRoot(shadowRoot);

    this.#main = shadowRoot.querySelector("#mainConversation");
    this.#total = shadowRoot.querySelector(".total");
    this.#title = shadowRoot.querySelector(".title");
    this.#details = shadowRoot.querySelector(".details");
  }

  disconnectedCallback() {
    this.l10n.disconnectRoot(this.shadowRoot);
  }

  /**
   * Show the thread conversation for the currently selected header.
   *
   * @param {nsIMsgDBHdr[]} headers
   */
  show(headers) {
    try {
      lazy.Gloda.getMessageCollectionForHeader(headers, this);
    } catch (e) {
      console.error(e);
    }
    this.hidden = false;
  }

  /**
   * Clear any leftover data.
   */
  clear() {
    this.#total.textContent = "";
    this.#total.removeAttribute("data-l10n-id");
    this.#title.textContent = "";
    this.#details.textContent = "";

    const browser = this.#main.querySelector("browser");
    if (browser) {
      browser.hidden = true;
      browser.contentWindow.displayMessage();
    }
    this.#main.replaceChildren();
  }

  onItemsAdded() {}
  onItemsModified() {}
  onItemsRemoved() {}
  onQueryCompleted(collection) {
    const conversation = collection.items.at(0)?.conversation;
    if (!conversation) {
      return;
    }
    conversation.getMessagesCollection({
      onItemsAdded() {},
      onItemsModified() {},
      onItemsRemoved() {},
      onQueryCompleted: msgs => {
        // Filter out potentially duplicated messages from multiple folders like
        // Sent, All Mail, etc.
        this.messages = msgs.items
          .map(i => i.folderMessage)
          .filter(
            (obj, index, messages) =>
              obj &&
              index === messages.findIndex(o => obj.messageId === o?.messageId)
          );
        this.#updateHeader();
        this.#showMessages();
      },
    });
  }

  /**
   * Update the conversation view header to show title and message counts.
   */
  #updateHeader() {
    document.l10n.setAttributes(this.#total, "total-message-count", {
      count: this.messages.length,
    });
    this.#title.textContent = this.messages.at(0).mime2DecodedSubject;

    const detailsPromise = [];
    const newCount = this.messages.filter(message => message.isNew).length;
    if (newCount) {
      detailsPromise.push(
        this.l10n.formatValue("new-message-count", { count: newCount })
      );
    }

    const unreadCount = this.messages.filter(message => !message.isRead).length;
    if (unreadCount) {
      detailsPromise.push(
        this.l10n.formatValue("unread-message-count", {
          count: unreadCount,
        })
      );
    }

    Promise.allSettled(detailsPromise).then(results => {
      const formatter = new Intl.ListFormat(
        Services.appinfo.name == "xpcshell"
          ? "en-US"
          : Services.locale.appLocalesAsBCP47,
        {
          style: "narrow",
          type: "conjunction",
        }
      );
      const trimmedResults = results
        .map(settledPromise => settledPromise.value ?? "")
        .filter(value => value.trim() != "");
      this.#details.textContent = formatter.format(trimmedResults);
    });
  }

  /**
   * Add messages to the conversation.
   */
  #showMessages() {
    // This shouldn't be needed but just to make sure we're starting from a
    // clean state.
    this.#main.replaceChildren();
    const template = document.getElementById("conversationViewMessageTemplate");

    // Loop through all the messages except the last one.
    for (const message of this.messages.slice(0, -1)) {
      this.#main.appendChild(
        this.#buildMessage(template.content.cloneNode(true), message)
      );
    }

    this.#main.appendChild(this.#addFullMessage());
    this.#loadMessageBrowser(this.messages.at(-1));
  }

  /**
   * Populate the message tempalte with the message data.
   *
   * @param {HTMLElement} article
   * @param {nsIMsgDBHdr} message
   * @returns {HTMLElement}
   */
  #buildMessage(article, message) {
    article.firstElementChild.dataset.messageId = message.messageId;

    const author = article.querySelector("address");
    author.textContent = lazy.DisplayNameUtils.formatDisplayNameList(
      message.mime2DecodedAuthor,
      "from"
    );

    const dateElement = article.querySelector("time");
    const date = new Date(message.date / 1000);
    dateElement.textContent = lazy.makeFriendlyDateAgo(date);
    dateElement.dateTime = date.toISOString();
    dateElement.title = date.toLocaleString();

    const paragraph = article.querySelector("p");
    this.#generateSnippet(message, paragraph);

    article.firstElementChild.addEventListener(
      "click",
      () => this.#openMessage(message),
      {
        capture: true,
        once: true,
      }
    );

    return article;
  }

  /**
   * Try to generate a snippet summary of the body content.
   *
   * @param {nsIMsgDBHdr} message
   */
  #generateSnippet(message, snippet) {
    try {
      lazy.MsgHdrToMimeMessage(
        message,
        null,
        (header, mime) => {
          if (!mime) {
            return;
          }
          const [text] = lazy.mimeMsgToContentSnippetAndMeta(
            mime,
            header.folder,
            100
          );
          snippet.textContent = text;
        },
        false,
        { saneBodySize: true }
      );
    } catch (e) {
      if (e.result == Cr.NS_ERROR_FAILURE) {
        // Offline messages generate exceptions, which is unfortunate. When
        // that's fixed, this code should adapt. XXX
        snippet.textContent = "...";
      } else {
        throw e;
      }
    }
  }

  /**
   * Expand the currently clicked message and collapses the other.
   *
   * @param {nsIMsgDBHdr} message
   */
  #openMessage(message) {
    const browser = this.#main.querySelector("browser");
    // If we already have a browser it means a message is currently opened.
    // Replace that child element with a closed message element.
    if (browser) {
      const template = document.getElementById(
        "conversationViewMessageTemplate"
      );
      const openArticle = browser.parentNode;
      const openMessage = this.messages.find(
        m => m.messageId == openArticle.dataset.messageId
      );
      this.#main.replaceChild(
        this.#buildMessage(template.content.cloneNode(true), openMessage),
        openArticle
      );
    }

    const article = this.#main.querySelector(
      `article[data-message-id="${message.messageId}"]`
    );
    this.#main.replaceChild(this.#addFullMessage(), article);
    this.#loadMessageBrowser(message);
  }

  /**
   * Clone the `conversationViewMessageBrowserTemplate` and return it for DOM
   * consumption.
   *
   * @returns {HTMLTemplateElement}
   */
  #addFullMessage() {
    const template = document
      .getElementById("conversationViewMessageBrowserTemplate")
      .content.cloneNode(true);
    return template;
  }

  /**
   * Load the browser of the selected message and display its content.
   *
   * @param {nsIMsgDBHdr} message
   */
  #loadMessageBrowser(message) {
    const browser = this.#main.querySelector("browser");

    browser.docShell.allowDNSPrefetch = false;
    if (browser.contentDocument.readyState != "complete") {
      browser.addEventListener(
        "load",
        () => {
          const folder = message.folder;
          const msgUri = folder.getUriForMsg(message);
          browser.contentWindow.displayMessage(msgUri, gViewWrapper);
          browser.hidden = false;
        },
        {
          capture: true,
          once: true,
        }
      );

      browser.addEventListener(
        "MsgLoaded",
        () => {
          const html =
            browser.contentDocument.querySelector("#messagepane")
              .contentDocument.documentElement;
          const header =
            browser.contentDocument.querySelector("#singleMessage");
          header.classList.add("in-conversation");

          const minHeight =
            Math.max(
              html.outerHeight || 0,
              html.offsetHeight || 0,
              html.scrollHeight || 0
            ) +
            Math.max(
              header.outerHeight || 0,
              header.offsetHeight || 0,
              header.scrollHeight || 0
            );

          const article = this.#main.querySelector(
            `article[aria-expanded="true"]`
          );
          article.dataset.messageId = message.messageId;
          article.style.minHeight = `${minHeight}px`;
        },
        {
          capture: true,
          once: true,
        }
      );
    }
  }
}
customElements.define("conversation-view", ConversationView);

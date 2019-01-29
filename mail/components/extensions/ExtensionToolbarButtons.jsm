/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

this.EXPORTED_SYMBOLS = ["ToolbarButtonAPI"];

ChromeUtils.defineModuleGetter(this, "Services", "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "ViewPopup", "resource:///modules/ExtensionPopups.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionSupport", "resource:///modules/ExtensionSupport.jsm");
const {ExtensionCommon} = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
const {ExtensionUtils} = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
const {ExtensionParent} = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");

const {
  EventManager,
  ExtensionAPI,
  makeWidgetId,
} = ExtensionCommon;

const {
  IconDetails,
  StartupCache,
} = ExtensionParent;

const {
  DefaultWeakMap,
  ExtensionError,
} = ExtensionUtils;

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyGlobalGetters(this, ["InspectorUtils"]);

var XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
var DEFAULT_ICON = "chrome://messenger/content/extension.svg";

this.ToolbarButtonAPI = class extends ExtensionAPI {
  /**
   * Called when the extension is enabled.
   *
   * @param {String} entryName
   *        The name of the property in the extension manifest
   */
  async onManifestEntry(entryName) {
    let {extension} = this;
    this.paint = this.paint.bind(this);
    this.unpaint = this.unpaint.bind(this);

    this.widgetId = makeWidgetId(extension.id);
    this.id = `${this.widgetId}-${this.manifestName}-toolbarbutton`;

    this.eventQueue = [];

    let options = extension.manifest[entryName];
    this.defaults = {
      enabled: true,
      title: options.default_title || extension.name,
      badgeText: "",
      badgeBackgroundColor: null,
      popup: options.default_popup || "",
    };
    this.globals = Object.create(this.defaults);

    this.browserStyle = options.browser_style;

    this.defaults.icon = await StartupCache.get(
      extension, [this.manifestName, "default_icon"],
      () => IconDetails.normalize({
        path: options.default_icon,
        iconType: this.manifestName,
        themeIcons: options.theme_icons,
      }, extension));

    this.iconData = new DefaultWeakMap(icons => this.getIconData(icons));
    this.iconData.set(
      this.defaults.icon,
      await StartupCache.get(
        extension, [this.manifestName, "default_icon_data"],
        () => this.getIconData(this.defaults.icon)));

    ExtensionSupport.registerWindowListener(this.id, {
      chromeURLs: this.windowURLs,
      onLoadWindow: window => {
        this.paint(window);
      },
    });

    extension.callOnClose(this);
  }

  /**
   * Called when the extension is disabled or removed.
   */
  close() {
    ExtensionSupport.unregisterWindowListener(this.id);
    for (let window of ExtensionSupport.openWindows) {
      if (this.windowURLs.includes(window.location.href)) {
        this.unpaint(window);
      }
    }
  }

  /**
   * Creates a toolbar button.
   *
   * @param {Window} window
   */
  makeButton(window) {
    let {document} = window;
    let button = document.createElementNS(XUL_NS, "toolbarbutton");
    button.id = this.id;
    button.classList.add("toolbarbutton-1");
    button.classList.add("webextension-action");
    button.classList.add("badged-button");
    button.setAttribute("data-extensionid", this.extension.id);
    button.addEventListener("mousedown", this);
    this.updateButton(button, this.globals);
    return button;
  }

  /**
   * Adds a toolbar button to this window.
   *
   * @param {Window} window
   */
  paint(window) {
    let {document} = window;
    if (document.getElementById(this.id)) {
      return;
    }

    let toolbox = document.getElementById(this.toolboxId);
    let toolbar = document.getElementById(this.toolbarId);
    if (!toolbox) {
      return;
    }
    let button = this.makeButton(window);
    if (toolbox.palette) {
      toolbox.palette.appendChild(button);
    } else {
      toolbar.appendChild(button);
    }
    let currentSet = toolbar.hasAttribute("currentset") ?
                     toolbar.getAttribute("currentset") :
                     toolbar.getAttribute("defaultset");
    currentSet = currentSet.split(",");
    if (currentSet.includes(this.id)) {
      toolbar.currentSet = currentSet.join(",");
    } else {
      currentSet.push(this.id);
      toolbar.currentSet = currentSet.join(",");

      let persistAttribute = toolbar.getAttribute("persist");
      if (persistAttribute && persistAttribute.split(/\s+/).includes("currentset")) {
        Services.xulStore.persist(toolbar, "currentset");
      }
    }
  }

  /**
   * Removes the toolbar button from this window.
   *
   * @param {Window} window
   */
  unpaint(window) {
    let {document} = window;
    let button = document.getElementById(this.id);
    if (button) {
      button.remove();
    }
  }

  /**
   * Triggers this browser action for the given window, with the same effects as
   * if it were clicked by a user.
   *
   * This has no effect if the browser action is disabled for, or not
   * present in, the given window.
   *
   * @param {Window} window
   */
  async triggerAction(window) {
    let {document} = window;
    let button = document.getElementById(this.id);
    let popupURL = this.getProperty(this.globals, "popup");
    let enabled = this.getProperty(this.globals, "enabled");

    if (button && popupURL && enabled) {
      let popup = ViewPopup.for(this.extension, window) || this.getPopup(window, popupURL);
      popup.viewNode.openPopup(button, "bottomcenter topleft", 0, 0);
    } else {
      this.emit("click");
    }
  }

  /**
   * Event listener.
   *
   * @param {Event} event
   */
  handleEvent(event) {
    let window = event.target.ownerGlobal;

    switch (event.type) {
      case "mousedown":
        if (event.button == 0) {
          this.triggerAction(window);
        }
        break;
    }
  }

  /**
   * Returns a potentially pre-loaded popup for the given URL in the given
   * window. If a matching pre-load popup already exists, returns that.
   * Otherwise, initializes a new one.
   *
   * If a pre-load popup exists which does not match, it is destroyed before a
   * new one is created.
   *
   * @param {Window} window
   *        The browser window in which to create the popup.
   * @param {string} popupURL
   *        The URL to load into the popup.
   * @param {boolean} [blockParser = false]
   *        True if the HTML parser should initially be blocked.
   * @returns {ViewPopup}
   */
  getPopup(window, popupURL, blockParser = false) {
    let popup = new ViewPopup(this.extension, window, popupURL, this.browserStyle, false, blockParser);
    popup.ignoreResizes = false;
    return popup;
  }

  /**
   * Update the toolbar button |node| with the tab context data
   * in |tabData|.
   *
   * @param {XULElement} node
   *        XUL toolbarbutton to update
   * @param {Object} tabData
   *        Properties to set
   * @param {boolean} sync
   *        Whether to perform the update immediately
   */
  updateButton(node, tabData, sync = false) {
    let title = tabData.title || this.extension.name;
    let callback = () => {
      node.setAttribute("tooltiptext", title);
      node.setAttribute("label", title);

      if (tabData.badgeText) {
        node.setAttribute("badge", tabData.badgeText);
      } else {
        node.removeAttribute("badge");
      }

      if (tabData.enabled) {
        node.removeAttribute("disabled");
      } else {
        node.setAttribute("disabled", "true");
      }

      let color = tabData.badgeBackgroundColor;
      if (color) {
        color = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;
        node.setAttribute("badgeStyle", `background-color: ${color};`);
      } else {
        node.removeAttribute("badgeStyle");
      }

      let {style, legacy} = this.iconData.get(tabData.icon);
      const LEGACY_CLASS = "toolbarbutton-legacy-addon";
      if (legacy) {
        node.classList.add(LEGACY_CLASS);
      } else {
        node.classList.remove(LEGACY_CLASS);
      }

      node.setAttribute("style", style);
    };
    if (sync) {
      callback();
    } else {
      node.ownerGlobal.requestAnimationFrame(callback);
    }
  }

  /**
   * Get icon properties for updating the UI.
   *
   * @param {Object} icons
   *        Contains the icon information, typically the extension manifest
   */
  getIconData(icons) {
    let baseSize = 16;
    let {icon, size} = IconDetails.getPreferredIcon(icons, this.extension, baseSize);

    let legacy = false;

    // If the best available icon size is not divisible by 16, check if we have
    // an 18px icon to fall back to, and trim off the padding instead.
    if (size % 16 && typeof icon === "string" && !icon.endsWith(".svg")) {
      let result = IconDetails.getPreferredIcon(icons, this.extension, 18);

      if (result.size % 18 == 0) {
        baseSize = 18;
        icon = result.icon;
        legacy = true;
      }
    }

    let getIcon = (size, theme) => {
      let {icon} = IconDetails.getPreferredIcon(icons, this.extension, size);
      if (typeof icon === "object") {
        if (icon[theme] == IconDetails.DEFAULT_ICON) {
          icon[theme] = DEFAULT_ICON;
        }
        return IconDetails.escapeUrl(icon[theme]);
      }
      if (icon == IconDetails.DEFAULT_ICON) {
        return DEFAULT_ICON;
      }
      return IconDetails.escapeUrl(icon);
    };

    let getStyle = (name, size) => {
      return `
        --webextension-${name}: url("${getIcon(size, "default")}");
        --webextension-${name}-light: url("${getIcon(size, "light")}");
        --webextension-${name}-dark: url("${getIcon(size, "dark")}");
      `;
    };

    let style = `
      ${getStyle("menupanel-image", 32)}
      ${getStyle("menupanel-image-2x", 64)}
      ${getStyle("toolbar-image", baseSize)}
      ${getStyle("toolbar-image-2x", baseSize * 2)}
    `;

    let realIcon = getIcon(size, "default");

    return {style, legacy, realIcon};
  }

  /**
   * Update the toolbar button for a given window.
   *
   * @param {ChromeWindow} window
   *        Browser chrome window.
   */
  async updateWindow(window) {
    let button = window.document.getElementById(this.id);
    if (button) {
      this.updateButton(button, this.globals);
    }
    await new Promise(window.requestAnimationFrame);
  }

  /**
   * Update the toolbar button when the extension changes the icon, title, url, etc.
   * If it only changes a parameter for a single tab, `target` will be that tab.
   * If it only changes a parameter for a single window, `target` will be that window.
   * Otherwise `target` will be null.
   *
   * @param {XULElement|ChromeWindow|null} target
   *        Browser tab or browser chrome window, may be null.
   */
  async updateOnChange(target) {
    if (target) {
      let window = target.ownerGlobal;
      if (target === window || target.selected) {
        await this.updateWindow(window);
      }
    } else {
      let promises = [];
      for (let window of ExtensionSupport.openWindows) {
        if (this.windowURLs.includes(window.location.href)) {
          promises.push(this.updateWindow(window));
        }
      }
      await Promise.all(promises);
    }
  }

  /**
   * Gets the target object and its associated values corresponding to
   * the `details` parameter of the various get* and set* API methods.
   *
   * @param {Object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @throws if both `tabId` and `windowId` are specified, or if they are invalid.
   * @returns {Object}
   *        An object with two properties: `target` and `values`.
   *        - If a `tabId` was specified, `target` will be the corresponding
   *          XULElement tab. If a `windowId` was specified, `target` will be
   *          the corresponding ChromeWindow. Otherwise it will be `null`.
   *        - `values` will contain the icon, title, badge, etc. associated with
   *          the target.
   */
  getContextData({tabId, windowId}) {
    if (tabId != null && windowId != null) {
      throw new ExtensionError("Only one of tabId and windowId can be specified.");
    }
    let target, values;
    // if (tabId != null) {
    //   target = tabTracker.getTab(tabId);
    //   values = this.tabContext.get(target);
    // } else if (windowId != null) {
    //   target = windowTracker.getWindow(windowId);
    //   values = this.tabContext.get(target);
    // } else {
      target = null;
      values = this.globals;
    // }
    return {target, values};
  }

  /**
   * Set a global, window specific or tab specific property.
   *
   * @param {Object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @param {string} prop
   *        String property to set. Should should be one of "icon", "title",
   *        "badgeText", "popup", "badgeBackgroundColor" or "enabled".
   * @param {string} value
   *        Value for prop.
   */
  async setProperty(details, prop, value) {
    let {target, values} = this.getContextData(details);
    if (value === null) {
      delete values[prop];
    } else {
      values[prop] = value;
    }

    await this.updateOnChange(target);
  }

  /**
   * Retrieve the value of a global, window specific or tab specific property.
   *
   * @param {Object} details
   *        An object with optional `tabId` or `windowId` properties.
   * @param {string} prop
   *        String property to retrieve. Should should be one of "icon", "title",
   *        "badgeText", "popup", "badgeBackgroundColor" or "enabled".
   * @returns {string} value
   *          Value of prop.
   */
  getProperty(details, prop) {
    return this.getContextData(details).values[prop];
  }

  /**
   * WebExtension API.
   *
   * @param {Object} context
   */
  getAPI(context) {
    let {extension} = context;

    let action = this;

    return {
      [this.manifestName]: {
        onClicked: new EventManager({
          context,
          name: `${this.manifestName}.onClicked`,
          inputHandling: true,
          register: fire => {
            let listener = (event, browser) => {
              context.withPendingBrowser(browser, () => fire.sync());
            };
            action.on("click", listener);
            return () => {
              action.off("click", listener);
            };
          },
        }).api(),

        async enable(tabId) {
          await action.setProperty({tabId}, "enabled", true);
        },

        async disable(tabId) {
          await action.setProperty({tabId}, "enabled", false);
        },

        isEnabled(details) {
          return action.getProperty(details, "enabled");
        },

        async setTitle(details) {
          await action.setProperty(details, "title", details.title);
        },

        getTitle(details) {
          return action.getProperty(details, "title");
        },

        async setIcon(details) {
          details.iconType = this.manifestName;

          let icon = IconDetails.normalize(details, extension, context);
          if (!Object.keys(icon).length) {
            icon = null;
          }
          await action.setProperty(details, "icon", icon);
        },

        async setBadgeText(details) {
          await action.setProperty(details, "badgeText", details.text);
        },

        getBadgeText(details) {
          return action.getProperty(details, "badgeText");
        },

        async setPopup(details) {
          // Note: Chrome resolves arguments to setIcon relative to the calling
          // context, but resolves arguments to setPopup relative to the extension
          // root.
          // For internal consistency, we currently resolve both relative to the
          // calling context.
          let url = details.popup && context.uri.resolve(details.popup);
          if (url && !context.checkLoadURL(url)) {
            return Promise.reject({message: `Access denied for URL ${url}`});
          }
          await action.setProperty(details, "popup", url);
          return Promise.resolve(null);
        },

        getPopup(details) {
          return action.getProperty(details, "popup");
        },

        async setBadgeBackgroundColor(details) {
          let color = details.color;
          if (typeof color == "string") {
            let col = InspectorUtils.colorToRGBA(color);
            if (!col) {
              throw new ExtensionError(`Invalid badge background color: "${color}"`);
            }
            color = col && [col.r, col.g, col.b, Math.round(col.a * 255)];
          }
          await action.setProperty(details, "badgeBackgroundColor", color);
        },

        getBadgeBackgroundColor(details, callback) {
          let color = action.getProperty(details, "badgeBackgroundColor");
          return color || [0xd9, 0, 0, 255];
        },

        openPopup() {
          throw new Error("Not implemented");
        },
      },
    };
  }
};

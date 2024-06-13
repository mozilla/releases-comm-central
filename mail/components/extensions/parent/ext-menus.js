/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);
var { SelectionUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/SelectionUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  ExtensionMenus: "resource://gre/modules/ExtensionMenus.sys.mjs",
});

XPCOMUtils.defineLazyGlobalGetters(this, ["fetch", "FileReader"]);

var { makeWidgetId } = ExtensionCommon;
var { DefaultMap, ExtensionError } = ExtensionUtils;
var { IconDetails } = ExtensionParent;

const ACTION_MENU_TOP_LEVEL_LIMIT = 6;

// Map[Extension -> Map[ID -> MenuItem]]
// Note: we want to enumerate all the menu items so
// this cannot be a weak map.
var gMenuMap = new Map();

// Map[Extension -> MenuItem]
var gRootItems = new Map();

// Map[Extension -> ID[]]
// Menu IDs that were eligible for being shown in the current menu.
var gShownMenuItems = new DefaultMap(() => []);

// Map[Extension -> Set[Contexts]]
// A DefaultMap (keyed by extension) which keeps track of the
// contexts with a subscribed onShown event listener.
var gOnShownSubscribers = new DefaultMap(() => new Set());

// If id is not specified for an item we use an integer.
var gNextMenuItemID = 0;

// Used to assign unique names to radio groups.
var gNextRadioGroupID = 0;

// The max length of a menu item's label.
var gMaxLabelLength = 64;

var gMenuBuilder = {
  // When a new menu is opened, this function is called and
  // we populate the |xulMenu| with all the items from extensions
  // to be displayed. We always clear all the items again when
  // popuphidden fires.
  build(contextData) {
    contextData = this.maybeOverrideContextData(contextData);
    const xulMenu = contextData.menu;
    xulMenu.addEventListener("popuphidden", this);
    this.xulMenu = xulMenu;
    for (const [, root] of gRootItems) {
      this.createAndInsertTopLevelElements(root, contextData, null);
    }
    this.afterBuildingMenu(contextData);

    if (
      contextData.webExtContextData &&
      !contextData.webExtContextData.showDefaults
    ) {
      // Wait until nsContextMenu.js has toggled the visibility of the default
      // menu items before hiding the default items.
      Promise.resolve().then(() => this.hideDefaultMenuItems());
    }
  },

  maybeOverrideContextData(contextData) {
    const { webExtContextData } = contextData;
    if (!webExtContextData || !webExtContextData.overrideContext) {
      return contextData;
    }
    const contextDataBase = {
      menu: contextData.menu,
      // eslint-disable-next-line no-use-before-define
      originalViewType: getContextViewType(contextData),
      originalViewUrl: contextData.inFrame
        ? contextData.frameUrl
        : contextData.pageUrl,
      webExtContextData,
    };
    if (webExtContextData.overrideContext === "tab") {
      // TODO: Handle invalid tabs more gracefully (instead of throwing).
      const tab = tabTracker.getTab(webExtContextData.tabId);
      return {
        ...contextDataBase,
        tab,
        pageUrl: tab.linkedBrowser?.currentURI?.spec,
        onTab: true,
      };
    }
    throw new ExtensionError(
      `Unexpected overrideContext: ${webExtContextData.overrideContext}`
    );
  },

  createAndInsertTopLevelElements(root, contextData, nextSibling) {
    const newWebExtensionGroupSeparator = () => {
      const element =
        this.xulMenu.ownerDocument.createXULElement("menuseparator");
      element.classList.add("webextension-group-separator");
      return element;
    };

    let rootElements;
    if (
      contextData.onAction ||
      contextData.onBrowserAction ||
      contextData.onComposeAction ||
      contextData.onMessageDisplayAction
    ) {
      if (contextData.extension.id !== root.extension.id) {
        return;
      }
      rootElements = this.buildTopLevelElements(
        root,
        contextData,
        ACTION_MENU_TOP_LEVEL_LIMIT,
        false
      );

      // Action menu items are prepended to the menu, followed by a separator.
      nextSibling = nextSibling || this.xulMenu.firstElementChild;
      if (rootElements.length && !this.itemsToCleanUp.has(nextSibling)) {
        rootElements.push(newWebExtensionGroupSeparator());
      }
    } else if (
      contextData.inActionMenu ||
      contextData.inBrowserActionMenu ||
      contextData.inComposeActionMenu ||
      contextData.inMessageDisplayActionMenu
    ) {
      if (contextData.extension.id !== root.extension.id) {
        return;
      }
      rootElements = this.buildTopLevelElements(
        root,
        contextData,
        Infinity,
        false
      );
    } else if (contextData.webExtContextData) {
      const { extensionId, showDefaults, overrideContext } =
        contextData.webExtContextData;
      if (extensionId === root.extension.id) {
        rootElements = this.buildTopLevelElements(
          root,
          contextData,
          Infinity,
          false
        );
        // The extension menu should be rendered at the top, but after the navigation buttons.
        nextSibling =
          nextSibling || this.xulMenu.querySelector(":scope > :first-child");
        if (
          rootElements.length &&
          showDefaults &&
          !this.itemsToCleanUp.has(nextSibling)
        ) {
          rootElements.push(newWebExtensionGroupSeparator());
        }
      } else if (!showDefaults && !overrideContext) {
        // When the default menu items should be hidden, menu items from other
        // extensions should be hidden too.
        return;
      }
      // Fall through to show default extension menu items.
    }

    if (!rootElements) {
      rootElements = this.buildTopLevelElements(root, contextData, 1, true);
      if (
        rootElements.length &&
        !this.itemsToCleanUp.has(this.xulMenu.lastElementChild) &&
        this.xulMenu.firstChild
      ) {
        // All extension menu items are appended at the end.
        // Prepend separator if this is the first extension menu item.
        rootElements.unshift(newWebExtensionGroupSeparator());
      }
    }

    if (!rootElements.length) {
      return;
    }

    if (nextSibling) {
      nextSibling.before(...rootElements);
    } else {
      this.xulMenu.append(...rootElements);
    }
    for (const item of rootElements) {
      this.itemsToCleanUp.add(item);
    }
  },

  buildElementWithChildren(item, contextData) {
    const element = this.buildSingleElement(item, contextData);
    const children = this.buildChildren(item, contextData);
    if (children.length) {
      element.firstElementChild.append(...children);
    }
    return element;
  },

  buildChildren(item, contextData) {
    let groupName;
    const children = [];
    for (const child of item.children) {
      if (child.type == "radio" && !child.groupName) {
        if (!groupName) {
          groupName = `webext-radio-group-${gNextRadioGroupID++}`;
        }
        child.groupName = groupName;
      } else {
        groupName = null;
      }

      if (child.enabledForContext(contextData)) {
        children.push(this.buildElementWithChildren(child, contextData));
      }
    }
    return children;
  },

  buildTopLevelElements(root, contextData, maxCount, forceManifestIcons) {
    const children = this.buildChildren(root, contextData);

    // TODO: Fix bug 1492969 and remove this whole if block.
    if (
      children.length === 1 &&
      maxCount === 1 &&
      forceManifestIcons &&
      AppConstants.platform === "linux" &&
      children[0].getAttribute("type") === "checkbox"
    ) {
      // Keep single checkbox items in the submenu on Linux since
      // the extension icon overlaps the checkbox otherwise.
      maxCount = 0;
    }

    if (children.length > maxCount) {
      // Move excess items into submenu.
      const rootElement = this.buildSingleElement(root, contextData);
      rootElement.setAttribute("ext-type", "top-level-menu");
      rootElement.firstElementChild.append(...children.splice(maxCount - 1));
      children.push(rootElement);
    }

    if (forceManifestIcons) {
      for (const rootElement of children) {
        // Display the extension icon on the root element.
        if (
          root.extension.manifest.icons &&
          rootElement.getAttribute("type") !== "checkbox"
        ) {
          this.setMenuItemIcon(
            rootElement,
            root.extension,
            contextData,
            root.extension.manifest.icons
          );
        } else {
          this.removeMenuItemIcon(rootElement);
        }
      }
    }
    return children;
  },

  removeSeparatorIfNoTopLevelItems() {
    // Extension menu items always have have a non-empty ID.
    const isNonExtensionSeparator = item =>
      item.nodeName === "menuseparator" && !item.id;

    // itemsToCleanUp contains all top-level menu items. A separator should
    // only be kept if it is next to an extension menu item.
    const isExtensionMenuItemSibling = item =>
      item && this.itemsToCleanUp.has(item) && !isNonExtensionSeparator(item);

    for (const item of this.itemsToCleanUp) {
      if (isNonExtensionSeparator(item)) {
        if (
          !isExtensionMenuItemSibling(item.previousElementSibling) &&
          !isExtensionMenuItemSibling(item.nextElementSibling)
        ) {
          item.remove();
          this.itemsToCleanUp.delete(item);
        }
      }
    }
  },

  buildSingleElement(item, contextData) {
    const doc = contextData.menu.ownerDocument;
    let element;
    if (item.children.length) {
      element = this.createMenuElement(doc, item);
    } else if (item.type == "separator") {
      element = doc.createXULElement("menuseparator");
    } else {
      element = doc.createXULElement("menuitem");
    }

    return this.customizeElement(element, item, contextData);
  },

  createMenuElement(doc) {
    const element = doc.createXULElement("menu");
    // Menu elements need to have a menupopup child for its menu items.
    const menupopup = doc.createXULElement("menupopup");
    element.appendChild(menupopup);
    return element;
  },

  customizeElement(element, item, contextData) {
    let label = item.title;
    if (label) {
      let accessKey;
      label = label.replace(/&([\S\s]|$)/g, (_, nextChar, i) => {
        if (nextChar === "&") {
          return "&";
        }
        if (accessKey === undefined) {
          if (nextChar === "%" && label.charAt(i + 2) === "s") {
            accessKey = "";
          } else {
            accessKey = nextChar;
          }
        }
        return nextChar;
      });
      element.setAttribute("accesskey", accessKey || "");

      if (contextData.isTextSelected && label.includes("%s")) {
        let selection = contextData.selectionText.trim();
        // The rendering engine will truncate the title if it's longer than 64 characters.
        // But if it makes sense let's try truncate selection text only, to handle cases like
        // 'look up "%s" in MyDictionary' more elegantly.

        let codePointsToRemove = 0;

        const selectionArray = Array.from(selection);

        const completeLabelLength = label.length - 2 + selectionArray.length;
        if (completeLabelLength > gMaxLabelLength) {
          codePointsToRemove = completeLabelLength - gMaxLabelLength;
        }

        if (codePointsToRemove) {
          let ellipsis = "\u2026";
          try {
            ellipsis = Services.prefs.getComplexValue(
              "intl.ellipsis",
              Ci.nsIPrefLocalizedString
            ).data;
          } catch (e) {}
          codePointsToRemove += 1;
          selection =
            selectionArray.slice(0, -codePointsToRemove).join("") + ellipsis;
        }

        label = label.replace(/%s/g, selection);
      }

      element.setAttribute("label", label);
    }

    element.setAttribute("id", item.elementId);

    if ("icons" in item) {
      if (item.icons) {
        this.setMenuItemIcon(element, item.extension, contextData, item.icons);
      } else {
        this.removeMenuItemIcon(element);
      }
    }

    if (item.type == "checkbox") {
      element.setAttribute("type", "checkbox");
      if (item.checked) {
        element.setAttribute("checked", "true");
      }
    } else if (item.type == "radio") {
      element.setAttribute("type", "radio");
      element.setAttribute("name", item.groupName);
      if (item.checked) {
        element.setAttribute("checked", "true");
      }
    }

    if (!item.enabled) {
      element.setAttribute("disabled", "true");
    }

    let button;

    element.addEventListener(
      "command",
      async event => {
        if (event.target !== event.currentTarget) {
          return;
        }
        const wasChecked = item.checked;
        if (item.type == "checkbox") {
          item.checked = !item.checked;
        } else if (item.type == "radio") {
          // Deselect all radio items in the current radio group.
          for (const child of item.parent.children) {
            if (child.type == "radio" && child.groupName == item.groupName) {
              child.checked = false;
            }
          }
          // Select the clicked radio item.
          item.checked = true;
        }

        const { webExtContextData } = contextData;
        if (
          contextData.tab &&
          // If the menu context was overridden by the extension, do not grant
          // activeTab since the extension also controls the tabId.
          (!webExtContextData ||
            webExtContextData.extensionId !== item.extension.id)
        ) {
          item.tabManager.addActiveTabPermission(contextData.tab);
        }

        const info = await item.getClickInfo(contextData, wasChecked);
        info.modifiers = clickModifiersFromEvent(event);

        info.button = button;
        const _execute_action =
          item.extension.manifestVersion < 3
            ? "_execute_browser_action"
            : "_execute_action";

        // Allow menus to open various actions supported in webext prior
        // to notifying onclicked.
        const actionFor = {
          [_execute_action]: global.browserActionFor,
          _execute_compose_action: global.composeActionFor,
          _execute_message_display_action: global.messageDisplayActionFor,
        }[item.command];
        if (actionFor) {
          const win = event.target.ownerGlobal;
          actionFor(item.extension).triggerAction(win);
          return;
        }

        item.extension.emit(
          "webext-menu-menuitem-click",
          info,
          contextData.tab
        );
      },
      { once: true }
    );

    // eslint-disable-next-line mozilla/balanced-listeners
    element.addEventListener("click", event => {
      if (
        event.target !== event.currentTarget ||
        // Ignore menu items that are usually not clickeable,
        // such as separators and parents of submenus and disabled items.
        element.localName !== "menuitem" ||
        element.disabled
      ) {
        return;
      }

      button = event.button;
      if (event.button) {
        element.doCommand();
        contextData.menu.hidePopup();
      }
    });

    // Don't publish the ID of the root because the root element is
    // auto-generated.
    if (item.parent) {
      gShownMenuItems.get(item.extension).push(item.id);
    }

    return element;
  },

  setMenuItemIcon(element, extension, contextData, icons) {
    const parentWindow = contextData.menu.ownerGlobal;

    const { icon } = IconDetails.getPreferredIcon(
      icons,
      extension,
      16 * parentWindow.devicePixelRatio
    );

    // The extension icons in the manifest are not pre-resolved, since
    // they're sometimes used by the add-on manager when the extension is
    // not enabled, and its URLs are not resolvable.
    const resolvedURL = extension.baseURI.resolve(icon);

    if (element.localName == "menu") {
      element.setAttribute("class", "menu-iconic");
    } else if (element.localName == "menuitem") {
      element.setAttribute("class", "menuitem-iconic");
    }

    element.setAttribute("image", resolvedURL);
  },

  // Undo changes from setMenuItemIcon.
  removeMenuItemIcon(element) {
    element.removeAttribute("class");
    element.removeAttribute("image");
  },

  rebuildMenu(extension) {
    const { contextData } = this;
    if (!contextData) {
      // This happens if the menu is not visible.
      return;
    }

    // Find the group of existing top-level items (usually 0 or 1 items)
    // and remember its position for when the new items are inserted.
    const elementIdPrefix = `${makeWidgetId(extension.id)}-menuitem-`;
    let nextSibling = null;
    for (const item of this.itemsToCleanUp) {
      if (item.id && item.id.startsWith(elementIdPrefix)) {
        nextSibling = item.nextSibling;
        item.remove();
        this.itemsToCleanUp.delete(item);
      }
    }

    const root = gRootItems.get(extension);
    if (root) {
      this.createAndInsertTopLevelElements(root, contextData, nextSibling);
    }
    this.removeSeparatorIfNoTopLevelItems();
  },

  // This should be called once, after constructing the top-level menus, if any.
  afterBuildingMenu(contextData) {
    function dispatchOnShownEvent(extension) {
      // Note: gShownMenuItems is a DefaultMap, so .get(extension) causes the
      // extension to be stored in the map even if there are currently no
      // shown menu items. This ensures that the onHidden event can be fired
      // when the menu is closed.
      const menuIds = gShownMenuItems.get(extension);
      extension.emit("webext-menu-shown", menuIds, contextData);
    }

    if (
      contextData.onAction ||
      contextData.onBrowserAction ||
      contextData.onComposeAction ||
      contextData.onMessageDisplayAction
    ) {
      dispatchOnShownEvent(contextData.extension);
    } else {
      for (const extension of gOnShownSubscribers.keys()) {
        dispatchOnShownEvent(extension);
      }
    }

    this.contextData = contextData;
  },

  hideDefaultMenuItems() {
    for (const item of this.xulMenu.children) {
      if (!this.itemsToCleanUp.has(item)) {
        item.hidden = true;
      }
    }
  },

  handleEvent(event) {
    if (this.xulMenu != event.target || event.type != "popuphidden") {
      return;
    }

    delete this.xulMenu;
    delete this.contextData;

    const target = event.target;
    target.removeEventListener("popuphidden", this);
    for (const item of this.itemsToCleanUp) {
      item.remove();
    }
    this.itemsToCleanUp.clear();
    for (const extension of gShownMenuItems.keys()) {
      extension.emit("webext-menu-hidden");
    }
    gShownMenuItems.clear();
  },

  itemsToCleanUp: new Set(),
};

// Called from different action popups.
global.actionContextMenu = function (contextData) {
  contextData.originalViewType = "tab";
  gMenuBuilder.build(contextData);
};

const contextsMap = {
  onAudio: "audio",
  onEditable: "editable",
  inFrame: "frame",
  onImage: "image",
  onLink: "link",
  onPassword: "password",
  isTextSelected: "selection",
  onVideo: "video",

  onAction: "action",
  onBrowserAction: "browser_action",
  onComposeAction: "compose_action",
  onMessageDisplayAction: "message_display_action",
  inActionMenu: "action_menu",
  inBrowserActionMenu: "browser_action_menu",
  inComposeActionMenu: "compose_action_menu",
  inMessageDisplayActionMenu: "message_display_action_menu",

  onComposeBody: "compose_body",
  onTab: "tab",
  inToolsMenu: "tools_menu",
  selectedMessages: "message_list",
  selectedFolders: "folder_pane",
  selectedComposeAttachments: "compose_attachments",
  selectedMessageAttachments: "message_attachments",
  allMessageAttachments: "all_message_attachments",
};

const chromeElementsMap = {
  msgSubject: "composeSubject",
  toAddrInput: "composeTo",
  ccAddrInput: "composeCc",
  bccAddrInput: "composeBcc",
  replyAddrInput: "composeReplyTo",
  newsgroupsAddrInput: "composeNewsgroupTo",
  followupAddrInput: "composeFollowupTo",
};

const getMenuContexts = contextData => {
  const contexts = new Set();

  for (const [key, value] of Object.entries(contextsMap)) {
    if (contextData[key]) {
      contexts.add(value);
    }
  }

  if (contexts.size === 0) {
    contexts.add("page");
  }

  // New non-content contexts supported in Thunderbird are not part of "all".
  if (!contextData.onTab && !contextData.inToolsMenu) {
    contexts.add("all");
  }

  return contexts;
};

function getContextViewType(contextData) {
  if ("originalViewType" in contextData) {
    return contextData.originalViewType;
  }
  if (
    contextData.webExtBrowserType === "popup" ||
    contextData.webExtBrowserType === "sidebar"
  ) {
    return contextData.webExtBrowserType;
  }
  if (contextData.tab && contextData.menu.id === "browserContext") {
    return "tab";
  }
  return undefined;
}

/**
 * Fetches a remote resource and returns a data: url.
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchDataUrl(url) {
  const data = await fetch(url);
  const blob = await data.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => resolve(e.target.result);
    reader.readAsDataURL(blob);
  });
}

/**
 * Takes a menu API createProperties or updateProperties object and replaces any
 * remote icon urls with data urls.
 *
 * @param {createProperties|updateProperties} properties
 * @see mail/components/extensions/schemas/menus.json
 */
async function fetchRemoteIcons(properties) {
  if (!properties.icons) {
    return;
  }
  if (typeof properties.icons == "string") {
    properties.icons = { 16: properties.icons };
  }
  const re = new RegExp("^https?://", "i");
  for (const size in properties.icons) {
    if (re.test(properties.icons[size])) {
      properties.icons[size] = await fetchDataUrl(properties.icons[size]);
    }
  }
}

async function addMenuEventInfo(
  info,
  contextData,
  extension,
  includeSensitiveData
) {
  info.viewType = getContextViewType(contextData);
  if (contextData.onVideo) {
    info.mediaType = "video";
  } else if (contextData.onAudio) {
    info.mediaType = "audio";
  } else if (contextData.onImage) {
    info.mediaType = "image";
  }
  if (contextData.frameId !== undefined) {
    info.frameId = contextData.frameId;
  }
  info.editable = contextData.onEditable || false;
  if (includeSensitiveData) {
    if (contextData.timeStamp) {
      // Convert to integer, in case the DOMHighResTimeStamp has a fractional part.
      info.targetElementId = Math.floor(contextData.timeStamp);
    }
    if (contextData.onLink) {
      info.linkText = contextData.linkText;
      info.linkUrl = contextData.linkUrl;
    }
    if (contextData.onAudio || contextData.onImage || contextData.onVideo) {
      info.srcUrl = contextData.srcUrl;
    }
    info.pageUrl = contextData.pageUrl;
    if (contextData.inFrame) {
      info.frameUrl = contextData.frameUrl;
    }
    if (contextData.isTextSelected) {
      info.selectionText = contextData.selectionText;
    }
  }
  // If the context was overridden, then frameUrl should be the URL of the
  // document in which the menu was opened (instead of undefined, even if that
  // document is not in a frame).
  if (contextData.originalViewUrl) {
    info.frameUrl = contextData.originalViewUrl;
  }

  if (contextData.fieldId) {
    info.fieldId = contextData.fieldId;
  }

  if (contextData.selectedMessages && extension.hasPermission("messagesRead")) {
    info.selectedMessages = await messageListTracker.startList(
      contextData.selectedMessages,
      extension
    );
  }
  if (extension.hasPermission("accountsRead")) {
    if (contextData.displayedFolder) {
      const folder = extension.folderManager.convert(
        contextData.displayedFolder
      );
      // Do not include subfolders in Manifest V3.
      info.displayedFolder =
        extension.manifestVersion > 2
          ? folder
          : extension.folderManager.traverseSubfolders(
              contextData.displayedFolder,
              folder.accountId
            );
    }

    if (contextData.selectedFolders) {
      info.selectedFolders = contextData.selectedFolders.map(folder =>
        extension.folderManager.convert(folder)
      );

      // Manifest V2 includes a single selectedFolder property. If the context
      //   menu click in the folder pane occurred on a root folder representing
      //   an account, we include the selectedAccount property instead.
      if (extension.manifestVersion < 3) {
        const [folder] = contextData.selectedFolders;
        const [{ path, accountId }] = info.selectedFolders;
        if (path == "/") {
          info.selectedAccount = extension.accountManager.convert(
            MailServices.accounts.getAccount(accountId)
          );
        } else {
          info.selectedFolder = extension.folderManager.traverseSubfolders(
            folder,
            accountId
          );
        }
      }
    }
  }
  if (
    (contextData.selectedMessageAttachments ||
      contextData.allMessageAttachments) &&
    extension.hasPermission("messagesRead")
  ) {
    const attachments =
      contextData.selectedMessageAttachments ||
      contextData.allMessageAttachments;
    info.attachments = attachments.map(attachment => {
      return {
        contentType: attachment.contentType,
        name: attachment.name,
        size: attachment.size,
        partName: attachment.partID,
      };
    });
  }
  if (
    contextData.selectedComposeAttachments &&
    extension.hasPermission("compose")
  ) {
    if (!("composeAttachmentTracker" in global)) {
      extensions.loadModule("compose");
    }

    info.attachments = contextData.selectedComposeAttachments.map(a =>
      global.composeAttachmentTracker.convert(a, contextData.menu.ownerGlobal)
    );
  }
}

class MenuItem {
  constructor(extension, createProperties, isRoot = false) {
    this.extension = extension;
    this.children = [];
    this.parent = null;
    this.tabManager = extension.tabManager;

    this.setDefaults();
    this.setProps(createProperties);

    if (!this.hasOwnProperty("_id")) {
      this.id = gNextMenuItemID++;
    }
    // If the item is not the root and has no parent
    // it must be a child of the root.
    if (!isRoot && !this.parent) {
      this.root.addChild(this);
    }
  }

  setProps(createProperties) {
    ExtensionMenus.mergeMenuProperties(this, createProperties);

    if (createProperties.documentUrlPatterns != null) {
      this.documentUrlMatchPattern = new MatchPatternSet(
        this.documentUrlPatterns,
        {
          restrictSchemes: this.extension.restrictSchemes,
        }
      );
    }

    if (createProperties.targetUrlPatterns != null) {
      this.targetUrlMatchPattern = new MatchPatternSet(this.targetUrlPatterns, {
        // restrictSchemes default to false when matching links instead of pages
        // (see Bug 1280370 for a rationale).
        restrictSchemes: false,
      });
    }

    // If a child MenuItem does not specify any contexts, then it should
    // inherit the contexts specified from its parent.
    if (createProperties.parentId && !createProperties.contexts) {
      this.contexts = this.parent.contexts;
    }
  }

  setDefaults() {
    this.setProps({
      type: "normal",
      checked: false,
      contexts: ["all"],
      enabled: true,
      visible: true,
    });
  }

  set id(id) {
    if (this.hasOwnProperty("_id")) {
      throw new ExtensionError("ID of a MenuItem cannot be changed");
    }
    const isIdUsed = gMenuMap.get(this.extension).has(id);
    if (isIdUsed) {
      throw new ExtensionError(`ID already exists: ${id}`);
    }
    this._id = id;
  }

  get id() {
    return this._id;
  }

  get elementId() {
    let id = this.id;
    // If the ID is an integer, it is auto-generated and globally unique.
    // If the ID is a string, it is only unique within one extension and the
    // ID needs to be concatenated with the extension ID.
    if (typeof id !== "number") {
      // To avoid collisions with numeric IDs, add a prefix to string IDs.
      id = `_${id}`;
    }
    return `${makeWidgetId(this.extension.id)}-menuitem-${id}`;
  }

  ensureValidParentId(parentId) {
    if (parentId === undefined) {
      return;
    }
    const menuMap = gMenuMap.get(this.extension);
    if (!menuMap.has(parentId)) {
      throw new ExtensionError(
        `Could not find any MenuItem with id: ${parentId}`
      );
    }
    for (let item = menuMap.get(parentId); item; item = item.parent) {
      if (item === this) {
        throw new ExtensionError(
          "MenuItem cannot be an ancestor (or self) of its new parent."
        );
      }
    }
  }

  set parentId(parentId) {
    this.ensureValidParentId(parentId);

    if (this.parent) {
      this.parent.detachChild(this);
    }

    if (parentId === undefined) {
      this.root.addChild(this);
    } else {
      const menuMap = gMenuMap.get(this.extension);
      menuMap.get(parentId).addChild(this);
    }
  }

  get parentId() {
    return this.parent ? this.parent.id : undefined;
  }

  get descendantIds() {
    return this.children
      ? this.children.flatMap(m => [m.id, ...m.descendantIds])
      : [];
  }

  addChild(child) {
    if (child.parent) {
      throw new ExtensionError("Child MenuItem already has a parent.");
    }
    this.children.push(child);
    child.parent = this;
  }

  detachChild(child) {
    const idx = this.children.indexOf(child);
    if (idx < 0) {
      throw new ExtensionError(
        "Child MenuItem not found, it cannot be removed."
      );
    }
    this.children.splice(idx, 1);
    child.parent = null;
  }

  get root() {
    const extension = this.extension;
    if (!gRootItems.has(extension)) {
      const root = new MenuItem(
        extension,
        { title: extension.name },
        /* isRoot = */ true
      );
      gRootItems.set(extension, root);
    }

    return gRootItems.get(extension);
  }

  remove() {
    if (this.parent) {
      this.parent.detachChild(this);
    }
    const children = this.children.slice(0);
    for (const child of children) {
      child.remove();
    }

    const menuMap = gMenuMap.get(this.extension);
    menuMap.delete(this.id);

    if (this.root == this) {
      gRootItems.delete(this.extension);
    }
  }

  async getClickInfo(contextData, wasChecked) {
    const info = {
      menuItemId: this.id,
    };
    if (this.parent) {
      info.parentMenuItemId = this.parentId;
    }

    await addMenuEventInfo(info, contextData, this.extension, true);

    if (this.type === "checkbox" || this.type === "radio") {
      info.checked = this.checked;
      info.wasChecked = wasChecked;
    }

    return info;
  }

  enabledForContext(contextData) {
    if (!this.visible) {
      return false;
    }
    const contexts = getMenuContexts(contextData);
    if (!this.contexts.some(n => contexts.has(n))) {
      return false;
    }

    if (
      this.viewTypes &&
      !this.viewTypes.includes(getContextViewType(contextData))
    ) {
      return false;
    }

    let docPattern = this.documentUrlMatchPattern;
    // When viewTypes is specified, the menu item is expected to be restricted
    // to documents. So let documentUrlPatterns always apply to the URL of the
    // document in which the menu was opened. When maybeOverrideContextData
    // changes the context, contextData.pageUrl does not reflect that URL any
    // more, so use contextData.originalViewUrl instead.
    if (docPattern && this.viewTypes && contextData.originalViewUrl) {
      if (
        !docPattern.matches(Services.io.newURI(contextData.originalViewUrl))
      ) {
        return false;
      }
      docPattern = null; // Null it so that it won't be used with pageURI below.
    }

    let pageURI = contextData[contextData.inFrame ? "frameUrl" : "pageUrl"];
    if (pageURI) {
      pageURI = Services.io.newURI(pageURI);
      if (docPattern && !docPattern.matches(pageURI)) {
        return false;
      }
    }

    const targetPattern = this.targetUrlMatchPattern;
    if (targetPattern) {
      const targetUrls = [];
      if (contextData.onImage || contextData.onAudio || contextData.onVideo) {
        // TODO: Double check if srcUrl is always set when we need it.
        targetUrls.push(contextData.srcUrl);
      }
      if (contextData.onLink) {
        targetUrls.push(contextData.linkUrl);
      }
      if (
        !targetUrls.some(targetUrl =>
          targetPattern.matches(Services.io.newURI(targetUrl))
        )
      ) {
        return false;
      }
    }

    return true;
  }
}

// While any extensions are active, this Tracker registers to observe/listen
// for menu events from both Tools and context menus, both content and chrome.
const menuTracker = {
  menuIds: [
    "tabContextMenu",
    "folderPaneContext",
    "msgComposeAttachmentItemContext",
    "taskPopup",
  ],

  register() {
    Services.obs.addObserver(this, "on-build-contextmenu");
    for (const window of windowTracker.browserWindows()) {
      this.onWindowOpen(window);
    }
    windowTracker.addOpenListener(this.onWindowOpen);
  },

  unregister() {
    Services.obs.removeObserver(this, "on-build-contextmenu");
    for (const window of windowTracker.browserWindows()) {
      this.cleanupWindow(window);
    }
    windowTracker.removeOpenListener(this.onWindowOpen);
  },

  observe(subject) {
    subject = subject.wrappedJSObject;
    gMenuBuilder.build(subject);
  },

  onWindowOpen(window) {
    // Register the event listener on the window, as some menus we are
    // interested in are dynamically created:
    // https://hg.mozilla.org/mozilla-central/file/83a21ab93aff939d348468e69249a3a33ccfca88/toolkit/content/editMenuOverlay.js#l96
    window.addEventListener("popupshowing", menuTracker);
  },

  cleanupWindow(window) {
    window.removeEventListener("popupshowing", this);
  },

  handleEvent(event) {
    const menu = event.target;
    const trigger = menu.triggerNode;
    const win = menu.ownerGlobal;
    switch (menu.id) {
      case "taskPopup": {
        const info = { menu, inToolsMenu: true };
        if (
          win.document.location.href ==
          "chrome://messenger/content/messenger.xhtml"
        ) {
          info.tab = tabTracker.activeTab;
          // Calendar and Task view do not have a browser/URL.
          info.pageUrl = info.tab.linkedBrowser?.currentURI?.spec;
        } else {
          info.tab = win;
        }
        gMenuBuilder.build(info);
        break;
      }
      case "tabContextMenu": {
        const triggerTab = trigger.closest("tab");
        const tab = triggerTab || tabTracker.activeTab;
        const pageUrl = tab.linkedBrowser?.currentURI?.spec;
        gMenuBuilder.build({ menu, tab, pageUrl, onTab: true });
        break;
      }
      case "folderPaneContext": {
        const tab = tabTracker.activeTab;
        const pageUrl = tab.linkedBrowser?.currentURI?.spec;
        const overrideFolder = win.folderPaneContextMenu._overrideFolder;
        const selectedFolders = overrideFolder
          ? [overrideFolder]
          : [...win.folderTree.selection.values()].map(row =>
              MailServices.folderLookup.getFolderForURL(row.uri)
            );
        gMenuBuilder.build({
          menu,
          tab,
          pageUrl,
          selectedFolders,
        });
        break;
      }
      case "attachmentListContext": {
        const attachmentList =
          menu.ownerGlobal.document.getElementById("attachmentList");
        const allMessageAttachments = [...attachmentList.children].map(
          item => item.attachment
        );
        gMenuBuilder.build({
          menu,
          tab: menu.ownerGlobal,
          allMessageAttachments,
        });
        break;
      }
      case "attachmentItemContext": {
        const attachmentList =
          menu.ownerGlobal.document.getElementById("attachmentList");
        const attachmentInfo =
          menu.ownerGlobal.document.getElementById("attachmentInfo");

        // If we opened the context menu from the attachment info area (the paperclip,
        // "1 attachment" label, filename, or file size, just grab the first (and
        // only) attachment as our "selected" attachments.
        let selectedMessageAttachments;
        if (
          menu.triggerNode == attachmentInfo ||
          menu.triggerNode.parentNode == attachmentInfo
        ) {
          selectedMessageAttachments = [
            attachmentList.getItemAtIndex(0).attachment,
          ];
        } else {
          selectedMessageAttachments = [...attachmentList.selectedItems].map(
            item => item.attachment
          );
        }

        gMenuBuilder.build({
          menu,
          tab: menu.ownerGlobal,
          selectedMessageAttachments,
        });
        break;
      }
      case "msgComposeAttachmentItemContext": {
        const bucket = menu.ownerDocument.getElementById("attachmentBucket");
        const selectedComposeAttachments = [];
        for (const item of bucket.itemChildren) {
          if (item.selected) {
            selectedComposeAttachments.push(item.attachment);
          }
        }
        gMenuBuilder.build({
          menu,
          tab: menu.ownerGlobal,
          selectedComposeAttachments,
        });
        break;
      }
      default:
        // Fall back to the triggerNode. Make sure we are not re-triggered by a
        // sub-menu.
        if (menu.parentNode.localName == "menu") {
          return;
        }
        if (Object.keys(chromeElementsMap).includes(trigger?.id)) {
          const selectionInfo = SelectionUtils.getSelectionDetails(win);
          const isContentSelected = !selectionInfo.docSelectionIsCollapsed;
          const textSelected = selectionInfo.text;
          const isTextSelected = !!textSelected.length;
          gMenuBuilder.build({
            menu,
            tab: win,
            pageUrl: win.browser.currentURI.spec,
            onEditable: true,
            isContentSelected,
            isTextSelected,
            onTextInput: true,
            originalViewType: "tab",
            fieldId: chromeElementsMap[trigger.id],
            selectionText: isTextSelected ? selectionInfo.fullText : undefined,
          });
        }
        break;
    }
  },
};

this.menus = class extends ExtensionAPIPersistent {
  #promiseInitialized = null;

  constructor(extension) {
    super(extension);

    if (!gMenuMap.size) {
      menuTracker.register();
    }
    gMenuMap.set(extension, new Map());
  }

  async initExtensionMenus() {
    const { extension } = this;
    await ExtensionMenus.asyncInitForExtension(extension);

    if (
      extension.hasShutdown ||
      !ExtensionMenus.shouldPersistMenus(extension)
    ) {
      return;
    }

    // Used for testing.
    const notifyMenusCreated = () =>
      extension.emit("webext-menus-created", gMenuMap.get(extension));

    const menus = ExtensionMenus.getMenus(extension);
    if (!menus.size) {
      notifyMenusCreated();
      return;
    }

    const createErrorMenuIds = [];
    for (const createProperties of menus.values()) {
      // The order of menu creation is significant:
      // When creating and reparenting the menu we ensure parents exist
      // in the persisted menus map before children.  That allows the
      // menus to be recreated in the correct sequence on startup.
      //
      // For details, see ExtensionMenusManager's updateMenus in
      // ExtensionMenus.sys.mjs
      try {
        const menuItem = new MenuItem(extension, createProperties);
        gMenuMap.get(extension).set(menuItem.id, menuItem);
      } catch (err) {
        console.error(
          `Unexpected error on recreating persisted menu ${createProperties?.id} for ${extension.id}: ${err}`
        );
        createErrorMenuIds.push(createProperties.id);
      }
    }

    if (createErrorMenuIds.length) {
      ExtensionMenus.deleteMenus(extension, createErrorMenuIds);
    }

    notifyMenusCreated();
  }

  onStartup() {
    this.#promiseInitialized = this.initExtensionMenus();
  }

  onShutdown() {
    const { extension } = this;

    if (gMenuMap.has(extension)) {
      gMenuMap.delete(extension);
      gRootItems.delete(extension);
      gShownMenuItems.delete(extension);
      gOnShownSubscribers.delete(extension);
      if (!gMenuMap.size) {
        menuTracker.unregister();
      }
    }
  }

  PERSISTENT_EVENTS = {
    onShown({ fire }) {
      const { extension } = this;
      const listener = async (event, menuIds, contextData) => {
        const info = {
          menuIds,
          contexts: Array.from(getMenuContexts(contextData)),
        };

        const nativeTab = contextData.tab;

        // The menus.onShown event is fired before the user has consciously
        // interacted with an extension, so we require permissions before
        // exposing sensitive contextual data.
        const contextUrl = contextData.inFrame
          ? contextData.frameUrl
          : contextData.pageUrl;

        const ownerDocumentUrl = contextData.menu.ownerDocument.location.href;

        let contextScheme;
        if (contextUrl) {
          contextScheme = Services.io.newURI(contextUrl).scheme;
        }

        const includeSensitiveData =
          (nativeTab &&
            extension.tabManager.hasActiveTabPermission(nativeTab)) ||
          (contextUrl && extension.allowedOrigins.matches(contextUrl)) ||
          (MESSAGE_PROTOCOLS.includes(contextScheme) &&
            extension.hasPermission("messagesRead")) ||
          (ownerDocumentUrl ==
            "chrome://messenger/content/messengercompose/messengercompose.xhtml" &&
            extension.hasPermission("compose"));

        await addMenuEventInfo(
          info,
          contextData,
          extension,
          includeSensitiveData
        );

        const tab = nativeTab && extension.tabManager.convert(nativeTab);
        fire.sync(info, tab);
      };
      gOnShownSubscribers.get(extension).add(listener);
      extension.on("webext-menu-shown", listener);
      return {
        unregister() {
          const listeners = gOnShownSubscribers.get(extension);
          listeners.delete(listener);
          if (listeners.size === 0) {
            gOnShownSubscribers.delete(extension);
          }
          extension.off("webext-menu-shown", listener);
        },
        convert(_fire) {
          fire = _fire;
        },
      };
    },
    onHidden({ fire }) {
      const { extension } = this;
      const listener = () => {
        fire.sync();
      };
      extension.on("webext-menu-hidden", listener);
      return {
        unregister() {
          extension.off("webext-menu-hidden", listener);
        },
        convert(_fire) {
          fire = _fire;
        },
      };
    },
    onClicked({ context, fire }) {
      const { extension } = this;
      const listener = async (event, info, nativeTab) => {
        const tab = nativeTab && extension.tabManager.convert(nativeTab);
        if (fire.wakeup) {
          // Force the wakeup, thus the call to convert to get the context.
          await fire.wakeup();
          // If while waiting the tab disappeared we bail out.
          if (!tabTracker.getTab(tab.id, /* do not throw, but return */ null)) {
            console.error(
              `menus.onClicked: target tab closed during background startup.`
            );
            return;
          }
        }
        // The pending browser concept is a hack to be able to access the browser
        // without having to explicitly pass it around. This basically sets
        // context.pendingEventBrowser before calling the provided callback.
        // The linked browser being null (for example if no message is selected)
        // does not have negative consequences here.
        context.withPendingBrowser(nativeTab.linkedBrowser, () =>
          fire.sync(info, tab)
        );
      };

      extension.on("webext-menu-menuitem-click", listener);
      return {
        unregister() {
          extension.off("webext-menu-menuitem-click", listener);
        },
        convert(_fire, _context) {
          fire = _fire;
          context = _context;
        },
      };
    },
  };

  getAPI(context) {
    const { extension } = context;

    return {
      menus: {
        refresh() {
          gMenuBuilder.rebuildMenu(extension);
        },

        onShown: new EventManager({
          context,
          module: "menus",
          event: "onShown",
          extensionApi: this,
        }).api(),
        onHidden: new EventManager({
          context,
          module: "menus",
          event: "onHidden",
          extensionApi: this,
        }).api(),
        onClicked: new EventManager({
          context,
          module: "menus",
          event: "onClicked",
          extensionApi: this,
        }).api(),

        create: async createProperties => {
          await this.#promiseInitialized;
          if (extension.hasShutdown) {
            return;
          }

          // Event pages require an id.
          if (ExtensionMenus.shouldPersistMenus(extension)) {
            if (!createProperties.id) {
              throw new ExtensionError(
                "menus.create requires an id for non-persistent background scripts."
              );
            }
            if (gMenuMap.get(extension).has(createProperties.id)) {
              throw new ExtensionError(
                `The menu id ${createProperties.id} already exists in menus.create.`
              );
            }
          }

          // Pre-fetch the icon from http(s) and replace it by a data: uri.
          await fetchRemoteIcons(createProperties);

          // Note that the id is required by the schema. If the addon did not set
          // it, the implementation of menus.create in the child will add it for
          // extensions with persistent backgrounds, but not otherwise.
          const menuItem = new MenuItem(extension, createProperties);
          ExtensionMenus.addMenu(extension, createProperties);
          gMenuMap.get(extension).set(menuItem.id, menuItem);
        },

        update: async (id, updateProperties) => {
          await this.#promiseInitialized;
          if (extension.hasShutdown) {
            return;
          }

          const menuItem = gMenuMap.get(extension).get(id);
          if (!menuItem) {
            return;
          }

          // Pre-fetch the icon from http(s) and replace it by a data: uri.
          await fetchRemoteIcons(updateProperties);

          menuItem.setProps(updateProperties);
          ExtensionMenus.updateMenu(extension, id, updateProperties);
        },

        remove: async id => {
          await this.#promiseInitialized;
          if (extension.hasShutdown) {
            return;
          }

          const menuItem = gMenuMap.get(extension).get(id);
          if (menuItem) {
            const menuIds = [menuItem.id, ...menuItem.descendantIds];
            menuItem.remove();
            ExtensionMenus.deleteMenus(extension, menuIds);
          }
        },

        removeAll: async () => {
          await this.#promiseInitialized;
          if (extension.hasShutdown) {
            return;
          }

          const root = gRootItems.get(extension);
          if (root) {
            root.remove();
          }
          ExtensionMenus.deleteAllMenus(extension);
        },
      },
    };
  }
};

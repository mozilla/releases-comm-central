/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//
function MenuManager(commandManager, menuSpecs, contextFunction, commandStr) {
  var menuManager = this;

  this.commandManager = commandManager;
  this.menuSpecs = menuSpecs;
  this.contextFunction = contextFunction;
  this.commandStr = commandStr;
  this.cxStore = {};

  this.onPopupShowing = function (event) {
    return menuManager.showPopup(event);
  };
  this.onPopupHiding = function (event) {
    return menuManager.hidePopup(event);
  };
  this.onMenuCommand = function (event) {
    return menuManager.menuCommand(event);
  };

  /* The code using us may override these with functions which will be called
   * after all our internal processing is done. Both are called with the
   * arguments 'event' (DOM), 'cx' (JS), 'popup' (DOM).
   */
  this.onCallbackPopupShowing = null;
  this.onCallbackPopupHiding = null;
}

MenuManager.prototype.createContextMenus = function (document) {
  for (var id in this.menuSpecs) {
    if (id.startsWith("context:")) {
      this.createContextMenu(document, id);
    }
  }
};

MenuManager.prototype.createContextMenu = function (document, id) {
  if (!document.getElementById(id)) {
    if (!ASSERT(id in this.menuSpecs, "unknown context menu " + id)) {
      return;
    }

    var dp = document.getElementById("dynamic-popups");
    var popup = this.appendPopupMenu(dp, null, id, id);
    var items = this.menuSpecs[id].items;
    this.createMenuItems(popup, null, items);

    if (!("uiElements" in this.menuSpecs[id])) {
      this.menuSpecs[id].uiElements = [popup];
    } else if (!this.menuSpecs[id].uiElements.includes(popup)) {
      this.menuSpecs[id].uiElements.push(popup);
    }
  }
};

MenuManager.prototype.createMenus = function (document, menuid) {
  var menu = document.getElementById(menuid);
  for (var id in this.menuSpecs) {
    var domID;
    if ("domID" in this.menuSpecs[id]) {
      domID = this.menuSpecs[id].domID;
    } else {
      domID = id;
    }

    if (id.startsWith(menuid + ":")) {
      this.createMenu(menu, null, id, domID);
    }
  }
};

/**
 * Internal use only.
 *
 * Registers event handlers on a given menu.
 */
MenuManager.prototype.hookPopup = function (node) {
  node.addEventListener("popupshowing", this.onPopupShowing);
  node.addEventListener("popuphiding", this.onPopupHiding);
};

/**
 * Internal use only.
 *
 * |showPopup| is called from the "onpopupshowing" event of menus managed
 * by the CommandManager. If a command is disabled, represents a command
 * that cannot be "satisfied" by the current command context |cx|, or has an
 * "enabledif" attribute that eval()s to false, then the menuitem is disabled.
 * In addition "checkedif" and "visibleif" attributes are eval()d and
 * acted upon accordingly.
 */
MenuManager.prototype.showPopup = function (event) {
  /* returns true if the command context has the properties required to
   * execute the command associated with |menuitem|.
   */
  function satisfied() {
    if (
      menuitem.hasAttribute("isSeparator") ||
      !menuitem.hasAttribute("commandname")
    ) {
      return true;
    }

    if (!("menuManager" in cx)) {
      dd("no menuManager in cx");
      return false;
    }

    var name = menuitem.getAttribute("commandname");
    var commandManager = cx.menuManager.commandManager;
    var commands = commandManager.commands;

    if (
      !ASSERT(name in commands, "menu contains unknown command '" + name + "'")
    ) {
      return false;
    }

    var rv = commandManager.isCommandSatisfied(cx, commands[name]);
    delete cx.parseError;
    return rv;
  }

  /* Convenience function for "enabledif", etc, attributes. */
  function has(prop) {
    return prop in cx;
  }

  /* evals the attribute named |attr| on the node |node|. */
  function evalIfAttribute(node, attr) {
    var ex;
    var expr = node.getAttribute(attr);
    if (!expr) {
      return true;
    }

    expr = expr.replace(/\Wand\W/gi, " && ");
    expr = expr.replace(/\Wor\W/gi, " || ");

    try {
      return eval("(" + expr + ")");
    } catch (ex) {
      dd(
        "caught exception evaling '" +
          node.getAttribute("id") +
          "'.'" +
          attr +
          "': '" +
          expr +
          "'\n" +
          ex
      );
    }
    return true;
  }

  /* evals the attribute named |attr| on the node |node|. */
  function evalAttribute(node, attr) {
    var ex;
    var expr = node.getAttribute(attr);
    if (!expr) {
      return null;
    }

    try {
      return eval(expr);
    } catch (ex) {
      dd(
        "caught exception evaling '" +
          node.getAttribute("id") +
          "'.'" +
          attr +
          "': '" +
          expr +
          "'\n" +
          ex
      );
    }
    return null;
  }

  /* replace "string $with a $variable", with
   * "string " + vars["with"] + " with a " + vars["variable"] */
  function replaceVars(str, vars) {
    function doReplace(symbol) {
      var name = symbol.substr(1);
      if (name in vars) {
        return vars[name];
      }

      return "$" + name;
    }

    return str.replace(/(\$\w[\w\d\-]+)/g, doReplace);
  }

  var cx;
  var popup = event.originalTarget;
  var menuName = popup.getAttribute("menuName");

  /* If the host provided a |contextFunction|, use it now.  Remember the
   * return result as this.cx for use if something from this menu is actually
   * dispatched.  */
  if (typeof this.contextFunction == "function") {
    cx = this.cx = this.contextFunction(menuName, event);
  } else {
    cx = this.cx = { menuManager: this, originalEvent: event };
  }

  // Keep the context around by menu name. Removed in hidePopup.
  this.cxStore[menuName] = cx;

  var menuitem = popup.firstChild;
  do {
    /* should it be visible? */
    if (menuitem.hasAttribute("visibleif")) {
      if (evalIfAttribute(menuitem, "visibleif")) {
        menuitem.removeAttribute("hidden");
      } else {
        menuitem.setAttribute("hidden", "true");
        continue;
      }
    }

    /* it's visible, maybe it has a dynamic label? */
    if (menuitem.hasAttribute("format")) {
      var label = replaceVars(menuitem.getAttribute("format"), cx);
      if (label.includes("$")) {
        label = menuitem.getAttribute("backupLabel");
      }
      menuitem.setAttribute("label", label);
    }

    /* ok, it's visible, maybe it should be disabled? */
    if (satisfied()) {
      if (menuitem.hasAttribute("enabledif")) {
        if (evalIfAttribute(menuitem, "enabledif")) {
          menuitem.removeAttribute("disabled");
        } else {
          menuitem.setAttribute("disabled", "true");
        }
      } else {
        menuitem.removeAttribute("disabled");
      }
    } else {
      menuitem.setAttribute("disabled", "true");
    }

    /* should it have a check? */
    if (menuitem.hasAttribute("checkedif")) {
      if (evalIfAttribute(menuitem, "checkedif")) {
        menuitem.setAttribute("checked", "true");
      } else {
        menuitem.removeAttribute("checked");
      }
    }
  } while ((menuitem = menuitem.nextSibling));

  if (typeof this.onCallbackPopupShowing == "function") {
    this.onCallbackPopupShowing(event, cx, popup);
  }

  return true;
};

/**
 * Internal use only.
 *
 * |hidePopup| is called from the "onpopuphiding" event of menus
 * managed by the CommandManager.  Clean up this.cxStore, but
 * not this.cx because that messes up nested menus.
 */
MenuManager.prototype.hidePopup = function (event) {
  var popup = event.originalTarget;
  var menuName = popup.getAttribute("menuName");

  if (typeof this.onCallbackPopupHiding == "function") {
    this.onCallbackPopupHiding(event, this.cxStore[menuName], popup);
  }

  delete this.cxStore[menuName];

  return true;
};

MenuManager.prototype.menuCommand = function (event) {
  /* evals the attribute named |attr| on the node |node|. */
  function evalAttribute(node, attr) {
    var ex;
    var expr = node.getAttribute(attr);
    if (!expr) {
      return null;
    }

    try {
      return eval(expr);
    } catch (ex) {
      dd(
        "caught exception evaling '" +
          node.getAttribute("id") +
          "'.'" +
          attr +
          "': '" +
          expr +
          "'\n" +
          ex
      );
    }
    return null;
  }

  eval(this.commandStr);
};

/**
 * Appends a sub-menu to an existing menu.
 * @param parentNode  DOM Node to insert into
 * @param beforeNode  DOM Node already contained by parentNode, to insert before
 * @param domId       ID of the sub-menu to add.
 * @param label       Text to use for this sub-menu.
 * @param accesskey   Accesskey to use for the sub-menu.
 * @param attribs     Object containing CSS attributes to set on the element.
 */
MenuManager.prototype.appendSubMenu = function (
  parentNode,
  beforeNode,
  menuName,
  domId,
  label,
  accesskey,
  attribs
) {
  var document = parentNode.ownerDocument;

  /* sometimes the menu is already there, for overlay purposes. */
  var menu = document.getElementById(domId);

  if (!menu) {
    menu = document.createElement("menu");
    menu.setAttribute("id", domId);
  }

  var menupopup = menu.firstChild;

  if (!menupopup) {
    menupopup = document.createElement("menupopup");
    menupopup.setAttribute("id", domId + "-popup");
    menu.appendChild(menupopup);
    menupopup = menu.firstChild;
  }

  menupopup.setAttribute("menuName", menuName);

  menu.setAttribute("accesskey", accesskey);
  label = label.replace("&", "");
  menu.setAttribute("label", label);
  menu.setAttribute("isSeparator", true);

  // Only attach the menu if it's not there already. This can't be in the
  // if (!menu) block because the updateMenus code clears toplevel menus,
  // orphaning the submenus, to (parts of?) which we keep handles in the
  // uiElements array. See the updateMenus code.
  if (!menu.parentNode) {
    parentNode.insertBefore(menu, beforeNode);
  }

  if (typeof attribs == "object") {
    for (var p in attribs) {
      menu.setAttribute(p, attribs[p]);
    }
  }

  this.hookPopup(menupopup);

  return menupopup;
};

/**
 * Appends a popup to an existing popupset.
 * @param parentNode  DOM Node to insert into
 * @param beforeNode  DOM Node already contained by parentNode, to insert before
 * @param id      ID of the popup to add.
 * @param label   Text to use for this popup.  Popup menus don't normally have
 *                labels, but we set a "label" attribute anyway, in case
 *                the host wants it for some reason.  Any "&" characters will
 *                be stripped.
 * @param attribs Object containing CSS attributes to set on the element.
 */
MenuManager.prototype.appendPopupMenu = function (
  parentNode,
  beforeNode,
  menuName,
  id,
  label,
  attribs
) {
  var document = parentNode.ownerDocument;
  var popup = document.createElement("menupopup");
  popup.setAttribute("id", id);
  if (label) {
    popup.setAttribute("label", label.replace("&", ""));
  }
  if (typeof attribs == "object") {
    for (var p in attribs) {
      popup.setAttribute(p, attribs[p]);
    }
  }

  popup.setAttribute("menuName", menuName);

  parentNode.insertBefore(popup, beforeNode);
  this.hookPopup(popup);

  return popup;
};

/**
 * Appends a menuitem to an existing menu or popup.
 * @param parentNode  DOM Node to insert into
 * @param beforeNode  DOM Node already contained by parentNode, to insert before
 * @param command A reference to the CommandRecord this menu item will represent.
 * @param attribs Object containing CSS attributes to set on the element.
 */
MenuManager.prototype.appendMenuItem = function (
  parentNode,
  beforeNode,
  commandName,
  attribs
) {
  var menuManager = this;

  var document = parentNode.ownerDocument;
  if (commandName == "-") {
    return this.appendMenuSeparator(parentNode, beforeNode, attribs);
  }

  var parentId = parentNode.getAttribute("id");

  if (
    !ASSERT(
      commandName in this.commandManager.commands,
      "unknown command " + commandName + " targeted for " + parentId
    )
  ) {
    return null;
  }

  var command = this.commandManager.commands[commandName];
  var menuitem = document.createElement("menuitem");
  menuitem.setAttribute("id", parentId + ":" + commandName);
  menuitem.setAttribute("commandname", command.name);
  // Add keys if this isn't a context menu:
  if (!parentId.startsWith("context")) {
    menuitem.setAttribute("key", "key:" + command.name);
  }
  menuitem.setAttribute("accesskey", command.accesskey);
  var label = command.label.replace("&", "");
  menuitem.setAttribute("label", label);
  if (command.format) {
    menuitem.setAttribute("format", command.format);
    menuitem.setAttribute("backupLabel", label);
  }

  if (typeof attribs == "object" && attribs) {
    for (var p in attribs) {
      menuitem.setAttribute(p, attribs[p]);
    }
  }

  command.uiElements.push(menuitem);
  parentNode.insertBefore(menuitem, beforeNode);
  /* It seems, bob only knows why, that this must be done AFTER the node is
   * added to the document.
   */
  menuitem.addEventListener("command", this.onMenuCommand);

  return menuitem;
};

/**
 * Appends a menuseparator to an existing menu or popup.
 * @param parentNode  DOM Node to insert into
 * @param beforeNode  DOM Node already contained by parentNode, to insert before
 * @param attribs Object containing CSS attributes to set on the element.
 */
MenuManager.prototype.appendMenuSeparator = function (
  parentNode,
  beforeNode,
  attribs
) {
  var document = parentNode.ownerDocument;
  var menuitem = document.createElement("menuseparator");
  menuitem.setAttribute("isSeparator", true);
  if (typeof attribs == "object") {
    for (var p in attribs) {
      menuitem.setAttribute(p, attribs[p]);
    }
  }
  parentNode.insertBefore(menuitem, beforeNode);

  return menuitem;
};

/**
 * Creates menu DOM nodes from a menu specification.
 * @param parentNode  DOM Node to insert into
 * @param beforeNode  DOM Node already contained by parentNode, to insert before
 * @param menuSpec    array of menu items
 */
MenuManager.prototype.createMenu = function (
  parentNode,
  beforeNode,
  menuName,
  domId,
  attribs
) {
  if (typeof domId == "undefined") {
    domId = menuName;
  }

  if (!ASSERT(menuName in this.menuSpecs, "unknown menu name " + menuName)) {
    return null;
  }

  var menuSpec = this.menuSpecs[menuName];
  if (!("accesskey" in menuSpec)) {
    menuSpec.accesskey = getAccessKey(menuSpec.label);
  }

  var subMenu = this.appendSubMenu(
    parentNode,
    beforeNode,
    menuName,
    domId,
    menuSpec.label,
    menuSpec.accesskey,
    attribs
  );

  // Keep track where we're adding popup nodes derived from some menuSpec
  if (!("uiElements" in this.menuSpecs[menuName])) {
    this.menuSpecs[menuName].uiElements = [subMenu];
  } else if (!this.menuSpecs[menuName].uiElements.includes(subMenu)) {
    this.menuSpecs[menuName].uiElements.push(subMenu);
  }

  this.createMenuItems(subMenu, null, menuSpec.items);
  return subMenu;
};

MenuManager.prototype.createMenuItems = function (
  parentNode,
  beforeNode,
  menuItems
) {
  function itemAttribs() {
    return 1 in menuItems[i] ? menuItems[i][1] : null;
  }

  var parentId = parentNode.getAttribute("id");

  for (var i in menuItems) {
    var itemName = menuItems[i][0];
    if (itemName[0] == ">") {
      itemName = itemName.substr(1);
      if (
        !ASSERT(
          itemName in this.menuSpecs,
          "unknown submenu " + itemName + " referenced in " + parentId
        )
      ) {
        continue;
      }
      this.createMenu(
        parentNode,
        beforeNode,
        itemName,
        parentId + ":" + itemName,
        itemAttribs()
      );
    } else if (itemName in this.commandManager.commands) {
      this.appendMenuItem(parentNode, beforeNode, itemName, itemAttribs());
    } else if (itemName == "-") {
      this.appendMenuSeparator(parentNode, beforeNode, itemAttribs());
    } else {
      dd("unknown command " + itemName + " referenced in " + parentId);
    }
  }
};

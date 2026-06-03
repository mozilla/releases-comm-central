/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

/**
 * TBPRO Menu
 *
 * This api provides a set of methods for creating and managing an item in the app
 * menu for TB Pro. This includes submenus and an event to react to clicks on
 * items. All create elements are tracked and removed automaticlly if the addon
 * is removed or shutdown.
 */

(function (exports) {
  var { ExtensionSupport } = ChromeUtils.importESModule(
    'resource:///modules/ExtensionSupport.sys.mjs'
  );
  var {
    ExtensionUtils: { ExtensionError },
  } = ChromeUtils.importESModule(
    'resource://gre/modules/ExtensionUtils.sys.mjs'
  );

  var gMenuItems = {};
  var gRootMenuId = null;

  const styleSheetContent = `
    .tbpro-header-button {
      position: relative;
      padding-bottom: 8px;
      margin-bottom: 8px;
      justify-content: flex-start;

      & .tbpro-header-content {
        font-size: 1.2rem;
        flex: 1;
      }

      & .tbpro-menu-item-bold-text {
        font-weight: bold;
      }

      & image {
        margin-left: 4rem;
      }
    }

    .tbpro-menu-item-text:not(:empty) + .tbpro-menu-item-bold-text:not(:empty)::before {
      content: " ";
    }

    .tbpro-panel-header {
      position: relative;
      border-bottom: 0;
      margin-bottom: 8px;

      & h1 {
        text-align: left;
        font-size: 13px;
      }
    }

    .tbpro-divider {
      left: 8px;
      bottom: 0;
      position: absolute;
      width: calc(100% - 16px);
      height: 2px;
      align-self: stretch;
      background-image: linear-gradient(to right, var(--color-accent-blue) 31%, var(--color-accent-purple));

      &.tbpro-submenu-divider {
        width: calc(100% - 32px);
        left: 16px;
      }
    }
  `;

  /**
   * Gets the main Thunderbird Pro toolbar button with its divider
   *
   * @param {DOMWindow} window  The window to add the button to
   * @param {extension} extension The extension to add the button with
   * @param {string} itemId The id name of the button
   */
  function _getRootButton(window, extension, itemId) {
    let toolbarButton = window.document.getElementById(
      'tbpro-menu-id-' + itemId
    );
    if (toolbarButton) {
      return toolbarButton;
    }

    const createElement = _createElement.bind(null, window, extension);

    toolbarButton = createElement({
      id: 'tbpro-menu-id-' + itemId,
      type: 'toolbarbutton',
      classes: ['subviewbutton', 'subviewbutton-iconic', 'tbpro-header-button'],
      attributes: { closemenu: '' },
      xul: true,
    });

    const divider = createElement({ type: 'div', classes: ['tbpro-divider'] });
    const text = createElement({
      type: 'span',
      classes: ['tbpro-menu-item-text'],
    });
    const wrapper = createElement({
      type: 'span',
      classes: ['tbpro-header-content'],
    });
    const boldText = createElement({
      type: 'span',
      classes: ['tbpro-menu-item-bold-text'],
    });

    wrapper.appendChild(text);
    wrapper.appendChild(boldText);

    toolbarButton.appendChild(wrapper);
    toolbarButton.appendChild(divider);

    toolbarButton.addEventListener('click', () => {
      if (!toolbarButton.classList.contains('subviewbutton-nav')) {
        extension.emit('menu-item-clicked', itemId);
      }
    });

    const banner = window.document.getElementById('appMenu-addon-banners');
    banner.parentNode.insertBefore(toolbarButton, banner.nextSibling);

    return toolbarButton;
  }

  /**
   * Apply a function to all main mail windows
   *
   * @param {Function} func The function to execute
   */
  function _applyForWindows(func) {
    for (const win of ExtensionSupport.openWindows) {
      if (
        win.document.location.href ==
        'chrome://messenger/content/messenger.xhtml'
      ) {
        func(win, win.document);
      }
    }
  }

  /**
   * Create a pro menu item in the specified window
   *
   * @param {DOMWindow} window - The window to inject into.
   * @param {Extension} extension - The extension object to create this element for.
   * @param {string} id - The id of the menu item to create.
   * @param {object} createProps - The create properties
   * @param {string} createProps.title - The title of the menu item
   * @param {string} createProps.secondaryTitle - The secondary title of the item, if applicable
   * @param {string} createProps.parentId - The parent menu item id.
   */
  function _createMenuItem(
    window,
    extension,
    id,
    { title, secondaryTitle, tooltip, parentId }
  ) {
    const document = window.document;

    if (parentId) {
      const parentToolbarItem = document.getElementById(
        'tbpro-menu-id-' + parentId
      );

      let submenu;
      if (!parentToolbarItem.classList.contains('subviewbutton-nav')) {
        // Parent is an item, not a subview. Needs adapting.
        let parentText = parentToolbarItem.querySelector(
          '.tbpro-menu-item-text'
        )?.textContent;
        if (!parentText) {
          parentText = parentToolbarItem.textContent;
        }

        submenu = _addSubMenu(
          window,
          extension,
          parentText,
          'appMenu-tbpro-submenu-' + parentId
        );
        parentToolbarItem.setAttribute(
          'oncommand',
          `PanelUI.showSubView('appMenu-tbpro-submenu-${parentId}', this)`
        );
        parentToolbarItem.classList.add('subviewbutton-nav');
        parentToolbarItem.setAttribute('closemenu', 'none');
      } else {
        submenu = document.getElementById('appMenu-tbpro-submenu-' + parentId);
      }

      if (submenu) {
        _addSubMenuItem(window, extension, {
          text: title,
          action: id,
          id: 'tbpro-menu-id-' + id,
          menuId: submenu.id,
          tooltip: tooltip,
          close: '',
        });
      }
    } else {
      const menuItem = _getRootButton(window, extension, id);
      menuItem.querySelector('.tbpro-menu-item-text').textContent = title;
      menuItem.querySelector('.tbpro-menu-item-bold-text').textContent =
        secondaryTitle;
      menuItem.setAttribute('tooltiptext', tooltip || '');
    }
  }

  /**
   * Update a pro menu item in the specified window
   *
   * @param {DOMWindow} window - The window to inject into.
   * @param {string} id - The id of the menu item to create.
   * @param {object} createProps - The create properties
   * @param {string} createProps.title - The title of the menu item
   * @param {string} createProps.secondaryTitle - The secondary title of the item, if applicable
   */
  function _updateMenuItem(window, id, { title, secondaryTitle, tooltip }) {
    const document = window.document;
    const menuItem = document.getElementById('tbpro-menu-id-' + id);
    if (!menuItem) {
      throw new ExtensionError('Could not find item ' + id);
    }

    if (menuItem.classList.contains('tbpro-header-button')) {
      if (title !== null) {
        menuItem.querySelector('.tbpro-menu-item-text').textContent = title;
      }

      if (secondaryTitle !== null) {
        menuItem.querySelector('.tbpro-menu-item-bold-text').textContent =
          secondaryTitle;
      }
    } else {
      if (title !== null) {
        menuItem.setAttribute('label', title);
      }
    }
    menuItem.setAttribute('tooltiptext', tooltip || '');
  }

  /**
   * Add a submenu to the app menu which the header button will navigate to.
   *
   * @param {DOMWindow} window - The window to inject into.
   * @param {Extension} extension - The extension object to create this element for.
   * @param {string} text - The username of the current user to display in the menu header
   * @param {string} id - Id to use for the submenu.
   *
   * @returns {HTMLElement} - The submenu element
   */
  function _addSubMenu(window, extension, text, id) {
    const { document } = window;

    const createElement = _createElement.bind(null, window, extension);

    const panel = createElement({
      type: 'panelview',
      id,
      classes: ['PanelUI-subView', 'tbpro-panel-subview'],
      xul: true,
    });

    const box = createElement({
      type: 'box',
      xul: true,
      classes: ['panel-header', 'tbpro-panel-header'],
    });

    const backLabel =
      document
        .querySelector('.subviewbutton-back[aria-label]')
        ?.getAttribute('aria-label') || 'Back';

    const backButton = createElement({
      type: 'toolbarbutton',
      classes: ['subviewbutton', 'subviewbutton-iconic', 'subviewbutton-back'],
      xul: true,
      attributes: {
        closemenu: 'none',
        tabindex: '0',
        'aria-label': backLabel,
      },
    });

    const icon = createElement({
      type: 'image',
      xul: true,
      classes: ['toolbarbutton-icon'],
    });

    const label = createElement({
      type: 'label',
      xul: true,
      classes: ['toolbarbutton-text'],
      attributes: {
        crop: 'end',
        flex: '1',
      },
    });

    backButton.appendChild(icon);
    backButton.appendChild(label);
    backButton.addEventListener('click', () => {
      document.querySelector('#appMenu-multiView').goBack();
    });

    const heading = createElement({ type: 'h1' });
    heading.textContent = text;

    const divider = createElement({
      type: 'div',
      classes: ['tbpro-divider', 'tbpro-submenu-divider'],
    });

    box.appendChild(backButton);
    box.appendChild(heading);
    box.appendChild(divider);

    const vbox = createElement({
      type: 'vbox',
      xul: true,
      classes: ['panel-subview-body'],
    });

    vbox.appendChild(box);
    panel.appendChild(vbox);

    document.getElementById('appMenu-multiView').appendChild(panel);

    return panel;
  }

  /**
   * Append a submenu item to the submenu.
   *
   * @param {DOMWindow} window - The window to inject into.
   * @param {Extension} extension - The extension object to create this element for.
   * @param {object} options - The options for the submenu item to be added.
   * @param {string} options.text - Text to be used for the submenu item.
   * @param {string} options.close - Id of menu item to close when the item is clicked. set to an
   *  empty string to close everything, use "none" or omit completely to not close anything.
   * @param {string} options.action - The action name to use when for the onCommnd event emitted
   *  when the item is clicked.
   * @param {string} options.id - The id of the submenu item. Used to generate the html ID
   *  and for being able to remove the item later.
   * @param {string} options.nav - The string of a submenu which should
   *  be navigated to when the item is clicked
   *
   * @returns {HTMLElement} - The submenu item which was created.
   */
  function _addSubMenuItem(
    window,
    extension,
    { text, close = 'none', tooltip, action, id, nav, menuId }
  ) {
    const classes = [
      'subviewbutton',
      'subviewbutton-iconic',
      'tbpro-menu-button',
    ];
    const attributes = {
      tabindex: '0',
      closemenu: close,
    };

    if (tooltip) {
      attributes.tooltiptext = tooltip;
    }

    if (nav) {
      classes.push('subviewbutton-nav');
      attributes.oncommand = `PanelUI.showSubView('${nav}', this);`;
    }

    attributes.label = text;

    const button = _createElement(window, extension, {
      type: 'toolbarbutton',
      classes,
      attributes,
      xul: true,
      id,
    });

    if (action) {
      button.addEventListener('click', () => {
        extension.emit('menu-item-clicked', action);
      });
    }

    window.document.querySelector(`#${menuId} vbox`).appendChild(button);
  }

  /**
   * Create an element based on the provided options and return it.
   * This method tags all created elements with an extension id so when
   * the extension is removed all of the elements will automaticlly
   * be removed as well.
   *
   * Note: The text/i18TextId options are mutually exclusive and the
   * i18n id will always take precedent if both are provided.
   *
   * @param {DOMWindow} window - The window to inject into.
   * @param {Extension} extension - The extension object to create this element for.
   * @param {object} options - The options to use for createing the element.
   * @param {object} options.attributes - Key value pairs of attributes to be set on the element.
   * @param {string[]} options.classes - An array of classes to be added to the element.
   * @param {string} options.id - The id of the element to to be set.
   * @param {string} options.text - The text to use for the textContent of the element.
   * @param {string} options.type - The type of element to be created.
   * @param {boolean} options.xul - If the element is a xul element and should be created with
                                    createXULElement rather than createElement.
   * @returns {HTMLElement}
   */
  function _createElement(
    window,
    extension,
    { attributes, classes, id, text, type, xul }
  ) {
    const element =
      window.document[xul ? 'createXULElement' : 'createElement'](type);

    // We set the extension id on all elements so they can easily be cleaned up later.
    element.setAttribute('data-extension-injected', extension.id);

    if (classes) {
      element.classList.add(...classes);
    }
    if (attributes) {
      for (let [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
      }
    }

    if (id) {
      element.id = id;
    }

    if (text) {
      element.textContent = text;
    }

    return element;
  }

  var TBProMenu = class extends ExtensionCommon.ExtensionAPI {
    _loadWindow(window) {
      const stylesheet = _createElement(window, this.extension, {
        type: 'style',
        text: styleSheetContent,
      });

      window.document.querySelector('body').appendChild(stylesheet);

      if (gRootMenuId) {
        let root = gMenuItems[gRootMenuId];
        this._loadMenuItem(window, root.id, root);
      }
    }

    _loadMenuItem(window, id, createProps) {
      _createMenuItem(window, this.extension, id, createProps);

      for (let child of createProps.children || []) {
        this._loadMenuItem(window, child.id, child);
      }
    }

    onStartup() {
      ExtensionSupport.registerWindowListener(
        'ext-tbpro-menu-' + this.extension.id,
        {
          chromeURLs: ['chrome://messenger/content/messenger.xhtml'],
          onLoadWindow: (win) => this._loadWindow(win, win.document),
        }
      );

      for (const win of ExtensionSupport.openWindows) {
        if (
          win.document.location.href ==
          'chrome://messenger/content/messenger.xhtml'
        ) {
          this._loadWindow(win, win.document);
        }
      }
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }

      ExtensionSupport.unregisterWindowListener(
        'ext-tbpro-menu-' + this.extension.id
      );
      for (const win of ExtensionSupport.openWindows) {
        if (
          win.document.location.href ==
          'chrome://messenger/content/messenger.xhtml'
        ) {
          for (const element of win.document.querySelectorAll(
            `[data-extension-injected="${this.extension.id}"]`
          )) {
            element.remove();
          }
        }
      }

      // Flush all caches. Enable this only for debugging
      // TODO disable
      Services.obs.notifyObservers(null, 'startupcache-invalidate');
    }

    getAPI(context) {
      return {
        TBProMenu: {
          create(id, createProps) {
            if (id in gMenuItems) {
              throw new ExtensionError(`Menu item ${id} already exists`);
            }
            if (createProps.parentId && !(createProps.parentId in gMenuItems)) {
              throw new ExtensionError(
                'Could not find parent ' + createProps.parentId
              );
            }

            if (!createProps.parentId) {
              if (gRootMenuId) {
                throw new ExtensionError('Can only have one root menu item');
              }

              gRootMenuId = id;
            }

            gMenuItems[id] = createProps;
            createProps.children = [];
            createProps.id = id;

            if (createProps.parentId) {
              gMenuItems[createProps.parentId].children.push(createProps);
            }

            _applyForWindows((window) => {
              _createMenuItem(window, context.extension, id, createProps);
            });
          },

          update(id, updateProps) {
            if (!(id in gMenuItems)) {
              throw new ExtensionError('Could not find item ' + id);
            }

            Object.assign(gMenuItems[id], updateProps);

            _applyForWindows((window) => {
              _updateMenuItem(window, id, updateProps);
            });
          },

          remove(id) {
            if (!(id in gMenuItems)) {
              throw new ExtensionError('Could not find item ' + id);
            }

            const item = gMenuItems[id];
            const parentItem = gMenuItems[item.parentId];
            if (parentItem) {
              parentItem.children = parentItem.children.filter(
                (element) => element !== item
              );
            }
            delete gMenuItems[id];

            _applyForWindows((window, document) => {
              const menu = document.getElementById('tbpro-menu-id-' + id);
              if (!menu) {
                return;
              }

              if (menu.classList.contains('subviewbutton-nav')) {
                document
                  .getElementById('appMenu-tbpro-submenu-' + id)
                  ?.remove();
                // TODO sub-sub-menus will not be cleaned up, fix this if needed
              }

              if (
                menu.parentNode.querySelectorAll('.tbpro-menu-button').length <
                2
              ) {
                const subview = menu.parentNode.closest('.tbpro-panel-subview');
                const parentId = subview?.id.substring(22);
                const parentButton = document.getElementById(
                  'tbpro-menu-id-' + parentId
                );
                parentButton.classList.remove('subviewbutton-nav');
                parentButton.setAttribute('closemenu', '');
                parentButton.removeAttribute('oncommand');
              }

              menu.remove();
              document.querySelector('#appMenu-multiView').goBack?.();
            });
          },

          clear(id) {
            if (!(id in gMenuItems)) {
              throw new ExtensionError('Could not find item ' + id);
            }
            const item = gMenuItems[id];
            for (const child of item.children) {
              delete gMenuItems[child.id];
            }
            item.children = [];

            _applyForWindows((window, document) => {
              const parent = document.getElementById('tbpro-menu-id-' + id);
              parent.classList.remove('subviewbutton-nav');
              parent.removeAttribute('oncommand');
              document.getElementById('appMenu-tbpro-submenu-' + id)?.remove();
            });
          },

          onClicked: new ExtensionCommon.EventManager({
            context,
            name: 'TBProMenu.onClicked',
            register(fire) {
              function callback(event, action) {
                return fire.async(action);
              }

              context.extension.on('menu-item-clicked', callback);

              return function () {
                context.extension.off('menu-item-clicked', callback);
              };
            },
          }).api(),
        },
      };
    }
  };

  exports.TBProMenu = TBProMenu;
})(this);

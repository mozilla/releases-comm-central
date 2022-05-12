/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SelectionWidgetController"];

/**
 * @callback GetLayoutDirectionMethod
 *
 * @return {"horizontal"|"vertical"} - The direction in which the widget
 *   visually lays out its items. "vertical" for top to bottom, "horizontal" for
 *   following the text direction.
 */
/**
 * @callback IndexFromTargetMethod
 *
 * @param {EventTarget} target - An event target.
 *
 * @return {?number} - The index for the selectable item that contains the event
 *   target, or null if there is none.
 */
/**
 * @callback SetFocusableItemMethod
 *
 * @param {?number} index - The index for the selectable item that should become
 *   focusable, replacing any previous focusable item. Or null if the widget
 *   itself should become focusable instead.
 * @param {boolean} focus - Whether to also focus the specified item after it
 *   becomes focusable.
 */
/**
 * @callback SetItemSelectionStateMethod
 *
 * @param {number} index - The index for the selectable item to set the
 *   selection state of.
 * @param {boolean} selected - Whether the specified item should be selected or
 *   unselected.
 */

/**
 * A class for handling the focus and selection controls for a widget.
 *
 * The widget is assumed to control a totally ordered set of selectable items,
 * each of which may be referenced by their index in this ordering. The visual
 * display of these items has an ordering that is faithful to this ordering.
 * Note, a "selectable item" is any item that may receive focus and can be
 * selected or unselected.
 *
 * A SelectionWidgetController instance will keep track of its widget's focus
 * and selection states, and will provide a standard set of keyboard and mouse
 * controls to the widget that handle changes in these states.
 *
 * The SelectionWidgetController instance will communicate with the widget to
 * inform it of any changes in these states that the widget should adjust to. It
 * may also query the widget for information as needed.
 *
 * The widget must inform its SelectionWidgetController instance of any changes
 * in the index of selectable items using the addedSelectableItems and
 * removingSelectableItems controller methods. In particular, the widget must
 * inform the controller of any initial set of items after it is initialized.
 *
 * The communication between the widget and its SelectionWidgetController
 * instance will use the item's index to reference the item. This means that the
 * representation of the item itself is left up to the widget.
 *
 * The controller currently handles one selection model.
 *
 * # Browse model
 *
 * Selection follows the focus by default. As such, changing selection should be
 * a light operation. Using the Control modifier allows the user to move focus
 * without changing selection.
 *
 * Only up to one item can be selected. A user can not manually deselect an
 * item. As such, in most usage exactly one item will be selected. However, it
 * is still possible to get into a state where no item is selected when the
 * widget is empty or the selected item is deleted when it doesn't have focus.
 */
class SelectionWidgetController {
  #numItems = 0;
  #selectedIndex = null;
  #focusIndex = null;
  #widget = null;
  #methods = null;

  /**
   * Creates a new selection controller for the given widget.
   *
   * @param {widget} - The widget to control.
   * @param {Object} methods - Methods for the controller to communicate with
   *   the widget.
   * @param {GetLayoutDirectionMethod} methods.getLayoutDirection - Used to
   *   get the layout direction of the widget.
   * @param {IndexFromTargetMethod} methods.indexFromTarget - Used to get the
   *   corresponding item index from an event target.
   * @param {SetFocusableItemMethod} methods.setFocusableItem - Used to update
   *   the widget on which item should receive focus.
   * @param {SetItemSelectionStateMethod} methods.setItemSelectionState - Used
   *   to update the widget on whether an item should be selected.
   */
  constructor(widget, methods) {
    this.#widget = widget;
    this.#methods = methods;

    widget.addEventListener("mousedown", event =>
      this.#handleKeyMouseDown(event)
    );
    widget.addEventListener("keydown", event =>
      this.#handleKeyMouseDown(event)
    );
    widget.addEventListener("focusin", event => this.#handleFocusIn(event));
  }

  /**
   * Informs the controller that a set of selectable items were added to the
   * widget. It is important to call this *after* the widget has indexed the new
   * items.
   *
   * @param {number} index - The index at which the selectable items were added.
   * @param {number} number - The number of selectable items that were added at
   *   this index.
   */
  addedSelectableItems(index, number) {
    this.#numItems += number;
    if (this.#selectedIndex != null && this.#selectedIndex >= index) {
      this.#selectedIndex += number;
    }
    if (this.#focusIndex != null && this.#focusIndex >= index) {
      this.#focusIndex += number;
    }
    // Newly added items are unselected.
    for (let i = 0; i < number; i++) {
      this.#methods.setItemSelectionState(index + i, false);
    }
  }

  /**
   * Informs the controller that a set of selectable items are being removed
   * from the widget. It is important to call this after the widget has stopped
   * indexing the removed items, but before the elements are removed from the
   * DOM. In particular, the focus and selection may be changed during this
   * call using the *updated* indices, and the focus will need to be transferred
   * before the previous focused element is removed.
   *
   * @param {number} index - The index of the first selectable item before it
   *   was removed.
   * @param {number} number - The number of subsequent selectable items that
   *   were removed, including the first item and any immediately following it.
   */
  removingSelectableItems(index, number) {
    this.#numItems -= number;
    let focusWasSelected = this.#focusIndex == this.#selectedIndex;
    if (this.#selectedIndex != null) {
      if (this.#selectedIndex >= index + number) {
        this.#selectedIndex -= number;
      } else if (this.#selectedIndex >= index) {
        // Selected item was removed.
        // NOTE: In general, we do not move the selection since this would be a
        // change outside the focused item. See below for when the selected item
        // is focused.
        this.#selectedIndex = null;
      }
    }
    if (this.#focusIndex != null) {
      if (this.#focusIndex >= index + number) {
        this.#focusIndex -= number;
      } else if (this.#focusIndex >= index) {
        this.#moveFocus(index);
        if (focusWasSelected && this.#focusIndex != null) {
          // If the focused item was selected, we move the selection with it.
          // This is deemed safe to do since it only effects the state of the
          // focused item.
          this.selectSingle(this.#focusIndex);
        }
      }
    }
  }

  /**
   * Select one index and nothing else.
   *
   * @param {number} index - The index to select. This must not exceed the
   *   number of items controlled by the widget.
   */
  selectSingle(index) {
    if (index == this.#selectedIndex) {
      return;
    }
    if (!(index >= 0 && index < this.#numItems)) {
      throw new RangeError(
        `index ${index} is not in the range [0, ${this.#numItems - 1}]`
      );
    }
    if (this.#selectedIndex != null) {
      this.#methods.setItemSelectionState(this.#selectedIndex, false);
    }
    this.#methods.setItemSelectionState(index, true);
    this.#selectedIndex = index;
  }

  /**
   * Make the specified element focusable. Also move focus to this item if the
   * widget has focus.
   *
   * @param {?number} index - The index of the item to focus, or null to focus
   *   the widget. If the index is out of range, it will be truncated.
   * @param {boolean} [forceFocus=false] - Whether to move the focus onto the
   *   item, regardless of whether the widget has focus.
   */
  #moveFocus(index, forceFocus) {
    let numItems = this.#numItems;
    if (index != null) {
      if (index >= numItems) {
        index = numItems ? numItems - 1 : null;
      } else if (index < 0) {
        index = numItems ? 0 : null;
      }
    }
    this.#focusIndex = index;
    this.#methods.setFocusableItem(
      index,
      forceFocus ||
        this.#widget.contains(this.#widget.ownerDocument.activeElement)
    );
  }

  #handleFocusIn(event) {
    // If the widget receives focus and we have items, we move focus onto an
    // item.
    if (event.target != this.#widget || !this.#numItems) {
      return;
    }
    // If nothing is selected, select the first item.
    if (this.#selectedIndex == null) {
      this.selectSingle(0);
    }
    // Focus first selected item.
    this.#moveFocus(this.#selectedIndex, true);
  }

  #handleKeyMouseDown(event) {
    if (event.metaKey || event.altKey) {
      // Not handled.
      return;
    }
    if (event.type == "mousedown" && event.buttons != 1) {
      // Not handled
      return;
    }
    let { shiftKey, ctrlKey } = event;
    let handledEvent = false;

    // Move focus and/or selection.
    let prevFocusIndex = this.#focusIndex;
    if (event.type == "mousedown") {
      let focusIndex;
      let selectIndex = null;
      handledEvent = true;
      if (shiftKey || ctrlKey) {
        // NOTE: Modifiers are for multi-selection, which we we don't support
        // yet. Instead, we just re-focus.
        focusIndex = prevFocusIndex;
      } else {
        let clickIndex = this.#methods.indexFromTarget(event.target);
        if (clickIndex == null) {
          // Did not click an item. Re-focus, and don't change the selection.
          focusIndex = prevFocusIndex;
        } else {
          focusIndex = clickIndex;
          selectIndex = clickIndex;
        }
      }

      this.#moveFocus(focusIndex, true);
      if (selectIndex != null) {
        this.selectSingle(selectIndex);
      }
    } else {
      let isVertical = this.#methods.getLayoutDirection() == "vertical";
      let ltrDir = this.#widget.matches(":dir(ltr)");
      if (
        event.key == "Home" ||
        event.key == "End" ||
        event.key == " " ||
        (isVertical && event.key == "ArrowUp") ||
        (isVertical && event.key == "ArrowDown") ||
        (!isVertical && event.key == "ArrowLeft") ||
        (!isVertical && event.key == "ArrowRight")
      ) {
        // We reserve control over these keys, regardless of modifiers pressed.
        handledEvent = true;
      }

      let selectIndex = null;
      // Move focus.
      if (!shiftKey) {
        // Shift is for multi-selection only, which we don't support yet.
        let focusIndex;
        // NOTE: focusIndex may be set to an out of range index, but it will be
        // clipped in #moveFocus.
        if (event.key == "Home") {
          focusIndex = 0;
        } else if (event.key == "End") {
          focusIndex = this.#numItems - 1;
        } else if (
          (isVertical && event.key == "ArrowUp") ||
          (!isVertical && ltrDir && event.key == "ArrowLeft") ||
          (!isVertical && !ltrDir && event.key == "ArrowRight")
        ) {
          if (prevFocusIndex == null) {
            // Move to first item.
            focusIndex = 0;
          } else {
            focusIndex = prevFocusIndex - 1;
          }
        } else if (
          (isVertical && event.key == "ArrowDown") ||
          (!isVertical && ltrDir && event.key == "ArrowRight") ||
          (!isVertical && !ltrDir && event.key == "ArrowLeft")
        ) {
          if (prevFocusIndex == null) {
            // Move to first item.
            focusIndex = 0;
          } else {
            focusIndex = prevFocusIndex + 1;
          }
        }
        if (focusIndex != undefined) {
          this.#moveFocus(focusIndex, true);
          if (!ctrlKey) {
            // We use the set #focusIndex rather than focusIndex because the
            // latter may be out of bounds.
            selectIndex = this.#focusIndex;
          }
        }
      }

      if (event.key == " " && !ctrlKey && !shiftKey) {
        // Ctrl and Shift are used for multi-selection only, which we don't
        // support yet.
        selectIndex = this.#focusIndex;
      }
      if (selectIndex != null) {
        this.selectSingle(selectIndex);
      }
    }

    if (handledEvent) {
      event.stopPropagation();
      event.preventDefault();
    }
  }
}

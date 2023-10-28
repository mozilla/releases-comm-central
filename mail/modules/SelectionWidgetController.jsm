/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SelectionWidgetController"];

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * @callback GetLayoutDirectionMethod
 *
 * @returns {"horizontal"|"vertical"} - The direction in which the widget
 *   visually lays out its items. "vertical" for top to bottom, "horizontal" for
 *   following the text direction.
 */
/**
 * Details about the sizing of the widget in the same direction as its layout.
 *
 * @typedef {object} PageSizeDetails
 * @param {number} viewSize - The size of the widget's "view" of its items. If
 *   the items are placed under a scrollable area with 0 padding, this would
 *   usually be the clientHeight or clientWidth, which exclude the border and
 *   the scroll bars.
 * @param {number} viewOffset - The offset of the widget's "view" from the
 *   starting item. If the items are placed under a scrollable area with 0
 *   padding, this would usually be its scrollTop, or the absolute value of its
 *   scrollLeft (to account for negative values in right-to-left).
 * @param {?number} itemSize - The size of an item. If the items have no spacing
 *   between them, then this would usually correspond to their bounding client
 *   widths or heights. If the items do not share the same size, or there are no
 *   items this should return null.
 */
/**
 * @callback GetPageSizeDetailsMethod
 *
 * @returns {?PageSizeDetails} Details about the currently visible items. Or null
 *   if page navigation should not be allowed: either because the required
 *   conditions do not apply or PageUp and PageDown should be used for something
 *   else.
 */
/**
 * @callback IndexFromTargetMethod
 *
 * @param {EventTarget} target - An event target.
 *
 * @returns {?number} - The index for the selectable item that contains the event
 *   target, or null if there is none.
 */
/**
 * @callback SetFocusableItemMethod
 *
 * @param {?number} index - The index for the selectable item that should become
 *   focusable, replacing any previous focusable item. Or null if the widget
 *   itself should become focusable instead. If the corresponding item was not
 *   previously the focused item and it is not yet visible, it should be scrolled
 *   into view.
 * @param {boolean} focus - Whether to also focus the specified item after it
 *   becomes focusable.
 */
/**
 * @callback SetItemSelectionStateMethod
 *
 * @param {number} index - The index of the first selectable items to set the
 *   selection state of.
 * @param {number} number - The number of subsequent selectable items that
 *   should be set to the same selection state, including the first item and any
 *   immediately following it.
 * @param {boolean} selected - Whether the specified items should be selected or
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
 * in the index of selectable items. In particular, the widget should call the
 * addedSelectableItems method to inform the controller of any initial set of
 * items or any additional items that are added to the widget. It should also
 * use the removeSelectableItems and moveSelectableItems methods when it wishes
 * to remove or move items.
 *
 * The communication between the widget and its SelectionWidgetController
 * instance will use the item's index to reference the item. This means that the
 * representation of the item itself is left up to the widget.
 *
 * # Selection models
 *
 * The controller implements a number of selection models. Each of which has
 * different selection features and controls suited to them. A model appropriate
 * to the specific situation should be chosen.
 *
 * Model behaviour table:
 *
 *  Model Name  | Selection follows focus | Multi selectable
 *  ==========================================================================
 *  focus         always                    no
 *  browse        default                   no
 *  browse-multi  default                   yes
 *
 *
 * ## Behaviour: Selection follows focus
 *
 * This determines whether the focused item is selected.
 *
 * "always" means a focused item will always be selected, and no other item will
 * be selected, which makes the selection redundant to the focus. This should be
 * used if a change in the selection has no side effect beyond what a change in
 * focus should trigger.
 *
 * "default" means the default action when navigating to a focused item is to
 * change the selection to just that item, but the user may press a modifier
 * (Control) to move the focus without selecting an item. The side effects to
 * selecting an item should be light and non-disruptive since a user will likely
 * change the selection regularly as they navigate the items without a modifier.
 * Moreover, this behaviour will prefer selecting a single item, and so is not
 * appropriate if the primary use case is to select multiple, or zero, items.
 *
 * ## Behaviour: Multi selectable
 *
 * This determines whether the user can select more than one item. If the
 * selection follows the focus (by default) the user can use a modifier to
 * select more than one item.
 *
 * Note, if this is "no", then in most usage, exactly one item will be selected.
 * However, it is still possible to get into a state where no item is selected
 * when the widget is empty or the selected item is deleted when it doesn't have
 * focus.
 */
class SelectionWidgetController {
  /**
   * The widget this controller controls.
   *
   * @type {Element}
   */
  #widget = null;
  /**
   * A collection of methods passed to the controller at initialization.
   *
   * @type {object}
   */
  #methods = null;
  /**
   * The number of items the controller controls.
   *
   * @type {number}
   */
  #numItems = 0;
  /**
   * A range that points to all selectable items whose index `i` obeys
   *   `start <= i < end`
   * Note, the `start` is inclusive of the index but the `end` is not.
   *
   * @typedef {object} SelectionRange
   * @property {number} start - The starting point of the range.
   * @property {number} end - The ending point of the range.
   */
  /**
   * The ranges of selected indices, ordered by their `start` property.
   *
   * Each range is kept "disjoint": no natural number N obeys
   *   `#ranges[i].start <= N <= #ranges[i].end`
   * for more than one index `i`. Essentially, this means that no range of
   * selected items will overlap, or even be immediately adjacent to
   * another set of selected items. Instead, if two ranges would be adjacent or
   * overlap, they will be merged into one range instead.
   *
   * We use ranges, rather than a list of indices to reduce the footprint when a
   * large number of items are selected. Similarly, we also avoid looping over
   * all selected indices.
   *
   * @type {SelectionRange[]}
   */
  #ranges = [];
  /**
   * The direction of travel when holding the Shift modifier, or null if some
   * other selection has broken the Shift selection sequence.
   *
   * @type {"forward"|"backward"|null}
   */
  #shiftRangeDirection = null;
  /**
   * The index of the focused selectable item, or null if the widget is focused
   * instead.
   *
   * @type {?number}
   */
  #focusIndex = null;
  /**
   * Whether the focused item must always be selected.
   *
   * @type {boolean}
   */
  #focusIsSelected = false;
  /**
   * Whether the user can select multiple items.
   *
   * @type {boolean}
   */
  #multiSelectable = false;

  /**
   * Creates a new selection controller for the given widget.
   *
   * @param {widget} widget - The widget to control.
   * @param {"focus"|"browse"|"browse-multi"} model - The selection model to
   *   follow.
   * @param {object} methods - Methods for the controller to communicate with
   *   the widget.
   * @param {GetLayoutDirectionMethod} methods.getLayoutDirection - Used to
   *   get the layout direction of the widget.
   * @param {IndexFromTargetMethod} methods.indexFromTarget - Used to get the
   *   corresponding item index from an event target.
   * @param {GetPageSizeDetailsMethod} method.getPageSizeDetails - Used to get
   *   details about the visible display of the widget items for page
   *   navigation.
   * @param {SetFocusableItemMethod} methods.setFocusableItem - Used to update
   *   the widget on which item should receive focus.
   * @param {SetItemSelectionStateMethod} methods.setItemSelectionState - Used
   *   to update the widget on whether a range of items should be selected.
   */
  constructor(widget, model, methods) {
    this.#widget = widget;
    switch (model) {
      case "focus":
        this.#focusIsSelected = true;
        this.#multiSelectable = false;
        break;
      case "browse":
        this.#focusIsSelected = false;
        this.#multiSelectable = false;
        break;
      case "browse-multi":
        this.#focusIsSelected = false;
        this.#multiSelectable = true;
        break;
      default:
        throw new RangeError(`The model "${model}" is not a supported model`);
    }
    this.#methods = methods;

    widget.addEventListener("mousedown", event => this.#handleMouseDown(event));
    if (this.#multiSelectable) {
      widget.addEventListener("click", event => this.#handleClick(event));
    }
    widget.addEventListener("keydown", event => this.#handleKeyDown(event));
    widget.addEventListener("focusin", event => this.#handleFocusIn(event));
  }

  #assertIntegerInRange(integer, lower, upper, name) {
    if (!Number.isInteger(integer)) {
      throw new RangeError(`"${name}" ${integer} is not an integer`);
    }
    if (lower != null && integer < lower) {
      throw new RangeError(
        `"${name}" ${integer} is not greater than or equal to ${lower}`
      );
    }
    if (upper != null && integer > upper) {
      throw new RangeError(
        `"${name}" ${integer} is not less than or equal to ${upper}`
      );
    }
  }

  /**
   * Update the widget's selection state for the specified items.
   *
   * @param {number} index - The index at which to start.
   * @param {number} number - The number of items to set the state of.
   */
  #updateWidgetSelectionState(index, number) {
    // First, inform the widget of the selection state of the new items.
    let prevRangeEnd = index;
    for (const { start, end } of this.#ranges) {
      // Deselect the items in the gap between the previous range and this one.
      // For the first range, there may not be a gap.
      if (start > prevRangeEnd) {
        this.#methods.setItemSelectionState(
          prevRangeEnd,
          start - prevRangeEnd,
          false
        );
      }
      // Select the items in the range.
      this.#methods.setItemSelectionState(start, end - start, true);
      prevRangeEnd = end;
    }
    // Deselect the items in the gap between the final range and the end of the
    // new items, if there is a gap.
    if (index + number > prevRangeEnd) {
      this.#methods.setItemSelectionState(
        prevRangeEnd,
        index + number - prevRangeEnd,
        false
      );
    }
  }

  /**
   * Informs the controller that a set of selectable items were added to the
   * widget. It is important to call this *after* the widget has indexed the new
   * items.
   *
   * @param {number} index - The index at which the selectable items were added.
   *   Between 0 and the current number of items (inclusive).
   * @param {number} number - The number of selectable items that were added at
   *   this index.
   */
  addedSelectableItems(index, number) {
    this.#assertIntegerInRange(index, 0, this.#numItems, "index");
    this.#assertIntegerInRange(number, 1, null, "number");
    // Newly added items are unselected.
    this.#adjustRangesOnAddItems(index, number, []);
    this.#numItems += number;

    if (this.#focusIndex != null && this.#focusIndex >= index) {
      // Focus remains on the same item, but is adjusted in index.
      this.#focusIndex += number;
    }

    this.#updateWidgetSelectionState(index, number);
  }

  /**
   * Adjust the #ranges to account for additional inserted items.
   *
   * @param {number} index - The index at which items are added.
   * @param {number} number - The number of items that are added at this index.
   * @param {SelectionRange[]} insertSelection - The selection state of the
   *   inserted items. The ranges should be "disjoint" and only overlap the
   *   added indices. The given array is owned by the method.
   */
  #adjustRangesOnAddItems(index, number, insertSelection) {
    // We want to insert whatever ranges are specified in insertSelection into
    // the #ranges Array. insertRangeIndex tracks the index at which we will
    // insert the given insertSelection.
    let insertRangeIndex = 0;
    // However, if insertSelection touches the start or end of the new items, it
    // may be possible to merge it with an existing SelectionRange that touches
    // the same edge.
    const touchStartRange =
      insertSelection.length && insertSelection[0].start == index
        ? insertSelection[0]
        : null;
    const touchEndRange =
      insertSelection.length &&
      insertSelection[insertSelection.length - 1].end == index + number
        ? insertSelection[insertSelection.length - 1]
        : null;

    // Go through ranges from last to first.
    for (let i = this.#ranges.length - 1; i >= 0; i--) {
      const { start, end } = this.#ranges[i];
      if (touchStartRange && end == index) {
        // Merge the range with touchStartRange.
        touchStartRange.start = start;
        this.#ranges.splice(i, 1, ...insertSelection);
        // All earlier ranges should end strictly before the index.
        return;
      }
      if (end <= index) {
        // A   B [ C   D   E ] F   G
        //         ^start   end^
        //                     ^index (or higher)
        // No change, and all earlier ranges are also before.
        // This is the last range that lies before the inserted items, so we
        // want to insert the given insertSelection after this range.
        insertRangeIndex = i + 1;
        break;
      }
      if (start < index) {
        // start < index < end
        // A   B [ C   D   E ] F   G
        //         ^start   end^
        //             ^index
        // The range is split in two parts by the index.
        if (touchEndRange) {
          // Extend touchEndRange to the end part of the current range.
          // We add "number" to account for the inserted indices.
          touchEndRange.end = end + number;
        } else {
          // Append a new range for the end part of the current range.
          insertSelection.push({ start: index + number, end: end + number });
        }
        if (touchStartRange) {
          // We merge touchStartRange with the first part of the current range.
          touchStartRange.start = start;
          this.#ranges.splice(i, 1, ...insertSelection);
        } else {
          // We adjust the first part to end where the inserted indices begin.
          this.#ranges[i].end = index;
          this.#ranges.splice(i + 1, 0, ...insertSelection);
        }
        // All earlier ranges should end strictly before the index.
        return;
      }
      // A   B [ C   D   E ] F   G
      //         ^start   end^
      //         ^index (or lower)
      if (touchEndRange && start == index) {
        // Merge the range with the touchEndRange.
        // We add "number" to account for the inserted indices.
        touchEndRange.end = end + number;
        this.#ranges.splice(i, 1, ...insertSelection);
        // All earlier ranges should end strictly before the index.
        return;
      }
      // Shift the range to account for the inserted indices.
      this.#ranges[i].start = start + number;
      this.#ranges[i].end = end + number;
    }

    // Add the insert ranges in the gap.
    if (insertSelection.length) {
      this.#ranges.splice(insertRangeIndex, 0, ...insertSelection);
    }
  }

  /**
   * Remove a set of selectable items from the widget. The actual removing of
   * the items and their elements from the widget is controlled by the widget
   * through a callback, and the controller will update its internals. The
   * controller may also change the selection state and focus of the widget
   * if need be.
   *
   * @param {number} index - The index of the first selectable item to be
   *   removed.
   * @param {number} number - The number of subsequent selectable items that
   *   will be removed, including the first item and any immediately following
   *   it.
   * @param {Function} removeCallback - A function to call with no arguments
   *   that removes the specified items from the widget. After this call the
   *   widget should no longer be tracking the specified items and should have
   *   shifted the indices of the remaining items to fill the gap.
   */
  removeSelectableItems(index, number, removeCallback) {
    this.#assertIntegerInRange(index, 0, this.#numItems - 1, "index");
    this.#assertIntegerInRange(number, 1, this.#numItems - index, "number");

    const focusWasSelected =
      this.#focusIndex != null && this.itemIsSelected(this.#focusIndex);
    // Get whether the focus is within the widget now in case it is lost when
    // the items are removed.
    const focusInWidget = this.#focusInWidget();

    removeCallback();

    this.#adjustRangesOnRemoveItems(index, number);
    this.#numItems -= number;

    if (!this.#ranges.length) {
      // Ends any shift range.
      this.#shiftRangeDirection = null;
    }

    // Adjust focus.
    if (this.#focusIndex == null || this.#focusIndex < index) {
      // No change in index if on widget or before the removed index.
      return;
    }
    if (this.#focusIndex >= index + number) {
      // Reduce index if after the removed items.
      this.#focusIndex -= number;
      return;
    }
    // Focus is lost.
    // Try to move to the first item after the removed items. If this does
    // not exist, it will be capped to the last item overall in #moveFocus.
    let newFocus = index;
    if (focusWasSelected && this.#shiftRangeDirection) {
      // As a special case, if the focused item was inside a shift selection
      // range when it was removed, and the range still exists after, we keep
      // the focus within the selection boundary that is opposite the "pivot"
      // point. I.e. when selecting forwards we keep the focus below the
      // selection end, and when selecting backwards we keep the focus above the
      // selection start. This is to prevent the focused item becoming
      // unselected in the middle of an ongoing shift range selection.
      // NOTE: When selecting forwards, we do not keep the focus above the
      // selection start because the user would only be here (at the selection
      // "pivot") if they navigated with Ctrl+Space to this position, so we do
      // not override the default behaviour. Similarly when selecting backwards
      // we do not require the focus to remain above the selection end.
      switch (this.#shiftRangeDirection) {
        case "forward":
          newFocus = Math.min(
            newFocus,
            this.#ranges[this.#ranges.length - 1].end - 1
          );
          break;
        case "backward":
          newFocus = Math.max(newFocus, this.#ranges[0].start);
      }
    }
    // TODO: if we have a tree structure, we will want to move the focus
    // within the nearest parent by clamping the focus to lie between the
    // parent index (inclusive) and its last descendant (inclusive). If
    // there are no children left, this will fallback to focusing the
    // parent.
    this.#moveFocus(newFocus, focusInWidget);
    // #focusIndex may now be different from newFocus if the deleted indices
    // were the final ones, and may be null if no items remain.
    if (!this.#ranges.length && this.#focusIndex != null) {
      // If the focus was moved, and now we have no selection, we select it.
      // This is deemed relatively safe to do since it only effects the state of
      // the focused item. And it is convenient to have selection resume.
      this.#selectSingle(this.#focusIndex);
    }
  }

  /**
   * Adjust the #ranges to remove items.
   *
   * @param {number} index - The index at which items are removed.
   * @param {number} number - The number of items that are removed.
   *
   * @returns {SelectionRange[]} - The removed SelectionRange objects. This will
   *   contain all the ranges that touched or overlapped the selected items.
   *   Owned by the caller.
   */
  #adjustRangesOnRemoveItems(index, number) {
    // The ranges to remove.
    let deleteRangesStart = 0;
    let deleteRangesNumber = 0;
    // The range to insert by combining overlapping ranges on either side of the
    // deleted indices.
    const insertRange = { start: index, end: index };

    // Go through ranges from last to first.
    for (let i = this.#ranges.length - 1; i >= 0; i--) {
      const { start, end } = this.#ranges[i];
      if (end < index) {
        //                                     <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //                                     ^index (or higher)
        deleteRangesStart = i + 1;
        // This and all earlier ranges do not need to be updated.
        break;
      } else if (start > index + number) {
        // <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //                 ^index + number (or lower)
        // Shift the range.
        this.#ranges[i].start = start - number;
        this.#ranges[i].end = end - number;
        continue;
      }
      deleteRangesNumber++;
      if (end > index + number) {
        // start <= (index + number) < end
        //     <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //     ^index          ^index + number
        //
        //             <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //             ^index          ^index + number
        //
        //                 <- removed ->
        // A   B   C [ D   E   F   G   H   I ] J   K   L   M
        //             ^start               end^
        //                 ^index          ^index + number
        //
        // Overlaps or touches the end of the removed indices, but is not
        // entirely contained within the removed region.
        // Extend the insertRange to the end of this range, and then shift it to
        // remove the deleted indices.
        insertRange.end = end - number;
      }
      if (start < index) {
        // start < index <= end
        //                                 <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //                                 ^index          ^index + number
        //
        //                         <- removed ->
        // A   B   C   D   E [ F   G   H ] I   J   K   L   M
        //                     ^start   end^
        //                         ^index          ^index + number
        //
        //                 <- removed ->
        // A   B   C [ D   E   F   G   H   I ] J   K   L   M
        //             ^start               end^
        //                 ^index          ^index + number
        //
        // Overlaps or touches the start of the removed indices, but is not
        // entirely contained within the removed region.
        // Extend the insertRange to the start of this range.
        insertRange.start = start;
        // Expect break on next loop.
      }
    }
    if (!deleteRangesNumber) {
      // No change in selection.
      return [];
    }
    if (insertRange.end > insertRange.start) {
      return this.#ranges.splice(
        deleteRangesStart,
        deleteRangesNumber,
        insertRange
      );
    }
    // No range to insert.
    return this.#ranges.splice(deleteRangesStart, deleteRangesNumber);
  }

  /**
   * Move a set of selectable items within the widget. The actual moving of
   * the items and their elements in the widget is controlled by the widget
   * through a callback, and the controller will update its internals.
   *
   * Unlike simply adding and then removing indices, this will transfer the
   * focus and selection states along with the moved items.
   *
   * @param {number} from - The index of the first selectable item to be
   *   moved, before the move.
   * @param {number} to - The index that the first selectable item will be moved
   *   to, after the move.
   * @param {number} number - The number of subsequent selectable items that
   *   will be moved along with the first item, including the first item and any
   *   immediately following it. Their relative positions should remain the
   *   same.
   * @param {Function} moveCallback - A function to call with no arguments
   *   that moves the specified items within the widget to the specified
   *   position. After this call the widget should have adjusted the indices
   *   of its items accordingly.
   */
  moveSelectableItems(from, to, number, moveCallback) {
    this.#assertIntegerInRange(from, 0, this.#numItems - 1, "from");
    this.#assertIntegerInRange(number, 1, this.#numItems - from, "number");
    this.#assertIntegerInRange(to, 0, this.#numItems - number, "to");
    // Get whether the focus is within the widget now in case it is lost when
    // the items are moved.
    const focusInWidget = this.#focusInWidget();

    moveCallback();

    const movedSelection = this.#adjustRangesOnRemoveItems(from, number);
    // Descend the removed ranges.
    for (let i = movedSelection.length - 1; i >= 0; i--) {
      const range = movedSelection[i];
      if (range.end <= from || range.start >= from + number) {
        // Touched the start or end, but did not overlap.
        movedSelection.splice(i, 1);
        // NOTE: Since we are descending it is safe to continue the loop by
        // decreasing i by 1.
        continue;
      }
      // Translate and clip the range.
      range.start = to + Math.max(0, range.start - from);
      range.end = to + Math.min(number, range.end - from);
    }
    this.#adjustRangesOnAddItems(to, number, movedSelection);

    // End any range selection.
    this.#shiftRangeDirection = null;

    // Adjust focus.
    if (this.#focusIndex != null) {
      if (this.#focusIndex >= from && this.#focusIndex < from + number) {
        // Focus was in the moved range.
        // We adjust the #focusIndex, but we also force the widget to reset the
        // focus in case it needs to apply it to a newly created items.
        this.#moveFocus(this.#focusIndex + to - from, focusInWidget);
      } else {
        // Adjust for removing `number` items at `from`.
        if (this.#focusIndex >= from + number) {
          this.#focusIndex -= number;
        }
        // Adjust for then adding `number` items at `to`.
        if (this.#focusIndex >= to) {
          this.#focusIndex += number;
        }
      }
    }
    // Reset the selection state for the moved items in case it needs to be
    // applied to newly created items.
    this.#updateWidgetSelectionState(to, number);
  }

  /**
   * Select the specified item and deselect all other items. The next time the
   * widget is entered by the user, the specified item will also receive the
   * focus.
   *
   * This should normally not be used in a situation were the focus may already
   * be within the widget because it will actively move the focus, which can be
   * disruptive if unexpected. It is mostly exposed to set an initial selection
   * after creating the widget, or when changing its dataset.
   *
   * @param {number} index - The index for the item to select. This must not
   *   exceed the number of items controlled by the widget.
   */
  selectSingleItem(index) {
    this.#selectSingle(index);
    const focusInWidget = this.#focusInWidget();
    if (this.#focusIndex == null && !focusInWidget) {
      // Wait until handleFocusIn to move the focus to the selected item in case
      // other items become selected through setItemSelected.
      return;
    }
    this.#moveFocus(index, focusInWidget);
  }

  /**
   * Set the selection state of the specified item, but otherwise leave the
   * selection state of other items the same.
   *
   * Note that this will throw if the selection model does not support multi
   * selection. Generally, you should try and use selectSingleItem instead
   * because this also moves the focus appropriately and works for all models.
   *
   * @param {number} index - The index for the item to set the selection state
   *   of.
   * @param {boolean} selected - Whether the item should be selected or
   *   unselected.
   */
  setItemSelected(index, selected) {
    if (!this.#multiSelectable) {
      throw new Error("Widget does not support multi-selection");
    }
    this.#toggleSelection(index, !!selected);
  }

  /**
   * Get the ranges of all selected items.
   *
   * Note that ranges are returned rather than individual indices to keep this
   * method fast. Unlike the selected indices which might become very large with
   * a single user operation, like Select-All, the number of ranges will
   * increase by order-one range per user interaction or public method call.
   *
   * Note that the SelectionRange objects specify the range with a `start` and
   * `end` index. The `start` is inclusive of the index, but the `end` is
   * not.
   *
   * Note that the returned Array is static (it will not update as the selection
   * changes).
   *
   * @returns {SelectionRange[]} - An array of all non-overlapping selection
   * ranges, order by their start index.
   */
  getSelectionRanges() {
    return Array.from(this.#ranges, r => {
      return { start: r.start, end: r.end };
    });
  }

  /**
   * Query whether the specified item is selected or not.
   *
   * @param {number} index - The index for the item to query.
   *
   * @returns {boolean} - Whether the item is selected.
   */
  itemIsSelected(index) {
    this.#assertIntegerInRange(index, 0, this.#numItems - 1, "index");
    for (const { start, end } of this.#ranges) {
      if (index < start) {
        // index was not in any lower ranges and is before the start of this
        // range, so should be unselected.
        return false;
      }
      if (index < end) {
        // start <= index < end
        return true;
      }
    }
    return false;
  }

  /**
   * Select the specified range of indices, and nothing else.
   *
   * @param {number} index - The first index to select.
   * @param {number} number - The number of indices to select.
   */
  #selectRange(index, number) {
    this.#assertIntegerInRange(index, 0, this.#numItems - 1, "index");
    this.#assertIntegerInRange(number, 1, this.#numItems - index, "number");

    const prevRanges = this.#ranges;
    const start = index;
    const end = index + number;
    if (
      prevRanges.length == 1 &&
      prevRanges[0].start == start &&
      prevRanges[0].end == end
    ) {
      // No change.
      return;
    }

    this.#ranges = [{ start, end }];
    // Adjust the selection state to match the new range.
    // NOTE: For simplicity, we do a blanket re-selection across the whole
    // region, even items in between ranges that are not selected.
    // NOTE: If the new range overlaps the previous range then the selection
    // state be set more than once for an item, but it will be to the same
    // value.
    if (prevRanges.length) {
      const firstRangeStart = prevRanges[0].start;
      const lastRangeEnd = prevRanges[prevRanges.length - 1].end;
      this.#updateWidgetSelectionState(
        firstRangeStart,
        lastRangeEnd - firstRangeStart
      );
    }
    this.#updateWidgetSelectionState(index, number);
  }

  /**
   * Select one index and nothing else.
   *
   * @param {number} index - The index to select.
   */
  #selectSingle(index) {
    this.#selectRange(index, 1);
    // Cancel any shift range.
    this.#shiftRangeDirection = null;
  }

  /**
   * Toggle the selection state at a single index.
   *
   * @param {number} index - The index to toggle the selection state of.
   * @param {boolean} [selectState] - The state to force the selection state of
   *   the item to, or leave undefined to toggle the state.
   */
  #toggleSelection(index, selectState) {
    this.#assertIntegerInRange(index, 0, this.#numItems - 1, "index");

    let wasSelected = false;
    let i;
    // We traverse over the ranges.
    for (i = 0; i < this.#ranges.length; i++) {
      const { start, end } = this.#ranges[i];
      // Test if in a gap between the end of last range and the start of the
      // current one.
      // NOTE: Since we did not break on the previous loop, we already know that
      // the index is above the end of the previous range.
      if (index < start) {
        // This index is not selected.
        break;
      }
      // Test if in the range.
      if (index < end) {
        // start <= index < end
        wasSelected = true;
        if (selectState) {
          // Already selected and we want to keep it that way.
          break;
        }
        if (start == index && end == index + 1) {
          // A   B   C [ D ] E   F   G
          //        start^   ^end
          //             ^index
          //
          // Remove the range entirely.
          this.#ranges.splice(i, 1);
        } else if (start == index) {
          // A [ B   C   D   E   F ] G
          //     ^start           end^
          //     ^index
          //
          // Remove the start of the range.
          this.#ranges[i].start = index + 1;
        } else if (end == index + 1) {
          // A [ B   C   D   E   F ] G
          //     ^start           end^
          //                     ^index
          //
          // Remove the end of the range.
          this.#ranges[i].end = index;
        } else {
          // A [ B   C   D   E   F ] G
          //     ^start           end^
          //             ^index
          //
          // Split the range in two.
          //
          // A [ B   C ] D [ E   F ] G
          this.#ranges[i].end = index;
          this.#ranges.splice(i + 1, 0, { start: index + 1, end });
        }
        break;
      }
    }
    if (!wasSelected && (selectState == undefined || selectState)) {
      // The index i points to a *gap* between existing ranges, so lies in
      // [0, numItems]. Note, the space between the start and the first range,
      // or the end and the last range count as gaps, even if they are zero
      // width.
      // We want to know whether the index touches the borders of the range
      // either side of the gap.
      const touchesRangeEnd = i > 0 && index == this.#ranges[i - 1].end;
      // A [ B   C   D ] E   F   G   H   I
      //         end(i-1)^
      //                 ^index
      const touchesRangeStart =
        i < this.#ranges.length && index + 1 == this.#ranges[i].start;
      // A   B   C   D   E [ F   G   H ] I
      //                     ^start(i)
      //                 ^index
      if (touchesRangeEnd && touchesRangeStart) {
        // A [ B   C   D ] E [ F   G   H ] I
        //                 ^index
        // Merge the two ranges together.
        this.#ranges[i - 1].end = this.#ranges[i].end;
        this.#ranges.splice(i, 1);
      } else if (touchesRangeEnd) {
        // Grow the range forwards to include the index.
        this.#ranges[i - 1].end = index + 1;
      } else if (touchesRangeStart) {
        // Grow the range backwards to include the index.
        this.#ranges[i].start = index;
      } else {
        // Create a new range.
        this.#ranges.splice(i, 0, { start: index, end: index + 1 });
      }
    }
    this.#methods.setItemSelectionState(index, 1, selectState ?? !wasSelected);
    // Cancel any shift range.
    this.#shiftRangeDirection = null;
  }

  /**
   * Determine whether the focus lies within the widget or elsewhere.
   *
   * @returns {boolean} - Whether the active element is the widget or one of its
   *   descendants.
   */
  #focusInWidget() {
    return this.#widget.contains(this.#widget.ownerDocument.activeElement);
  }

  /**
   * Make the specified element focusable. Also move focus to this element if
   * the widget already has focus.
   *
   * @param {?number} index - The index of the item to focus, or null to focus
   *   the widget. If the index is out of range, it will be truncated.
   * @param {boolean} [forceInWidget] - Whether the focus was in the widget
   *   before the specified element becomes focusable. This should be given to
   *   reference an earlier focus state, otherwise leave undefined to use the
   *   current focus state.
   */
  #moveFocus(index, focusInWidget) {
    const numItems = this.#numItems;
    if (index != null) {
      if (index >= numItems) {
        index = numItems ? numItems - 1 : null;
      } else if (index < 0) {
        index = numItems ? 0 : null;
      }
    }
    if (focusInWidget == undefined) {
      focusInWidget = this.#focusInWidget();
    }

    this.#focusIndex = index;
    // If focus is within the widget, we move focus onto the new item.
    this.#methods.setFocusableItem(index, focusInWidget);
  }

  #handleFocusIn(event) {
    if (
      // No item is focused,
      this.#focusIndex == null &&
      // and we have at least one item,
      this.#numItems &&
      // and the focus moved from outside the widget.
      // NOTE: relatedTarget may be null, but Node.contains will also return
      // false for this case, as desired.
      !this.#widget.contains(event.relatedTarget)
    ) {
      // If nothing is selected, select the first item.
      if (!this.#ranges.length) {
        this.#selectSingle(0);
      }
      // Focus first selected item.
      this.#moveFocus(this.#ranges[0].start);
      return;
    }
    if (this.#focusIndex != this.#methods.indexFromTarget(event.target)) {
      // Restore focus to where it needs to be.
      this.#moveFocus(this.#focusIndex);
    }
  }

  /**
   * Adjust the focus and selection in response to a user generated event.
   *
   * @param {?number} [focusIndex] - The new index to move focus to, or null to
   *   move the focus to the widget, or undefined to leave the focus as it is.
   *   Note that the focusIndex will be clamped to lie within the current index
   *   range.
   * @param {string} [select] - The change in selection to trigger, relative to
   *   the #focusIndex. "single" to select the #focusIndex, "toggle" to swap its
   *   selection state, "range" to start or continue a range selection, or "all"
   *   to select all items.
   */
  #adjustFocusAndSelection(focusIndex, select) {
    const prevFocusIndex = this.#focusIndex;
    if (focusIndex !== undefined) {
      // NOTE: We need a strict inequality since focusIndex may be null.
      this.#moveFocus(focusIndex);
    }
    // Change selection relative to the focused index.
    // NOTE: We use the #focusIndex value rather than the focusIndex variable.
    if (this.#focusIndex != null) {
      switch (select) {
        case "single":
          this.#selectSingle(this.#focusIndex);
          break;
        case "toggle":
          this.#toggleSelection(this.#focusIndex);
          break;
        case "range":
          // We want to select all items between a "pivot" point and the focused
          // index. If we do not have a "pivot" point, we use the previously
          // focused index.
          // This "pivot" point is lost every time the user performs a single
          // selection or a toggle selection. I.e. if the selection changes by
          // any means other than "range" selection.
          //
          // NOTE: We represent the presence of such a "pivot" point using the
          // #shiftRangeDirection property. If it is null, no such point exists,
          // if it is "forward" then the "pivot" point is the first selected
          // index, and if it is "backward" then the "pivot" point is the last
          // selected index.
          // Usually, we only have one #ranges entry whilst doing such a Shift
          // selection, but if items are added in the middle of such a range,
          // then the selection can be split, but subsequent Shift selection
          // will reselect all of them.
          // NOTE: We do not keep track of this "pivot" index explicitly in a
          // property because otherwise we would have to adjust its value every
          // time items are removed, and handle cases where the "pivot" index is
          // removed. Instead, we just borrow the logic of how the #ranges array
          // is updated, and continue to derive the "pivot" point from the
          // #shiftRangeDirection and #ranges properties.
          let start;
          switch (this.#shiftRangeDirection) {
            case "forward":
              // When selecting forward, the range start is the first selected
              // index.
              start = this.#ranges[0].start;
              break;
            case "backward":
              // When selecting backward, the range end is the last selected
              // index.
              start = this.#ranges[this.#ranges.length - 1].end - 1;
              break;
            default:
              // We start a new range selection between the previously focused
              // index and the newly focused index.
              start = prevFocusIndex || 0;
              break;
          }
          let number;
          // NOTE: Selection may transition from "forward" to "backward" if the
          // user moves the selection in the other direction.
          if (start > this.#focusIndex) {
            this.#shiftRangeDirection = "backward";
            number = start - this.#focusIndex + 1;
            start = this.#focusIndex;
          } else {
            this.#shiftRangeDirection = "forward";
            number = this.#focusIndex - start + 1;
          }
          this.#selectRange(start, number);
          break;
      }
    }

    // Selecting all does not require focus.
    if (select == "all" && this.#numItems) {
      this.#shiftRangeDirection = null;
      this.#selectRange(0, this.#numItems);
    }
  }

  #handleMouseDown(event) {
    // NOTE: The default handler for mousedown will move focus onto the clicked
    // item or the widget, but #handleFocusIn will re-assign it to the current
    // #focusIndex if it differs.
    if (event.button != 0 || event.metaKey || event.altKey) {
      return;
    }
    const { shiftKey, ctrlKey } = event;
    if (
      (ctrlKey && shiftKey) ||
      // Both modifiers pressed.
      ((ctrlKey || shiftKey) && !this.#multiSelectable)
      // Attempting multi-selection when not supported
    ) {
      return;
    }
    const clickIndex = this.#methods.indexFromTarget(event.target);
    if (clickIndex == null) {
      // Clicked empty space.
      return;
    }
    if (ctrlKey) {
      this.#adjustFocusAndSelection(clickIndex, "toggle");
    } else if (shiftKey) {
      this.#adjustFocusAndSelection(clickIndex, "range");
    } else if (this.#multiSelectable && this.itemIsSelected(clickIndex)) {
      // We set the focus now, but wait until "click" to select a single item.
      // We do this to allow the user to drag a multi selection.
      this.#adjustFocusAndSelection(clickIndex, undefined);
    } else {
      this.#adjustFocusAndSelection(clickIndex, "single");
    }
  }

  #handleClick(event) {
    // NOTE: This handler is only used if we have #multiSelectable.
    // See #handleMouseDown
    if (
      event.button != 0 ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      event.ctrlKey
    ) {
      return;
    }
    const clickIndex = this.#methods.indexFromTarget(event.target);
    if (clickIndex == null) {
      return;
    }
    this.#adjustFocusAndSelection(clickIndex, "single");
  }

  #handleKeyDown(event) {
    if (event.altKey) {
      // Not handled.
      return;
    }

    const { shiftKey, ctrlKey, metaKey } = event;
    if (
      this.#multiSelectable &&
      event.key == "a" &&
      !shiftKey &&
      (AppConstants.platform == "macosx") == metaKey &&
      (AppConstants.platform != "macosx") == ctrlKey
    ) {
      this.#adjustFocusAndSelection(undefined, "all");
      event.stopPropagation();
      event.preventDefault();
      return;
    }

    if (metaKey) {
      // Not handled.
      return;
    }

    if (event.key == " ") {
      // Always reserve the Space press.
      event.stopPropagation();
      event.preventDefault();

      if (shiftKey) {
        // Not handled.
        return;
      }

      if (ctrlKey) {
        if (this.#multiSelectable) {
          this.#adjustFocusAndSelection(undefined, "toggle");
        }
        // Else, do nothing.
        return;
      }

      this.#adjustFocusAndSelection(undefined, "single");
      return;
    }

    let forwardKey;
    let backwardKey;
    if (this.#methods.getLayoutDirection() == "vertical") {
      forwardKey = "ArrowDown";
      backwardKey = "ArrowUp";
    } else if (this.#widget.matches(":dir(ltr)")) {
      forwardKey = "ArrowRight";
      backwardKey = "ArrowLeft";
    } else {
      forwardKey = "ArrowLeft";
      backwardKey = "ArrowRight";
    }

    // NOTE: focusIndex may be set to an out of range index, but it will be
    // clipped in #moveFocus.
    let focusIndex;
    switch (event.key) {
      case "Home":
        focusIndex = 0;
        break;
      case "End":
        focusIndex = this.#numItems - 1;
        break;
      case "PageUp":
      case "PageDown":
        const sizeDetails = this.#methods.getPageSizeDetails();
        if (!sizeDetails) {
          // Do not handle and allow PageUp or PageDown to propagate.
          return;
        }
        if (!sizeDetails.itemSize || !sizeDetails.viewSize) {
          // Still reserve PageUp and PageDown
          break;
        }
        const { itemSize, viewSize, viewOffset } = sizeDetails;
        // We want to determine what items are visible. We count an item as
        // "visible" if more than half of it is in view.
        //
        // Consider an item at index i that follows the assumed model:
        //
        //      [   item content   ]
        //      <---- itemSize ---->
        // ---->start_i = i * itemSize
        //
        // where start_i is the offset of the starting edge of the item relative
        // to the starting edge of the first item.
        //
        // As such, an item will be visible if
        //     start_i + itemSize / 2 > viewOffset
        // and
        //     start_i + itemSize / 2 < viewOffset + viewSize
        // <=>
        //     i > (viewOffset / itemSize) - 1/2
        // and
        //     i < ((viewOffset + viewSize) / itemSize) - 1/2

        // First, we want to know the number of items we can visibly fit on a
        // page. I.e. when the viewOffset is 0, the number of items whose midway
        // point is lower than the viewSize. This is given by (i + 1), where i
        // is the largest index i that satisfies
        //     i < (viewSize / itemSize) - 1/2
        // This is given by taking the ceiling - 1, which cancels with the +1.
        const itemsPerPage = Math.ceil(viewSize / itemSize - 0.5);
        if (itemsPerPage <= 1) {
          break;
        }
        if (event.key == "PageUp") {
          // We want to know what the first visible index is. I.e. the smallest
          // i that satisfies
          //     i > (viewOffset / itemSize) - 1/2
          // This is equivalent to flooring the right hand side + 1.
          const pageStart = Math.floor(viewOffset / itemSize - 0.5) + 1;
          if (this.#focusIndex == null || this.#focusIndex > pageStart) {
            // Move focus to the top of the page.
            focusIndex = pageStart;
          } else {
            // Reduce focusIndex by one page.
            // We add "1" index to try and keep the previous focusIndex visible
            // at the bottom of the view.
            focusIndex = this.#focusIndex - itemsPerPage + 1;
          }
        } else {
          // We want to know what the last visible index is. I.e. the largest i
          // that satisfies
          //     i < (viewOffset + viewSize) / itemSize - 1/2
          // This is equivalent to ceiling the right hand side - 1.
          const pageEnd =
            Math.ceil((viewOffset + viewSize) / itemSize - 0.5) - 1;
          if (this.#focusIndex == null || this.#focusIndex < pageEnd) {
            // Move focus to the end of the page.
            focusIndex = pageEnd;
          } else {
            // Increase focusIndex by one page.
            // We minus "1" index to try and keep the previous focusIndex
            // visible at the top of the view.
            focusIndex = this.#focusIndex + itemsPerPage - 1;
          }
        }
        break;
      case forwardKey:
        if (this.#focusIndex == null) {
          // Move to first item.
          focusIndex = 0;
        } else {
          focusIndex = this.#focusIndex + 1;
        }
        break;
      case backwardKey:
        if (this.#focusIndex == null) {
          // Move to first item.
          focusIndex = 0;
        } else {
          focusIndex = this.#focusIndex - 1;
        }
        break;
      default:
        // Not a navigation key.
        return;
    }

    // NOTE: We always reserve control over these keys, regardless of whether
    // we respond to them.
    event.stopPropagation();
    event.preventDefault();

    if (focusIndex === undefined) {
      return;
    }

    if (shiftKey && ctrlKey) {
      // Both modifiers not handled.
      return;
    }

    if (ctrlKey) {
      // Move the focus without changing the selection.
      if (!this.#focusIsSelected) {
        this.#adjustFocusAndSelection(focusIndex, undefined);
      }
      return;
    }

    if (shiftKey) {
      // Range selection.
      if (this.#multiSelectable) {
        this.#adjustFocusAndSelection(focusIndex, "range");
      }
      return;
    }

    this.#adjustFocusAndSelection(focusIndex, "single");
  }
}

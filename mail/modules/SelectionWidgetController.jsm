/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SelectionWidgetController"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

/**
 * @callback GetLayoutDirectionMethod
 *
 * @return {"horizontal"|"vertical"} - The direction in which the widget
 *   visually lays out its items. "vertical" for top to bottom, "horizontal" for
 *   following the text direction.
 */
/**
 * Details about the sizing of the widget in the same direction as its layout.
 *
 * @typedef {Object} PageSizeDetails
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
 * @return {?PageSizeDetails} Details about the currently visible items. Or null
 *   if page navigation should not be allowed: either because the required
 *   conditions do not apply or PageUp and PageDown should be used for something
 *   else.
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
 * in the index of selectable items using the addedSelectableItems and
 * removingSelectableItems controller methods. In particular, the widget must
 * inform the controller of any initial set of items after it is initialized.
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
   * @type {Object}
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
   * @param {Object} methods - Methods for the controller to communicate with
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
    widget.addEventListener("keydown", event => this.#handleKeyDown(event));
    widget.addEventListener("focusin", event => this.#handleFocusIn(event));
  }

  /**
   * Query whether the selectable item at the given index is selected or not.
   *
   * @param {number} index - The index of the selectable item.
   *
   * @return {boolean} - Whether the item is selected.
   */
  #indexIsSelected(index) {
    for (let { start, end } of this.#ranges) {
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
    if (!Number.isInteger(index) || index < 0 || index > this.#numItems) {
      throw new RangeError(
        `index ${index} is not an integer in the range [0, ${this.#numItems}]`
      );
    }
    if (!Number.isInteger(number) || number <= 0) {
      throw new RangeError(`number ${number} is not an integer greater than 0`);
    }

    this.#numItems += number;

    // Go through ranges from last to first.
    for (let i = this.#ranges.length - 1; i >= 0; i--) {
      let { start, end } = this.#ranges[i];
      if (end <= index) {
        // A   B [ C   D   E ] F   G
        //         ^start   end^
        //                     ^index (or higher)
        // No change, and all earlier ranges are also before.
        break;
      }
      if (start < index) {
        // start < index < end
        // A   B [ C   D   E ] F   G
        //         ^start   end^
        //             ^index
        // Split the range by modifying the end of the earlier half and creating
        // a new range for the second half.
        this.#ranges[i].end = index;
        this.#ranges.splice(i + 1, 0, {
          start: index + number,
          end: end + number,
        });
      } else {
        // A   B [ C   D   E ] F   G
        //         ^start   end^
        //         ^index (or lower)
        // Shift the range.
        this.#ranges[i].start = start + number;
        this.#ranges[i].end = end + number;
      }
    }

    if (this.#focusIndex != null && this.#focusIndex >= index) {
      this.#focusIndex += number;
    }

    // Newly added items are unselected.
    this.#methods.setItemSelectionState(index, number, false);
  }

  /**
   * Assert that the given range is within the full range of indices.
   *
   * @param {number} index - The range start.
   * @param {number} number - The number of indices in the range.
   */
  #assertValidRange(index, number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.#numItems) {
      throw new RangeError(
        `index ${index} is not an integer in the range [0, ${this.#numItems -
          1}]`
      );
    }
    if (
      !Number.isInteger(number) ||
      number < 1 ||
      number > this.#numItems - index
    ) {
      throw new RangeError(
        `number ${number} is not an integer in the range [1, ${this.#numItems -
          index}]`
      );
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
    this.#assertValidRange(index, number);

    let focusWasSelected =
      this.#focusIndex != null && this.#indexIsSelected(this.#focusIndex);

    this.#numItems -= number;

    // The ranges to remove.
    let deleteRangesStart = 0;
    let deleteRangesNumber = 0;
    // The range to insert by combining overlapping ranges on either side of the
    // deleted indices.
    let insertRange = { start: index, end: index };

    // Go through ranges from last to first.
    for (let i = this.#ranges.length - 1; i >= 0; i--) {
      let { start, end } = this.#ranges[i];
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
    if (deleteRangesNumber) {
      if (insertRange.end > insertRange.start) {
        this.#ranges.splice(deleteRangesStart, deleteRangesNumber, insertRange);
      } else {
        // No range to insert.
        this.#ranges.splice(deleteRangesStart, deleteRangesNumber);
      }
    }

    if (!this.#ranges.length) {
      // Ends any shift range.
      this.#shiftRangeDirection = null;
    }

    if (this.#focusIndex != null) {
      if (this.#focusIndex >= index + number) {
        this.#focusIndex -= number;
      } else if (this.#focusIndex >= index) {
        // Focus is lost.
        // Try to move to the first item after the removed items. If this does
        // not exist, it will be capped to the last item overall in #moveFocus.
        let newFocus = index;
        if (focusWasSelected && this.#shiftRangeDirection) {
          // As a special case, if the focused item was inside a shift
          // selection range when it was removed, and the range still exists
          // after, we keep the focus within the selection boundary that is
          // opposite the "pivot" point. I.e. when selecting forwards we keep
          // the focus below the selection end, and when selecting backwards we
          // keep the focus above the selection start. This is to prevent the
          // focused item becoming unselected in the middle of an ongoing shift
          // range selection.
          // NOTE: When selecting forwards, we do not keep the focus above the
          // selection start because the user would only be here (at the
          // selection "pivot") if they navigated with Ctrl+Space to this
          // position, so we do not override the default behaviour. Similarly
          // when selecting backwards we do not require the focus to remain
          // above the selection end.
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
        this.#moveFocus(newFocus);
        // #focusIndex may now be different from newFocus if the deleted
        // indices were the final ones, and may be null if no items remain.
        if (!this.#ranges.length && this.#focusIndex != null) {
          // If the focus was moved, and now we have no selection, we select it.
          // This is deemed relatively safe to do since it only effects the
          // state of the focused item. And it is convenient to have selection
          // resume.
          this.#selectSingle(this.#focusIndex);
        }
      }
    }
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
    this.#moveFocus(index);
  }

  /**
   * Get the ranges of all selected items.
   *
   * Note that ranges are returned rather than individual indices to keep this
   * method fast. Unlike the selected indices which might become very large with
   * a single user operation, like Select-All, the number of ranges will
   * increase by at most one range per user interaction or public method call.
   *
   * Note that the SelectionRange objects specify the range with a `start` and
   * `end` index. The `start` is inclusive of the index, but the `end` is
   * not.
   *
   * Note that the returned Array is static (it will not update as the selection
   * changes).
   *
   * @return {SelectionRange[]} - An array of all non-overlapping selection
   * ranges, order by their start index.
   */
  getSelectionRanges() {
    return Array.from(this.#ranges, r => {
      return { start: r.start, end: r.end };
    });
  }

  /**
   * Select the specified range of indices, and nothing else.
   *
   * @param {number} index - The first index to select.
   * @param {number} number - The number of indices to select.
   */
  #selectRange(index, number) {
    this.#assertValidRange(index, number);

    let rangeStart = index;
    let rangeEnd = index + number;
    if (
      this.#ranges.length == 1 &&
      this.#ranges[0].start == rangeStart &&
      this.#ranges[0].end == rangeEnd
    ) {
      // No change.
      return;
    }

    if (this.#ranges.length) {
      // Clear any existing selection.
      // NOTE: For simplicity, we do a blanket de-selection across the whole
      // region, even items in between ranges that are not selected, but we
      // avoid de-selecting the items in the region we are about to select to
      // avoid toggling their selection state in this method.
      let firstRangeStart = this.#ranges[0].start;
      let lastRangeEnd = this.#ranges[this.#ranges.length - 1].end;
      if (firstRangeStart < rangeStart) {
        // Clear everything from first range up to rangeStart.
        this.#methods.setItemSelectionState(
          firstRangeStart,
          rangeStart - firstRangeStart,
          false
        );
      }
      if (lastRangeEnd > rangeEnd) {
        // Clear everything from the rangeEnd to last range.
        this.#methods.setItemSelectionState(
          rangeEnd,
          lastRangeEnd - rangeEnd,
          false
        );
      }
    }

    this.#methods.setItemSelectionState(index, number, true);
    this.#ranges = [{ start: rangeStart, end: rangeEnd }];
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
   */
  #toggleSelection(index) {
    this.#assertValidRange(index, 1);

    let wasSelected = false;
    let i;
    // We traverse over the ranges.
    for (i = 0; i < this.#ranges.length; i++) {
      let { start, end } = this.#ranges[i];
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
    if (!wasSelected) {
      // The index i points to a *gap* between existing ranges, so lies in
      // [0, numItems]. Note, the space between the start and the first range,
      // or the end and the last range count as gaps, even if they are zero
      // width.
      // We want to know whether the index touches the borders of the range
      // either side of the gap.
      let touchesRangeEnd = i > 0 && index == this.#ranges[i - 1].end;
      // A [ B   C   D ] E   F   G   H   I
      //         end(i-1)^
      //                 ^index
      let touchesRangeStart =
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
    this.#methods.setItemSelectionState(index, 1, !wasSelected);
    // Cancel any shift range.
    this.#shiftRangeDirection = null;
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
    if (this.#focusIndex != null || !this.#numItems) {
      return;
    }
    // If nothing is selected, select the first item.
    if (!this.#ranges.length) {
      this.#selectSingle(0);
    }
    // Focus first selected item.
    this.#moveFocus(this.#ranges[0].start, true);
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
    let prevFocusIndex = this.#focusIndex;
    if (focusIndex !== undefined) {
      // NOTE: We need a strict inequality since focusIndex may be null.
      this.#moveFocus(focusIndex, true);
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
    if (event.buttons != 1 || event.metaKey || event.altKey) {
      return;
    }
    // Reserve the mousedown event.
    event.stopPropagation();
    event.preventDefault();

    let { shiftKey, ctrlKey } = event;
    let focusIndex;
    let select;
    let clickIndex = this.#methods.indexFromTarget(event.target);
    if (
      clickIndex == null ||
      // Clicking empty space.
      (ctrlKey && shiftKey) ||
      // Both modifiers pressed.
      ((ctrlKey || shiftKey) && !this.#multiSelectable)
      // Attempting multi-selection when not supported
    ) {
      // Just re-focus the widget.
      focusIndex = this.#focusIndex;
    } else {
      focusIndex = clickIndex;
      if (ctrlKey) {
        select = "toggle";
      } else if (shiftKey) {
        select = "range";
      } else {
        select = "single";
      }
    }
    this.#adjustFocusAndSelection(focusIndex, select);
  }

  #handleKeyDown(event) {
    if (event.altKey) {
      // Not handled.
      return;
    }

    let { shiftKey, ctrlKey, metaKey } = event;
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
        let sizeDetails = this.#methods.getPageSizeDetails();
        if (!sizeDetails) {
          // Do not handle and allow PageUp or PageDown to propagate.
          return;
        }
        if (!sizeDetails.itemSize || !sizeDetails.viewSize) {
          // Still reserve PageUp and PageDown
          break;
        }
        let { itemSize, viewSize, viewOffset } = sizeDetails;
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
        let itemsPerPage = Math.ceil(viewSize / itemSize - 0.5);
        if (itemsPerPage <= 1) {
          break;
        }
        if (event.key == "PageUp") {
          // We want to know what the first visible index is. I.e. the smallest
          // i that satisfies
          //     i > (viewOffset / itemSize) - 1/2
          // This is equivalent to flooring the right hand side + 1.
          let pageStart = Math.floor(viewOffset / itemSize - 0.5) + 1;
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
          let pageEnd = Math.ceil((viewOffset + viewSize) / itemSize - 0.5) - 1;
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

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A structure to represent a set of articles. This is usually for lines from
 * the newsrc, which have article lists like
 *
 * 1-29627,29635,29658,32861-32863
 *
 * so the data has these properties:
 *
 * - strictly increasing
 * - large subsequences of monotonically increasing ranges
 * - gaps in the set are usually small, but not always
 * - consecutive ranges tend to be large
 */
export class MsgKeySet {
  /**
   * @param {string} [str] - The raw string to represent a set of articles.
   */
  constructor(str) {
    // An array of tuples, each tuple contains the start and end value of a sub
    // range.
    // @type {Array<[number, number]>}
    this._ranges = str
      ? str.split(",").map(part => {
          const [start, end] = part.split("-");
          return [+start, +end || +start];
        })
      : [];
  }

  /**
   * Add a value to the set.
   *
   * @param {number} value - The value to add.
   */
  add(value) {
    this.addRange(value, value);
  }

  /**
   * Add a range to the set.
   *
   * @param {number} low - The smallest value of the range.
   * @param {number} high - The largest value of the range.
   */
  addRange(low, high) {
    let index = 0;
    for (const [start] of this._ranges) {
      if (start > low) {
        break;
      }
      index++;
    }
    this._ranges.splice(index, 0, [low, high]);
    this._rebuild();
  }

  /**
   * Check if a value is in the set.
   *
   * @param {number} value - The value to check.
   * @returns {boolean}
   */
  has(value) {
    return this._ranges.some(([start, end]) =>
      end ? start <= value && value <= end : start == value
    );
  }

  /**
   * Get the last range that is in the input range, but not in the key set.
   *
   * @param {number} low - The smallest value of the input range.
   * @param {number} high - The largest value of the input range.
   * @returns {number[]} - Array of lenght two with [low, high].
   */
  getLastMissingRange(low, high) {
    const length = this._ranges.length;
    for (let i = length - 1; i >= 0; i--) {
      const [start, end] = this._ranges[i];
      if (end < high) {
        return [Math.max(low, end + 1), high];
      } else if (low < start && high > start) {
        high = start - 1;
      } else {
        return [];
      }
    }
    return [low, high];
  }

  /**
   * Get the string representation of the key set.
   *
   * @returns {string}
   */
  toString() {
    return this._ranges
      .map(([start, end]) => (start == end ? start : `${start}-${end}`))
      .join(",");
  }

  /**
   * Sub ranges may become overlapped after some operations. This method merges
   * them if needed.
   */
  _rebuild() {
    if (this._ranges.length < 2) {
      return;
    }
    const newRanges = [];
    let [cursorStart, cursorEnd] = this._ranges[0];
    for (const [start, end] of this._ranges.slice(1)) {
      if (cursorEnd < start - 1) {
        // No overlap between the two ranges.
        newRanges.push([cursorStart, cursorEnd]);
        cursorStart = start;
        cursorEnd = end;
      } else if (end > cursorEnd) {
        // Overlapped, merge them.
        cursorEnd = end;
      }
    }
    newRanges.push([cursorStart, cursorEnd]);
    this._ranges = newRanges;
  }
}

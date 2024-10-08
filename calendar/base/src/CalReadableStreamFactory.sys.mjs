/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

/**
 * Function used to transform each value received from a stream.
 *
 * @callback MapStreamFunction
 * @param {any} value
 * @returns {Promise<any>|any}
 */

/**
 * A version of UnderlyingSource that accepts a CalBoundedReadableStreamController
 * as the controller argument.
 *
 * @typedef {object} CalBoundedReadableStreamUnderlyingSource
 */

/**
 * Wrapper class for a ReadableStreamDefaultController that keeps track of how
 * many items have been added to the queue before closing. This controller also
 * buffers items to reduce the amount of times items are added to the queue.
 */
class CalBoundedReadableStreamController {
  /**
   * @type {ReadableStreamDefaultController}
   */
  _controller = null;

  /**
   * @type {CalBoundedReadableStreamUnderlyingSource}
   */
  _src = null;

  /**
   * @type {number}
   */
  _maxTotalItems;

  /**
   * @type {number}
   */
  _maxQueuedItems;

  /**
   * @type {calIItemBase[]}
   */
  _buffer = [];

  /**
   * @type {boolean}
   */
  _closed = false;

  /**
   * The count of items enqueued so far.
   *
   * @type {number}
   */
  count = 0;

  /**
   * @param {number} maxTotalItems
   * @param {number} maxQueuedItems
   * @param {CalBoundedReadableStreamUnderlyingSource} src
   */
  constructor(maxTotalItems, maxQueuedItems, src) {
    this._maxTotalItems = maxTotalItems;
    this._maxQueuedItems = maxQueuedItems;
    this._src = src;
  }

  /**
   * Indicates whether the maximum number of items have been added to the queue
   * after which no more will be allowed.
   *
   * @type {number}
   */
  get maxTotalItemsReached() {
    return this._maxTotalItems && this.count >= this._maxTotalItems;
  }

  /**
   * Indicates whether the queue is full or not.
   *
   * @type {boolean}
   */
  get queueFull() {
    return this._buffer.length >= this._maxQueuedItems;
  }

  /**
   * Indicates how many more items can be enqueued based on the internal count
   * kept.
   *
   * @type {number}
   */
  get remainingItemCount() {
    return this._maxTotalItems ? this._maxTotalItems - this.count : Infinity;
  }

  /**
   * Provides the value of the same property from the controller.
   *
   * @type {number}
   */
  get desiredSize() {
    return this._controller.desiredSize;
  }

  /**
   * Called by the ReadableStream to begin queueing items. This delegates to
   * the provided underlying source.
   *
   * @param {ReadableStreamDefaultController} controller
   */
  async start(controller) {
    this._controller = controller;
    if (this._src.start) {
      await this._src.start(this);
    }
  }

  /**
   * Called by the ReadableStream to receive more items when the queue has not
   * been filled.
   */
  async pull() {
    if (this._src.pull) {
      await this._src.pull(this);
    }
  }

  /**
   * Called by the ReadableStream when reading has been cancelled.
   *
   * @param {string} reason
   */
  async cancel(reason) {
    this._closed = true;
    if (this._src.cancel) {
      await this._src.cancel(reason);
    }
  }

  /**
   * Called by start() of the underlying source to add items to the queue. Items
   * will only be added if maxTotalItemsReached returns false at which point
   * the stream is automatically closed.
   *
   * @param {calIItemBase[]} items
   */
  enqueue(items) {
    for (const item of items) {
      if (this.queueFull) {
        this.flush();
      }
      if (this.maxTotalItemsReached) {
        return;
      }
      this._buffer.push(item);
    }
    this.flush();
  }

  /**
   * Flushes the internal buffer if the number of buffered items have reached
   * the threshold.
   *
   * @param {boolean} [force] - If true, will flush all items regardless of the
   *                            threshold.
   */
  flush(force) {
    if (force || this.queueFull) {
      if (this.maxTotalItemsReached) {
        return;
      }
      const buffer = this._buffer.slice(0, this.remainingItemCount);
      this._controller.enqueue(buffer);
      this.count += buffer.length;
      this._buffer = [];
      if (this.maxTotalItemsReached) {
        this._controller.close();
      }
    }
  }

  /**
   * Puts the stream in the error state.
   *
   * @param {Error} err
   */
  error(err) {
    this._closed = true;
    this._controller.error(err);
  }

  /**
   * Closes the stream preventing any further items from being added to the queue.
   */
  close() {
    if (!this._closed) {
      if (this._buffer.length) {
        this.flush(true);
      }
      this._closed = true;
      this._controller.close();
    }
  }
}

/**
 * Factory object for creating ReadableStreams of calIItemBase instances. This
 * is used by the providers to satisfy getItems() calls from their respective
 * backing stores.
 */
export class CalReadableStreamFactory {
  /**
   * The default amount of items to queue before providing via the reader.
   */
  static defaultQueueSize = 100;

  /**
   * Creates a generic ReadableStream using the passed object as the
   * UnderlyingSource. Use this method instead of creating streams directly
   * until the API is more stable.
   *
   * @param {UnderlyingSource} src
   *
   * @returns {ReadableStream}
   */
  static createReadableStream(src) {
    return new ReadableStream(src);
  }

  /**
   * Creates a ReadableStream of calIItemBase items that tracks how many
   * have been added to the queue. If maxTotalItems or more are enqueued, the
   * stream will close ignoring further additions.
   *
   * @param {number} maxTotalItems
   * @param {number} maxQueuedItems
   * @param {UnderlyingSource} src
   *
   * @returns {ReadableStream<calIItemBase>}
   */
  static createBoundedReadableStream(maxTotalItems, maxQueuedItems, src) {
    return new ReadableStream(
      new CalBoundedReadableStreamController(maxTotalItems, maxQueuedItems, src)
    );
  }

  /**
   * Creates a ReadableStream that will provide no actual items.
   *
   * @returns {ReadableStream<calIItemBase>}
   */
  static createEmptyReadableStream() {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  /**
   * Creates a ReadableStream that uses the one or more provided ReadableStreams
   * for the source of its data. Each stream is read to completion one at a time
   * and an error occurring while reading any will cause the main stream to end
   * with in an error state.
   *
   * @param {ReadableStream[]} streams
   * @returns {ReadableStream}
   */
  static createCombinedReadableStream(streams) {
    return new ReadableStream({
      async start(controller) {
        for (const stream of streams) {
          for await (const chunk of cal.iterate.streamValues(stream)) {
            controller.enqueue(chunk);
          }
        }
        controller.close();
      },
    });
  }

  /**
   * Creates a ReadableStream from another stream where each chunk of the source
   * stream is passed to a MapStreamFunction before enqueuing in the final stream.
   *
   * @param {ReadableStream}
   * @param {MapStreamFunction}
   *
   * @returns {ReadableStream}
   */
  static createMappedReadableStream(stream, func) {
    return new ReadableStream({
      async start(controller) {
        for await (const chunk of cal.iterate.streamValues(stream)) {
          controller.enqueue(await func(chunk));
        }
        controller.close();
      },
    });
  }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { CalReadableStreamFactory } from "resource:///modules/CalReadableStreamFactory.sys.mjs";
import { CalStorageItemModel } from "resource:///modules/calendar/CalStorageItemModel.sys.mjs";

/**
 * CalStorageCachedItemModel extends CalStorageItemModel to add caching support
 * for items. Most of the methods here are overridden from the parent class to
 * either add or retrieve items from the cache.
 */
export class CalStorageCachedItemModel extends CalStorageItemModel {
  /**
   * Cache for all items.
   *
   * @type {Map<string, calIItemBase>}
   */
  itemCache = new Map();

  /**
   * Cache for recurring events.
   *
   * @type {Map<string, calIEvent>}
   */
  #recurringEventsCache = new Map();

  /**
   * Cache for recurring events offline flags.
   *
   * @type {Map<string, number>}
   */
  #recurringEventsOfflineFlagCache = new Map();

  /**
   * Cache for recurring todos.
   *
   * @type {Map<string, calITodo>}
   */
  #recurringTodosCache = new Map();

  /**
   * Cache for recurring todo offline flags.
   *
   * @type {Map<string, number>}
   */
  #recurringTodosOfflineCache = new Map();

  /**
   * Promise that resolves when the caches have been built up.
   *
   * @type {Promise<void>}
   */
  #recurringCachePromise = null;

  /**
   * Build up recurring event and todo cache with its offline flags.
   */
  async #ensureRecurringItemCaches() {
    if (!this.#recurringCachePromise) {
      this.#recurringCachePromise = this.#buildRecurringItemCaches();
    }
    return this.#recurringCachePromise;
  }

  async #buildRecurringItemCaches() {
    // Retrieve items and flags for recurring events and todos before combining
    // storing them in the item cache. Items need to be expunged from the
    // existing item cache to avoid get(Event|Todo)FromRow providing stale
    // values.
    const expunge = id => this.itemCache.delete(id);
    const [events, eventFlags] = await this.getRecurringEventAndFlagMaps(expunge);
    const [todos, todoFlags] = await this.getRecurringTodoAndFlagMaps(expunge);
    const itemsMap = await this.getAdditionalDataForItemMap(new Map([...events, ...todos]));

    this.itemCache = new Map([...this.itemCache, ...itemsMap]);
    this.#recurringEventsCache = new Map([...this.#recurringEventsCache, ...events]);
    this.#recurringEventsOfflineFlagCache = new Map([
      ...this.#recurringEventsOfflineFlagCache,
      ...eventFlags,
    ]);
    this.#recurringTodosCache = new Map([...this.#recurringTodosCache, ...todos]);
    this.#recurringTodosOfflineCache = new Map([...this.#recurringTodosOfflineCache, ...todoFlags]);
  }

  /**
   * Overridden here to build the recurring item caches when needed.
   *
   * @param {CalStorageQuery} query
   *
   * @returns {ReadableStream<calIItemBase>
   */
  getItems(query) {
    const self = this;
    const getStream = () => super.getItems(query);
    return CalReadableStreamFactory.createReadableStream({
      async start(controller) {
        // HACK because recurring offline events/todos objects don't have offline_journal information
        // Hence we need to update the offline flags caches.
        // It can be an expensive operation but is only used in Online Reconciliation mode
        if (
          (query.filters.wantOfflineCreatedItems ||
            query.filters.wantOfflineDeletedItems ||
            query.filters.wantOfflineModifiedItems) &&
          self.mRecItemCachePromise
        ) {
          // If there's an existing Promise and it's not complete, wait for it - something else is
          // already waiting and we don't want to break that by throwing away the caches. If it IS
          // complete, we'll continue immediately.
          const recItemCachePromise = self.mRecItemCachePromise;
          await recItemCachePromise;
          await new Promise(resolve => ChromeUtils.idleDispatch(resolve));
          // Check in case someone else already threw away the caches.
          if (self.mRecItemCachePromise == recItemCachePromise) {
            self.mRecItemCachePromise = null;
          }
        }
        await self.#ensureRecurringItemCaches();

        for await (const value of cal.iterate.streamValues(getStream())) {
          controller.enqueue(value);
        }
        controller.close();
      },
    });
  }

  /**
   * Overridden here to provide the events from the cache.
   *
   * @returns {[Map<string, calIEvent>, Map<string, number>]}
   */
  async getFullRecurringEventAndFlagMaps() {
    return [this.#recurringEventsCache, this.#recurringEventsOfflineFlagCache];
  }

  /**
   * Overridden here to provide the todos from the cache.
   *
   * @returns {[Map<string, calITodo>, Map<string, number>]}
   */
  async getFullRecurringTodoAndFlagMaps() {
    return [this.#recurringTodosCache, this.#recurringTodosOfflineCache];
  }

  async getEventFromRow(row, getAdditionalData = true) {
    let item = this.itemCache.get(row.getResultByName("id"));
    if (item) {
      return item;
    }

    item = await super.getEventFromRow(row, getAdditionalData);
    if (getAdditionalData) {
      this.#cacheItem(item);
    }
    return item;
  }

  async getTodoFromRow(row, getAdditionalData = true) {
    let item = this.itemCache.get(row.getResultByName("id"));
    if (item) {
      return item;
    }

    item = await super.getTodoFromRow(row, getAdditionalData);
    if (getAdditionalData) {
      this.#cacheItem(item);
    }
    return item;
  }

  async addItem(item) {
    await super.addItem(item);
    this.#cacheItem(item);
  }

  async getItemById(id) {
    await this.#ensureRecurringItemCaches();
    const item = this.itemCache.get(id);
    if (item) {
      return item;
    }
    return super.getItemById(id);
  }

  async deleteItemById(id, keepMeta) {
    await super.deleteItemById(id, keepMeta);
    this.itemCache.delete(id);
    this.#recurringEventsCache.delete(id);
    this.#recurringTodosCache.delete(id);
  }

  /**
   * Adds an item to the relevant caches.
   *
   * @param {calIItemBase} item
   */
  #cacheItem(item) {
    if (item.recurrenceId) {
      // Do not cache recurring item instances. See bug 1686466.
      return;
    }
    this.itemCache.set(item.id, item);
    if (item.recurrenceInfo) {
      if (item.isEvent()) {
        this.#recurringEventsCache.set(item.id, item);
      } else {
        this.#recurringTodosCache.set(item.id, item);
      }
    }
  }
}

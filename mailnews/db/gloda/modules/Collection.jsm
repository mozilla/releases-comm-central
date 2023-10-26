/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["GlodaCollection", "GlodaCollectionManager"];

var LOG = console.createInstance({
  prefix: "gloda.collection",
  maxLogLevel: "Warn",
  maxLogLevelPref: "gloda.loglevel",
});

/**
 * @namespace Central registry and logic for all collections.
 *
 * The collection manager is a singleton that has the following tasks:
 * - Let views of objects (nouns) know when their objects have changed.  For
 *   example, an attribute has changed due to user action.
 * - Let views of objects based on queries know when new objects match their
 *   query, or when their existing objects no longer match due to changes.
 * - Caching/object-identity maintenance.  It is ideal if we only ever have
 *   one instance of an object at a time.  (More specifically, only one instance
 *   per database row 'id'.)  The collection mechanism lets us find existing
 *   instances to this end.  Caching can be directly integrated by being treated
 *   as a special collection.
 */
var GlodaCollectionManager = {
  _collectionsByNoun: {},
  _cachesByNoun: {},

  /**
   * Registers the existence of a collection with the collection manager.  This
   *  is done using a weak reference so that the collection can go away if it
   *  wants to.
   */
  registerCollection(aCollection) {
    let collections;
    const nounID = aCollection.query._nounDef.id;
    if (!(nounID in this._collectionsByNoun)) {
      collections = this._collectionsByNoun[nounID] = [];
    } else {
      // purge dead weak references while we're at it
      collections = this._collectionsByNoun[nounID].filter(aRef => aRef.get());
      this._collectionsByNoun[nounID] = collections;
    }
    collections.push(Cu.getWeakReference(aCollection));
  },

  getCollectionsForNounID(aNounID) {
    if (!(aNounID in this._collectionsByNoun)) {
      return [];
    }

    // generator would be nice, but I suspect get() is too expensive to use
    //  twice (guard/predicate and value)
    const weakCollections = this._collectionsByNoun[aNounID];
    const collections = [];
    for (let iColl = 0; iColl < weakCollections.length; iColl++) {
      const collection = weakCollections[iColl].get();
      if (collection) {
        collections.push(collection);
      }
    }
    return collections;
  },

  defineCache(aNounDef, aCacheSize) {
    this._cachesByNoun[aNounDef.id] = new GlodaLRUCacheCollection(
      aNounDef,
      aCacheSize
    );
  },

  /**
   * Attempt to locate an instance of the object of the given noun type with the
   *  given id.  Counts as a cache hit if found.  (And if it wasn't in a cache,
   *  but rather a collection, it is added to the cache.)
   */
  cacheLookupOne(aNounID, aID, aDoCache) {
    let cache = this._cachesByNoun[aNounID];

    if (cache) {
      if (aID in cache._idMap) {
        const item = cache._idMap[aID];
        return cache.hit(item);
      }
    }

    if (aDoCache === false) {
      cache = null;
    }

    for (const collection of this.getCollectionsForNounID(aNounID)) {
      if (aID in collection._idMap) {
        const item = collection._idMap[aID];
        if (cache) {
          cache.add([item]);
        }
        return item;
      }
    }

    LOG.debug("cacheLookupOne:\nhit null");
    return null;
  },

  /**
   * Lookup multiple nouns by ID from the cache/existing collections.
   *
   * @param {integer} aNounID - The kind of noun identified by its ID.
   * @param {object} aIDMap - A dictionary/map whose keys must be gloda noun
   *   ids for the given noun type and whose values are ignored.
   * @param  {object} aTargetMap - An object to hold the noun id's (key)
   *   and noun instances (value) for the noun instances that were found
   *   available in memory because they were cached or in existing query
   *   collections.
   * @param {boolean} [aDoCache=true] Should we add any items to the cache that
   *   we found in collections that were in memory but not in the cache?
   *   You would likely want to pass false if you are only updating in-memory
   *   representations rather than performing a new query.
   *
   * @returns {integer[]} [The number that were found, the number that were not found,
   *          a dictionary whose keys are the ids of noun instances that
   *          were not found.]
   */
  cacheLookupMany(aNounID, aIDMap, aTargetMap, aDoCache) {
    let foundCount = 0,
      notFoundCount = 0;
    const notFound = {};

    let cache = this._cachesByNoun[aNounID];

    if (cache) {
      for (const key in aIDMap) {
        const cacheValue = cache._idMap[key];
        if (cacheValue === undefined) {
          notFoundCount++;
          notFound[key] = null;
        } else {
          foundCount++;
          aTargetMap[key] = cacheValue;
          cache.hit(cacheValue);
        }
      }
    }

    if (aDoCache === false) {
      cache = null;
    }

    for (const collection of this.getCollectionsForNounID(aNounID)) {
      for (const key in notFound) {
        const collValue = collection._idMap[key];
        if (collValue !== undefined) {
          aTargetMap[key] = collValue;
          delete notFound[key];
          foundCount++;
          notFoundCount--;
          if (cache) {
            cache.add([collValue]);
          }
        }
      }
    }

    return [foundCount, notFoundCount, notFound];
  },

  /**
   * Friendlier version of |cacheLookupMany|; takes a list of ids and returns
   *  an object whose keys and values are the gloda id's and instances of the
   *  instances that were found.  We don't tell you who we didn't find.  The
   *  assumption is this is being used for in-memory updates where we only need
   *  to tweak what is in memory.
   */
  cacheLookupManyList(aNounID, aIds) {
    const checkMap = {},
      targetMap = {};
    for (const id of aIds) {
      checkMap[id] = null;
    }
    // do not promote found items into the cache
    this.cacheLookupMany(aNounID, checkMap, targetMap, false);
    return targetMap;
  },

  /**
   * Attempt to locate an instance of the object of the given noun type with the
   *  given id.  Counts as a cache hit if found.  (And if it wasn't in a cache,
   *  but rather a collection, it is added to the cache.)
   */
  cacheLookupOneByUniqueValue(aNounID, aUniqueValue, aDoCache) {
    let cache = this._cachesByNoun[aNounID];

    if (cache) {
      if (aUniqueValue in cache._uniqueValueMap) {
        const item = cache._uniqueValueMap[aUniqueValue];
        return cache.hit(item);
      }
    }

    if (aDoCache === false) {
      cache = null;
    }

    for (const collection of this.getCollectionsForNounID(aNounID)) {
      if (aUniqueValue in collection._uniqueValueMap) {
        const item = collection._uniqueValueMap[aUniqueValue];
        if (cache) {
          cache.add([item]);
        }
        return item;
      }
    }

    return null;
  },

  /**
   * Checks whether the provided item with the given id is actually a duplicate
   *  of an instance that already exists in the cache/a collection.  If it is,
   *  the pre-existing instance is returned and counts as a cache hit.  If it
   *  is not, the passed-in instance is added to the cache and returned.
   */
  cacheLoadUnifyOne(aItem) {
    const items = [aItem];
    this.cacheLoadUnify(aItem.NOUN_ID, items);
    return items[0];
  },

  /**
   * Given a list of items, check if any of them already have duplicate,
   *  canonical, instances in the cache or collections.  Items with pre-existing
   *  instances are replaced by those instances in the provided list, and each
   *  counts as a cache hit.  Items without pre-existing instances are added
   *  to the cache and left intact.
   */
  cacheLoadUnify(aNounID, aItems, aCacheIfMissing) {
    const cache = this._cachesByNoun[aNounID];
    if (aCacheIfMissing === undefined) {
      aCacheIfMissing = true;
    }

    // track the items we haven't yet found in a cache/collection (value) and
    //  their index in aItems (key).  We're somewhat abusing the dictionary
    //  metaphor with the intent of storing tuples here.  We also do it because
    //  it allows random-access deletion theoretically without cost.  (Since
    //  we delete during iteration, that may be wrong, but it sounds like the
    //  semantics still work?)
    const unresolvedIndexToItem = {};
    let numUnresolved = 0;

    if (cache) {
      for (let iItem = 0; iItem < aItems.length; iItem++) {
        const item = aItems[iItem];

        if (item.id in cache._idMap) {
          const realItem = cache._idMap[item.id];
          // update the caller's array with the reference to the 'real' item
          aItems[iItem] = realItem;
          cache.hit(realItem);
        } else {
          unresolvedIndexToItem[iItem] = item;
          numUnresolved++;
        }
      }

      // we're done if everyone was a hit.
      if (numUnresolved == 0) {
        return;
      }
    } else {
      for (let iItem = 0; iItem < aItems.length; iItem++) {
        unresolvedIndexToItem[iItem] = aItems[iItem];
      }
      numUnresolved = aItems.length;
    }

    const needToCache = [];
    // next, let's fall back to our collections
    for (const collection of this.getCollectionsForNounID(aNounID)) {
      for (const [iItem, item] of Object.entries(unresolvedIndexToItem)) {
        if (item.id in collection._idMap) {
          const realItem = collection._idMap[item.id];
          // update the caller's array to now have the 'real' object
          aItems[iItem] = realItem;
          // flag that we need to cache this guy (we use an inclusive cache)
          needToCache.push(realItem);
          // we no longer need to resolve this item...
          delete unresolvedIndexToItem[iItem];
          // stop checking collections if we got everybody
          if (--numUnresolved == 0) {
            break;
          }
        }
      }
    }

    // anything left in unresolvedIndexToItem should be added to the cache
    //  unless !aCacheIfMissing.  plus, we already have 'needToCache'
    if (cache && aCacheIfMissing) {
      cache.add(
        needToCache.concat(
          Object.keys(unresolvedIndexToItem).map(
            key => unresolvedIndexToItem[key]
          )
        )
      );
    }
  },

  cacheCommitDirty() {
    for (const id in this._cachesByNoun) {
      const cache = this._cachesByNoun[id];
      cache.commitDirty();
    }
  },

  /**
   * Notifies the collection manager that an item has been loaded and should
   *  be cached, assuming caching is active.
   */
  itemLoaded(aItem) {
    const cache = this._cachesByNoun[aItem.NOUN_ID];
    if (cache) {
      cache.add([aItem]);
    }
  },

  /**
   * Notifies the collection manager that multiple items has been loaded and
   *  should be cached, assuming caching is active.
   */
  itemsLoaded(aNounID, aItems) {
    const cache = this._cachesByNoun[aNounID];
    if (cache) {
      cache.add(aItems);
    }
  },

  /**
   * This should be called when items are added to the global database.  This
   *  should generally mean during indexing by indexers or an attribute
   *  provider.
   * We walk all existing collections for the given noun type and add the items
   *  to the collection if the item meets the query that defines the collection.
   */
  itemsAdded(aNounID, aItems) {
    const cache = this._cachesByNoun[aNounID];
    if (cache) {
      cache.add(aItems);
    }

    for (const collection of this.getCollectionsForNounID(aNounID)) {
      const addItems = aItems.filter(item => collection.query.test(item));
      if (addItems.length) {
        collection._onItemsAdded(addItems);
      }
    }
  },
  /**
   * This should be called when items in the global database are modified.  For
   *  example, as a result of indexing.  This should generally only be called
   *  by indexers or by attribute providers.
   * We walk all existing collections for the given noun type.  For items
   *  currently included in each collection but should no longer be (per the
   *  collection's defining query) we generate onItemsRemoved events.  For items
   *  not currently included in the collection but should now be, we generate
   *  onItemsAdded events.  For items included that still match the query, we
   *  generate onItemsModified events.
   */
  itemsModified(aNounID, aItems) {
    for (const collection of this.getCollectionsForNounID(aNounID)) {
      const added = [],
        modified = [],
        removed = [];
      for (const item of aItems) {
        if (item.id in collection._idMap) {
          // currently in... but should it still be there?
          if (collection.query.test(item)) {
            modified.push(item); // yes, keep it
          } else if (!collection.query.frozen) {
            // oy, so null queries really don't want any notifications, and they
            //  sorta fit into our existing model, except for the removal bit.
            //  so we need a specialized check for them, and we're using the
            //  frozen attribute to this end.
            removed.push(item); // no, bin it
          }
        } else if (collection.query.test(item)) {
          // not in, should it be?
          added.push(item); // yep, add it
        }
      }
      if (added.length) {
        collection._onItemsAdded(added);
      }
      if (modified.length) {
        collection._onItemsModified(modified);
      }
      if (removed.length) {
        collection._onItemsRemoved(removed);
      }
    }
  },
  /**
   * This should be called when items in the global database are permanently-ish
   *  deleted.  (This is distinct from concepts like message deletion which may
   *  involved trash folders or other modified forms of existence.  Deleted
   *  means the data is gone and if it were to come back, it would come back
   *  via an itemsAdded event.)
   * We walk all existing collections for the given noun type.  For items
   *  currently in the collection, we generate onItemsRemoved events.
   *
   * @param {integer} aNounID - Noun id.
   * @param {integer[]} aItemIds - A list of item ids that are being deleted.
   */
  itemsDeleted(aNounID, aItemIds) {
    // cache
    const cache = this._cachesByNoun[aNounID];
    if (cache) {
      for (const itemId of aItemIds) {
        if (itemId in cache._idMap) {
          cache.deleted(cache._idMap[itemId]);
        }
      }
    }

    // collections
    for (const collection of this.getCollectionsForNounID(aNounID)) {
      const removeItems = aItemIds
        .filter(itemId => itemId in collection._idMap)
        .map(itemId => collection._idMap[itemId]);
      if (removeItems.length) {
        collection._onItemsRemoved(removeItems);
      }
    }
  },
  /**
   * Like |itemsDeleted| but for the case where the deletion is based on an
   *  attribute that SQLite can more efficiently check than we can and where the
   *  cost of scanning the in-memory items is presumably much cheaper than
   *  trying to figure out what actually got deleted.
   *
   * Since we are doing an in-memory walk, this is obviously O(n) where n is the
   *  number of noun instances of a given type in-memory.  We are assuming this
   *  is a reasonable number of things and that this type of deletion call is
   *  not going to happen all that frequently.  If these assumptions are wrong,
   *  callers are advised to re-think the whole situation.
   *
   * @param {integer} aNounID - Type of noun we are talking about here.
   * @param {Function} aFilter - A filter function that returns true when the
   *   item should be thought of as deleted, or false if the item is still good.
   *   Screw this up and you will get some seriously wacky bugs, yo.
   */
  itemsDeletedByAttribute(aNounID, aFilter) {
    // cache
    const cache = this._cachesByNoun[aNounID];
    if (cache) {
      for (const id in cache._idMap) {
        const item = cache._idMap[id];
        if (aFilter(item)) {
          cache.deleted(item);
        }
      }
    }

    // collections
    for (const collection of this.getCollectionsForNounID(aNounID)) {
      const removeItems = collection.items.filter(aFilter);
      if (removeItems.length) {
        collection._onItemsRemoved(removeItems);
      }
    }
  },
};

/**
 * @class A current view of the set of first-class nouns meeting a given query.
 *  Assuming a listener is present, events are
 *  generated when new objects meet the query, existing objects no longer meet
 *  the query, or existing objects have experienced a change in attributes that
 *  does not affect their ability to be present (but the listener may care about
 *  because it is exposing those attributes).
 * @class
 */
function GlodaCollection(
  aNounDef,
  aItems,
  aQuery,
  aListener,
  aMasterCollection
) {
  // if aNounDef is null, we are just being invoked for subclassing
  if (aNounDef === undefined) {
    return;
  }

  this._nounDef = aNounDef;
  // should we also maintain a unique value mapping...
  if (this._nounDef.usesUniqueValue) {
    this._uniqueValueMap = {};
  }

  this.pendingItems = [];
  this._pendingIdMap = {};
  this.items = [];
  this._idMap = {};

  // force the listener to null for our call to _onItemsAdded; no events for
  //  the initial load-out.
  this._listener = null;
  if (aItems && aItems.length) {
    this._onItemsAdded(aItems);
  }

  this.query = aQuery || null;
  if (this.query) {
    this.query.collection = this;
    if (this.query.options.stashColumns) {
      this.stashedColumns = {};
    }
  }
  this._listener = aListener || null;

  this.deferredCount = 0;
  this.resolvedCount = 0;

  if (aMasterCollection) {
    this.masterCollection = aMasterCollection.masterCollection;
  } else {
    this.masterCollection = this;
    /** a dictionary of dictionaries. at the top level, the keys are noun IDs.
     * each of these sub-dictionaries maps the IDs of desired noun instances to
     * the actual instance, or null if it has not yet been loaded.
     */
    this.referencesByNounID = {};
    /**
     * a dictionary of dictionaries. at the top level, the keys are noun IDs.
     * each of the sub-dictionaries maps the IDs of the _recognized parent
     * noun_ to the list of children, or null if the list has not yet been
     * populated.
     *
     * So if we have a noun definition A with ID 1 who is the recognized parent
     *  noun of noun definition B with ID 2, AND we have an instance A(1) with
     *  two children B(10), B(11), then an example might be: {2: {1: [10, 11]}}.
     */
    this.inverseReferencesByNounID = {};
    this.subCollections = {};
  }
}

GlodaCollection.prototype = {
  get listener() {
    return this._listener;
  },
  set listener(aListener) {
    this._listener = aListener;
  },

  /**
   * If this collection still has a query associated with it, drop the query
   *  and replace it with an 'explicit query'.  This means that the Collection
   *  Manager will not attempt to match new items indexed to the system against
   *  our query criteria.
   * Once you call this method, your collection's listener will no longer
   *  receive onItemsAdded notifications that are not the result of your
   *  initial database query.  It will, however, receive onItemsModified
   *  notifications if items in the collection are re-indexed.
   */
  becomeExplicit() {
    if (!(this.query instanceof this._nounDef.explicitQueryClass)) {
      this.query = new this._nounDef.explicitQueryClass(this);
    }
  },

  /**
   * Clear the contents of this collection.  This only makes sense for explicit
   *  collections or wildcard collections.  (Actual query-based collections
   *  should represent the state of the query, so unless we're going to delete
   *  all the items, clearing the collection would violate that constraint.)
   */
  clear() {
    this._idMap = {};
    if (this._uniqueValueMap) {
      this._uniqueValueMap = {};
    }
    this.items = [];
  },

  _onItemsAdded(aItems) {
    this.items.push.apply(this.items, aItems);
    if (this._uniqueValueMap) {
      for (const item of this.items) {
        this._idMap[item.id] = item;
        this._uniqueValueMap[item.uniqueValue] = item;
      }
    } else {
      for (const item of this.items) {
        this._idMap[item.id] = item;
      }
    }
    if (this._listener) {
      try {
        this._listener.onItemsAdded(aItems, this);
      } catch (ex) {
        LOG.error(
          "caught exception from listener in onItemsAdded: " +
            ex.fileName +
            ":" +
            ex.lineNumber +
            ": " +
            ex
        );
      }
    }
  },

  _onItemsModified(aItems) {
    if (this._listener) {
      try {
        this._listener.onItemsModified(aItems, this);
      } catch (ex) {
        LOG.error(
          "caught exception from listener in onItemsModified: " +
            ex.fileName +
            ":" +
            ex.lineNumber +
            ": " +
            ex
        );
      }
    }
  },

  /**
   * Given a list of items that definitely no longer belong in this collection,
   *  remove them from the collection and notify the listener.  The 'tricky'
   *  part is that we need to remove the deleted items from our list of items.
   */
  _onItemsRemoved(aItems) {
    // we want to avoid the O(n^2) deletion performance case, and deletion
    //  should be rare enough that the extra cost of building the deletion map
    //  should never be a real problem.
    const deleteMap = {};
    // build the delete map while also nuking from our id map/unique value map
    for (const item of aItems) {
      deleteMap[item.id] = true;
      delete this._idMap[item.id];
      if (this._uniqueValueMap) {
        delete this._uniqueValueMap[item.uniqueValue];
      }
    }
    const items = this.items;
    // in-place filter.  probably needless optimization.
    let iWrite = 0;
    for (let iRead = 0; iRead < items.length; iRead++) {
      const item = items[iRead];
      if (!(item.id in deleteMap)) {
        items[iWrite++] = item;
      }
    }
    items.splice(iWrite);

    if (this._listener) {
      try {
        this._listener.onItemsRemoved(aItems, this);
      } catch (ex) {
        LOG.error(
          "caught exception from listener in onItemsRemoved: " +
            ex.fileName +
            ":" +
            ex.lineNumber +
            ": " +
            ex
        );
      }
    }
  },

  _onQueryCompleted() {
    this.query.completed = true;
    if (this._listener && this._listener.onQueryCompleted) {
      this._listener.onQueryCompleted(this);
    }
  },
};

/**
 * Create an LRU cache collection for the given noun with the given size.
 *
 * @class
 */
function GlodaLRUCacheCollection(aNounDef, aCacheSize) {
  GlodaCollection.call(this, aNounDef, null, null, null);

  this._head = null; // aka oldest!
  this._tail = null; // aka newest!
  this._size = 0;
  // let's keep things sane, and simplify our logic a little...
  if (aCacheSize < 32) {
    aCacheSize = 32;
  }
  this._maxCacheSize = aCacheSize;
}
/**
 * @class A LRU-discard cache.  We use a doubly linked-list for the eviction
 *  tracking.  Since we require that there is at most one LRU-discard cache per
 *  noun class, we simplify our lives by adding our own attributes to the
 *  cached objects.
 * @augments GlodaCollection
 */
GlodaLRUCacheCollection.prototype = new GlodaCollection();
GlodaLRUCacheCollection.prototype.add = function (aItems) {
  for (const item of aItems) {
    if (item.id in this._idMap) {
      // DEBUGME so, we're dealing with this, but it shouldn't happen.  need
      //  trace-debuggage.
      continue;
    }
    this._idMap[item.id] = item;
    if (this._uniqueValueMap) {
      this._uniqueValueMap[item.uniqueValue] = item;
    }

    item._lruPrev = this._tail;
    // we do have to make sure that we will set _head the first time we insert
    //  something
    if (this._tail !== null) {
      this._tail._lruNext = item;
    } else {
      this._head = item;
    }
    item._lruNext = null;
    this._tail = item;

    this._size++;
  }

  while (this._size > this._maxCacheSize) {
    const item = this._head;

    // we never have to deal with the possibility of needing to make _head/_tail
    //  null.
    this._head = item._lruNext;
    this._head._lruPrev = null;
    // (because we are nice, we will delete the properties...)
    delete item._lruNext;
    delete item._lruPrev;

    // nuke from our id map
    delete this._idMap[item.id];
    if (this._uniqueValueMap) {
      delete this._uniqueValueMap[item.uniqueValue];
    }

    // flush dirty items to disk (they may not have this attribute, in which
    //  case, this returns false, which is fine.)
    if (item.dirty) {
      this._nounDef.objUpdate.call(this._nounDef.datastore, item);
      delete item.dirty;
    }

    this._size--;
  }
};

GlodaLRUCacheCollection.prototype.hit = function (aItem) {
  // don't do anything in the 0 or 1 items case, or if we're already
  //  the last item
  if (this._head === this._tail || this._tail === aItem) {
    return aItem;
  }

  // - unlink the item
  if (aItem._lruPrev !== null) {
    aItem._lruPrev._lruNext = aItem._lruNext;
  } else {
    this._head = aItem._lruNext;
  }
  // (_lruNext cannot be null)
  aItem._lruNext._lruPrev = aItem._lruPrev;
  // - link it in to the end
  this._tail._lruNext = aItem;
  aItem._lruPrev = this._tail;
  aItem._lruNext = null;
  // update tail tracking
  this._tail = aItem;

  return aItem;
};

GlodaLRUCacheCollection.prototype.deleted = function (aItem) {
  // unlink the item
  if (aItem._lruPrev !== null) {
    aItem._lruPrev._lruNext = aItem._lruNext;
  } else {
    this._head = aItem._lruNext;
  }
  if (aItem._lruNext !== null) {
    aItem._lruNext._lruPrev = aItem._lruPrev;
  } else {
    this._tail = aItem._lruPrev;
  }

  // (because we are nice, we will delete the properties...)
  delete aItem._lruNext;
  delete aItem._lruPrev;

  // nuke from our id map
  delete this._idMap[aItem.id];
  if (this._uniqueValueMap) {
    delete this._uniqueValueMap[aItem.uniqueValue];
  }

  this._size--;
};

/**
 * If any of the cached items are dirty, commit them, and make them no longer
 *  dirty.
 */
GlodaLRUCacheCollection.prototype.commitDirty = function () {
  // we can only do this if there is an update method available...
  if (!this._nounDef.objUpdate) {
    return;
  }

  for (const iItem in this._idMap) {
    const item = this._idMap[iItem];
    if (item.dirty) {
      LOG.debug("flushing dirty: " + item);
      this._nounDef.objUpdate.call(this._nounDef.datastore, item);
      delete item.dirty;
    }
  }
};

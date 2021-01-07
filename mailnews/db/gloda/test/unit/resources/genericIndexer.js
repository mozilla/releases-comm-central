/**
 * Generic indexing mechanism; does nothing special, just uses
 *  Gloda.grokNounItem.  Call GenericIndexer.indexNewObjects() to queue
 *  queue your objects for initial indexing.
 */

/* import-globals-from ../test_query_core.js */

var GenericIndexer = {
  _log: console.createInstance({
    prefix: "gloda.test",
    maxLogLevel: "Warn",
    maxLogLevelPref: "gloda.test.loglevel",
  }),
  /* public interface */
  name: "generic_indexer",
  enable() {
    this.enabled = true;
  },
  disable() {
    this.enabled = false;
  },
  get workers() {
    return [
      [
        "generic",
        {
          worker: this._worker_index_generic,
        },
      ],
    ];
  },
  initialSweep() {},
  /* mock interface */
  enabled: false,
  initialSweepCalled: false,
  indexObjects(aObjects) {
    indexingInProgress = true;
    this._log.debug(
      "enqueuing " +
        aObjects.length +
        " generic objects with id: " +
        aObjects[0].NOUN_ID
    );
    GlodaIndexer.indexJob(new IndexingJob("generic", null, aObjects.concat()));
  },
  /* implementation */
  *_worker_index_generic(aJob, aCallbackHandle) {
    this._log.debug(
      "Beginning indexing " + aJob.items.length + " generic items"
    );
    for (let item of aJob.items) {
      this._log.debug("Indexing: " + item);
      yield aCallbackHandle.pushAndGo(
        Gloda.grokNounItem(
          item,
          {},
          item.id === undefined,
          item.id === undefined,
          aCallbackHandle,
          item.NOUN_DEF.cache
        )
      );
      item._stash();
    }

    yield GlodaIndexer.kWorkDone;
    this._log.debug("Done indexing");
  },
};
GlodaIndexer.registerIndexer(GenericIndexer);

var indexingInProgress = false;
function genericIndexerCallback(aStatus) {
  // If indexingInProgress is false, we've received the synthetic
  // notification, so ignore it
  if (indexingInProgress && aStatus == Gloda.kIndexerIdle) {
    indexingInProgress = false;
    async_driver();
  }
}
Gloda.addIndexerListener(genericIndexerCallback);

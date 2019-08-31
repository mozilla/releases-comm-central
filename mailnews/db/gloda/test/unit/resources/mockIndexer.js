/**
 * A mock gloda indexer.  Right now it just exists to let us cause the indexer
 *  to think it is indexing but really have nothing going on.
 */

/* globals GlodaIndexer, IndexingJob */

var MockIndexer = {
  /* public interface */
  name: "mock_indexer",
  enable() {
    this.enabled = true;
  },
  disable() {
    this.enabled = false;
  },
  get workers() {
    return [["forever", this._worker_index_forever]];
  },
  initialSweep() {
    this.initialSweepCalled = false;
  },
  /* mock interface */
  enabled: false,
  initialSweepCalled: false,
  indexForever() {
    GlodaIndexer.indexJob(new IndexingJob("forever", null));
  },
  stopIndexingForever() {
    GlodaIndexer.callbackDriver();
  },
  /* implementation */
  *_worker_index_forever(aJob, aCallbackHandle) {
    // pretend that something async is happening, but nothing is really
    //  happening!  muahahaha!
    //
    yield GlodaIndexer.kWorkAsync;
    yield GlodaIndexer.kWorkDone;
  },
};
GlodaIndexer.registerIndexer(MockIndexer);

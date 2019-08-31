/**
 * Mock nsITimer implementation.  Intended to be clobbered into place after the
 *  actual timer would normally be constructed.  Has a helpful method to help
 *  you do that, too!
 */
function MockTimer(aObj, aAttrName) {
  if (aObj && aAttrName) {
    this.clobber(aObj, aAttrName);
  }
}
MockTimer.prototype = {
  /* public interface */
  TYPE_ONE_SHOT: 0,
  TYPE_REPEATING_SLACK: 1,
  TYPE_REPEATING_PRECISE: 2,
  initWithCallback(aCallback, aDelay, aType) {
    if (aCallback instanceof Ci.nsITimerCallback) {
      this.callback = aCallback;
    } else {
      // It was just a function that we need to dress up.
      this.callback = {
        notify() {
          aCallback();
        },
      };
    }
    this.delay = aDelay;
    this.type = aType;
  },
  init(aObserver, aDelay, aType) {
    this.observer = aObserver;
    this.delay = aDelay;
    this.type = aType;
    this.callback = null;
  },
  cancel() {
    this.callback = null;
  },
  delay: 0,
  type: 0,
  _callback: null,
  _activeCallback: null,
  get callback() {
    return this._callback || this._activeCallback;
  },
  set callback(aCallback) {
    this._callback = aCallback;
  },
  get target() {
    throw Error("Homey don't play that");
  },
  /* private */
  observer: null,
  /* mock interface */
  get oneShot() {
    return this.type == this.TYPE_ONE_SHOT;
  },
  clobber(aObj, aAttrName) {
    let realTimer = aObj[aAttrName];
    realTimer.cancel();
    this.delay = realTimer.delay;
    this.type = realTimer.type;
    this.callback = realTimer.callback;
    aObj[aAttrName] = this;
  },
  fireNow() {
    if (this._callback) {
      this._activeCallback = this._callback;
      if (this.oneShot) {
        this._callback = null;
      }
      this._activeCallback.notify();
      this._activeCallback = null;
    } else if (this.observer) {
      let observer = this.observer;
      if (this.oneShot) {
        this.observer = null;
      }
      observer.observe(this, "timer-callback", null);
    }
  },
  get active() {
    return this.callback != null || this.observer != null;
  },
};

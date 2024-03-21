/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef UrlListener_h__
#define UrlListener_h__

#include <functional>  // For std::function.
#include "nsIUrlListener.h"
class nsIURI;

/**
 * UrlListener is a small nsIUrlListener implementation which allows
 * callable objects (including lambdas) to be plugged in instead of deriving
 * your own nsIUrlListener.
 *
 * The aim is to encourage more readable code by allowing the start/stop
 * notifications of a long-running operation to be handled near to where the
 * operation was initiated.
 *
 * A contrived example:
 *
 * void Kick() {
 *   UrlListener* listener = new UrlListener;
 *   listener->mStopFn = [](nsIURI* url, nsresult status) -> nsresult {
 *     // Note that we may get here waaaaaaay after Kick() has returned...
 *     printf("LongRunningOperation is finished.\n");
 *     return NS_OK;
 *   };
 *   thingService.startLongRunningOperation(listener);
 *   //...continue doing other stuff while operation is ongoing...
 * }
 *
 * Traditionally, c-c code has tended to use multiple inheritance to add
 * listener callbacks to the class of the object initiating the operation.
 * This has a couple of undesirable side effects:
 *
 * 1) It separates out the onStopRunningUrl handling into some other
 *    part of the code, which makes the order of things much harder to follow.
 * 2) Often the same onStopRunningUrl handler will be used for many different
 *    kinds of operations (see nsImapMailFolder::OnStopRunningUrl(), for
 *    example).
 * 3) It exposes implementation details as part of the public interface
 *    e.g see all the listener types nsMsgDBFolder derives from to implement
 *    it's internals. That's all just confusing noise that shouldn't be seen
 *    from outside the class.
 *
 * Just as PromiseTestUtils.sys.mjs brings the Javascript side up from callback
 * hell to async lovelyness, this can be used to raise the C++ side from
 * callback-somewhere-else-maybe-in-this-class-but-who-can-really-tell hell
 * up to normal callback hell :-)
 *
 */
class UrlListener : public nsIUrlListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIURLLISTENER

  UrlListener() {}
  /**
   * mStartFn and mStopFn are the OnStartRunning() and OnStopRunningUrl()
   * handlers. It's fine for them to be null (often you'll only need mStopFn).
   */
  std::function<nsresult(nsIURI*)> mStartFn;
  std::function<nsresult(nsIURI*, nsresult)> mStopFn;

 protected:
  virtual ~UrlListener() {}
};

#endif  // UrlListener_h__

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_
#define COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_

#include <functional>  // For std::function.
#include "nsIMsgOperationListener.h"

/**
 * MsgOperationListener is a small helper implementation of
 * nsIMsgOperationListener which wraps a callable object.
 */
class MsgOperationListener : public nsIMsgOperationListener {
 public:
  NS_DECL_ISUPPORTS
  using StopFunc = std::function<nsresult(nsresult)>;

  MsgOperationListener() = delete;
  explicit MsgOperationListener(StopFunc fn) : mStopFunc(fn) {
    MOZ_ASSERT(mStopFunc);
  }

  NS_IMETHOD OnStopOperation(nsresult status) override {
    return mStopFunc(status);
  }

 protected:
  StopFunc mStopFunc;
  virtual ~MsgOperationListener() {}
};

#endif  // COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_

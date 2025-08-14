/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_
#define COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_

#include <functional>  // For std::function.

#include "nsIMsgHdr.h"
#include "nsIMsgOperationListener.h"
#include "nsTArray.h"

/**
 * MsgOperationListener is a small helper implementation of
 * nsIMsgOperationListener which wraps a callable object.
 */
class MsgOperationListener : public nsIMsgOperationListener {
 public:
  NS_DECL_ISUPPORTS
  using StopFunc =
      std::function<nsresult(nsresult, const nsTArray<RefPtr<nsIMsgDBHdr>>&)>;

  MsgOperationListener() = delete;
  explicit MsgOperationListener(
      const nsTArray<RefPtr<nsIMsgDBHdr>>& newMessages, StopFunc fn)
      : mStopFunc(std::move(fn)), mNewMessages(newMessages.Clone()) {
    MOZ_ASSERT(mStopFunc);
  }

  NS_IMETHOD OnStopOperation(nsresult status) override {
    return mStopFunc(status, mNewMessages);
  }

 protected:
  StopFunc mStopFunc;
  const nsTArray<RefPtr<nsIMsgDBHdr>> mNewMessages;
  virtual ~MsgOperationListener() {}
};

#endif  // COMM_MAILNEWS_BASE_SRC_MSGOPERATIONLISTENER_H_

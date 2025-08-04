/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsListeners.h"

// Implementation of EwsSimpleListener

NS_IMPL_ISUPPORTS(EwsSimpleListener, IEwsSimpleOperationListener)

NS_IMETHODIMP EwsSimpleListener::OnOperationSuccess(
    const nsTArray<nsCString>& newIds, bool useLegacyFallback) {
  return mOnSuccess(std::move(newIds), useLegacyFallback);
};

// Implementation of EwsSimpleMessageListener

NS_IMPL_ISUPPORTS(EwsSimpleMessageListener, IEwsSimpleOperationListener)

NS_IMETHODIMP EwsSimpleMessageListener::OnOperationSuccess(
    const nsTArray<nsCString>& newIds, bool useLegacyFallback) {
  return mOnSuccess(mHeaders, std::move(newIds), useLegacyFallback);
};

// Implementation of EwsFallibleListener

NS_IMETHODIMP EwsFallibleListener::OnOperationFailure(nsresult status) {
  return mOnFailure(status);
};

// Implementation of EwsSimpleFailibleListener

NS_IMPL_ISUPPORTS_INHERITED(EwsSimpleFailibleListener, EwsSimpleListener,
                            EwsFallibleListener, IEwsSimpleOperationListener,
                            IEwsFallibleOperationListener)

// Implementation of EwsSimpleFailibleMessageListener

NS_IMPL_ISUPPORTS_INHERITED(EwsSimpleFailibleMessageListener,
                            EwsSimpleMessageListener, EwsFallibleListener,
                            IEwsSimpleOperationListener,
                            IEwsFallibleOperationListener)

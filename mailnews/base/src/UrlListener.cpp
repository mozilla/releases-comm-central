/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "UrlListener.h"

NS_IMPL_ISUPPORTS(UrlListener, nsIUrlListener)

NS_IMETHODIMP UrlListener::OnStartRunningUrl(nsIURI* url) {
  if (!mStartFn) {
    return NS_OK;
  }
  return mStartFn(url);
}

NS_IMETHODIMP UrlListener::OnStopRunningUrl(nsIURI* url, nsresult exitCode) {
  if (!mStopFn) {
    return NS_OK;
  }
  return mStopFn(url, exitCode);
}

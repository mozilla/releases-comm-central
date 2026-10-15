/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMessenger.h"

#include "nsMsgUtils.h"

nsMessenger::nsMessenger() {}

nsMessenger::~nsMessenger() {}

NS_IMPL_ISUPPORTS(nsMessenger, nsIMessenger, nsISupportsWeakReference)

NS_IMETHODIMP
nsMessenger::FormatFileSize(uint64_t aSize, bool aUseKB,
                            nsAString& aFormattedSize) {
  return ::FormatFileSize(aSize, aUseKB, aFormattedSize);
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgEnumerator.h"
#include "nsIMsgEnumerator.h"

#include "mozilla/dom/IteratorResultBinding.h"
#include "mozilla/dom/RootedDictionary.h"
#include "mozilla/dom/ToJSValue.h"
#include "mozilla/ResultExtensions.h"
#include "nsContentUtils.h"

#include "nsIMsgHdr.h"

using namespace mozilla;
using namespace mozilla::dom;

/**
 * Internal class to support iteration over nsMsgEnumerator in javascript.
 */
class JSMsgIterator final : public nsIJSIterator {
  NS_DECL_ISUPPORTS
  NS_DECL_NSIJSITERATOR

  explicit JSMsgIterator(nsMsgEnumerator* aEnumerator)
      : mEnumerator(aEnumerator) {}

 private:
  ~JSMsgIterator() = default;
  RefPtr<nsMsgEnumerator> mEnumerator;
};

NS_IMETHODIMP JSMsgIterator::Next(JSContext* aCx,
                                  JS::MutableHandleValue aResult) {
  // result is object of the form: {value: ..., done: ...}
  RootedDictionary<IteratorResult> result(aCx);

  // We're really using the enumerator itself as the iterator.
  nsCOMPtr<nsIMsgDBHdr> msg;
  if (NS_FAILED(mEnumerator->GetNext(getter_AddRefs(msg)))) {
    result.mDone = true;
    // Leave value unset.
  } else {
    result.mDone = false;

    JS::RootedValue value(aCx);
    MOZ_TRY(
        nsContentUtils::WrapNative(aCx, msg, &NS_GET_IID(nsIMsgDBHdr), &value));
    result.mValue = value;
  }

  if (!ToJSValue(aCx, result, aResult)) {
    return NS_ERROR_OUT_OF_MEMORY;
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(JSMsgIterator, nsIJSIterator)

// nsMsgEnumerator implementation.

NS_IMETHODIMP nsMsgEnumerator::Iterator(nsIJSIterator** aResult) {
  auto result = MakeRefPtr<JSMsgIterator>(this);
  result.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP nsMsgEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgEnumerator::HasMoreElements(bool* aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMPL_ISUPPORTS(nsMsgEnumerator, nsIMsgEnumerator)

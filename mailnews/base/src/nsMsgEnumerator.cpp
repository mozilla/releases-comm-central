/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgEnumerator.h"

#include "mozilla/dom/IteratorResultBinding.h"
#include "mozilla/dom/RootedDictionary.h"
#include "mozilla/dom/ToJSValue.h"
#include "nsContentUtils.h"

#include "nsIMsgHdr.h"
#include "nsIMsgThread.h"

using namespace mozilla;
using namespace mozilla::dom;

/**
 * Internal class to support iteration over nsBaseMsgEnumerator in javascript.
 */
class JSMsgIterator final : public nsIJSIterator {
  NS_DECL_ISUPPORTS
  NS_DECL_NSIJSITERATOR

  explicit JSMsgIterator(nsBaseMsgEnumerator* aEnumerator)
      : mEnumerator(aEnumerator) {}

 private:
  ~JSMsgIterator() = default;
  RefPtr<nsBaseMsgEnumerator> mEnumerator;
};

NS_IMETHODIMP JSMsgIterator::Next(JSContext* aCx,
                                  JS::MutableHandle<JS::Value> aResult) {
  // result is object of the form: {value: ..., done: ...}
  RootedDictionary<IteratorResult> result(aCx);

  // We're really using the enumerator itself as the iterator.
  nsCOMPtr<nsIMsgDBHdr> msg;
  if (NS_FAILED(mEnumerator->GetNext(getter_AddRefs(msg)))) {
    result.mDone = true;
    // Leave value unset.
  } else {
    result.mDone = false;

    JS::Rooted<JS::Value> value(aCx);
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

// nsBaseMsgEnumerator implementation.

NS_IMETHODIMP nsBaseMsgEnumerator::Iterator(nsIJSIterator** aResult) {
  auto result = MakeRefPtr<JSMsgIterator>(this);
  result.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP nsBaseMsgEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsBaseMsgEnumerator::HasMoreElements(bool* aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMPL_ISUPPORTS(nsBaseMsgEnumerator, nsIMsgEnumerator)

/**
 * Internal class to support iteration over nsBaseMsgThreadEnumerator in
 * javascript.
 */
class JSThreadIterator final : public nsIJSIterator {
  NS_DECL_ISUPPORTS
  NS_DECL_NSIJSITERATOR

  explicit JSThreadIterator(nsBaseMsgThreadEnumerator* aEnumerator)
      : mEnumerator(aEnumerator) {}

 private:
  ~JSThreadIterator() = default;
  RefPtr<nsBaseMsgThreadEnumerator> mEnumerator;
};

NS_IMETHODIMP JSThreadIterator::Next(JSContext* aCx,
                                     JS::MutableHandle<JS::Value> aResult) {
  // result is object of the form: {value: ..., done: ...}
  RootedDictionary<IteratorResult> result(aCx);

  // We're really using the enumerator itself as the iterator.
  nsCOMPtr<nsIMsgThread> msg;
  if (NS_FAILED(mEnumerator->GetNext(getter_AddRefs(msg)))) {
    result.mDone = true;
    // Leave value unset.
  } else {
    result.mDone = false;

    JS::Rooted<JS::Value> value(aCx);
    MOZ_TRY(nsContentUtils::WrapNative(aCx, msg, &NS_GET_IID(nsIMsgThread),
                                       &value));
    result.mValue = value;
  }

  if (!ToJSValue(aCx, result, aResult)) {
    return NS_ERROR_OUT_OF_MEMORY;
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(JSThreadIterator, nsIJSIterator)

// nsBaseMsgThreadEnumerator implementation.

NS_IMETHODIMP nsBaseMsgThreadEnumerator::Iterator(nsIJSIterator** aResult) {
  auto result = MakeRefPtr<JSThreadIterator>(this);
  result.forget(aResult);
  return NS_OK;
}

NS_IMETHODIMP nsBaseMsgThreadEnumerator::GetNext(nsIMsgThread** aItem) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsBaseMsgThreadEnumerator::HasMoreElements(bool* aResult) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMPL_ISUPPORTS(nsBaseMsgThreadEnumerator, nsIMsgThreadEnumerator)

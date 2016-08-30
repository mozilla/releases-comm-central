/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This was copied from netwerk/base/LoadContextInfo.cpp

#include "MailnewsLoadContextInfo.h"

#include "mozilla/dom/ToJSValue.h"
#include "nsIChannel.h"
#include "nsILoadContext.h"
#include "nsIWebNavigation.h"
#include "nsNetUtil.h"

// MailnewsLoadContextInfo

NS_IMPL_ISUPPORTS(MailnewsLoadContextInfo, nsILoadContextInfo)

MailnewsLoadContextInfo::MailnewsLoadContextInfo(bool aIsPrivate, bool aIsAnonymous, mozilla::NeckoOriginAttributes aOriginAttributes)
  : mIsPrivate(aIsPrivate)
  , mIsAnonymous(aIsAnonymous)
  , mOriginAttributes(aOriginAttributes)
{
  mOriginAttributes.SyncAttributesWithPrivateBrowsing(mIsPrivate);
}

MailnewsLoadContextInfo::~MailnewsLoadContextInfo()
{
}

NS_IMETHODIMP MailnewsLoadContextInfo::GetIsPrivate(bool *aIsPrivate)
{
  *aIsPrivate = mIsPrivate;
  return NS_OK;
}

NS_IMETHODIMP MailnewsLoadContextInfo::GetIsAnonymous(bool *aIsAnonymous)
{
  *aIsAnonymous = mIsAnonymous;
  return NS_OK;
}

mozilla::NeckoOriginAttributes const* MailnewsLoadContextInfo::OriginAttributesPtr()
{
  return &mOriginAttributes;
}

NS_IMETHODIMP MailnewsLoadContextInfo::GetOriginAttributes(JSContext *aCx,
                                                   JS::MutableHandle<JS::Value> aVal)
{
  if (NS_WARN_IF(!ToJSValue(aCx, mOriginAttributes, aVal))) {
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This was copied from netwerk/base/LoadContextInfo.h

#ifndef MailnewsLoadContextInfo_h__
#define MailnewsLoadContextInfo_h__

#include "nsILoadContextInfo.h"

class nsIChannel;
class nsILoadContext;

class MailnewsLoadContextInfo : public nsILoadContextInfo
{
public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSILOADCONTEXTINFO

  MailnewsLoadContextInfo(bool aIsPrivate, bool aIsAnonymous, mozilla::NeckoOriginAttributes aOriginAttributes);

private:
  virtual ~MailnewsLoadContextInfo();

protected:
  bool mIsPrivate : 1;
  bool mIsAnonymous : 1;
  mozilla::NeckoOriginAttributes mOriginAttributes;
};

#endif

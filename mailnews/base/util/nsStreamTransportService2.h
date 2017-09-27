/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsStreamTransportService2_h__
#define nsStreamTransportService2_h__

#include "nsIStreamTransportService2.h"
#include "nsIEventTarget.h"
#include "nsIObserver.h"
#include "nsCOMPtr.h"
#include "nsThreadUtils.h"
#include "mozilla/Attributes.h"
#include "mozilla/Mutex.h"

class nsIThreadPool;

namespace mozilla {
namespace net {

class nsStreamTransportService2 final : public nsIStreamTransportService2
                                      , public nsIEventTarget
                                      , public nsIObserver
{
public:
    NS_DECL_THREADSAFE_ISUPPORTS
    NS_DECL_NSISTREAMTRANSPORTSERVICE2
    NS_DECL_NSIEVENTTARGET_FULL
    NS_DECL_NSIOBSERVER

    nsresult Init();

    nsStreamTransportService2() : mShutdownLock("nsStreamTransportService2.mShutdownLock"),
                                 mIsShutdown(false) {}

private:
    ~nsStreamTransportService2();

    nsCOMPtr<nsIThreadPool> mPool;

    mozilla::Mutex mShutdownLock;
    bool mIsShutdown;
};

} // namespace net
} // namespace mozilla
#endif

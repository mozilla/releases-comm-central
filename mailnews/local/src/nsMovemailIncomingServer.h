/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef __nsMovemailIncomingServer_h
#define __nsMovemailIncomingServer_h

#include "mozilla/Attributes.h"
#include "msgCore.h"
#include "nsIMovemailIncomingServer.h"
#include "nsILocalMailIncomingServer.h"
#include "nsMailboxServer.h"

/* get some implementation from nsMsgIncomingServer */
class nsMovemailIncomingServer : public nsMailboxServer,
                                 public nsIMovemailIncomingServer,
                                 public nsILocalMailIncomingServer

{
public:
    NS_DECL_ISUPPORTS_INHERITED
    NS_DECL_NSIMOVEMAILINCOMINGSERVER
    NS_DECL_NSILOCALMAILINCOMINGSERVER

    nsMovemailIncomingServer();

    NS_IMETHOD PerformBiff(nsIMsgWindow *aMsgWindow) override;
    NS_IMETHOD GetDownloadMessagesAtStartup(bool *getMessages) override;
    NS_IMETHOD GetCanBeDefaultServer(bool *canBeDefaultServer) override;
    NS_IMETHOD GetCanSearchMessages(bool *canSearchMessages) override;
    NS_IMETHOD GetServerRequiresPasswordForBiff(bool *aServerRequiresPasswordForBiff) override;
    NS_IMETHOD GetAccountManagerChrome(nsAString& aResult) override;

private:
    virtual ~nsMovemailIncomingServer();
};


#endif

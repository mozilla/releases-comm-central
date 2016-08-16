/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaIncomingServer_H_
#define _JaIncomingServer_H_

#include "DelegateList.h"
#include "msgIOverride.h"
#include "nsMsgIncomingServer.h"
#include "nsAutoPtr.h"
#include "nsDataHashtable.h"
#include "nsIInterfaceRequestor.h"

// This file specifies the definition of nsIMsgIncomingServer.idl objects
// in the JsAccount system.

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppIncomingServer : public nsMsgIncomingServer,
                                public nsIInterfaceRequestor
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppIncomingServer() { }

  // nsMsgIncomingServer overrides
  nsresult CreateRootFolderFromUri(const nsCString &serverUri,
                                         nsIMsgFolder **rootFolder) override;

protected:
  virtual ~JaBaseCppIncomingServer() { }

};

class JaCppIncomingServerDelegator : public JaBaseCppIncomingServer,
                                     public msgIOverride
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  NS_FORWARD_NSIMSGINCOMINGSERVER(DELEGATE_JS(nsIMsgIncomingServer, mJsIMsgIncomingServer)->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(DELEGATE_JS(nsIInterfaceRequestor, mJsIInterfaceRequestor)->)

  JaCppIncomingServerDelegator();

private:
  virtual ~JaCppIncomingServerDelegator() {
  }

  // This class will call a method on the delegator, but force the use of the
  // C++ parent class, bypassing any JS Delegate.
  class Super : public nsIMsgIncomingServer,
                public nsIInterfaceRequestor
  {
    public:
      Super(JaCppIncomingServerDelegator* aFakeThis) {mFakeThis = aFakeThis;}
      NS_DECL_ISUPPORTS
      // Forward all overridable methods, bypassing JS override.
      NS_FORWARD_NSIMSGINCOMINGSERVER(mFakeThis->JaBaseCppIncomingServer::)
      NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppIncomingServer::)
    private:
      virtual ~Super() {};
      JaCppIncomingServerDelegator* mFakeThis;
  };

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIMsgIncomingServer> mJsIMsgIncomingServer;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  nsCOMPtr<nsISupports> mJsISupports;

  // Class to bypass JS delegates.
  nsCOMPtr<nsIMsgIncomingServer> mCppBase;

  RefPtr<DelegateList> mDelegateList;
  nsDataHashtable<nsCStringHashKey, bool>* mMethods;


};

} // namespace mailnews
} // namespace mozilla

#endif

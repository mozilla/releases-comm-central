/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsAbLDAPReplicationData_h__
#define nsAbLDAPReplicationData_h__

#include "mozilla/Attributes.h"
#include "nsIAbLDAPReplicationData.h"
#include "nsIWebProgressListener.h"
#include "nsIAbLDAPReplicationQuery.h"
#include "nsAbLDAPListenerBase.h"
#include "nsIAbDirectory.h"
#include "nsIFile.h"
#include "nsIAbLDAPAttributeMap.h"
#include "nsIAbLDAPDirectory.h"
#include "nsString.h"
#include "mozilla/MozPromise.h"
#include "nsIObserver.h"

class nsAbLDAPProcessReplicationData : public nsIAbLDAPProcessReplicationData,
                                       public nsAbLDAPListenerBase,
                                       public nsIObserver {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIABLDAPPROCESSREPLICATIONDATA
  NS_DECL_NSIOBSERVER

  nsAbLDAPProcessReplicationData();

  // nsILDAPMessageListener
  NS_IMETHOD OnLDAPMessage(nsILDAPMessage* aMessage) override;
  NS_IMETHOD OnLDAPError(nsresult status, nsITransportSecurityInfo* secInfo,
                         nsACString const& location) override;

 protected:
  virtual ~nsAbLDAPProcessReplicationData();
  virtual nsresult DoTask() override;
  virtual void InitFailed(bool aCancelled = false) override;

  // pointer to the interfaces used by this object
  nsCOMPtr<nsIWebProgressListener> mListener;
  // pointer to the query to call back to once we've finished
  nsCOMPtr<nsIAbLDAPReplicationQuery> mQuery;

  // These four are set up upon LDAP bind.
  nsCOMPtr<nsIAbDirectory> mReplicationDB;
  nsCOMPtr<nsIFile> mReplicationFile;
  nsCOMPtr<nsIFile> mOldReplicationFile;
  nsCString mReplicationFileName;

  // state of processing, protocol used and count of results
  int32_t mState;
  int32_t mCount;
  bool mInitialized;

  nsCOMPtr<nsIAbLDAPDirectory> mDirectory;
  nsCOMPtr<nsIAbLDAPAttributeMap> mAttrMap;  // maps ab properties to ldap attrs

  virtual nsresult OnLDAPSearchEntry(nsILDAPMessage* aMessage);
  virtual nsresult OnLDAPSearchResult(nsILDAPMessage* aMessage);

  nsresult OpenABForReplicatedDir(bool bCreate);
  void Done(bool aSuccess);

  RefPtr<mozilla::GenericPromise> PromiseDatabaseClosed(nsIFile* file);
  RefPtr<mozilla::GenericPromise::Private> mDatabaseClosedPromise;
};

#endif  // nsAbLDAPReplicationData_h__

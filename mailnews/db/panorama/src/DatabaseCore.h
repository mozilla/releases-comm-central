/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DatabaseCore_h__
#define DatabaseCore_h__

#include "FolderDatabase.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "mozilla/WeakPtr.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsIDatabaseCore.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIObserver.h"
#include "nsTHashMap.h"

#define DATABASE_CORE_CID \
  {0xbb308d0b, 0xbb99, 0x4699, {0x89, 0xde, 0x42, 0x82, 0x65, 0x2d, 0x0e, 0x16}}

class nsIMsgFolder;

namespace mozilla::mailnews {

class PerFolderDatabase;

class DatabaseCore : public nsIDatabaseCore,
                     public nsIMsgDBService,
                     public nsIObserver,
                     public MessageListener {
 public:
  DatabaseCore();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDATABASECORE
  NS_DECL_NSIMSGDBSERVICE
  NS_DECL_NSIOBSERVER

  // MessageListener functions.
  void OnMessageAdded(Message* message) override;
  void OnMessageRemoved(Message* message) override;

 protected:
  virtual ~DatabaseCore() {};

 private:
  friend class FolderDatabase;
  friend class MessageDatabase;
  friend class PerFolderDatabase;

  static nsresult GetStatement(const nsACString& aName, const nsACString& aSQL,
                               mozIStorageStatement** aStmt);

 private:
  friend class LiveView;

  static nsCOMPtr<mozIStorageConnection> sConnection;

 private:
  static nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>> sStatements;

  static nsresult EnsureConnection();

  RefPtr<FolderDatabase> mFolderDatabase;
  RefPtr<MessageDatabase> mMessageDatabase;

  nsresult GetFolderForMsgFolder(nsIMsgFolder* aMsgFolder, nsIFolder** aFolder);

  nsTHashMap<uint64_t, WeakPtr<PerFolderDatabase>> mOpenDatabases;
};

}  // namespace mozilla::mailnews

#endif  // DatabaseCore_h__

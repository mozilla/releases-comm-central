/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_DATABASECORE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_DATABASECORE_H_

#include "FolderDatabase.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "mozilla/WeakPtr.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsIDatabaseCore.h"
#include "nsIFactory.h"
#include "nsIMsgDatabase.h"
#include "nsIObserver.h"
#include "nsTHashMap.h"

#define DATABASE_CORE_CID \
  {0xbb308d0b, 0xbb99, 0x4699, {0x89, 0xde, 0x42, 0x82, 0x65, 0x2d, 0x0e, 0x16}}

namespace mozilla::mailnews {

class PerFolderDatabase;

class DatabaseCore : public nsIDatabaseCore,
                     public nsIMsgDBService,
                     public nsIObserver {
 public:
  DatabaseCore();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDATABASECORE
  NS_DECL_NSIMSGDBSERVICE
  NS_DECL_NSIOBSERVER

  static already_AddRefed<DatabaseCore> GetInstanceForService();

 protected:
  virtual ~DatabaseCore() {};

 private:
  friend class FolderDatabase;
  friend class FolderInfo;
  friend class FolderMigrator;
  friend class LiveView;
  friend class Message;
  friend class MessageDatabase;
  friend class PerFolderDatabase;
  friend class Thread;
  friend class ThreadMessageEnumerator;
  friend class VirtualFolderWrapper;

  static StaticRefPtr<DatabaseCore> sInstance;
  static bool sDatabaseIsNew;  // If the database was created in this session.
  static nsCOMPtr<mozIStorageConnection> sConnection;
  static nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>> sStatements;

  static nsresult EnsureConnection();
  static nsresult CreateNewDatabase();

  static nsresult GetStatement(const nsACString& aName, const nsACString& aSQL,
                               mozIStorageStatement** aStmt);
  static nsresult CreateSavepoint(const nsACString& name);
  static nsresult ReleaseSavepoint(const nsACString& name);
  static nsresult RollbackToSavepoint(const nsACString& name);

  RefPtr<FolderDatabase> mFolderDatabase;
  RefPtr<MessageDatabase> mMessageDatabase;

  nsTHashMap<uint64_t, WeakPtr<PerFolderDatabase>> mOpenDatabases;
  nsTHashMap<nsString, WeakPtr<PerFolderDatabase>> mOpenDatabasesByFile;
};

class DatabaseCoreFactory final : public nsIFactory {
  NS_DECL_ISUPPORTS
  NS_DECL_NSIFACTORY

 private:
  ~DatabaseCoreFactory() = default;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_DATABASECORE_H_

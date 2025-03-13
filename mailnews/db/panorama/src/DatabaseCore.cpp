/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseCore.h"

#include "FolderDatabase.h"
#include "Message.h"
#include "MessageDatabase.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/Logging.h"
#include "mozilla/Services.h"
#include "mozIStorageService.h"
#include "msgCore.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsIClassInfoImpl.h"
#include "nsIFile.h"
#include "nsIObserverService.h"
#include "nsMsgFolderFlags.h"
#include "PerFolderDatabase.h"
#include "xpcpublic.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::dom::Promise;

namespace mozilla {
namespace mailnews {

LazyLogModule gPanoramaLog("panorama");

NS_IMPL_CLASSINFO(DatabaseCore, nullptr, nsIClassInfo::SINGLETON,
                  DATABASE_CORE_CID)
NS_IMPL_ISUPPORTS_CI(DatabaseCore, nsIDatabaseCore, nsIMsgDBService,
                     nsIObserver)

MOZ_RUNINIT nsCOMPtr<mozIStorageConnection> DatabaseCore::sConnection;
MOZ_RUNINIT nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>>
    DatabaseCore::sStatements;

DatabaseCore::DatabaseCore() {
  MOZ_ASSERT(!sConnection, "creating a second DatabaseCore");

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  obs->AddObserver(this, "profile-before-change", false);
}

NS_IMETHODIMP
DatabaseCore::Startup() {
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("DatabaseCore starting up"));

  nsresult rv = EnsureConnection();
  NS_ENSURE_SUCCESS(rv, rv);

  mFolderDatabase = new FolderDatabase();
  rv = mFolderDatabase->Startup();
  NS_ENSURE_SUCCESS(rv, rv);

  mMessageDatabase = new MessageDatabase();
  mMessageDatabase->Startup();
  // Add a message listener purely for logging purposes while this code is
  // under heavy development. TODO: Remove this.
  mMessageDatabase->AddMessageListener(this);

  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("DatabaseCore startup complete"));
  return NS_OK;
}

NS_IMETHODIMP
DatabaseCore::Observe(nsISupports* aSubject, const char* aTopic,
                      const char16_t* aData) {
  if (strcmp(aTopic, "profile-before-change")) {
    return NS_OK;
  }

  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("DatabaseCore shutting down"));

  for (auto iter = sStatements.Iter(); !iter.Done(); iter.Next()) {
    iter.UserData()->Finalize();
  }
  sStatements.Clear();

  mFolderDatabase->Shutdown();
  mFolderDatabase = nullptr;

  mMessageDatabase->Shutdown();
  mMessageDatabase = nullptr;

  if (sConnection) {
    sConnection->Close();
    sConnection = nullptr;
  }

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  obs->RemoveObserver(this, "profile-before-change");

  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("DatabaseCore shutdown complete"));

  return NS_OK;
}

/**
 * Ensures a mozIStorageConnection to panorama.sqlite in the profile folder.
 */
nsresult DatabaseCore::EnsureConnection() {
  if (sConnection) {
    return NS_OK;
  }

  MOZ_ASSERT(NS_IsMainThread(),
             "connection must be established on the main thread");

  nsCOMPtr<nsIFile> databaseFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(databaseFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> file;
  rv = databaseFile->Append(u"panorama.sqlite"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  bool exists;
  rv = databaseFile->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageService> storage =
      do_GetService("@mozilla.org/storage/service;1");
  NS_ENSURE_STATE(storage);

  rv = storage->OpenUnsharedDatabase(databaseFile,
                                     mozIStorageService::CONNECTION_DEFAULT,
                                     getter_AddRefs(sConnection));
  NS_ENSURE_SUCCESS(rv, rv);

  if (!exists) {
    MOZ_LOG(gPanoramaLog, LogLevel::Warning,
            ("database file does not exist, creating"));
    rv = sConnection->ExecuteSimpleSQL(
        "CREATE TABLE folders ( \
          id INTEGER PRIMARY KEY, \
          parent INTEGER REFERENCES folders(id), \
          ordinal INTEGER DEFAULT NULL, \
          name TEXT, \
          flags INTEGER DEFAULT 0, \
          UNIQUE(parent, name) \
        );"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = sConnection->ExecuteSimpleSQL(
        "CREATE TABLE folder_properties ( \
          id INTEGER REFERENCES folders(id), \
          name TEXT, \
          value ANY, \
          PRIMARY KEY(id, name) \
        );"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = sConnection->ExecuteSimpleSQL(
        "CREATE TABLE messages ( \
          id INTEGER PRIMARY KEY, \
          folderId INTEGER REFERENCES folders(id), \
          messageId TEXT, \
          date INTEGER, \
          sender TEXT, \
          subject TEXT, \
          flags INTEGER, \
          tags TEXT \
        );"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = sConnection->ExecuteSimpleSQL(
        "CREATE TABLE message_properties ( \
          id INTEGER REFERENCES messages(id), \
          name TEXT, \
          value ANY, \
          PRIMARY KEY(id, name) \
        );"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = sConnection->ExecuteSimpleSQL(
        "CREATE INDEX messages_date ON messages(date);"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  RefPtr<TagsMatchFunction> tagsInclude = new TagsMatchFunction(true);
  sConnection->CreateFunction("tags_include"_ns, 2, tagsInclude);
  RefPtr<TagsMatchFunction> tagsExclude = new TagsMatchFunction(false);
  sConnection->CreateFunction("tags_exclude"_ns, 2, tagsExclude);
  RefPtr<AddressFormatFunction> addressFormat = new AddressFormatFunction();
  sConnection->CreateFunction("address_format"_ns, 1, addressFormat);

  return NS_OK;
}

/**
 * Create and cache an SQL statement.
 */
nsresult DatabaseCore::GetStatement(const nsACString& aName,
                                    const nsACString& aSQL,
                                    mozIStorageStatement** aStmt) {
  NS_ENSURE_ARG_POINTER(aStmt);

  nsresult rv = EnsureConnection();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmt;
  if (sStatements.Get(aName, &stmt)) {
    NS_IF_ADDREF(*aStmt = stmt);
    return NS_OK;
  }

  rv = sConnection->CreateStatement(aSQL, getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  sStatements.InsertOrUpdate(aName, stmt);
  NS_IF_ADDREF(*aStmt = stmt);

  return NS_OK;
}

NS_IMETHODIMP
DatabaseCore::GetFolders(nsIFolderDatabase** aFolderDatabase) {
  NS_IF_ADDREF(*aFolderDatabase = mFolderDatabase);
  return NS_OK;
}

NS_IMETHODIMP
DatabaseCore::GetMessages(nsIMessageDatabase** aMessageDatabase) {
  NS_IF_ADDREF(*aMessageDatabase = mMessageDatabase);
  return NS_OK;
}

NS_IMETHODIMP
DatabaseCore::GetConnection(mozIStorageConnection** aConnection) {
  if (!xpc::IsInAutomation()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_ENSURE_ARG_POINTER(aConnection);

  nsresult rv = EnsureConnection();
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*aConnection = sConnection);
  return NS_OK;
}

void DatabaseCore::OnMessageAdded(Message* m) {
  MOZ_LOG(gPanoramaLog, LogLevel::Debug,
          ("DatabaseCore::OnMessageAdded: %" PRId32 " %" PRIu64 " %" PRId64
           " '%s' '%s' %" PRIu64 " '%s'\n",
           m->mId, m->mFolderId, m->mDate, m->mSender.get(), m->mSubject.get(),
           m->mFlags, m->mTags.get()));
}

void DatabaseCore::OnMessageRemoved(Message* m) {
  MOZ_LOG(gPanoramaLog, LogLevel::Debug,
          ("DatabaseCore::OnMessageRemoved: %" PRId32 " %" PRIu64 " %" PRId64
           " '%s' '%s' %" PRIu64 " '%s'\n",
           m->mId, m->mFolderId, m->mDate, m->mSender.get(), m->mSubject.get(),
           m->mFlags, m->mTags.get()));
}

NS_IMETHODIMP DatabaseCore::OpenFolderDB(nsIMsgFolder* aFolder,
                                         bool aLeaveInvalidDB,
                                         nsIMsgDatabase** _retval) {
  nsCOMPtr<nsIFolder> folder;
  nsresult rv = GetFolderForMsgFolder(aFolder, getter_AddRefs(folder));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!folder) {
    return NS_MSG_ERROR_FOLDER_SUMMARY_MISSING;
  }

  uint64_t folderId = folder->GetId();
  WeakPtr<PerFolderDatabase> existingDatabase = mOpenDatabases.Get(folderId);
  if (existingDatabase) {
    NS_IF_ADDREF(*_retval = existingDatabase);
    return NS_OK;
  }

  RefPtr<PerFolderDatabase> db =
      new PerFolderDatabase(mFolderDatabase, mMessageDatabase, folderId,
                            folder->GetFlags() & nsMsgFolderFlags::Newsgroup);
  NS_IF_ADDREF(*_retval = db);

  mOpenDatabases.InsertOrUpdate(folderId, db);

  return NS_OK;
}
NS_IMETHODIMP DatabaseCore::CreateNewDB(nsIMsgFolder* aFolder,
                                        nsIMsgDatabase** _retval) {
  nsAutoCString name;
  aFolder->GetName(name);
  nsCOMPtr<nsIMsgFolder> msgParent;
  aFolder->GetParent(getter_AddRefs(msgParent));
  nsCOMPtr<nsIFolder> parent;
  GetFolderForMsgFolder(msgParent, getter_AddRefs(parent));

  nsCOMPtr<nsIFolder> unused;
  mFolderDatabase->InsertFolder(parent, name, getter_AddRefs(unused));

  return OpenFolderDB(aFolder, false, _retval);
}
NS_IMETHODIMP DatabaseCore::OpenDBFromFile(nsIFile* aFile,
                                           nsIMsgFolder* aFolder, bool aCreate,
                                           bool aLeaveInvalidDB,
                                           nsIMsgDatabase** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP DatabaseCore::RegisterPendingListener(
    nsIMsgFolder* folder, nsIDBChangeListener* listener) {
  // TODO: Decide if we really need this still.
  return NS_OK;
}
NS_IMETHODIMP DatabaseCore::UnregisterPendingListener(
    nsIDBChangeListener* listener) {
  return NS_OK;
}
NS_IMETHODIMP DatabaseCore::CachedDBForFolder(nsIMsgFolder* aFolder,
                                              nsIMsgDatabase** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP DatabaseCore::CachedDBForFilePath(nsIFile* filePath,
                                                nsIMsgDatabase** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP DatabaseCore::ForceFolderDBClosed(nsIMsgFolder* aFolder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP DatabaseCore::GetOpenDBs(
    nsTArray<RefPtr<nsIMsgDatabase>>& aOpenDBs) {
  aOpenDBs.Clear();
  return NS_OK;
}

nsresult DatabaseCore::GetFolderForMsgFolder(nsIMsgFolder* aMsgFolder,
                                             nsIFolder** aFolder) {
  NS_ENSURE_ARG(aMsgFolder);
  NS_ENSURE_ARG_POINTER(aFolder);

  nsresult rv;

  bool isServer;
  aMsgFolder->GetIsServer(&isServer);
  if (isServer) {
    nsCOMPtr<nsIMsgIncomingServer> incomingServer;
    rv = aMsgFolder->GetServer(getter_AddRefs(incomingServer));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString serverKey;
    rv = incomingServer->GetKey(serverKey);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = mFolderDatabase->GetFolderByPath(serverKey, aFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  nsCOMPtr<nsIMsgFolder> msgParent;
  rv = aMsgFolder->GetParent(getter_AddRefs(msgParent));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIFolder> parent;
  rv = GetFolderForMsgFolder(msgParent, getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!parent) {
    return NS_ERROR_FAILURE;
  }

  nsAutoCString msgName;
  rv = aMsgFolder->GetName(msgName);
  NS_ENSURE_SUCCESS(rv, rv);

  return parent->GetChildNamed(msgName, aFolder);
}

}  // namespace mailnews
}  // namespace mozilla

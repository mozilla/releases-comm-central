/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseCore.h"

#include "FolderDatabase.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/Logging.h"
#include "mozilla/Services.h"
#include "mozIStorageService.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsIFile.h"
#include "nsIObserverService.h"
#include "xpcpublic.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::dom::Promise;

namespace mozilla {
namespace mailnews {

LazyLogModule gPanoramaLog("panorama");

NS_IMPL_ISUPPORTS(DatabaseCore, nsIDatabaseCore, nsIObserver)

MOZ_RUNINIT nsCOMPtr<mozIStorageConnection> DatabaseCore::sConnection;
MOZ_RUNINIT nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>>
    DatabaseCore::sStatements;

DatabaseCore::DatabaseCore() {
  MOZ_ASSERT(!sConnection, "creating a second DatabaseCore");

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  obs->AddObserver(this, "profile-before-change", false);
}

NS_IMETHODIMP
DatabaseCore::Startup(JSContext* aCx, Promise** aPromise) {
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("DatabaseCore starting up"));

  ErrorResult result;
  RefPtr<Promise> promise =
      Promise::Create(xpc::CurrentNativeGlobal(aCx), result);

  nsresult rv = EnsureConnection();
  if (NS_FAILED(rv)) {
    promise->MaybeReject(rv);
  }

  mFolderDatabase = new FolderDatabase();

  RefPtr<FolderDatabaseStartupPromise> foldersPromise =
      mFolderDatabase->Startup();
  foldersPromise->Then(
      mozilla::GetCurrentSerialEventTarget(), __func__,
      [promise]() {
        MOZ_LOG(gPanoramaLog, LogLevel::Info,
                ("DatabaseCore startup complete"));
        promise->MaybeResolveWithUndefined();
      },
      [promise]() { promise->MaybeReject(NS_ERROR_DOM_ABORT_ERR); });

  promise.forget(aPromise);
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
    sConnection->ExecuteSimpleSQL(
        "CREATE TABLE folders ( \
          id INTEGER PRIMARY KEY, \
          parent INTEGER REFERENCES folders(id), \
          ordinal INTEGER DEFAULT NULL, \
          name TEXT, \
          flags INTEGER DEFAULT 0, \
          UNIQUE(parent, name) \
        );"_ns);
  }

  return NS_OK;
}

/**
 * Create and cache an SQL statement.
 */
nsresult DatabaseCore::GetStatement(const nsCString& aName,
                                    const nsCString& aSQL,
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

}  // namespace mailnews
}  // namespace mozilla

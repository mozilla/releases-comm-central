/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgPurgeService.h"
#include "nsIMsgAccountManager.h"
#include "nsMsgUtils.h"
#include "nsMsgSearchCore.h"
#include "msgCore.h"
#include "nsISpamSettings.h"
#include "nsIMsgSearchTerm.h"
#include "nsIMsgHdr.h"
#include "nsIMsgProtocolInfo.h"
#include "nsIMsgFilterPlugin.h"
#include "nsIPrefBranch.h"
#include "nsIPrefService.h"
#include "mozilla/Logging.h"
#include "nsMsgFolderFlags.h"
#include "nsITimer.h"
#include <stdlib.h>
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"

static mozilla::LazyLogModule MsgPurgeLogModule("MsgPurge");

NS_IMPL_ISUPPORTS(nsMsgPurgeService, nsIMsgPurgeService, nsIMsgSearchNotify)

void OnPurgeTimer(nsITimer* timer, void* aPurgeService) {
  nsMsgPurgeService* purgeService = (nsMsgPurgeService*)aPurgeService;
  purgeService->PerformPurge();
}

nsMsgPurgeService::nsMsgPurgeService() {
  mHaveShutdown = false;
  // never purge a folder more than once every 8 hours (60 min/hour * 8 hours.
  mMinDelayBetweenPurges = 480;
  // fire the purge timer every 5 minutes, starting 5 minutes after the service
  // is created (when we load accounts).
  mPurgeTimerInterval = 5;
}

nsMsgPurgeService::~nsMsgPurgeService() {
  if (mPurgeTimer) mPurgeTimer->Cancel();

  if (!mHaveShutdown) Shutdown();
}

NS_IMETHODIMP nsMsgPurgeService::Init() {
  nsresult rv;

  // these prefs are here to help QA test this feature
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_SUCCEEDED(rv)) {
    int32_t min_delay;
    rv = prefBranch->GetIntPref("mail.purge.min_delay", &min_delay);
    if (NS_SUCCEEDED(rv) && min_delay) mMinDelayBetweenPurges = min_delay;

    int32_t purge_timer_interval;
    rv = prefBranch->GetIntPref("mail.purge.timer_interval",
                                &purge_timer_interval);
    if (NS_SUCCEEDED(rv) && purge_timer_interval)
      mPurgeTimerInterval = purge_timer_interval;
  }

  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("mail.purge.min_delay=%d minutes", mMinDelayBetweenPurges));
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("mail.purge.timer_interval=%d minutes", mPurgeTimerInterval));

  // don't start purging right away.
  // because the accounts aren't loaded and because the user might be trying to
  // sign in or startup, etc.
  SetupNextPurge();

  mHaveShutdown = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgPurgeService::Shutdown() {
  if (mPurgeTimer) {
    mPurgeTimer->Cancel();
    mPurgeTimer = nullptr;
  }

  mHaveShutdown = true;
  return NS_OK;
}

nsresult nsMsgPurgeService::SetupNextPurge() {
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("setting to check again in %d minutes", mPurgeTimerInterval));

  // Convert mPurgeTimerInterval into milliseconds
  uint32_t timeInMSUint32 = mPurgeTimerInterval * 60000;

  // Can't currently reset a timer when it's in the process of
  // calling Notify. So, just release the timer here and create a new one.
  if (mPurgeTimer) mPurgeTimer->Cancel();

  nsresult rv = NS_NewTimerWithFuncCallback(
      getter_AddRefs(mPurgeTimer), OnPurgeTimer, (void*)this, timeInMSUint32,
      nsITimer::TYPE_ONE_SHOT, "nsMsgPurgeService::OnPurgeTimer", nullptr);
  if (NS_FAILED(rv)) {
    NS_WARNING("Could not start mPurgeTimer timer");
  }

  return NS_OK;
}

// This is the function that looks for the first folder to purge. It also
// applies retention settings to any folder that hasn't had retention settings
// applied in mMinDelayBetweenPurges minutes (default, 8 hours).
// However, if we've spent more than .5 seconds in this loop, don't
// apply any more retention settings because it might lock up the UI.
// This might starve folders later on in the hierarchy, since we always
// start at the top, but since we also apply retention settings when you
// open a folder, or when you compact all folders, I think this will do
// for now, until we have a cleanup on shutdown architecture.
nsresult nsMsgPurgeService::PerformPurge() {
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info, ("performing purge"));

  nsresult rv;

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      do_GetService("@mozilla.org/messenger/account-manager;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  bool keepApplyingRetentionSettings = true;

  nsTArray<RefPtr<nsIMsgIncomingServer>> allServers;
  rv = accountManager->GetAllServers(allServers);
  if (NS_SUCCEEDED(rv)) {
    MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
            ("%d servers", (int)allServers.Length()));
    nsCOMPtr<nsIMsgFolder> folderToPurge;
    PRIntervalTime startTime = PR_IntervalNow();
    int32_t purgeIntervalToUse = 0;
    PRTime oldestPurgeTime =
        0;  // we're going to pick the least-recently purged folder

    // apply retention settings to folders that haven't had retention settings
    // applied in mMinDelayBetweenPurges minutes (default 8 hours)
    // Because we get last purge time from the folder cache,
    // this code won't open db's for folders until it decides it needs
    // to apply retention settings, and since
    // nsIMsgFolder::ApplyRetentionSettings will close any db's it opens, this
    // code won't leave db's open.
    for (uint32_t serverIndex = 0; serverIndex < allServers.Length();
         serverIndex++) {
      nsCOMPtr<nsIMsgIncomingServer> server(allServers[serverIndex]);
      if (server) {
        if (keepApplyingRetentionSettings) {
          nsCOMPtr<nsIMsgFolder> rootFolder;
          rv = server->GetRootFolder(getter_AddRefs(rootFolder));
          NS_ENSURE_SUCCESS(rv, rv);

          nsTArray<RefPtr<nsIMsgFolder>> childFolders;
          rv = rootFolder->GetDescendants(childFolders);
          NS_ENSURE_SUCCESS(rv, rv);

          for (auto childFolder : childFolders) {
            uint32_t folderFlags;
            (void)childFolder->GetFlags(&folderFlags);
            if (folderFlags & nsMsgFolderFlags::Virtual) continue;
            PRTime curFolderLastPurgeTime = 0;
            nsCString curFolderLastPurgeTimeString, curFolderUri;
            rv = childFolder->GetStringProperty("LastPurgeTime",
                                                curFolderLastPurgeTimeString);
            if (NS_FAILED(rv))
              continue;  // it is ok to fail, go on to next folder

            if (!curFolderLastPurgeTimeString.IsEmpty()) {
              PRTime theTime;
              PR_ParseTimeString(curFolderLastPurgeTimeString.get(), false,
                                 &theTime);
              curFolderLastPurgeTime = theTime;
            }

            childFolder->GetURI(curFolderUri);
            MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                    ("%s curFolderLastPurgeTime=%s (if blank, then never)",
                     curFolderUri.get(), curFolderLastPurgeTimeString.get()));

            // check if this folder is due to purge
            // has to have been purged at least mMinDelayBetweenPurges minutes
            // ago we don't want to purge the folders all the time - once a
            // day is good enough
            int64_t minDelayBetweenPurges(mMinDelayBetweenPurges);
            int64_t microSecondsPerMinute(60000000);
            PRTime nextPurgeTime =
                curFolderLastPurgeTime +
                (minDelayBetweenPurges * microSecondsPerMinute);
            if (nextPurgeTime < PR_Now()) {
              MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                      ("purging %s", curFolderUri.get()));
              childFolder->ApplyRetentionSettings();
            }
            PRIntervalTime elapsedTime = PR_IntervalNow() - startTime;
            // check if more than 500 milliseconds have elapsed in this purge
            // process
            if (PR_IntervalToMilliseconds(elapsedTime) > 500) {
              keepApplyingRetentionSettings = false;
              break;
            }
          }
        }
        nsCString type;
        nsresult rv = server->GetType(type);
        NS_ENSURE_SUCCESS(rv, rv);

        nsCString hostName;
        server->GetHostName(hostName);
        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] %s (%s)", serverIndex, hostName.get(), type.get()));

        nsCOMPtr<nsISpamSettings> spamSettings;
        rv = server->GetSpamSettings(getter_AddRefs(spamSettings));
        NS_ENSURE_SUCCESS(rv, rv);

        int32_t spamLevel;
        spamSettings->GetLevel(&spamLevel);
        // clang-format off
        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] spamLevel=%d (if 0, don't purge)", serverIndex, spamLevel));
        // clang-format on
        if (!spamLevel) continue;

        // check if we are set up to purge for this server
        // if not, skip it.
        bool purgeSpam;
        spamSettings->GetPurge(&purgeSpam);

        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] purgeSpam=%s (if false, don't purge)", serverIndex,
                 purgeSpam ? "true" : "false"));
        if (!purgeSpam) continue;

        // check if the spam folder uri is set for this server
        // if not skip it.
        nsCString junkFolderURI;
        rv = spamSettings->GetSpamFolderURI(junkFolderURI);
        NS_ENSURE_SUCCESS(rv, rv);

        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] junkFolderURI=%s (if empty, don't purge)", serverIndex,
                 junkFolderURI.get()));
        if (junkFolderURI.IsEmpty()) continue;

        // if the junk folder doesn't exist
        // because the folder pane isn't built yet, for example
        // skip this account
        nsCOMPtr<nsIMsgFolder> junkFolder;
        rv = FindFolder(junkFolderURI, getter_AddRefs(junkFolder));
        NS_ENSURE_SUCCESS(rv, rv);

        // clang-format off
        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] %s exists? %s (if doesn't exist, don't purge)", serverIndex,
                 junkFolderURI.get(), junkFolder ? "true" : "false"));
        // clang-format on
        if (!junkFolder) continue;

        PRTime curJunkFolderLastPurgeTime = 0;
        nsCString curJunkFolderLastPurgeTimeString;
        rv = junkFolder->GetStringProperty("curJunkFolderLastPurgeTime",
                                           curJunkFolderLastPurgeTimeString);
        if (NS_FAILED(rv))
          continue;  // it is ok to fail, junk folder may not exist

        if (!curJunkFolderLastPurgeTimeString.IsEmpty()) {
          PRTime theTime;
          PR_ParseTimeString(curJunkFolderLastPurgeTimeString.get(), false,
                             &theTime);
          curJunkFolderLastPurgeTime = theTime;
        }

        MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                ("[%d] %s curJunkFolderLastPurgeTime=%s (if blank, then never)",
                 serverIndex, junkFolderURI.get(),
                 curJunkFolderLastPurgeTimeString.get()));

        // check if this account is due to purge
        // has to have been purged at least mMinDelayBetweenPurges minutes ago
        // we don't want to purge the folders all the time
        PRTime nextPurgeTime =
            curJunkFolderLastPurgeTime +
            mMinDelayBetweenPurges * 60000000  // convert to microseconds.
            ;
        if (nextPurgeTime < PR_Now()) {
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] last purge greater than min delay", serverIndex));

          nsCOMPtr<nsIMsgIncomingServer> junkFolderServer;
          rv = junkFolder->GetServer(getter_AddRefs(junkFolderServer));
          NS_ENSURE_SUCCESS(rv, rv);

          bool serverBusy = false;
          bool serverRequiresPassword = true;
          bool passwordPromptRequired;
          bool canSearchMessages = false;
          junkFolderServer->GetPasswordPromptRequired(&passwordPromptRequired);
          junkFolderServer->GetServerBusy(&serverBusy);
          junkFolderServer->GetServerRequiresPasswordForBiff(
              &serverRequiresPassword);
          junkFolderServer->GetCanSearchMessages(&canSearchMessages);
          // Make sure we're logged on before doing the search (assuming we need
          // to be) and make sure the server isn't already in the middle of
          // downloading new messages and make sure a search isn't already going
          // on
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] (search in progress? %s)", serverIndex,
                   mSearchSession ? "true" : "false"));
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] (server busy? %s)", serverIndex,
                   serverBusy ? "true" : "false"));
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] (serverRequiresPassword? %s)", serverIndex,
                   serverRequiresPassword ? "true" : "false"));
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] (passwordPromptRequired? %s)", serverIndex,
                   passwordPromptRequired ? "true" : "false"));
          if (canSearchMessages && !mSearchSession && !serverBusy &&
              (!serverRequiresPassword || !passwordPromptRequired)) {
            int32_t purgeInterval;
            spamSettings->GetPurgeInterval(&purgeInterval);

            if ((oldestPurgeTime == 0) ||
                (curJunkFolderLastPurgeTime < oldestPurgeTime)) {
              // clang-format off
              MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                      ("[%d] purging! searching for messages older than %d days",
                       serverIndex, purgeInterval));
              // clang-format on
              oldestPurgeTime = curJunkFolderLastPurgeTime;
              purgeIntervalToUse = purgeInterval;
              folderToPurge = junkFolder;
              // if we've never purged this folder, do it...
              if (curJunkFolderLastPurgeTime == 0) break;
            }
          } else {
            NS_ASSERTION(canSearchMessages,
                         "unexpected, you should be able to search");
            MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                    ("[%d] not a good time for this server, try again later",
                     serverIndex));
          }
        } else {
          MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
                  ("[%d] last purge too recent", serverIndex));
        }
      }
    }
    if (folderToPurge && purgeIntervalToUse != 0)
      rv = SearchFolderToPurge(folderToPurge, purgeIntervalToUse);
  }

  // set up timer to check accounts again
  SetupNextPurge();
  return rv;
}

nsresult nsMsgPurgeService::SearchFolderToPurge(nsIMsgFolder* folder,
                                                int32_t purgeInterval) {
  nsresult rv;
  mSearchSession =
      do_CreateInstance("@mozilla.org/messenger/searchSession;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  mSearchSession->RegisterListener(this, nsIMsgSearchSession::allNotifications);

  // update the time we attempted to purge this folder
  char dateBuf[100];
  dateBuf[0] = '\0';
  PRExplodedTime exploded;
  PR_ExplodeTime(PR_Now(), PR_LocalTimeParameters, &exploded);
  PR_FormatTimeUSEnglish(dateBuf, sizeof(dateBuf), "%a %b %d %H:%M:%S %Y",
                         &exploded);
  folder->SetStringProperty("curJunkFolderLastPurgeTime",
                            nsDependentCString(dateBuf));
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("curJunkFolderLastPurgeTime is now %s", dateBuf));

  nsCOMPtr<nsIMsgIncomingServer> server;
  // We need to get the folder's server scope because imap can have
  // local junk folder.
  rv = folder->GetServer(getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  nsMsgSearchScopeValue searchScope;
  server->GetSearchScope(&searchScope);

  mSearchSession->AddScopeTerm(searchScope, folder);

  // look for messages older than the cutoff
  // you can't also search by junk status, see
  // nsMsgPurgeService::OnSearchHit()
  nsCOMPtr<nsIMsgSearchTerm> searchTerm;
  mSearchSession->CreateTerm(getter_AddRefs(searchTerm));
  if (searchTerm) {
    searchTerm->SetAttrib(nsMsgSearchAttrib::AgeInDays);
    searchTerm->SetOp(nsMsgSearchOp::IsGreaterThan);
    nsCOMPtr<nsIMsgSearchValue> searchValue;
    searchTerm->GetValue(getter_AddRefs(searchValue));
    if (searchValue) {
      searchValue->SetAttrib(nsMsgSearchAttrib::AgeInDays);
      searchValue->SetAge((uint32_t)purgeInterval);
      searchTerm->SetValue(searchValue);
    }
    searchTerm->SetBooleanAnd(false);
    mSearchSession->AppendTerm(searchTerm);
  }

  // we are about to search
  // create mHdrsToDelete array (if not previously created)
  NS_ASSERTION(mHdrsToDelete.IsEmpty(), "mHdrsToDelete is not empty");

  mSearchFolder = folder;
  return mSearchSession->Search(nullptr);
}

NS_IMETHODIMP nsMsgPurgeService::OnNewSearch() {
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info, ("on new search"));
  return NS_OK;
}

NS_IMETHODIMP nsMsgPurgeService::OnSearchHit(nsIMsgDBHdr* aMsgHdr,
                                             nsIMsgFolder* aFolder) {
  NS_ENSURE_ARG_POINTER(aMsgHdr);

  nsCString messageId;
  nsCString author;
  nsCString subject;

  aMsgHdr->GetMessageId(messageId);
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("messageId=%s", messageId.get()));
  aMsgHdr->GetSubject(subject);
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("subject=%s", subject.get()));
  aMsgHdr->GetAuthor(author);
  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("author=%s", author.get()));

  // double check that the message is junk before adding to
  // the list of messages to delete
  //
  // note, we can't just search for messages that are junk
  // because not all imap server support keywords
  // (which we use for the junk score)
  // so the junk status would be in the message db.
  //
  // see bug #194090
  nsCString junkScoreStr;
  nsresult rv = aMsgHdr->GetStringProperty("junkscore", junkScoreStr);
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
          ("junkScore=%s (if empty or != nsIJunkMailPlugin::IS_SPAM_SCORE, "
           "don't add to list delete)",
           junkScoreStr.get()));

  // if "junkscore" is not set, don't delete the message
  if (junkScoreStr.IsEmpty()) return NS_OK;

  if (atoi(junkScoreStr.get()) == nsIJunkMailPlugin::IS_SPAM_SCORE) {
    MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
            ("added message to delete"));
    mHdrsToDelete.AppendElement(aMsgHdr);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgPurgeService::OnSearchDone(nsresult status) {
  if (NS_SUCCEEDED(status)) {
    uint32_t count = mHdrsToDelete.Length();
    MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info,
            ("%d messages to delete", count));

    if (count > 0) {
      MOZ_LOG(MsgPurgeLogModule, mozilla::LogLevel::Info, ("delete messages"));
      if (mSearchFolder)
        mSearchFolder->DeleteMessages(
            mHdrsToDelete, nullptr, false /*delete storage*/, false /*isMove*/,
            nullptr, false /*allowUndo*/);
    }
  }
  mHdrsToDelete.Clear();
  if (mSearchSession) mSearchSession->UnregisterListener(this);
  // don't cache the session
  // just create another search session next time we search, rather than
  // clearing scopes, terms etc. we also use mSearchSession to determine if the
  // purge service is "busy"
  mSearchSession = nullptr;
  mSearchFolder = nullptr;
  return NS_OK;
}

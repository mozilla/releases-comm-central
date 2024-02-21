/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsStatusBarBiffManager.h"
#include "nsMsgBiffManager.h"
#include "nsIMsgMailSession.h"
#include "nsIMsgAccountManager.h"
#include "nsIObserverService.h"
#include "nsIWindowMediator.h"
#include "nsIMsgMailSession.h"
#include "MailNewsTypes.h"
#include "nsIMsgFolder.h"  // TO include biffState enum. Change to bool later...
#include "nsMsgDBFolder.h"
#include "nsIFileChannel.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIURL.h"
#include "nsNetUtil.h"
#include "nsIFileURL.h"
#include "nsIFile.h"
#include "nsMsgUtils.h"
#include "mozilla/Preferences.h"
#include "mozilla/Services.h"
#include "nsPrintfCString.h"

// QueryInterface, AddRef, and Release
//
NS_IMPL_ISUPPORTS(nsStatusBarBiffManager, nsIStatusBarBiffManager,
                  nsIFolderListener, nsIObserver)

nsStatusBarBiffManager::nsStatusBarBiffManager()
    : mInitialized(false),
      mCurrentBiffState(nsIMsgFolder::nsMsgBiffState_Unknown) {}

nsStatusBarBiffManager::~nsStatusBarBiffManager() {}

#define SYSTEM_SOUND_TYPE 0
#define CUSTOM_SOUND_TYPE 1
#define PREF_CHAT_ENABLED "mail.chat.enabled"
#define PLAY_CHAT_NOTIFICATION_SOUND "play-chat-notification-sound"

nsresult nsStatusBarBiffManager::Init() {
  if (mInitialized) return NS_ERROR_ALREADY_INITIALIZED;

  nsresult rv;

  nsCOMPtr<nsIMsgMailSession> mailSession =
      do_GetService("@mozilla.org/messenger/services/session;1", &rv);
  if (NS_SUCCEEDED(rv))
    mailSession->AddFolderListener(this, nsIFolderListener::intPropertyChanged);

  nsCOMPtr<nsIPrefBranch> pref(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  bool chatEnabled = false;
  if (NS_SUCCEEDED(rv)) rv = pref->GetBoolPref(PREF_CHAT_ENABLED, &chatEnabled);
  if (NS_SUCCEEDED(rv) && chatEnabled) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    if (observerService)
      observerService->AddObserver(this, PLAY_CHAT_NOTIFICATION_SOUND, false);
  }

  mInitialized = true;
  return NS_OK;
}

// aPref is one of "mail.biff.play_sound", "mail.feed.play_sound" or
// "mail.chat.play_sound". We derive names of related preferences by
// appending ".type" (system/custom) and ".url" (custom sound file).
nsresult nsStatusBarBiffManager::PlayBiffSound(const char* aPref) {
  bool playSound = mozilla::Preferences::GetBool(aPref, false);
  if (!playSound) return NS_OK;

  // lazily create the sound instance
  if (!mSound) mSound = do_CreateInstance("@mozilla.org/sound;1");

  int32_t soundType = mozilla::Preferences::GetInt(
      nsPrintfCString("%s.type", aPref).get(), SYSTEM_SOUND_TYPE);

#ifndef XP_MACOSX
  bool customSoundPlayed = false;
#endif

  nsresult rv = NS_OK;
  if (soundType == CUSTOM_SOUND_TYPE) {
    nsCString soundURLSpec;
    rv = mozilla::Preferences::GetCString(
        nsPrintfCString("%s.url", aPref).get(), soundURLSpec);

    if (NS_SUCCEEDED(rv) && !soundURLSpec.IsEmpty()) {
      if (!strncmp(soundURLSpec.get(), "file://", 7)) {
        nsCOMPtr<nsIURI> fileURI;
        rv = NS_NewURI(getter_AddRefs(fileURI), soundURLSpec);
        NS_ENSURE_SUCCESS(rv, rv);
        nsCOMPtr<nsIFileURL> soundURL = do_QueryInterface(fileURI, &rv);
        if (NS_SUCCEEDED(rv)) {
          nsCOMPtr<nsIFile> soundFile;
          rv = soundURL->GetFile(getter_AddRefs(soundFile));
          if (NS_SUCCEEDED(rv)) {
            bool soundFileExists = false;
            rv = soundFile->Exists(&soundFileExists);
            if (NS_SUCCEEDED(rv) && soundFileExists) {
              rv = mSound->Play(soundURL);
#ifndef XP_MACOSX
              if (NS_SUCCEEDED(rv)) customSoundPlayed = true;
#endif
            }
          }
        }
      }
      // XXX TODO: See if we can create a nsIFile using the string as a native
      // path.
    }
  }
#ifndef XP_MACOSX
  // if nothing played, play the default system sound
  if (!customSoundPlayed) {
    rv = mSound->PlayEventSound(nsISound::EVENT_NEW_MAIL_RECEIVED);
    NS_ENSURE_SUCCESS(rv, rv);
  }
#endif
  return rv;
}

// nsIFolderListener methods....
NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderAdded(nsIMsgFolder* parent,
                                      nsIMsgFolder* child) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnMessageAdded(nsIMsgFolder* parent, nsIMsgDBHdr* msg) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderRemoved(nsIMsgFolder* parent,
                                        nsIMsgFolder* child) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnMessageRemoved(nsIMsgFolder* parent,
                                         nsIMsgDBHdr* msg) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderPropertyChanged(nsIMsgFolder* folder,
                                                const nsACString& property,
                                                const nsACString& oldValue,
                                                const nsACString& newValue) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderIntPropertyChanged(nsIMsgFolder* folder,
                                                   const nsACString& property,
                                                   int64_t oldValue,
                                                   int64_t newValue) {
  // Get the folder's server type.
  nsCString type;
  nsCOMPtr<nsIMsgIncomingServer> server;
  nsresult rv = folder->GetServer(getter_AddRefs(server));
  if (NS_SUCCEEDED(rv) && server) server->GetType(type);
  const char* pref = type.EqualsLiteral("rss") ? "mail.feed.play_sound"
                                               : "mail.biff.play_sound";

  if (property.Equals(kBiffState) && mCurrentBiffState != newValue) {
    // if we got new mail, attempt to play a sound.
    // if we fail along the way, don't return.
    // we still need to update the UI.
    if (newValue == nsIMsgFolder::nsMsgBiffState_NewMail) {
      // if we fail to play the biff sound, keep going.
      (void)PlayBiffSound(pref);
    }
    mCurrentBiffState = newValue;

    // don't care if notification fails
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();

    if (observerService)
      observerService->NotifyObservers(
          static_cast<nsIStatusBarBiffManager*>(this),
          "mail:biff-state-changed", nullptr);
  } else if (property.Equals(kNewMailReceived)) {
    (void)PlayBiffSound(pref);
  }
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderBoolPropertyChanged(nsIMsgFolder* folder,
                                                    const nsACString& property,
                                                    bool oldValue,
                                                    bool newValue) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderUnicharPropertyChanged(
    nsIMsgFolder* folder, const nsACString& property, const nsAString& oldValue,
    const nsAString& newValue) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderPropertyFlagChanged(nsIMsgDBHdr* msg,
                                                    const nsACString& property,
                                                    uint32_t oldFlag,
                                                    uint32_t newFlag) {
  return NS_OK;
}

NS_IMETHODIMP
nsStatusBarBiffManager::OnFolderEvent(nsIMsgFolder* folder,
                                      const nsACString& event) {
  return NS_OK;
}

// nsIObserver implementation
NS_IMETHODIMP
nsStatusBarBiffManager::Observe(nsISupports* aSubject, const char* aTopic,
                                const char16_t* aData) {
  return PlayBiffSound("mail.chat.play_sound");
}

// nsIStatusBarBiffManager method....
NS_IMETHODIMP
nsStatusBarBiffManager::GetBiffState(int32_t* aBiffState) {
  NS_ENSURE_ARG_POINTER(aBiffState);
  *aBiffState = mCurrentBiffState;
  return NS_OK;
}

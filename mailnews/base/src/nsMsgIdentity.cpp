/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgIdentity.h"

#include "mozilla/Components.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "mozilla/Preferences.h"
#include "msgCore.h"  // for pre-compiled headers
#include "nsIMsgAccountManager.h"
#include "nsIMsgFolder.h"
#include "nsIMsgHeaderParser.h"
#include "nsIMsgIncomingServer.h"
#include "nsIMsgLocalMailFolder.h"
#include "nsIPrefService.h"
#include "nsIURIMutator.h"
#include "nsIUUIDGenerator.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgUtils.h"
#include "nsNetCID.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include "prprf.h"

using mozilla::Preferences;

#define REL_FILE_PREF_SUFFIX "-rel"

NS_IMPL_ISUPPORTS(nsMsgIdentity, nsIMsgIdentity)

/*
 * accessors for pulling values directly out of preferences
 * instead of member variables, etc
 */

NS_IMETHODIMP
nsMsgIdentity::GetKey(nsACString& aKey) {
  aKey = mKey;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgIdentity::SetKey(const nsACString& identityKey) {
  mKey = identityKey;
  nsresult rv;
  nsCOMPtr<nsIPrefService> prefs = Preferences::GetService();

  nsAutoCString branchName;
  branchName.AssignLiteral("mail.identity.");
  branchName += mKey;
  branchName.Append('.');
  rv = prefs->GetBranch(branchName.get(), getter_AddRefs(mPrefBranch));
  if (NS_FAILED(rv)) return rv;

  rv = prefs->GetBranch("mail.identity.default.",
                        getter_AddRefs(mDefPrefBranch));
  return rv;
}

NS_IMETHODIMP
nsMsgIdentity::GetUID(nsACString& uid) {
  bool hasValue;
  nsresult rv = mPrefBranch->PrefHasUserValue("uid", &hasValue);
  NS_ENSURE_SUCCESS(rv, rv);
  if (hasValue) {
    return mPrefBranch->GetCharPref("uid", uid);
  }

  nsCOMPtr<nsIUUIDGenerator> uuidgen =
      mozilla::components::UUIDGenerator::Service();
  NS_ENSURE_TRUE(uuidgen, NS_ERROR_FAILURE);

  nsID id;
  rv = uuidgen->GenerateUUIDInPlace(&id);
  NS_ENSURE_SUCCESS(rv, rv);

  char idString[NSID_LENGTH];
  id.ToProvidedString(idString);

  uid.AppendASCII(idString + 1, NSID_LENGTH - 3);
  return SetUID(uid);
}

NS_IMETHODIMP
nsMsgIdentity::SetUID(const nsACString& uid) {
  bool hasValue;
  nsresult rv = mPrefBranch->PrefHasUserValue("uid", &hasValue);
  NS_ENSURE_SUCCESS(rv, rv);
  if (hasValue) {
    return NS_ERROR_ABORT;
  }
  return SetCharAttribute("uid", uid);
}

nsresult nsMsgIdentity::GetIdentityName(nsAString& idName) {
  idName.AssignLiteral("");
  // Try to use "fullname <email>" as the name.
  nsresult rv = GetFullAddress(idName);
  NS_ENSURE_SUCCESS(rv, rv);

  // If a non-empty label exists, append it.
  nsString label;
  rv = GetLabel(label);
  if (NS_SUCCEEDED(rv) &&
      !label.IsEmpty()) {  // TODO: this should be localizable
    idName.AppendLiteral(" (");
    idName.Append(label);
    idName.Append(')');
  }

  if (!idName.IsEmpty()) return NS_OK;

  // If we still found nothing to use, use our key.
  return ToString(idName);
}

nsresult nsMsgIdentity::GetFullAddress(nsAString& fullAddress) {
  nsAutoString fullName;
  nsresult rv = GetFullName(fullName);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString email;
  rv = GetEmail(email);
  NS_ENSURE_SUCCESS(rv, rv);

  if (fullName.IsEmpty() && email.IsEmpty()) {
    fullAddress.Truncate();
  } else {
    nsCOMPtr<msgIAddressObject> mailbox;
    nsCOMPtr<nsIMsgHeaderParser> headerParser(
        mozilla::components::HeaderParser::Service());
    NS_ENSURE_TRUE(headerParser, NS_ERROR_UNEXPECTED);
    headerParser->MakeMailboxObject(fullName, NS_ConvertUTF8toUTF16(email),
                                    getter_AddRefs(mailbox));
    mailbox->ToString(fullAddress);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsMsgIdentity::ToString(nsAString& aResult) {
  aResult.AssignLiteral("[nsIMsgIdentity: ");
  aResult.Append(NS_ConvertASCIItoUTF16(mKey));
  aResult.Append(']');
  return NS_OK;
}

/* Identity attribute accessors */

NS_IMETHODIMP
nsMsgIdentity::GetSignature(nsIFile** sig) {
  bool gotRelPref;
  nsresult rv =
      NS_GetPersistentFile("sig_file" REL_FILE_PREF_SUFFIX, "sig_file", nullptr,
                           gotRelPref, sig, mPrefBranch);
  if (NS_SUCCEEDED(rv) && !gotRelPref) {
    rv = NS_SetPersistentFile("sig_file" REL_FILE_PREF_SUFFIX, "sig_file", *sig,
                              mPrefBranch);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Failed to write signature file pref.");
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgIdentity::SetSignature(nsIFile* sig) {
  nsresult rv = NS_OK;
  if (sig)
    rv = NS_SetPersistentFile("sig_file" REL_FILE_PREF_SUFFIX, "sig_file", sig,
                              mPrefBranch);
  return rv;
}

NS_IMETHODIMP
nsMsgIdentity::ClearAllValues() {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsTArray<nsCString> prefNames;
  nsresult rv = mPrefBranch->GetChildList("", prefNames);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto& prefName : prefNames) {
    mPrefBranch->ClearUserPref(prefName.get());
  }

  return NS_OK;
}

NS_IMPL_IDPREF_STR(EscapedVCard, "escapedVCard")
NS_IMPL_IDPREF_STR(SmtpServerKey, "smtpServer")
NS_IMPL_IDPREF_WSTR(FullName, "fullName")
NS_IMPL_IDPREF_STR(Email, "useremail")
NS_IMPL_IDPREF_BOOL(CatchAll, "catchAll")
NS_IMPL_IDPREF_STR(CatchAllHint, "catchAllHint")
NS_IMPL_IDPREF_WSTR(Label, "label")
NS_IMPL_IDPREF_STR(ReplyTo, "reply_to")
NS_IMPL_IDPREF_WSTR(Organization, "organization")
NS_IMPL_IDPREF_BOOL(ComposeHtml, "compose_html")
NS_IMPL_IDPREF_BOOL(AttachVCard, "attach_vcard")
NS_IMPL_IDPREF_BOOL(AttachSignature, "attach_signature")
NS_IMPL_IDPREF_WSTR(HtmlSigText, "htmlSigText")
NS_IMPL_IDPREF_BOOL(HtmlSigFormat, "htmlSigFormat")

NS_IMPL_IDPREF_BOOL(AutoQuote, "auto_quote")
NS_IMPL_IDPREF_INT(ReplyOnTop, "reply_on_top")
NS_IMPL_IDPREF_BOOL(SigBottom, "sig_bottom")
NS_IMPL_IDPREF_BOOL(SigOnForward, "sig_on_fwd")
NS_IMPL_IDPREF_BOOL(SigOnReply, "sig_on_reply")

NS_IMPL_IDPREF_INT(SignatureDate, "sig_date")

NS_IMPL_IDPREF_BOOL(DoFcc, "fcc")

NS_IMPL_FOLDERPREF_STR(FccFolder, "fcc_folder", nsMsgFolderFlags::SentMail,
                       "Sent"_ns)
NS_IMPL_IDPREF_STR(FccFolderPickerMode, "fcc_folder_picker_mode")
NS_IMPL_IDPREF_BOOL(FccReplyFollowsParent, "fcc_reply_follows_parent")
NS_IMPL_IDPREF_STR(DraftsFolderPickerMode, "drafts_folder_picker_mode")
NS_IMPL_IDPREF_STR(ArchivesFolderPickerMode, "archives_folder_picker_mode")
NS_IMPL_IDPREF_STR(TemplatesFolderPickerMode, "tmpl_folder_picker_mode")

NS_IMPL_IDPREF_BOOL(BccSelf, "bcc_self")
NS_IMPL_IDPREF_BOOL(BccOthers, "bcc_other")
NS_IMPL_IDPREF_STR(BccList, "bcc_other_list")

NS_IMPL_IDPREF_BOOL(SuppressSigSep, "suppress_signature_separator")

NS_IMPL_IDPREF_BOOL(DoCc, "doCc")
NS_IMPL_IDPREF_STR(DoCcList, "doCcList")

NS_IMPL_IDPREF_BOOL(AttachPgpKey, "attachPgpKey")
NS_IMPL_IDPREF_BOOL(SendAutocryptHeaders, "sendAutocryptHeaders")
NS_IMPL_IDPREF_BOOL(AutoEncryptDrafts, "autoEncryptDrafts")
NS_IMPL_IDPREF_BOOL(ProtectSubject, "protectSubject")
NS_IMPL_IDPREF_INT(EncryptionPolicy, "encryptionpolicy")
NS_IMPL_IDPREF_BOOL(SignMail, "sign_mail")

NS_IMETHODIMP
nsMsgIdentity::GetDoBcc(bool* aValue) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv = mPrefBranch->GetBoolPref("doBcc", aValue);
  if (NS_SUCCEEDED(rv)) return rv;

  bool bccSelf = false;
  GetBccSelf(&bccSelf);

  bool bccOthers = false;
  GetBccOthers(&bccOthers);

  nsCString others;
  GetBccList(others);

  *aValue = bccSelf || (bccOthers && !others.IsEmpty());

  return SetDoBcc(*aValue);
}

NS_IMETHODIMP
nsMsgIdentity::SetDoBcc(bool aValue) {
  return SetBoolAttribute("doBcc", aValue);
}

NS_IMETHODIMP
nsMsgIdentity::GetDoBccList(nsACString& aValue) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsCString val;
  nsresult rv = mPrefBranch->GetCharPref("doBccList", val);
  aValue = val;
  if (NS_SUCCEEDED(rv)) return rv;

  bool bccSelf = false;
  rv = GetBccSelf(&bccSelf);
  NS_ENSURE_SUCCESS(rv, rv);

  if (bccSelf) GetEmail(aValue);

  bool bccOthers = false;
  rv = GetBccOthers(&bccOthers);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString others;
  rv = GetBccList(others);
  NS_ENSURE_SUCCESS(rv, rv);

  if (bccOthers && !others.IsEmpty()) {
    if (bccSelf) aValue.Append(',');
    aValue.Append(others);
  }

  return SetDoBccList(aValue);
}

NS_IMETHODIMP
nsMsgIdentity::SetDoBccList(const nsACString& aValue) {
  return SetCharAttribute("doBccList", aValue);
}

NS_IMPL_FOLDERPREF_STR(DraftsFolder, "draft_folder", nsMsgFolderFlags::Drafts,
                       "Drafts"_ns)
NS_IMPL_FOLDERPREF_STR(ArchivesFolder, "archive_folder",
                       nsMsgFolderFlags::Archive, "Archives"_ns)
NS_IMPL_FOLDERPREF_STR(TemplatesFolder, "stationery_folder",
                       nsMsgFolderFlags::Templates, "Templates"_ns)

NS_IMPL_IDPREF_BOOL(ArchiveEnabled, "archive_enabled")
NS_IMPL_IDPREF_INT(ArchiveGranularity, "archive_granularity")
NS_IMPL_IDPREF_BOOL(ArchiveKeepFolderStructure, "archive_keep_folder_structure")
NS_IMPL_IDPREF_BOOL(ArchiveRecreateInbox, "archive_recreate_inbox")

NS_IMPL_IDPREF_BOOL(ShowSaveMsgDlg, "showSaveMsgDlg")
NS_IMPL_IDPREF_STR(DirectoryServer, "directoryServer")
NS_IMPL_IDPREF_BOOL(OverrideGlobalPref, "overrideGlobal_Pref")
NS_IMPL_IDPREF_BOOL(AutocompleteToMyDomain, "autocompleteToMyDomain")

NS_IMPL_IDPREF_BOOL(Valid, "valid")

bool nsMsgIdentity::checkServerForExistingFolder(nsIMsgFolder* rootFolder,
                                                 const char* prefName,
                                                 uint32_t folderFlag,
                                                 const nsACString& folderName,
                                                 nsIMsgFolder** retval) {
  // Look for a folder with the flag we want.
  nsresult rv = rootFolder->GetFolderWithFlags(folderFlag, retval);
  if (NS_SUCCEEDED(rv) && *retval) {
    SetCharAttribute(prefName, (*retval)->URI());
    return true;
  }

  // Look for a folder with the name we want.
  rv = rootFolder->GetChildNamed(folderName, retval);
  if (NS_SUCCEEDED(rv) && *retval) {
    (*retval)->SetFlag(folderFlag);
    SetCharAttribute(prefName, (*retval)->URI());
    return true;
  }
  return false;
}

nsresult nsMsgIdentity::getOrCreateFolder(const char* prefName,
                                          uint32_t folderFlag,
                                          const nsACString& folderName,
                                          nsIMsgFolder** retval) {
  if (!mPrefBranch) {
    return NS_ERROR_NOT_INITIALIZED;
  }

  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();
  nsCOMPtr<nsIMsgFolder> rootFolder;
  nsCOMPtr<nsIMsgLocalMailFolder> localRootFolder;

  // Look for a folder matching the preference value.
  nsAutoCString prefValue;
  nsresult rv =
      mPrefBranch->GetStringPref(prefName, EmptyCString(), 0, prefValue);
  if (NS_SUCCEEDED(rv) && !prefValue.IsEmpty()) {
    rv = GetExistingFolder(prefValue, retval);
    if (NS_SUCCEEDED(rv) && *retval) {
      // Success! Return the folder.
      return NS_OK;
    }

    // Can we get a server that matches the preference?
    nsCOMPtr<nsIURL> url;
    rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
             .SetSpec(prefValue)
             .Finalize(url);
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgIncomingServer> server;

      if (url->SchemeIs("mailbox")) {
        // Of course that means looking for the same thing several times,
        // because nothing is simple around here.
        if (NS_SUCCEEDED(
                NS_MutateURI(url).SetScheme("none"_ns).Finalize(url))) {
          accountManager->FindServerByURI(url, getter_AddRefs(server));
        }
        if (!server &&
            NS_SUCCEEDED(
                NS_MutateURI(url).SetScheme("pop3"_ns).Finalize(url))) {
          accountManager->FindServerByURI(url, getter_AddRefs(server));
        }
        if (!server &&
            NS_SUCCEEDED(NS_MutateURI(url).SetScheme("rss"_ns).Finalize(url))) {
          accountManager->FindServerByURI(url, getter_AddRefs(server));
        }
      } else {
        accountManager->FindServerByURI(url, getter_AddRefs(server));
      }

      if (server) {
        // Do we have an existing folder on this server?
        rv = server->GetRootMsgFolder(getter_AddRefs(rootFolder));
        NS_ENSURE_SUCCESS(rv, rv);

        if (checkServerForExistingFolder(rootFolder, prefName, folderFlag,
                                         folderName, retval)) {
          return NS_OK;
        }

        // Can we create one?
        localRootFolder = do_QueryInterface(rootFolder);
      }
    }
  }

  if (!localRootFolder) {
    // Look for a server we could create a folder on, starting with the
    // identity's servers.
    nsTArray<RefPtr<nsIMsgIncomingServer>> servers;
    rv = accountManager->GetServersForIdentity(this, servers);
    NS_ENSURE_SUCCESS(rv, rv);
    for (RefPtr<nsIMsgIncomingServer> server : servers) {
      // Should we store copies on this server?
      bool defaultToServer;
      rv = server->GetDefaultCopiesAndFoldersPrefsToServer(&defaultToServer);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!defaultToServer) {
        continue;
      }

      // Do we have an existing folder on this server?
      rv = server->GetRootMsgFolder(getter_AddRefs(rootFolder));
      NS_ENSURE_SUCCESS(rv, rv);

      if (checkServerForExistingFolder(rootFolder, prefName, folderFlag,
                                       folderName, retval)) {
        return NS_OK;
      }

      // Can we create one?
      localRootFolder = do_QueryInterface(rootFolder);
      if (localRootFolder) {
        break;
      }
    }
  }
  if (!localRootFolder) {
    // Still nothing? Let's use the Local Folders server.
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = accountManager->GetLocalFoldersServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    // Do we have an existing folder on this server?
    rv = server->GetRootMsgFolder(getter_AddRefs(rootFolder));
    NS_ENSURE_SUCCESS(rv, rv);

    if (checkServerForExistingFolder(rootFolder, prefName, folderFlag,
                                     folderName, retval)) {
      return NS_OK;
    }

    localRootFolder = do_QueryInterface(rootFolder);
  }
  if (!localRootFolder) {
    return NS_ERROR_FAILURE;
  }

  // Okay, there's no folder. We're going to have to create one.
  rv = localRootFolder->CreateLocalSubfolder(folderName, retval);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = (*retval)->SetFlags(folderFlag);
  NS_ENSURE_SUCCESS(rv, rv);

  SetCharAttribute(prefName, (*retval)->URI());
  return NS_OK;
}

nsresult nsMsgIdentity::setFolderPref(const char* prefName,
                                      const nsACString& value,
                                      uint32_t folderFlag) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
      mozilla::components::AccountManager::Service();

  if (folderFlag == nsMsgFolderFlags::SentMail) {
    // Clear the temporary return receipt filter so that the new filter
    // rule can be recreated (by ConfigureTemporaryFilters()).
    nsTArray<RefPtr<nsIMsgIncomingServer>> servers;
    rv = accountManager->GetServersForIdentity(this, servers);
    NS_ENSURE_SUCCESS(rv, rv);
    if (!servers.IsEmpty()) {
      servers[0]->ClearTemporaryReturnReceiptsFilter();
      // Okay to fail; no need to check for return code.
    }
  }

  // Get the old folder, and clear the special folder flag on it, but only if no
  // other identity is using it.
  nsAutoCString oldValue;
  rv = GetCharAttribute(prefName, oldValue);
  if (NS_SUCCEEDED(rv) && !oldValue.IsEmpty() && !oldValue.Equals(value)) {
    nsTArray<RefPtr<nsIMsgIdentity>> identities;
    rv = accountManager->GetAllIdentities(identities);
    NS_ENSURE_SUCCESS(rv, rv);

    bool shouldRemove = true;
    for (auto identity : identities) {
      if (identity == this) {
        continue;
      }
      nsAutoCString identityValue;
      rv = identity->GetCharAttribute(prefName, identityValue);
      if (NS_SUCCEEDED(rv) && identityValue.Equals(oldValue)) {
        shouldRemove = false;
        break;
      }
    }

    if (shouldRemove) {
      nsCOMPtr<nsIMsgFolder> folder;
      rv = FindFolder(oldValue, getter_AddRefs(folder));
      if (NS_SUCCEEDED(rv) && folder) {
        folder->ClearFlag(folderFlag);
      }
    }
  }

  // Set the new folder, and set the special folder flags on it.
  rv = SetCharAttribute(prefName, value);
  if (NS_SUCCEEDED(rv) && !value.IsEmpty()) {
    nsCOMPtr<nsIMsgFolder> folder;
    rv = FindFolder(value, getter_AddRefs(folder));
    if (NS_SUCCEEDED(rv) && folder) {
      rv = folder->SetFlag(folderFlag);
    }
  }

  return rv;
}

NS_IMETHODIMP nsMsgIdentity::SetUnicharAttribute(const char* aName,
                                                 const nsAString& val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  if (!val.IsEmpty())
    return mPrefBranch->SetStringPref(aName, NS_ConvertUTF16toUTF8(val));

  mPrefBranch->ClearUserPref(aName);
  return NS_OK;
}

NS_IMETHODIMP nsMsgIdentity::GetUnicharAttribute(const char* aName,
                                                 nsAString& val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsCString valueUtf8;
  if (NS_FAILED(
          mPrefBranch->GetStringPref(aName, EmptyCString(), 0, valueUtf8)))
    mDefPrefBranch->GetStringPref(aName, EmptyCString(), 0, valueUtf8);
  CopyUTF8toUTF16(valueUtf8, val);
  return NS_OK;
}

NS_IMETHODIMP nsMsgIdentity::SetCharAttribute(const char* aName,
                                              const nsACString& val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  if (!val.IsEmpty()) return mPrefBranch->SetCharPref(aName, val);

  mPrefBranch->ClearUserPref(aName);
  return NS_OK;
}

NS_IMETHODIMP nsMsgIdentity::GetCharAttribute(const char* aName,
                                              nsACString& val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  nsCString tmpVal;
  if (NS_FAILED(mPrefBranch->GetCharPref(aName, tmpVal)))
    mDefPrefBranch->GetCharPref(aName, tmpVal);
  val = tmpVal;
  return NS_OK;
}

NS_IMETHODIMP nsMsgIdentity::SetBoolAttribute(const char* aName, bool val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  return mPrefBranch->SetBoolPref(aName, val);
}

NS_IMETHODIMP nsMsgIdentity::GetBoolAttribute(const char* aName, bool* val) {
  NS_ENSURE_ARG_POINTER(val);
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  *val = false;

  if (NS_FAILED(mPrefBranch->GetBoolPref(aName, val)))
    mDefPrefBranch->GetBoolPref(aName, val);

  return NS_OK;
}

NS_IMETHODIMP nsMsgIdentity::SetIntAttribute(const char* aName, int32_t val) {
  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  return mPrefBranch->SetIntPref(aName, val);
}

NS_IMETHODIMP nsMsgIdentity::GetIntAttribute(const char* aName, int32_t* val) {
  NS_ENSURE_ARG_POINTER(val);

  if (!mPrefBranch) return NS_ERROR_NOT_INITIALIZED;

  *val = 0;

  if (NS_FAILED(mPrefBranch->GetIntPref(aName, val)))
    mDefPrefBranch->GetIntPref(aName, val);

  return NS_OK;
}

#define COPY_IDENTITY_FILE_VALUE(SRC_ID, MACRO_GETTER, MACRO_SETTER) \
  {                                                                  \
    nsresult macro_rv;                                               \
    nsCOMPtr<nsIFile> macro_spec;                                    \
    macro_rv = SRC_ID->MACRO_GETTER(getter_AddRefs(macro_spec));     \
    if (NS_SUCCEEDED(macro_rv)) this->MACRO_SETTER(macro_spec);      \
  }

#define COPY_IDENTITY_INT_VALUE(SRC_ID, MACRO_GETTER, MACRO_SETTER) \
  {                                                                 \
    nsresult macro_rv;                                              \
    int32_t macro_oldInt;                                           \
    macro_rv = SRC_ID->MACRO_GETTER(&macro_oldInt);                 \
    if (NS_SUCCEEDED(macro_rv)) this->MACRO_SETTER(macro_oldInt);   \
  }

#define COPY_IDENTITY_BOOL_VALUE(SRC_ID, MACRO_GETTER, MACRO_SETTER) \
  {                                                                  \
    nsresult macro_rv;                                               \
    bool macro_oldBool;                                              \
    macro_rv = SRC_ID->MACRO_GETTER(&macro_oldBool);                 \
    if (NS_SUCCEEDED(macro_rv)) this->MACRO_SETTER(macro_oldBool);   \
  }

#define COPY_IDENTITY_STR_VALUE(SRC_ID, MACRO_GETTER, MACRO_SETTER) \
  {                                                                 \
    nsCString macro_oldStr;                                         \
    nsresult macro_rv;                                              \
    macro_rv = SRC_ID->MACRO_GETTER(macro_oldStr);                  \
    if (NS_SUCCEEDED(macro_rv)) {                                   \
      this->MACRO_SETTER(macro_oldStr);                             \
    }                                                               \
  }

#define COPY_IDENTITY_WSTR_VALUE(SRC_ID, MACRO_GETTER, MACRO_SETTER) \
  {                                                                  \
    nsString macro_oldStr;                                           \
    nsresult macro_rv;                                               \
    macro_rv = SRC_ID->MACRO_GETTER(macro_oldStr);                   \
    if (NS_SUCCEEDED(macro_rv)) {                                    \
      this->MACRO_SETTER(macro_oldStr);                              \
    }                                                                \
  }

NS_IMETHODIMP
nsMsgIdentity::Copy(nsIMsgIdentity* identity) {
  NS_ENSURE_ARG_POINTER(identity);

  COPY_IDENTITY_BOOL_VALUE(identity, GetComposeHtml, SetComposeHtml)
  COPY_IDENTITY_STR_VALUE(identity, GetEmail, SetEmail)
  COPY_IDENTITY_BOOL_VALUE(identity, GetCatchAll, SetCatchAll)
  COPY_IDENTITY_WSTR_VALUE(identity, GetLabel, SetLabel)
  COPY_IDENTITY_STR_VALUE(identity, GetReplyTo, SetReplyTo)
  COPY_IDENTITY_WSTR_VALUE(identity, GetFullName, SetFullName)
  COPY_IDENTITY_WSTR_VALUE(identity, GetOrganization, SetOrganization)
  COPY_IDENTITY_STR_VALUE(identity, GetDraftsFolderURI, SetDraftsFolderURI)
  COPY_IDENTITY_STR_VALUE(identity, GetArchivesFolderURI, SetArchivesFolderURI)
  COPY_IDENTITY_STR_VALUE(identity, GetFccFolderURI, SetFccFolderURI)
  COPY_IDENTITY_BOOL_VALUE(identity, GetFccReplyFollowsParent,
                           SetFccReplyFollowsParent)
  COPY_IDENTITY_STR_VALUE(identity, GetTemplatesFolderURI,
                          SetTemplatesFolderURI)
  COPY_IDENTITY_BOOL_VALUE(identity, GetArchiveEnabled, SetArchiveEnabled)
  COPY_IDENTITY_INT_VALUE(identity, GetArchiveGranularity,
                          SetArchiveGranularity)
  COPY_IDENTITY_BOOL_VALUE(identity, GetArchiveKeepFolderStructure,
                           SetArchiveKeepFolderStructure)
  COPY_IDENTITY_BOOL_VALUE(identity, GetArchiveRecreateInbox,
                           SetArchiveRecreateInbox)
  COPY_IDENTITY_BOOL_VALUE(identity, GetAttachSignature, SetAttachSignature)
  COPY_IDENTITY_FILE_VALUE(identity, GetSignature, SetSignature)
  COPY_IDENTITY_WSTR_VALUE(identity, GetHtmlSigText, SetHtmlSigText)
  COPY_IDENTITY_BOOL_VALUE(identity, GetHtmlSigFormat, SetHtmlSigFormat)
  COPY_IDENTITY_BOOL_VALUE(identity, GetAutoQuote, SetAutoQuote)
  COPY_IDENTITY_INT_VALUE(identity, GetReplyOnTop, SetReplyOnTop)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSigBottom, SetSigBottom)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSigOnForward, SetSigOnForward)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSigOnReply, SetSigOnReply)
  COPY_IDENTITY_INT_VALUE(identity, GetSignatureDate, SetSignatureDate)
  COPY_IDENTITY_BOOL_VALUE(identity, GetAttachVCard, SetAttachVCard)
  COPY_IDENTITY_STR_VALUE(identity, GetEscapedVCard, SetEscapedVCard)
  COPY_IDENTITY_STR_VALUE(identity, GetSmtpServerKey, SetSmtpServerKey)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSuppressSigSep, SetSuppressSigSep)

  COPY_IDENTITY_BOOL_VALUE(identity, GetAttachPgpKey, SetAttachPgpKey)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSendAutocryptHeaders,
                           SetSendAutocryptHeaders)
  COPY_IDENTITY_BOOL_VALUE(identity, GetAutoEncryptDrafts, SetAutoEncryptDrafts)
  COPY_IDENTITY_BOOL_VALUE(identity, GetProtectSubject, SetProtectSubject)
  COPY_IDENTITY_INT_VALUE(identity, GetEncryptionPolicy, SetEncryptionPolicy)
  COPY_IDENTITY_BOOL_VALUE(identity, GetSignMail, SetSignMail)
  return NS_OK;
}

NS_IMETHODIMP
nsMsgIdentity::GetRequestReturnReceipt(bool* aVal) {
  NS_ENSURE_ARG_POINTER(aVal);

  bool useCustomPrefs = false;
  nsresult rv = GetBoolAttribute("use_custom_prefs", &useCustomPrefs);
  NS_ENSURE_SUCCESS(rv, rv);
  if (useCustomPrefs)
    return GetBoolAttribute("request_return_receipt_on", aVal);

  return Preferences::GetBool("mail.receipt.request_return_receipt_on", aVal);
}

NS_IMETHODIMP
nsMsgIdentity::GetReceiptHeaderType(int32_t* aType) {
  NS_ENSURE_ARG_POINTER(aType);

  bool useCustomPrefs = false;
  nsresult rv = GetBoolAttribute("use_custom_prefs", &useCustomPrefs);
  NS_ENSURE_SUCCESS(rv, rv);
  if (useCustomPrefs)
    return GetIntAttribute("request_receipt_header_type", aType);

  return Preferences::GetInt("mail.receipt.request_header_type", aType);
}

NS_IMETHODIMP
nsMsgIdentity::GetRequestDSN(bool* aVal) {
  NS_ENSURE_ARG_POINTER(aVal);

  bool useCustomPrefs = false;
  nsresult rv = GetBoolAttribute("dsn_use_custom_prefs", &useCustomPrefs);
  NS_ENSURE_SUCCESS(rv, rv);
  if (useCustomPrefs) return GetBoolAttribute("dsn_always_request_on", aVal);

  return Preferences::GetBool("mail.dsn.always_request_on", aVal);
}

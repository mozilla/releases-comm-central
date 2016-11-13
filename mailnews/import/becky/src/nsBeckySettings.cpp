/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgBaseCID.h"
#include "nsMsgCompCID.h"
#include "nsIMsgAccountManager.h"
#include "nsServiceManagerUtils.h"
#include "nsIINIParser.h"
#include "nsISmtpService.h"
#include "nsISmtpServer.h"
#include "nsIPop3IncomingServer.h"
#include "nsIStringEnumerator.h"
#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsILineInputStream.h"
#include "nsNetUtil.h"
#include "nsString.h"
#include "msgCore.h"
#include "nsIStringBundle.h"

#include "nsBeckySettings.h"
#include "nsBeckyStringBundle.h"
#include "nsBeckyUtils.h"

NS_IMPL_ISUPPORTS(nsBeckySettings, nsIImportSettings)

nsresult
nsBeckySettings::Create(nsIImportSettings **aImport)
{
  NS_ENSURE_ARG_POINTER(aImport);

  *aImport = new nsBeckySettings();

  NS_ADDREF(*aImport);
  return NS_OK;
}

nsBeckySettings::nsBeckySettings()
{
}

nsBeckySettings::~nsBeckySettings()
{
}

NS_IMETHODIMP
nsBeckySettings::AutoLocate(char16_t **aDescription,
                            nsIFile **aLocation,
                            bool *_retval)
{
  NS_ENSURE_ARG_POINTER(aDescription);
  NS_ENSURE_ARG_POINTER(aLocation);
  NS_ENSURE_ARG_POINTER(_retval);

  *aDescription =
    nsBeckyStringBundle::GetStringByName(u"BeckyImportName");
  *aLocation = nullptr;
  *_retval = false;

  nsCOMPtr<nsIFile> location;
  nsresult rv = nsBeckyUtils::GetDefaultMailboxINIFile(getter_AddRefs(location));
  if (NS_FAILED(rv))
    location = do_CreateInstance(NS_LOCAL_FILE_CONTRACTID, &rv);
  else
    *_retval = true;

  location.forget(aLocation);
  return NS_OK;
}

NS_IMETHODIMP
nsBeckySettings::SetLocation(nsIFile *aLocation)
{
  mLocation = aLocation;
  return NS_OK;
}

nsresult
nsBeckySettings::CreateParser()
{
  if (!mLocation) {
    nsresult rv = nsBeckyUtils::GetDefaultMailboxINIFile(getter_AddRefs(mLocation));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // nsIINIParser accepts only UTF-8 encoding, so we need to convert the file
  // first.
  nsresult rv;
  rv = nsBeckyUtils::ConvertToUTF8File(mLocation, getter_AddRefs(mConvertedFile));
  NS_ENSURE_SUCCESS(rv, rv);

  return nsBeckyUtils::CreateINIParserForFile(mConvertedFile,
                                              getter_AddRefs(mParser));
}

nsresult
nsBeckySettings::CreateSmtpServer(const nsCString &aUserName,
                                  const nsCString &aServerName,
                                  nsISmtpServer **aServer,
                                  bool *existing)
{
  nsresult rv;

  nsCOMPtr<nsISmtpService> smtpService = do_GetService(NS_SMTPSERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISmtpServer> server;
  rv = smtpService->FindServer(aUserName.get(),
                               aServerName.get(),
                               getter_AddRefs(server));

  if (NS_FAILED(rv) || !server) {
    rv = smtpService->CreateServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);

    server->SetHostname(aServerName);
    server->SetUsername(aUserName);
    *existing = false;
  } else {
    *existing = true;
  }

  server.forget(aServer);

  return NS_OK;
}

nsresult
nsBeckySettings::CreateIncomingServer(const nsCString &aUserName,
                                      const nsCString &aServerName,
                                      const nsCString &aProtocol,
                                      nsIMsgIncomingServer **aServer)
{
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager = do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> incomingServer;
  rv = accountManager->FindServer(aUserName,
                                  aServerName,
                                  aProtocol,
                                  getter_AddRefs(incomingServer));

  if (NS_FAILED(rv) || !incomingServer) {
    rv = accountManager->CreateIncomingServer(aUserName,
                                              aServerName,
                                              aProtocol,
                                              getter_AddRefs(incomingServer));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  incomingServer.forget(aServer);

  return NS_OK;
}

nsresult
nsBeckySettings::SetupSmtpServer(nsISmtpServer **aServer)
{
  nsresult rv;
  nsAutoCString userName, serverName;

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("SMTPServer"),
                     serverName);
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("UserID"),
                     userName);

  nsCOMPtr<nsISmtpServer> server;
  bool existing = false;
  rv = CreateSmtpServer(userName, serverName, getter_AddRefs(server), &existing);
  NS_ENSURE_SUCCESS(rv, rv);

  // If we already have an existing server, do not touch it's settings.
  if (existing) {
    server.forget(aServer);
    return NS_OK;
  }

  nsAutoCString value;
  rv = mParser->GetString(NS_LITERAL_CSTRING("Account"),
                          NS_LITERAL_CSTRING("SMTPPort"),
                          value);
  int32_t port = 25;
  if (NS_SUCCEEDED(rv)) {
    nsresult errorCode;
    port = value.ToInteger(&errorCode, 10);
  }
  server->SetPort(port);

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("SSLSMTP"),
                     value);
  if (value.Equals("1"))
    server->SetSocketType(nsMsgSocketType::SSL);

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("SMTPAUTH"),
                     value);
  if (value.Equals("1")) {
    mParser->GetString(NS_LITERAL_CSTRING("Account"),
                       NS_LITERAL_CSTRING("SMTPAUTHMODE"),
                       value);
    nsMsgAuthMethodValue authMethod = nsMsgAuthMethod::none;
    if (value.Equals("1")) {
      authMethod = nsMsgAuthMethod::passwordEncrypted;
    } else if (value.Equals("2") ||
               value.Equals("4") ||
               value.Equals("6")) {
      authMethod = nsMsgAuthMethod::passwordCleartext;
    } else {
      authMethod = nsMsgAuthMethod::anything;
    }
    server->SetAuthMethod(authMethod);
  }

  server.forget(aServer);

  return NS_OK;
}

nsresult
nsBeckySettings::SetPop3ServerProperties(nsIMsgIncomingServer *aServer)
{
  nsCOMPtr<nsIPop3IncomingServer> pop3Server = do_QueryInterface(aServer);

  nsAutoCString value;
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("POP3Auth"),
                     value); // 0: plain, 1: APOP, 2: CRAM-MD5, 3: NTLM
  nsMsgAuthMethodValue authMethod;
  if (value.IsEmpty() || value.Equals("0")) {
    authMethod = nsMsgAuthMethod::passwordCleartext;
  } else if (value.Equals("1")) {
    authMethod = nsMsgAuthMethod::old;
  } else if (value.Equals("2")) {
    authMethod = nsMsgAuthMethod::passwordEncrypted;
  } else if (value.Equals("3")) {
    authMethod = nsMsgAuthMethod::NTLM;
  } else {
    authMethod = nsMsgAuthMethod::none;
  }
  aServer->SetAuthMethod(authMethod);

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("LeaveServer"),
                     value);
  if (value.Equals("1")) {
    pop3Server->SetLeaveMessagesOnServer(true);
    nsresult rv = mParser->GetString(NS_LITERAL_CSTRING("Account"),
                                     NS_LITERAL_CSTRING("KeepDays"),
                                     value);
    if (NS_FAILED(rv))
      return NS_OK;

    nsresult errorCode;
    int32_t leftDays = value.ToInteger(&errorCode, 10);
    if (NS_SUCCEEDED(errorCode)) {
      pop3Server->SetNumDaysToLeaveOnServer(leftDays);
      pop3Server->SetDeleteByAgeFromServer(true);
    }
  }

  return NS_OK;
}

nsresult
nsBeckySettings::SetupIncomingServer(nsIMsgIncomingServer **aServer)
{
  nsAutoCString value;
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("Protocol"),
                     value);
  nsCString protocol;
  if (value.Equals("1")) {
    protocol = NS_LITERAL_CSTRING("imap");
  } else {
    protocol = NS_LITERAL_CSTRING("pop3");
  }

  nsAutoCString userName, serverName;
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("MailServer"),
                     serverName);
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("UserID"),
                     userName);

  nsresult rv;
  nsCOMPtr<nsIMsgIncomingServer> server;
  rv = CreateIncomingServer(userName, serverName, protocol, getter_AddRefs(server));
  NS_ENSURE_SUCCESS(rv, rv);

  bool isSecure = false;
  int32_t port = 0;
  nsresult errorCode;
  if (protocol.EqualsLiteral("pop3")) {
    SetPop3ServerProperties(server);
    rv = mParser->GetString(NS_LITERAL_CSTRING("Account"),
                            NS_LITERAL_CSTRING("POP3Port"),
                            value);
    if (NS_SUCCEEDED(rv))
      port = value.ToInteger(&errorCode, 10);
    else
      port = 110;
    mParser->GetString(NS_LITERAL_CSTRING("Account"),
                       NS_LITERAL_CSTRING("SSLPOP"),
                       value);
    if (value.Equals("1"))
      isSecure = true;
  } else if (protocol.EqualsLiteral("imap")) {
    rv = mParser->GetString(NS_LITERAL_CSTRING("Account"),
                            NS_LITERAL_CSTRING("IMAP4Port"),
                            value);
    if (NS_SUCCEEDED(rv))
      port = value.ToInteger(&errorCode, 10);
    else
      port = 143;
    mParser->GetString(NS_LITERAL_CSTRING("Account"),
                       NS_LITERAL_CSTRING("SSLIMAP"),
                       value);
    if (value.Equals("1"))
      isSecure = true;
  }

  server->SetPort(port);
  if (isSecure)
    server->SetSocketType(nsMsgSocketType::SSL);

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("CheckInt"),
                     value);
  if (value.Equals("1"))
    server->SetDoBiff(true);
  rv = mParser->GetString(NS_LITERAL_CSTRING("Account"),
                          NS_LITERAL_CSTRING("CheckEvery"),
                          value);
  if (NS_SUCCEEDED(rv)) {
    int32_t minutes = value.ToInteger(&errorCode, 10);
    if (NS_SUCCEEDED(errorCode))
      server->SetBiffMinutes(minutes);
  }

  server.forget(aServer);

  return NS_OK;
}

nsresult
nsBeckySettings::CreateIdentity(nsIMsgIdentity **aIdentity)
{
  nsAutoCString email, fullName, identityName, bccAddress;

  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("Name"),
                     identityName);
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("YourName"),
                     fullName);
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("MailAddress"),
                     email);
  mParser->GetString(NS_LITERAL_CSTRING("Account"),
                     NS_LITERAL_CSTRING("PermBcc"),
                     bccAddress);

  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
    do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgIdentity> identity;
  rv = accountManager->CreateIdentity(getter_AddRefs(identity));
  NS_ENSURE_SUCCESS(rv, rv);

  identity->SetLabel(NS_ConvertUTF8toUTF16(identityName));
  identity->SetFullName(NS_ConvertUTF8toUTF16(fullName));
  identity->SetEmail(email);
  if (!bccAddress.IsEmpty()) {
    identity->SetDoBcc(true);
    identity->SetDoBccList(bccAddress);
  }

  identity.forget(aIdentity);

  return NS_OK;
}

nsresult
nsBeckySettings::CreateAccount(nsIMsgIdentity *aIdentity,
                               nsIMsgIncomingServer *aIncomingServer,
                               nsIMsgAccount **aAccount)
{
  nsresult rv;
  nsCOMPtr<nsIMsgAccountManager> accountManager =
    do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgAccount> account;
  rv = accountManager->CreateAccount(getter_AddRefs(account));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = account->AddIdentity(aIdentity);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = account->SetIncomingServer(aIncomingServer);
  NS_ENSURE_SUCCESS(rv, rv);

  account.forget(aAccount);

  return NS_OK;
}

nsresult
nsBeckySettings::RemoveConvertedFile()
{
  if (mConvertedFile) {
    bool exists;
    mConvertedFile->Exists(&exists);
    if (exists)
      mConvertedFile->Remove(false);
    mConvertedFile = nullptr;
  }
  return NS_OK;
}

#define NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(expr, rv) \
  if (NS_FAILED(expr)) {                                         \
    RemoveConvertedFile();                                       \
    return rv;                                                   \
  }

NS_IMETHODIMP
nsBeckySettings::Import(nsIMsgAccount **aLocalMailAccount,
                        bool *_retval)
{
  NS_ENSURE_ARG_POINTER(aLocalMailAccount);
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv = CreateParser();
  NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(rv, rv);

  nsCOMPtr<nsIMsgIncomingServer> incomingServer;
  rv = SetupIncomingServer(getter_AddRefs(incomingServer));
  NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(rv, rv);

  nsCOMPtr<nsISmtpServer> smtpServer;
  rv = SetupSmtpServer(getter_AddRefs(smtpServer));
  NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(rv, rv);

  nsCOMPtr<nsIMsgIdentity> identity;
  rv = CreateIdentity(getter_AddRefs(identity));
  NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(rv, rv);

  nsAutoCString smtpKey;
  smtpServer->GetKey(getter_Copies(smtpKey));
  identity->SetSmtpServerKey(smtpKey);

  nsCOMPtr<nsIMsgAccount> account;
  rv = CreateAccount(identity, incomingServer, getter_AddRefs(account));
  NS_RETURN_IF_FAILED_WITH_REMOVE_CONVERTED_FILE(rv, rv);

  RemoveConvertedFile();
  if (aLocalMailAccount)
    account.forget(aLocalMailAccount);
  *_retval = true;
  return NS_OK;
}


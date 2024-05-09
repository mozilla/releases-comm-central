/* vim: set ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsBeckySettings_h___
#define nsBeckySettings_h___

#include "nsIImportSettings.h"
#include "nsIFile.h"
#include "nsIINIParser.h"

class nsIMsgIncomingServer;
class nsIMsgIdentity;
class nsIMsgOutgoingServer;

class nsBeckySettings final : public nsIImportSettings {
 public:
  nsBeckySettings();
  static nsresult Create(nsIImportSettings** aImport);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIIMPORTSETTINGS

 private:
  virtual ~nsBeckySettings();

  nsCOMPtr<nsIFile> mLocation;
  nsCOMPtr<nsIFile> mConvertedFile;
  nsCOMPtr<nsIINIParser> mParser;

  nsresult CreateParser();
  nsresult CreateIdentity(nsIMsgIdentity** aIdentity);
  nsresult CreateAccount(nsIMsgIdentity* aIdentity,
                         nsIMsgIncomingServer* aIncomingServer,
                         nsIMsgAccount** aAccount);
  nsresult CreateSmtpServer(const nsCString& aUserName,
                            const nsCString& aServerName,
                            nsIMsgOutgoingServer** aServer, bool* existing);
  nsresult CreateIncomingServer(const nsCString& aUserName,
                                const nsCString& aServerName,
                                const nsCString& aProtocol,
                                nsIMsgIncomingServer** aServer);
  nsresult SetupIncomingServer(nsIMsgIncomingServer** aServer);
  nsresult SetupSmtpServer(nsIMsgOutgoingServer** aServer);
  nsresult SetPop3ServerProperties(nsIMsgIncomingServer* aServer);
  nsresult RemoveConvertedFile();
};

#endif /* nsBeckySettings_h___ */

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

!macro PostUpdate
  ; PostUpdate is called from both session 0 and from the user session
  ; for service updates, make sure that we only register with the user session
  ; Otherwise ApplicationID::Set can fail intermittently with a file in use error.
  System::Call "kernel32::GetCurrentProcessId() i.r0"
  System::Call "kernel32::ProcessIdToSessionId(i $0, *i ${NSIS_MAX_STRLEN} r9)"

  ${CreateShortcutsLog}

  ; Remove registry entries for non-existent apps and for apps that point to our
  ; install location in the Software\Mozilla key and uninstall registry entries
  ; that point to our install location for both HKCU and HKLM.
  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
  ${RegCleanMain} "Software\Mozilla"
  ${RegCleanUninstall}
  ${UpdateProtocolHandlers}

  ; setup the application model id registration value
  ${InitHashAppModelId} "$INSTDIR" "Software\Mozilla\${AppName}\TaskBarIDs"

  ; Upgrade the copies of the MAPI DLL's
  ${UpgradeMapiDLLs}

  ClearErrors
  WriteRegStr HKLM "Software\Mozilla" "${BrandShortName}InstallerTest" "Write Test"
  ${If} ${Errors}
    StrCpy $TmpVal "HKCU"
  ${Else}
    SetShellVarContext all    ; Set SHCTX to all users (e.g. HKLM)
    DeleteRegValue HKLM "Software\Mozilla" "${BrandShortName}InstallerTest"
    StrCpy $TmpVal "HKLM"
    ${RegCleanMain} "Software\Mozilla"
    ${RegCleanUninstall}
    ${UpdateProtocolHandlers}
    ${SetAppLSPCategories} ${LSP_CATEGORIES}

    ; Only update the Clients\Mail registry key values if they don't exist or
    ; this installation is the same as the one set in those keys.
    ReadRegStr $0 HKLM "Software\Clients\Mail\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
    ${EndIf}
    ${If} "$0" == "$INSTDIR"
      ${SetClientsMail} "HKLM"
    ${EndIf}

    ; Only update the Clients\News registry key values if they don't exist or
    ; this installation is the same as the one set in those keys.
    ReadRegStr $0 HKLM "Software\Clients\News\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
    ${EndIf}
    ${If} "$0" == "$INSTDIR"
      ${SetClientsNews} "HKLM"
    ${EndIf}

    ; Only update the Clients\Calendar registry key values if they don't exist or
    ; this installation is the same as the one set in those keys.
    ReadRegStr $0 HKLM "Software\Clients\Calendar\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
    ${EndIf}
    ${If} "$0" == "$INSTDIR"
      ${SetClientsCalendar} "HKLM"
    ${EndIf}
  ${EndIf}

  ; Update the name/icon/AppModelID of our shortcuts as needed, then update the
  ; lastwritetime of the Start Menu shortcut to clear the tile icon cache.
  ; Do this for both shell contexts in case the user has shortcuts in multiple
  ; locations, then restore the previous context at the end.
  SetShellVarContext all
  ${UpdateShortcutsBranding}
  ${TouchStartMenuShortcut}
  Call FixShortcutAppModelIDs
  SetShellVarContext current
  ${UpdateShortcutsBranding}
  ${TouchStartMenuShortcut}
  Call FixShortcutAppModelIDs
  ${If} $TmpVal == "HKLM"
    SetShellVarContext all
  ${ElseIf} $TmpVal == "HKCU"
    SetShellVarContext current
  ${EndIf}

  ${RemoveDeprecatedKeys}
  ${Set32to64DidMigrateReg}

  ${SetAppKeys}
  ${SetUninstallKeys}

  ; Remove files that may be left behind by the application in the
  ; VirtualStore directory.
  ${CleanVirtualStore}

  RmDir /r /REBOOTOK "$INSTDIR\${TO_BE_DELETED}"

  ; Register AccessibleMarshal.dll with COM (this requires write access to HKLM)
  ${RegisterAccessibleMarshal}

  ; Record the Windows Error Reporting module
  WriteRegDWORD HKLM "SOFTWARE\Microsoft\Windows\Windows Error Reporting\RuntimeExceptionHelperModules" "$INSTDIR\mozwer.dll" 0

!ifdef MOZ_MAINTENANCE_SERVICE
  Call IsUserAdmin
  Pop $R0
  ${If} $R0 == "true"
  ; Only proceed if we have HKLM write access
  ${AndIf} $TmpVal == "HKLM"
    ; We check to see if the maintenance service install was already attempted.
    ; Since the Maintenance service can be installed either x86 or x64,
    ; always use the 64-bit registry for checking if an attempt was made.
    ${If} ${RunningX64}
    ${OrIf} ${IsNativeARM64}
      SetRegView 64
    ${EndIf}
    ReadRegDWORD $5 HKLM "Software\Mozilla\MaintenanceService" "Attempted"
    ClearErrors
    ${If} ${RunningX64}
    ${OrIf} ${IsNativeARM64}
      SetRegView lastused
    ${EndIf}

    ; Add the registry keys for allowed certificates.
    ${AddMaintCertKeys}

    ; If the maintenance service is already installed, do nothing.
    ; The maintenance service will launch:
    ; maintenanceservice_installer.exe /Upgrade to upgrade the maintenance
    ; service if necessary.   If the update was done from updater.exe without
    ; the service (i.e. service is failing), updater.exe will do the update of
    ; the service.  The reasons we do not do it here is because we don't want
    ; to have to prompt for limited user accounts when the service isn't used
    ; and we currently call the PostUpdate twice, once for the user and once
    ; for the SYSTEM account.  Also, this would stop the maintenance service
    ; and we need a return result back to the service when run that way.
    ${If} $5 == ""
      ; An install of maintenance service was never attempted.
      ; We know we are an Admin and that we have write access into HKLM
      ; based on the above checks, so attempt to just run the EXE.
      ; In the worst case, in case there is some edge case with the
      ; IsAdmin check and the permissions check, the maintenance service
      ; will just fail to be attempted to be installed.
      nsExec::Exec "$\"$INSTDIR\maintenanceservice_installer.exe$\""
    ${EndIf}
  ${EndIf}
!endif

  ${WriteToastNotificationRegistration} $TmpVal
!macroend
!define PostUpdate "!insertmacro PostUpdate"

; Update the last modified time on the Start Menu shortcut, so that its icon
; gets refreshed. Should be called on Win8+ after UpdateShortcutBranding.
!macro TouchStartMenuShortcut
  ${If} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
    FileOpen $0 "$SMPROGRAMS\${BrandShortName}.lnk" a
    ${IfNot} ${Errors}
      System::Call '*(i, i) p .r1'
      System::Call 'kernel32::GetSystemTimeAsFileTime(p r1)'
      System::Call 'kernel32::SetFileTime(p r0, i 0, i 0, p r1) i .r2'
      System::Free $1
      FileClose $0
    ${EndIf}
  ${EndIf}
!macroend
!define TouchStartMenuShortcut "!insertmacro TouchStartMenuShortcut"

!macro SetAsDefaultAppGlobal
  ${RemoveDeprecatedKeys} ; Does not use SHCTX

  SetShellVarContext all      ; Set SHCTX to all users (e.g. HKLM)
  ${SetHandlersMail} ; Uses SHCTX
  ${SetHandlersNews} ; Uses SHCTX
  ${SetClientsMail} "HKLM"
  ${SetClientsNews} "HKLM"
  ${SetClientsCalendar} "HKLM"
  ${SetMailClientForMapi} "HKLM"
  ${ShowShortcuts}
!macroend
!define SetAsDefaultAppGlobal "!insertmacro SetAsDefaultAppGlobal"

!macro SetMailClientForMapi RegKey
  WriteRegStr ${RegKey} "Software\Clients\Mail" "" "${ClientsRegName}"
!macroend
!define SetMailClientForMapi "!insertmacro SetMailClientForMapi"

!macro HideShortcuts
  StrCpy $R1 "Software\Clients\Mail\${ClientsRegName}\InstallInfo"
  WriteRegDWORD HKLM "$R1" "IconsVisible" 0
  WriteRegDWORD HKCU "$R1" "IconsVisible" 0

  SetShellVarContext all  ; Set $DESKTOP to All Users
  ${Unless} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
    SetShellVarContext current  ; Set $DESKTOP to the current user's desktop
  ${EndUnless}

  ${If} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
    ShellLink::GetShortCutArgs "$DESKTOP\${BrandShortName}.lnk"
    Pop $0
    ${If} "$0" == ""
      ShellLink::GetShortCutTarget "$DESKTOP\${BrandShortName}.lnk"
      Pop $0
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR\${FileMainEXE}"
        Delete "$DESKTOP\${BrandShortName}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  SetShellVarContext all  ; Set $SMPROGRAMS to All Users
  ${Unless} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
    SetShellVarContext current  ; Set $SMPROGRAMS to the current user's Start
                                ; Menu Programs directory
  ${EndUnless}

  ${If} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
    ShellLink::GetShortCutArgs "$SMPROGRAMS\${BrandShortName}.lnk"
    Pop $0
    ${If} "$0" == ""
      ShellLink::GetShortCutTarget "$SMPROGRAMS\${BrandShortName}.lnk"
      Pop $0
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR\${FileMainEXE}"
        Delete "$SMPROGRAMS\${BrandShortName}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} ${FileExists} "$QUICKLAUNCH\${BrandShortName}.lnk"
    ShellLink::GetShortCutArgs "$QUICKLAUNCH\${BrandShortName}.lnk"
    Pop $0
    ${If} "$0" == ""
      ShellLink::GetShortCutTarget "$QUICKLAUNCH\${BrandShortName}.lnk"
      Pop $0
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR\${FileMainEXE}"
        Delete "$QUICKLAUNCH\${BrandShortName}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!define HideShortcuts "!insertmacro HideShortcuts"

; Adds shortcuts for this installation. This should also add the application
; to Open With for the file types the application handles (bug 370480).
!macro ShowShortcuts
  StrCpy $R1 "Software\Clients\Mail\${ClientsRegName}\InstallInfo"
  WriteRegDWORD HKLM "$R1" "IconsVisible" 1
  WriteRegDWORD HKCU "$R1" "IconsVisible" 1

  SetShellVarContext all  ; Set $DESKTOP to All Users
  ${Unless} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
    CreateShortCut "$DESKTOP\${BrandShortName}.lnk" "$INSTDIR\${FileMainEXE}"
    ${If} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
      ShellLink::SetShortCutWorkingDirectory "$DESKTOP\${BrandShortName}.lnk" "$INSTDIR"
      ${If} "$AppUserModelID" != ""
        ApplicationID::Set "$DESKTOP\${BrandShortName}.lnk" "$AppUserModelID" "true"
      ${EndIf}
    ${Else}
      SetShellVarContext current  ; Set $DESKTOP to the current user's desktop
      ${Unless} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
        CreateShortCut "$DESKTOP\${BrandShortName}.lnk" "$INSTDIR\${FileMainEXE}"
        ${If} ${FileExists} "$DESKTOP\${BrandShortName}.lnk"
          ShellLink::SetShortCutWorkingDirectory "$DESKTOP\${BrandShortName}.lnk" \
                                                 "$INSTDIR"
          ${If} "$AppUserModelID" != ""
            ApplicationID::Set "$DESKTOP\${BrandShortName}.lnk" "$AppUserModelID" "true"
          ${EndIf}
        ${EndIf}
      ${EndUnless}
    ${EndIf}
  ${EndUnless}

  SetShellVarContext all  ; Set $SMPROGRAMS to All Users
  ${Unless} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
    CreateShortCut "$SMPROGRAMS\${BrandShortName}.lnk" "$INSTDIR\${FileMainEXE}"
    ${If} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
      ShellLink::SetShortCutWorkingDirectory "$SMPROGRAMS\${BrandShortName}.lnk" \
                                             "$INSTDIR"
      ${If} "$AppUserModelID" != ""
        ApplicationID::Set "$SMPROGRAMS\${BrandShortName}.lnk" "$AppUserModelID" "true"
      ${EndIf}
    ${Else}
      SetShellVarContext current  ; Set $SMPROGRAMS to the current user's Start
                                  ; Menu Programs directory
      ${Unless} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
        CreateShortCut "$SMPROGRAMS\${BrandShortName}.lnk" "$INSTDIR\${FileMainEXE}"
        ${If} ${FileExists} "$SMPROGRAMS\${BrandShortName}.lnk"
          ShellLink::SetShortCutWorkingDirectory "$SMPROGRAMS\${BrandShortName}.lnk" \
                                                 "$INSTDIR"
          ${If} "$AppUserModelID" != ""
            ApplicationID::Set "$SMPROGRAMS\${BrandShortName}.lnk" "$AppUserModelID" "true"
          ${EndIf}
        ${EndIf}
      ${EndUnless}
    ${EndIf}
  ${EndUnless}
!macroend
!define ShowShortcuts "!insertmacro ShowShortcuts"

; Update the branding name on all shortcuts our installer created
; to convert from BrandFullName (which is what we used to name shortcuts)
; to BrandShortName (which is what we now name shortcuts). We only rename
; desktop and start menu shortcuts, because touching taskbar pins often
; (but inconsistently) triggers various broken behaviors in the shell.
; This assumes SHCTX is set correctly.
!macro UpdateShortcutsBranding
  ${UpdateOneShortcutBranding} "STARTMENU" "$SMPROGRAMS"
  ${UpdateOneShortcutBranding} "DESKTOP" "$DESKTOP"
!macroend
!define UpdateShortcutsBranding "!insertmacro UpdateShortcutsBranding"

!macro UpdateOneShortcutBranding LOG_SECTION SHORTCUT_DIR
  ; Only try to rename the shortcuts found in the shortcuts log, to avoid
  ; blowing away a name that the user created.
  ${GetLongPath} "$INSTDIR\uninstall\${SHORTCUTS_LOG}" $R9
  ${If} ${FileExists} "$R9"
    ClearErrors
    ; The shortcuts log contains a numbered list of entries for each section,
    ; but we never actually create more than one.
    ReadINIStr $R8 "$R9" "${LOG_SECTION}" "Shortcut0"
    ${IfNot} ${Errors}
      ${If} ${FileExists} "${SHORTCUT_DIR}\$R8"
        ShellLink::GetShortCutTarget "${SHORTCUT_DIR}\$R8"
        Pop $R7
        ${GetLongPath} "$R7" $R7
        ${If} $R7 == "$INSTDIR\${FileMainEXE}"
        ${AndIf} $R8 != "${BrandShortName}.lnk"
        ${AndIfNot} ${FileExists} "${SHORTCUT_DIR}\${BrandShortName}.lnk"
          ClearErrors
          Rename "${SHORTCUT_DIR}\$R8" "${SHORTCUT_DIR}\${BrandShortName}.lnk"
          ${IfNot} ${Errors}
            ; Update the shortcut log manually instead of calling LogShortcut
            ; because it would add a Shortcut1 entry, and we really do want to
            ; overwrite the existing entry 0, since we just renamed the file.
            WriteINIStr "$R9" "${LOG_SECTION}" "Shortcut0" \
                        "${BrandShortName}.lnk"
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!define UpdateOneShortcutBranding "!insertmacro UpdateOneShortcutBranding"

!macro SetHandlersMail
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8

  StrCpy $0 "SOFTWARE\Classes"
  StrCpy $1 "$\"$8$\" $\"%1$\""
  StrCpy $2 "$\"$8$\" -osint -compose $\"%1$\""

  ; An empty string is used for the 5th param because ThunderbirdEML is not a
  ; protocol handler
  ${AddHandlerValues} "$0\ThunderbirdEML"  "$1" "$8,0" \
                      "${AppRegNameMail} Document" "" ""
  ${AddHandlerValues} "$0\Thunderbird.Url.mailto"  "$2" "$8,0" "${AppRegNameMail} URL" "delete" ""
  ${AddHandlerValues} "$0\mailto" "$2" "$8,0" "${AppRegNameMail} URL" "true" ""
  ${AddHandlerValues} "$0\Thunderbird.Url.mid"  "$1" "$8,0" "${AppRegNameMail} URL" "delete" ""
  ${AddHandlerValues} "$0\mid" "$1" "$8,0" "${AppRegNameMail} URL" "true" ""

  ; Associate the file handlers with ThunderbirdEML
  ReadRegStr $6 SHCTX ".eml" ""
  ${If} "$6" != "ThunderbirdEML"
    WriteRegStr SHCTX "$0\.eml"   "" "ThunderbirdEML"
  ${EndIf}
!macroend
!define SetHandlersMail "!insertmacro SetHandlersMail"

!macro SetHandlersNews
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  StrCpy $0 "SOFTWARE\Classes"
  StrCpy $1 "$\"$8$\" -osint -mail $\"%1$\""

  ${AddHandlerValues} "$0\Thunderbird.Url.news" "$1" "$8,0" \
                      "${AppRegNameNews} URL" "delete" ""
  ${AddHandlerValues} "$0\news"   "$1" "$8,0" "${AppRegNameNews} URL" "true" ""
  ${AddHandlerValues} "$0\nntp"   "$1" "$8,0" "${AppRegNameNews} URL" "true" ""
  ${AddHandlerValues} "$0\snews"  "$1" "$8,0" "${AppRegNameNews} URL" "true" ""
!macroend
!define SetHandlersNews "!insertmacro SetHandlersNews"

!macro SetHandlersCalendar
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8

  StrCpy $0 "SOFTWARE\Classes"
  StrCpy $1 "$\"$8$\" $\"%1$\""

  ${AddHandlerValues} "$0\Thunderbird.Url.webcal"  "$1" "$8,0" "${AppRegNameCalendar} URL" "delete" ""
  ${AddHandlerValues} "$0\webcal" "$1" "$8,0" "${AppRegNameCalendar} URL" "true" ""
  ${AddHandlerValues} "$0\webcals" "$1" "$8,0" "${AppRegNameCalendar} URL" "true" ""
  ; An empty string is used for the 5th param because ThunderbirdICS is not a
  ; protocol handler
  ${AddHandlerValues} "$0\ThunderbirdICS" "$1" "$8,0" \
                      "${AppRegNameCalendar} Document" "" ""

  ;; Associate the file handlers with ThunderbirdICS
  ReadRegStr $6 SHCTX ".ics" ""
  ${If} "$6" != "ThunderbirdICS"
    WriteRegStr SHCTX "$0\.ics"   "" "ThunderbirdICS"
  ${EndIf}
!macroend
!define SetHandlersCalendar "!insertmacro SetHandlersCalendar"

; XXXrstrong - there are several values that will be overwritten by and
; overwrite other installs of the same application.
!macro SetClientsMail RegKey
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  ${GetLongPath} "$INSTDIR\uninstall\helper.exe" $7
  ${GetLongPath} "$INSTDIR\mozMapi32_InUse.dll" $6

  StrCpy $0 "Software\Clients\Mail\${ClientsRegName}"

  WriteRegStr ${RegKey} "$0" "" "${ClientsRegName}"
  WriteRegStr ${RegKey} "$0\DefaultIcon" "" "$8,0"
  WriteRegStr ${RegKey} "$0" "DLLPath" "$6"

  ; The MapiProxy dll can exist in multiple installs of the application.
  ; Registration occurs as follows with the last action to occur being the one
  ; that wins:
  ; On install and software update when helper.exe runs with the /PostUpdate
  ; argument. On setting the application as the system's default application
  ; using Window's "Set program access and defaults".

  !ifndef NO_LOG
    ${LogHeader} "DLL Registration"
  !endif
  ClearErrors
  ${RegisterDLL} "$INSTDIR\MapiProxy_InUse.dll"
  !ifndef NO_LOG
    ${If} ${Errors}
      ${LogMsg} "** ERROR Registering: $INSTDIR\MapiProxy_InUse.dll **"
    ${Else}
      ${LogUninstall} "DLLReg: \MapiProxy_InUse.dll"
      ${LogMsg} "Registered: $INSTDIR\MapiProxy_InUse.dll"
    ${EndIf}
  !endif

  StrCpy $1 "Software\Classes\CLSID\{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"
  WriteRegStr ${RegKey} "$1\LocalServer32" "" "$\"$8$\" /MAPIStartup"
  WriteRegStr ${RegKey} "$1\ProgID" "" "MozillaMapi.1"
  WriteRegStr ${RegKey} "$1\VersionIndependentProgID" "" "MozillaMAPI"
  StrCpy $1 "SOFTWARE\Classes"
  WriteRegStr ${RegKey} "$1\MozillaMapi" "" "Mozilla MAPI"
  WriteRegStr ${RegKey} "$1\MozillaMapi\CLSID" "" "{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"
  WriteRegStr ${RegKey} "$1\MozillaMapi\CurVer" "" "MozillaMapi.1"
  WriteRegStr ${RegKey} "$1\MozillaMapi.1" "" "Mozilla MAPI"
  WriteRegStr ${RegKey} "$1\MozillaMapi.1\CLSID" "" "{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"

  ; The Reinstall Command is defined at
  ; http://msdn.microsoft.com/library/default.asp?url=/library/en-us/shellcc/platform/shell/programmersguide/shell_adv/registeringapps.asp
  WriteRegStr ${RegKey} "$0\InstallInfo" "HideIconsCommand" "$\"$7$\" /HideShortcuts"
  WriteRegStr ${RegKey} "$0\InstallInfo" "ShowIconsCommand" "$\"$7$\" /ShowShortcuts"
  WriteRegStr ${RegKey} "$0\InstallInfo" "ReinstallCommand" "$\"$7$\" /SetAsDefaultAppGlobal"

  ClearErrors
  ReadRegDWORD $1 ${RegKey} "$0\InstallInfo" "IconsVisible"
  ; If the IconsVisible name value pair doesn't exist add it otherwise the
  ; application won't be displayed in Set Program Access and Defaults.
  ${If} ${Errors}
    ${If} ${FileExists} "$QUICKLAUNCH\${BrandShortName}.lnk"
      WriteRegDWORD ${RegKey} "$0\InstallInfo" "IconsVisible" 1
    ${Else}
      WriteRegDWORD ${RegKey} "$0\InstallInfo" "IconsVisible" 0
    ${EndIf}
  ${EndIf}

  WriteRegStr ${RegKey} "$0\shell\open\command" "" "$\"$8$\" -mail"

  WriteRegStr ${RegKey} "$0\shell\properties" "" "$(CONTEXT_OPTIONS)"
  WriteRegStr ${RegKey} "$0\shell\properties\command" "" "$\"$8$\" -options"

  WriteRegStr ${RegKey} "$0\shell\safemode" "" "$(CONTEXT_SAFE_MODE)"
  WriteRegStr ${RegKey} "$0\shell\safemode\command" "" "$\"$8$\" -safe-mode"

  ; Protocols
  StrCpy $1 "$\"$8$\" -osint -compose $\"%1$\""
  StrCpy $2 "$\"$8$\" $\"%1$\""
  ${AddHandlerValues} "$0\Protocols\mailto" "$1" "$8,0" "${AppRegNameMail} URL" "true" ""
  ${AddHandlerValues} "$0\Protocols\mid" "$2" "$8,0" "${AppRegNameMail} URL" "true" ""

  ; Capabilities registry keys
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationDescription" "$(REG_APP_DESC)"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationIcon" "$8,0"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationName" "${AppRegNameMail}"
  WriteRegStr ${RegKey} "$0\Capabilities\FileAssociations" ".eml"   "ThunderbirdEML"
  WriteRegStr ${RegKey} "$0\Capabilities\FileAssociations" ".wdseml" "ThunderbirdEML"
  WriteRegStr ${RegKey} "$0\Capabilities\StartMenu" "Mail" "${ClientsRegName}"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "mailto" "Thunderbird.Url.mailto"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "mid" "Thunderbird.Url.mid"

  ; Registered Application
  WriteRegStr ${RegKey} "Software\RegisteredApplications" "${AppRegNameMail}" "$0\Capabilities"
!macroend
!define SetClientsMail "!insertmacro SetClientsMail"

; Add registry keys to support the Thunderbird 32 bit to 64 bit migration.
; These registry entries are not removed on uninstall at this time. After the
; Thunderbird 32 bit to 64 bit migration effort is completed these registry
; entries can be removed during install, post update, and uninstall.
!macro Set32to64DidMigrateReg
  ${GetLongPath} "$INSTDIR" $1
  ; These registry keys are always in the 32 bit hive since they are never
  ; needed by a Thunderbird 64 bit install unless it has been updated from
  ; Thunderbird 32 bit.
  SetRegView 32

!ifdef HAVE_64BIT_BUILD

  ; Running Thunderbird 64 bit on Windows 64 bit
  ClearErrors
  ReadRegDWORD $2 HKLM "Software\Mozilla\${AppName}\32to64DidMigrate" "$1"
  ; If there were no errors then the system was updated from Thunderbird 32 bit
  ; to Thunderbird 64 bit and if the value is already 1 then the registry value
  ; has already been updated in the HKLM registry.
  ${IfNot} ${Errors}
  ${AndIf} $2 != 1
    ClearErrors
    WriteRegDWORD HKLM "Software\Mozilla\${AppName}\32to64DidMigrate" "$1" 1
    ${If} ${Errors}
      ; There was an error writing to HKLM so just write it to HKCU
      WriteRegDWORD HKCU "Software\Mozilla\${AppName}\32to64DidMigrate" "$1" 1
    ${Else}
      ; This will delete the value from HKCU if it exists
      DeleteRegValue HKCU "Software\Mozilla\${AppName}\32to64DidMigrate" "$1"
    ${EndIf}
  ${EndIf}

  ClearErrors
  ReadRegDWORD $2 HKCU "Software\Mozilla\${AppName}\32to64DidMigrate" "$1"
  ; If there were no errors then the system was updated from Thunderbird 32 bit
  ; to Thunderbird 64 bit and if the value is already 1 then the registry value
  ; has already been updated in the HKCU registry.
  ${IfNot} ${Errors}
  ${AndIf} $2 != 1
    WriteRegDWORD HKCU "Software\Mozilla\${AppName}\32to64DidMigrate" "$1" 1
  ${EndIf}

!else

  ; Running Thunderbird 32 bit
  ${If} ${RunningX64}
  ${OrIf} ${IsNativeARM64}
    ; Running Thunderbird 32 bit on a Windows 64 bit system
    ClearErrors
    ReadRegDWORD $2 HKLM "Software\Mozilla\${AppName}\32to64DidMigrate" "$1"
    ; If there were errors the value doesn't exist yet.
    ${If} ${Errors}
      ClearErrors
      WriteRegDWORD HKLM "Software\Mozilla\${AppName}\32to64DidMigrate" "$1" 0
      ; If there were errors write the value in HKCU.
      ${If} ${Errors}
        WriteRegDWORD HKCU "Software\Mozilla\${AppName}\32to64DidMigrate" "$1" 0
      ${EndIf}
    ${EndIf}
  ${EndIf}

!endif

  ClearErrors
  SetRegView lastused
!macroend
!define Set32to64DidMigrateReg "!insertmacro Set32to64DidMigrateReg"

; XXXrstrong - there are several values that will be overwritten by and
; overwrite other installs of the same application.
!macro SetClientsNews RegKey
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  ${GetLongPath} "$INSTDIR\uninstall\helper.exe" $7
  ${GetLongPath} "$INSTDIR\mozMapi32_InUse.dll" $6

  StrCpy $0 "Software\Clients\News\${ClientsRegName}"

  WriteRegStr ${RegKey} "$0" "" "${ClientsRegName}"
  WriteRegStr ${RegKey} "$0\DefaultIcon" "" "$8,0"
  WriteRegStr ${RegKey} "$0" "DLLPath" "$6"

  ; The MapiProxy dll can exist in multiple installs of the application.
  ; Registration occurs as follows with the last action to occur being the one
  ; that wins:
  ; On install and software update when helper.exe runs with the /PostUpdate
  ; argument. On setting the application as the system's default application
  ; using Window's "Set program access and defaults".

  !ifndef NO_LOG
    ${LogHeader} "DLL Registration"
  !endif
  ClearErrors
  ${RegisterDLL} "$INSTDIR\MapiProxy_InUse.dll"
  !ifndef NO_LOG
    ${If} ${Errors}
      ${LogMsg} "** ERROR Registering: $INSTDIR\MapiProxy_InUse.dll **"
    ${Else}
      ${LogUninstall} "DLLReg: \MapiProxy_InUse.dll"
      ${LogMsg} "Registered: $INSTDIR\MapiProxy_InUse.dll"
    ${EndIf}
  !endif

  StrCpy $1 "Software\Classes\CLSID\{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"
  WriteRegStr ${RegKey} "$1\LocalServer32" "" "$\"$8$\" /MAPIStartup"
  WriteRegStr ${RegKey} "$1\ProgID" "" "MozillaMapi.1"
  WriteRegStr ${RegKey} "$1\VersionIndependentProgID" "" "MozillaMAPI"
  StrCpy $1 "SOFTWARE\Classes"
  WriteRegStr ${RegKey} "$1\MozillaMapi" "" "Mozilla MAPI"
  WriteRegStr ${RegKey} "$1\MozillaMapi\CLSID" "" "{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"
  WriteRegStr ${RegKey} "$1\MozillaMapi\CurVer" "" "MozillaMapi.1"
  WriteRegStr ${RegKey} "$1\MozillaMapi.1" "" "Mozilla MAPI"
  WriteRegStr ${RegKey} "$1\MozillaMapi.1\CLSID" "" "{29F458BE-8866-11D5-A3DD-00B0D0F3BAA7}"

  ; Mail shell/open/command
  WriteRegStr ${RegKey} "$0\shell\open\command" "" "$\"$8$\" -mail"

  ; Capabilities registry keys
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationDescription" "$(REG_APP_DESC)"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationIcon" "$8,0"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationName" "${AppRegNameNews}"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "nntp" "Thunderbird.Url.news"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "news" "Thunderbird.Url.news"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "snews" "Thunderbird.Url.news"

  ; Protocols
  StrCpy $1 "$\"$8$\" -osint -mail $\"%1$\""
  ${AddHandlerValues} "$0\Protocols\nntp" "$1" "$8,0" "${AppRegNameNews} URL" "true" ""
  ${AddHandlerValues} "$0\Protocols\news" "$1" "$8,0" "${AppRegNameNews} URL" "true" ""
  ${AddHandlerValues} "$0\Protocols\snews" "$1" "$8,0" "${AppRegNameNews} URL" "true" ""

  ; Registered Application
  WriteRegStr ${RegKey} "Software\RegisteredApplications" "${AppRegNameNews}" "$0\Capabilities"
!macroend
!define SetClientsNews "!insertmacro SetClientsNews"

!macro SetClientsCalendar RegKey
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  ${GetLongPath} "$INSTDIR\uninstall\helper.exe" $7
  ${GetLongPath} "$INSTDIR\mozMapi32_InUse.dll" $6

  StrCpy $0 "Software\Clients\Calendar\${ClientsRegName}"

  WriteRegStr ${RegKey} "$0" "" "${ClientsRegName}"
  WriteRegStr ${RegKey} "$0\DefaultIcon" "" "$8,0"
  WriteRegStr ${RegKey} "$0" "DLLPath" "$6"

  WriteRegStr ${RegKey} "$0\shell\open\command" "" "$\"$8$\""

  WriteRegStr ${RegKey} "$0\shell\properties" "" "$(CONTEXT_OPTIONS)"
  WriteRegStr ${RegKey} "$0\shell\properties\command" "" "$\"$8$\" -options"

  WriteRegStr ${RegKey} "$0\shell\safemode" "" "$(CONTEXT_SAFE_MODE)"
  WriteRegStr ${RegKey} "$0\shell\safemode\command" "" "$\"$8$\" -safe-mode"

  ; Protocols
  StrCpy $1 "$\"$8$\" $\"%1$\""
  ${AddHandlerValues} "$0\Protocols\webcal" "$1" "$8,0" "${AppRegNameCalendar} URL" "true" ""
  ${AddHandlerValues} "$0\Protocols\webcals" "$1" "$8,0" "${AppRegNameCalendar} URL" "true" ""

  ; Capabilities registry keys
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationDescription" "$(REG_APP_DESC)"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationIcon" "$8,0"
  WriteRegStr ${RegKey} "$0\Capabilities" "ApplicationName" "${AppRegNameCalendar}"
  WriteRegStr ${RegKey} "$0\Capabilities\FileAssociations" ".ics"    "ThunderbirdICS"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "webcal" "Thunderbird.Url.webcal"
  WriteRegStr ${RegKey} "$0\Capabilities\URLAssociations" "webcals" "Thunderbird.Url.webcal"

  ; Registered Application
  WriteRegStr ${RegKey} "Software\RegisteredApplications" "${AppRegNameCalendar}" "$0\Capabilities"
!macroend
!define SetClientsCalendar "!insertmacro SetClientsCalendar"

; Add Software\Mozilla\ registry entries (uses SHCTX).
!macro SetAppKeys
  ${GetLongPath} "$INSTDIR" $8
  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Main"
  ${WriteRegStr2} $TmpVal "$0" "Install Directory" "$8" 0
  ${WriteRegStr2} $TmpVal "$0" "PathToExe" "$8\${FileMainEXE}" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Uninstall"
  ${WriteRegStr2} $TmpVal "$0" "Description" "${BrandFullNameInternal} ${AppVersion} (${ARCH} ${AB_CD})" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})"
  ${WriteRegStr2} $TmpVal  "$0" "" "${AppVersion} (${AB_CD})" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal} ${AppVersion}\bin"
  ${WriteRegStr2} $TmpVal "$0" "PathToExe" "$8\${FileMainEXE}" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal} ${AppVersion}\extensions"
  ${WriteRegStr2} $TmpVal "$0" "Components" "$8\components" 0
  ${WriteRegStr2} $TmpVal "$0" "Plugins" "$8\plugins" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal} ${AppVersion}"
  ${WriteRegStr2} $TmpVal "$0" "GeckoVer" "${GREVersion}" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}"
  ${WriteRegStr2} $TmpVal "$0" "" "${AppVersion}" 0
  ${WriteRegStr2} $TmpVal "$0" "CurrentVersion" "${AppVersion} (${AB_CD})" 0
  ${WriteRegStr2} $TmpVal "$0" "GeckoVersion" "${GREVersion}" 0
!macroend
!define SetAppKeys "!insertmacro SetAppKeys"

; Add uninstall registry entries. This macro tests for write access to determine
; if the uninstall keys should be added to HKLM or HKCU.
!macro SetUninstallKeys
  StrCpy $0 "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BrandFullNameInternal} ${AppVersion} (${ARCH} ${AB_CD})"

  StrCpy $2 ""
  ClearErrors
  WriteRegStr HKLM "$0" "${BrandShortName}InstallerTest" "Write Test"
  ${If} ${Errors}
    ; If the uninstall keys already exist in HKLM don't create them in HKCU
    ClearErrors
    ReadRegStr $2 "HKLM" $0 "DisplayName"
    ${If} $2 == ""
      ; Otherwise we don't have any keys for this product in HKLM so proceed
      ; to create them in HKCU.  Better handling for this will be done in:
      ; Bug 711044 - Better handling for 2 uninstall icons
      StrCpy $1 "HKCU"
      SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
    ${EndIf}
    ClearErrors
  ${Else}
    StrCpy $1 "HKLM"
    SetShellVarContext all     ; Set SHCTX to all users (e.g. HKLM)
    DeleteRegValue HKLM "$0" "${BrandShortName}InstallerTest"
  ${EndIf}

  ${If} $2 == ""
    ${GetLongPath} "$INSTDIR" $8


    ; Write the uninstall registry keys
    ${WriteRegStr2} $1 "$0" "Comments" "${BrandFullNameInternal} ${AppVersion} (${ARCH} ${AB_CD})" 0
    ${WriteRegStr2} $1 "$0" "DisplayIcon" "$8\${FileMainEXE},0" 0
    ${WriteRegStr2} $1 "$0" "DisplayName" "${BrandFullNameInternal} (${ARCH} ${AB_CD})" 0
    ${WriteRegStr2} $1 "$0" "DisplayVersion" "${AppVersion}" 0
    ${WriteRegStr2} $1 "$0" "InstallLocation" "$8" 0
    ${WriteRegStr2} $1 "$0" "Publisher" "Mozilla" 0
    ${WriteRegStr2} $1 "$0" "UninstallString" "$\"$8\uninstall\helper.exe$\"" 0
    ${WriteRegStr2} $1 "$0" "URLInfoAbout" "${URLInfoAbout}" 0
    ${WriteRegStr2} $1 "$0" "URLUpdateInfo" "${URLUpdateInfo}" 0
    ${WriteRegDWORD2} $1 "$0" "NoModify" 1 0
    ${WriteRegDWORD2} $1 "$0" "NoRepair" 1 0

    ${GetSize} "$8" "/S=0K" $R2 $R3 $R4
    ${WriteRegDWORD2} $1 "$0" "EstimatedSize" $R2 0

    ${If} "$TmpVal" == "HKLM"
      SetShellVarContext all     ; Set SHCTX to all users (e.g. HKLM)
    ${Else}
      SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
    ${EndIf}
  ${EndIf}
!macroend
!define SetUninstallKeys "!insertmacro SetUninstallKeys"

; Updates protocol handlers if their registry open command value is for this
; install location (uses SHCTX).
!macro UpdateProtocolHandlers
  ; Store the command to open the app with an url in a register for easy access.
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  StrCpy $0 "SOFTWARE\Classes"
  StrCpy $1 "$\"$8$\" -osint -compose $\"%1$\""
  StrCpy $2 "$\"$8$\" -osint -mail $\"%1$\""
  StrCpy $3 "$\"$8$\" $\"%1$\""

  ; Only set the file and protocol handlers if the existing one under HKCR is
  ; for this install location.
  ${IsHandlerForInstallDir} "ThunderbirdEML" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\ThunderbirdEML" "$3" "$8,0" \
                        "${AppRegNameMail} Document" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "Thunderbird.Url.mailto" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\Thunderbird.Url.mailto" "$1" "$8,0" \
                        "${AppRegNameMail} URL" "delete" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "mailto" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\mailto" "$1" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "Thunderbird.Url.mid" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\Thunderbird.Url.mid" "$3" "$8,0" \
                        "${AppRegNameMail} URL" "delete" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "mid" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\mid" "$3" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "Thunderbird.Url.news" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\Thunderbird.Url.news" "$2" "$8,0" \
                        "${AppRegNameNews} URL" "delete" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "news" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\news" "$2" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "snews" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\snews" "$2" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "nntp" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\nntp" "$2" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "Thunderbird.Url.webcal" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\Thunderbird.Url.webcal" "$3" "$8,0" \
                        "${AppRegNameCalendar} URL" "delete" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "webcal" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\webcal" "$3" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "webcals" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\webcals" "$3" "$8,0" "" "" ""
  ${EndIf}

  ${IsHandlerForInstallDir} "ThunderbirdICS" $R9
  ${If} "$R9" == "true"
    ${AddHandlerValues} "SOFTWARE\Classes\ThunderbirdICS" "$3" "$8,0" \
                        "${AppRegNameCalendar} Document" "" ""
  ${EndIf}
!macroend
!define UpdateProtocolHandlers "!insertmacro UpdateProtocolHandlers"

!ifdef MOZ_MAINTENANCE_SERVICE
; Adds maintenance service certificate keys for the install dir.
; For the cert to work, it must also be signed by a trusted cert for the user.
!macro AddMaintCertKeys
  Push $R0
  ; Allow main Mozilla cert information for updates
  ; This call will push the needed key on the stack
  ServicesHelper::PathToUniqueRegistryPath "$INSTDIR"
  Pop $R0
  ${If} $R0 != ""
    ; More than one certificate can be specified in a different subfolder
    ; for example: $R0\1, but each individual binary can be signed
    ; with at most one certificate.  A fallback certificate can only be used
    ; if the binary is replaced with a different certificate.
    ; We always use the 64bit registry for certs.
    ${If} ${RunningX64}
    ${OrIf} ${IsNativeARM64}
      SetRegView 64
    ${EndIf}
    DeleteRegKey HKLM "$R0"

    ; Setting the Attempted value will ensure that a new Maintenance Service
    ; install will never be attempted again after this from updates.  The value
    ; is used only to see if updates should attempt new service installs.
    WriteRegDWORD HKLM "Software\Mozilla\MaintenanceService" "Attempted" 1

    ; These values associate the allowed certificates for the current
    ; installation.
    WriteRegStr HKLM "$R0\0" "name" "${CERTIFICATE_NAME}"
    WriteRegStr HKLM "$R0\0" "issuer" "${CERTIFICATE_ISSUER}"
    ; These values associate the allowed certificates for the previous
    ;  installation, so that we can update from it cleanly using the
    ;  old updater.exe (which will still have this signature).
    WriteRegStr HKLM "$R0\1" "name" "${CERTIFICATE_NAME_PREVIOUS}"
    WriteRegStr HKLM "$R0\1" "issuer" "${CERTIFICATE_ISSUER_PREVIOUS}"
    ${If} ${RunningX64}
    ${OrIf} ${IsNativeARM64}
      SetRegView lastused
    ${EndIf}
    ClearErrors
  ${EndIf}
  ; Restore the previously used value back
  Pop $R0
!macroend
!define AddMaintCertKeys "!insertmacro AddMaintCertKeys"
!endif

!macro RegisterAccessibleMarshal
  ${RegisterDLL} "$INSTDIR\AccessibleMarshal.dll"
!macroend
!define RegisterAccessibleMarshal "!insertmacro RegisterAccessibleMarshal"

; Removes various registry entries for reasons noted below (does not use SHCTX).
!macro RemoveDeprecatedKeys
  StrCpy $0 "SOFTWARE\Classes"

  ; remove DI and SOC from the .eml class if it exists and contains
  ; thunderbird.exe
  ClearErrors
  ReadRegStr $1 HKLM "$0\.eml\shell\open\command" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKLM "$0\.eml\shell\open\command"
  ${EndUnless}

  ClearErrors
  ReadRegStr $1 HKCU "$0\.eml\shell\open\command" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKCU "$0\.eml\shell\open\command"
  ${EndUnless}

  ClearErrors
  ReadRegStr $1 HKLM "$0\.eml\DefaultIcon" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKLM "$0\.eml\DefaultIcon"
  ${EndUnless}

  ClearErrors
  ReadRegStr $1 HKCU "$0\.eml\DefaultIcon" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKCU "$0\.eml\DefaultIcon"
  ${EndUnless}

  ; Remove the Shredder clients key if its default icon contains thunderbird.exe
  ClearErrors
  ReadRegStr $1 HKLM "SOFTWARE\clients\mail\Shredder\DefaultIcon" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKLM "SOFTWARE\clients\mail\Shredder"
  ${EndUnless}

  ClearErrors
  ReadRegStr $1 HKLM "SOFTWARE\clients\news\Shredder\DefaultIcon" ""
  ${WordFind} "$1" "${FileMainEXE}" "E+1{" $R1
  ${Unless} ${Errors}
    DeleteRegKey HKLM "SOFTWARE\clients\news\Shredder"
  ${EndUnless}

  ; The shim for 1.5.0.10 writes out a set of bogus keys which we need to
  ; cleanup. Intentionally hard coding Mozilla Thunderbird here
  ; as this is the string used by the shim.
  DeleteRegKey HKLM "$0\Mozilla Thunderbird.Url.mailto"
  DeleteRegValue HKLM "Software\RegisteredApplications" "Mozilla Thunderbird"

  ; Remove the app compatibility registry key
  StrCpy $0 "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
  DeleteRegValue HKLM "$0" "$INSTDIR\${FileMainEXE}"
  DeleteRegValue HKCU "$0" "$INSTDIR\${FileMainEXE}"

  ; Remove the SupportUTF8 registry value as it causes MAPI issues on some locales
  ; with non-ASCII characters in file names.
  StrCpy $0 "Software\Clients\Mail\${ClientsRegName}"
  DeleteRegValue HKLM $0 "SupportUTF8"

  ; Unregister deprecated AccessibleHandler.dll.
  ${If} ${FileExists} "$INSTDIR\AccessibleHandler.dll"
    ${UnregisterDLL} "$INSTDIR\AccessibleHandler.dll"
  ${EndIf}
!macroend
!define RemoveDeprecatedKeys "!insertmacro RemoveDeprecatedKeys"

; For updates, adds a pinned shortcut to Task Bar on update for Windows 7
; and 8 if this macro has never been called before and the application
; is default (see PinToTaskBar for more details). This doesn't get called
; for Windows 10 and 11 on updates, so we will never pin on update there.
;
; For installs, adds a taskbar pin if SHOULD_PIN is 1. (Defaults to 1,
; but is controllable through the UI, ini file, and command line flags.)
!macro MigrateTaskBarShortcut SHOULD_PIN
  ${GetShortcutsLogPath} $0
  ${If} ${FileExists} "$0"
    ClearErrors
    ReadINIStr $1 "$0" "TASKBAR" "Migrated"
    ${If} ${Errors}
      ClearErrors
      WriteIniStr "$0" "TASKBAR" "Migrated" "true"
      WriteRegDWORD HKCU \
        "Software\Mozilla\${AppName}\Installer\$AppUserModelID" \
        "WasPinnedToTaskbar" 1
      ${If} "${SHOULD_PIN}" == "1"
        ${PinToTaskBar}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!define MigrateTaskBarShortcut "!insertmacro MigrateTaskBarShortcut"

!define GetPinningSupportedByWindowsVersionWithoutSystemPopup "!insertmacro GetPinningSupportedByWindowsVersionWithoutSystemPopup "

; Starting with Windows 10 (> 10.0.19045.3996) and Windows 11 (> 10.0.22621.2361),
; the OS will show a system popup when trying to pin to the taskbar.
;
; Pass in the variable to put the output into. A '1' means pinning is supported on this
; OS without generating a popup, a '0' means pinning will generate a system popup.
;
;
; More info: a version of Windows was released that introduced a system popup when
; an exe (such as setup.exe) attempts to pin an app to the taskbar.
; We already handle pinning in the onboarding process once Firefox
; launches so we don't want to also attempt to pin it in the installer
; and have the OS ask the user for confirmation without the full context.
;
; The number for that version of windows is still unclear (it might be 22H2 or 23H2)
; and it's not supported by the version of WinVer.nsh we have anyways,
; so instead we are manually retrieving the major, minor, build and ubr numbers
; (Update Build Revision) and confirming that the build numbers work to do pinning
; in the installer.
;
; NOTE: there are currently running Windows where pinning fails and is a no-op. We haven't quite
; determined how to identify when that will happen, and it's so far only been reported
; on the newest versions of Windows. GetPinningSupportedByWindowsVersionWithoutSystemPopup
; will current report that pinning is not supported in these cases, due to reporting
; pinning as not supported on the newest builds of Windows.
;
!macro GetPinningSupportedByWindowsVersionWithoutSystemPopup outvar
  !define pin_lbl lbl_GPSBWVWSP_${__COUNTER__}

  Push $0
  Push $1
  Push $2
  Push $3

  ${WinVerGetMajor} $0
  ${WinVerGetMinor} $1
  ${WinVerGetBuild} $2

  ; Get the UBR; only documented way I could figure out how to get this reliably
  ClearErrors
  ReadRegDWORD $3 HKLM \
    "Software\Microsoft\Windows NT\CurrentVersion" \
    "UBR"

  ; It's not obvious how to use LogicLib itself within a LogicLib custom
  ; operator, so we do everything by hand with `IntCmp`.  The below lines
  ; translate to:
  ; StrCpy ${outvar} '0'  ; default to false
  ; ${If} $0 == 10
  ;   ${If} $1 == 0
  ;     ${If} $2 < 19045
  ;       StrCpy ${outvar} '1'
  ;     ${ElseIf} $2 == 19045
  ;       ; Test Windows 10
  ;       ${If} $3 < 3996
  ;         StrCpy ${outvar} '1'
  ;       ${Endif}
  ;     ; 22000 is the version number that splits between Win 10 and 11
  ;     ${ElseIf} $2 >= 22000
  ;       ; Test Windows 11
  ;       ${If} $2 < 22621
  ;         StrCpy ${outvar} '1'
  ;       ${ElseIf} $2 == 22621
  ;         ${If} $3 < 2361
  ;           StrCpy ${outvar} '1'
  ;         ${EndIf}
  ;       ${EndIf}
  ;     ${EndIf}
  ;  ${Endif}
  ; ${EndIf}

  StrCpy ${outvar} '0' ; default to false on pinning

  ; If the major version is greater than 10, no pinning in setup
  IntCmp $0 10 "" "" ${pin_lbl}_bad

  ; If the minor version is greater than 0, no pinning in setup
  IntCmp $1 0 "" "" ${pin_lbl}_bad

  ; If the build number equals 19045, we have to test the UBR
  ; If it's greater than 19045, then we have to check if
  ; it's a Windows 11 build or not to determine if more testing
  ; is needed
  IntCmp $2 19045 ${pin_lbl}_test_win10 ${pin_lbl}_good ""

  ; If the major number is less than 22000, then we're between
  ; 19046 and 22000, meaning pinning will produce a popup
  IntCmp $2 22000 "" ${pin_lbl}_bad ""

  ${pin_lbl}_test_win11:

  ; If the build number is less than 22621, jump to pinning; if greater than, no pinning
  IntCmp $2 22621 "" ${pin_lbl}_good ${pin_lbl}_bad

  ; Only if the version is 10.0.22621 do we fall through to here
  ; If the UBR is greater than or equal to 2361, jump to no pinning
  ; Otherwise jump to pinning
  IntCmp $3 2361 ${pin_lbl}_bad ${pin_lbl}_good ${pin_lbl}_bad

  ${pin_lbl}_test_win10:

  ; Only if the version is 10.0.19045 or greater (but not Windows 11) do we fall
  ; through to here.
  ; If the UBR is greater than or equal to 3996, jump to no pinning
  IntCmp $3 3996 ${pin_lbl}_bad ${pin_lbl}_good ${pin_lbl}_bad

  ${pin_lbl}_good:

  StrCpy ${outvar} '1'

  ${pin_lbl}_bad:
  !undef pin_lbl

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro _PinningSupportedByWindowsVersionWithoutSystemPopup _ignore _ignore2 _t _f
  !insertmacro _LOGICLIB_TEMP
  ${GetPinningSupportedByWindowsVersionWithoutSystemPopup} $_LOGICLIB_TEMP
  !insertmacro _= $_LOGICLIB_TEMP "1" `${_t}` `${_f}`
!macroend

; The following is to make if statements for the functionality easier. When using an if statement,
; Use IsPinningSupportedByWindowsVersionWithoutSystemPopup like so, instead of GetPinningSupportedByWindowsVersionWithoutSystemPopup:
;
; ${If} ${IsPinningSupportedByWindowsVersionWithoutSystemPopup}
;    ; do something
; ${EndIf}
;
!define IsPinningSupportedByWindowsVersionWithoutSystemPopup `"" PinningSupportedByWindowsVersionWithoutSystemPopup "" `

; Adds a pinned Task Bar shortcut on Windows 7 if there isn't one for the main
; application executable already. Existing pinned shortcuts for the same
; application model ID must be removed first to prevent breaking the pinned
; item's lists but multiple installations with the same application model ID is
; an edgecase. If removing existing pinned shortcuts with the same application
; model ID removes a pinned pinned Start Menu shortcut this will also add a
; pinned Start Menu shortcut.
!macro PinToTaskBar
  StrCpy $8 "false" ; Whether a shortcut had to be created
  ${IsPinnedToTaskBar} "$INSTDIR\${FileMainEXE}" $R9
  ${If} "$R9" == "false"
    ; Find an existing Start Menu shortcut or create one to use for pinning
    ${GetShortcutsLogPath} $0
    ${If} ${FileExists} "$0"
      ClearErrors
      ReadINIStr $1 "$0" "STARTMENU" "Shortcut0"
      ${Unless} ${Errors}
        SetShellVarContext all ; Set SHCTX to all users
        ${Unless} ${FileExists} "$SMPROGRAMS\$1"
          SetShellVarContext current ; Set SHCTX to the current user
            ${Unless} ${FileExists} "$SMPROGRAMS\$1"
            StrCpy $8 "true"
            CreateShortCut "$SMPROGRAMS\$1" "$INSTDIR\${FileMainEXE}"
            ${If} ${FileExists} "$SMPROGRAMS\$1"
              ShellLink::SetShortCutWorkingDirectory "$SMPROGRAMS\$1" \
                                                     "$INSTDIR"
              ${If} "$AppUserModelID" != ""
                ApplicationID::Set "$SMPROGRAMS\$1" "$AppUserModelID" "true"
              ${EndIf}
            ${EndIf}
          ${EndUnless}
        ${EndUnless}

        ${If} ${FileExists} "$SMPROGRAMS\$1"
          ; Count of Start Menu pinned shortcuts before unpinning.
          ${PinnedToStartMenuLnkCount} $R9

          ; Having multiple shortcuts pointing to different installations with
          ; the same AppUserModelID (e.g. side by side installations of the
          ; same version) will make the TaskBar shortcut's lists into an bad
          ; state where the lists are not shown. To prevent this first
          ; uninstall the pinned item.
          ApplicationID::UninstallPinnedItem "$SMPROGRAMS\$1"

          ; Count of Start Menu pinned shortcuts after unpinning.
          ${PinnedToStartMenuLnkCount} $R8

          ; If there is a change in the number of Start Menu pinned shortcuts
          ; assume that unpinning unpinned a side by side installation from
          ; the Start Menu and pin this installation to the Start Menu.
          ${Unless} $R8 == $R9
            ; Pin the shortcut to the Start Menu. 5381 is the shell32.dll
            ; resource id for the "Pin to Start Menu" string.
            InvokeShellVerb::DoIt "$SMPROGRAMS" "$1" "5381"
          ${EndUnless}

          ${If} ${AtMostWaaS} 1809
            ; In Windows 10 the "Pin to Taskbar" resource was removed, so we
            ; can't access the verb that way anymore. We have to create a
            ; command key using the GUID that's assigned to this action and
            ; then invoke that as a verb. This works up until build 1809
            ReadRegStr $R9 HKLM \
              "Software\Microsoft\Windows\CurrentVersion\Explorer\CommandStore\shell\Windows.taskbarpin" \
              "ExplorerCommandHandler"
            WriteRegStr HKCU "Software\Classes\*\shell\${AppRegNameMail}-$AppUserModelID" "ExplorerCommandHandler" $R9
            InvokeShellVerb::DoIt "$SMPROGRAMS" "$1" "${AppRegNameMail}-$AppUserModelID"
            DeleteRegKey HKCU "Software\Classes\*\shell\${AppRegNameMail}-$AppUserModelID"
          ${Else}
            ; In Windows 10 1903 and up, and Windows 11 prior to 22H2, the above no
            ; longer works. We have yet another method for these versions
            ; which is detailed in the PinToTaskbar plugin code.
            ${If} ${IsPinningSupportedByWindowsVersionWithoutSystemPopup}
              PinToTaskbar::Pin "$SMPROGRAMS\$1"
            ${EndIf}
          ${EndIf}

          ; Delete the shortcut if it was created
          ${If} "$8" == "true"
            Delete "$SMPROGRAMS\$1"
          ${EndIf}
        ${EndIf}

        ${If} $TmpVal == "HKCU"
          SetShellVarContext current ; Set SHCTX to the current user
        ${Else}
          SetShellVarContext all ; Set SHCTX to all users
        ${EndIf}
      ${EndUnless}
    ${EndIf}
  ${EndIf}
!macroend
!define PinToTaskBar "!insertmacro PinToTaskBar"

; Removes the application's start menu directory along with its shortcuts if
; they exist and if they exist creates a start menu shortcut in the root of the
; start menu directory (bug 598779). If the application's start menu directory
; is not empty after removing the shortucts the directory will not be removed
; since these additional items were not created by the installer (uses SHCTX).
!macro RemoveStartMenuDir
  ${GetShortcutsLogPath} $0
  ${If} ${FileExists} "$0"
    ; Delete Start Menu Programs shortcuts, directory if it is empty, and
    ; parent directories if they are empty up to but not including the start
    ; menu directory.
    ${GetLongPath} "$SMPROGRAMS" $1
    ClearErrors
    ReadINIStr $2 "$0" "SMPROGRAMS" "RelativePathToDir"
    ${Unless} ${Errors}
      ${GetLongPath} "$1\$2" $2
      ${If} "$2" != ""
        ; Delete shortucts in the Start Menu Programs directory.
        StrCpy $3 0
        ${Do}
          ClearErrors
          ReadINIStr $4 "$0" "SMPROGRAMS" "Shortcut$3"
          ; Stop if there are no more entries
          ${If} ${Errors}
            ${ExitDo}
          ${EndIf}
          ${If} ${FileExists} "$2\$4"
            ShellLink::GetShortCutTarget "$2\$4"
            Pop $5
            ${If} "$INSTDIR\${FileMainEXE}" == "$5"
              Delete "$2\$4"
            ${EndIf}
          ${EndIf}
          IntOp $3 $3 + 1 ; Increment the counter
        ${Loop}
        ; Delete Start Menu Programs directory and parent directories
        ${Do}
          ; Stop if the current directory is the start menu directory
          ${If} "$1" == "$2"
            ${ExitDo}
          ${EndIf}
          ClearErrors
          RmDir "$2"
          ; Stop if removing the directory failed
          ${If} ${Errors}
            ${ExitDo}
          ${EndIf}
          ${GetParent} "$2" $2
        ${Loop}
      ${EndIf}
      DeleteINISec "$0" "SMPROGRAMS"
    ${EndUnless}
  ${EndIf}
!macroend
!define RemoveStartMenuDir "!insertmacro RemoveStartMenuDir"

; Creates the shortcuts log ini file with the appropriate entries if it doesn't
; already exist.
!macro CreateShortcutsLog
  ${GetShortcutsLogPath} $0
  ${Unless} ${FileExists} "$0"
    ${LogStartMenuShortcut} "${BrandShortName}.lnk"
    ${LogQuickLaunchShortcut} "${BrandShortName}.lnk"
    ${LogDesktopShortcut} "${BrandShortName}.lnk"
  ${EndUnless}
!macroend
!define CreateShortcutsLog "!insertmacro CreateShortcutsLog"

; The MAPI DLL's are copied and the copies are used for the MAPI registration
; to lessen file in use errors on application update.
!macro UpgradeMapiDLLs
  ClearErrors
  ${DeleteFile} "$INSTDIR\MapiProxy_InUse.dll"
  ${If} ${Errors}
    ${DeleteFile} "$INSTDIR\MapiProxy_InUse.dll.moz-delete" ; shouldn't exist
    Rename "$INSTDIR\MapiProxy_InUse.dll" "$INSTDIR\MapiProxy_InUse.dll.moz-delete"
    Delete /REBOOTOK "$INSTDIR\MapiProxy_InUse.dll.moz-delete"
  ${EndIf}
  CopyFiles /SILENT "$INSTDIR\MapiProxy.dll" "$INSTDIR\MapiProxy_InUse.dll"

  ClearErrors
  ${DeleteFile} "$INSTDIR\mozMapi32_InUse.dll"
  ${If} ${Errors}
    ${DeleteFile} "$INSTDIR\mozMapi32_InUse.dll.moz-delete" ; shouldn't exist
    Rename "$INSTDIR\mozMapi32_InUse.dll" "$INSTDIR\mozMapi32_InUse.dll.moz-delete"
    Delete /REBOOTOK "$INSTDIR\mozMapi32_InUse.dll.moz-delete"
  ${EndIf}
  CopyFiles /SILENT "$INSTDIR\mozMapi32.dll" "$INSTDIR\mozMapi32_InUse.dll"
!macroend
!define UpgradeMapiDLLs "!insertmacro UpgradeMapiDLLs"

; The files to check if they are in use during (un)install so the restart is
; required message is displayed. All files must be located in the $INSTDIR
; directory.
!macro PushFilesToCheck
  ; The first string to be pushed onto the stack MUST be "end" to indicate
  ; that there are no more files to check in $INSTDIR and the last string
  ; should be ${FileMainEXE} so if it is in use the CheckForFilesInUse macro
  ; returns after the first check.
  Push "end"
  Push "AccessibleMarshal.dll"
  Push "freebl3.dll"
  Push "nssckbi.dll"
  Push "nspr4.dll"
  Push "nssdbm3.dll"
  Push "sqlite3.dll"
  Push "mozsqlite3.dll"
  Push "xpcom.dll"
  Push "crashreporter.exe"
  Push "minidump-analyzer.exe"
  Push "pingsender.exe"
  Push "updater.exe"
  Push "mozwer.dll"
  Push "xpicleanup.exe"
  Push "MapiProxy.dll"
  Push "MapiProxy_InUse.dll"
  Push "mozMapi32.dll"
  Push "mozMapi32_InUse.dll"
  Push "${FileMainEXE}"
!macroend
!define PushFilesToCheck "!insertmacro PushFilesToCheck"

; Helper for updating the shortcut application model IDs.
Function FixShortcutAppModelIDs
  ${If} "$AppUserModelID" != ""
    ${UpdateShortcutAppModelIDs} "$INSTDIR\${FileMainEXE}" "$AppUserModelID" $0
  ${EndIf}
FunctionEnd

; The !ifdef NO_LOG prevents warnings when compiling the installer.nsi due to
; this function only being used by the uninstaller.nsi.
!ifdef NO_LOG

Function SetAsDefaultAppUser
  ; AddTaskbarSC is needed by MigrateTaskBarShortcut, which is called by
  ; SetAsDefaultAppUserHKCU. If this is called via ExecCodeSegment,
  ; MigrateTaskBarShortcut will not see the value of AddTaskbarSC, so we
  ; send it via a register instead.
  StrCpy $R0 $AddTaskbarSC
  ; It is only possible to set this installation of the application as the
  ; Mail handler if it was added to the HKLM Mail
  ; registry keys.
  ; http://support.microsoft.com/kb/297878
  ${GetParameters} $R0

  ClearErrors
  ${GetOptions} "$R0" "Mail" $R1
  ${Unless} ${Errors}
    ; Check if this install location registered as the Mail client
    ClearErrors
    ReadRegStr $0 HKLM "Software\Clients\Mail\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        ; Check if this is running in an elevated process
        ClearErrors
        ${GetParameters} $0
        ${GetOptions} "$0" "/UAC:" $0
        ${If} ${Errors} ; Not elevated
          Call SetAsDefaultMailAppUserHKCU
        ${Else} ; Elevated - execute the function in the unelevated process
          GetFunctionAddress $0 SetAsDefaultMailAppUserHKCU
          UAC::ExecCodeSegment $0
        ${EndIf}

        ; Do we also set TB as default News client? If not we can return
        ClearErrors
        ${GetOptions} "$R0" "News" $R1
        ${If} ${Errors}
          Return
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  ClearErrors
  ${GetOptions} "$R0" "News" $R1
  ${Unless} ${Errors}
    ; Check if this install location registered as the News client
    ClearErrors
    ReadRegStr $0 HKLM "Software\Clients\News\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        ; Check if this is running in an elevated process
        ClearErrors
        ${GetParameters} $0
        ${GetOptions} "$0" "/UAC:" $0
        ${If} ${Errors} ; Not elevated
          Call SetAsDefaultNewsAppUserHKCU
        ${Else} ; Elevated - execute the function in the unelevated process
          GetFunctionAddress $0 SetAsDefaultNewsAppUserHKCU
          UAC::ExecCodeSegment $0
        ${EndIf}
        Return ; Nothing more needs to be done
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  ClearErrors
  ${GetOptions} "$R0" "Calendar" $R1
  ${Unless} ${Errors}
    ; Check if this install location registered as the Calendar client
    ClearErrors
    ReadRegStr $0 HKLM "Software\Clients\Calendar\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        ; Check if this is running in an elevated process
        ClearErrors
        ${GetParameters} $0
        ${GetOptions} "$0" "/UAC:" $0
        ${If} ${Errors} ; Not elevated
          Call SetAsDefaultCalendarAppUserHKCU
        ${Else} ; Elevated - execute the function in the unelevated process
          GetFunctionAddress $0 SetAsDefaultCalendarAppUserHKCU
          UAC::ExecCodeSegment $0
        ${EndIf}
        Return ; Nothing more needs to be done
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  ; The code after ElevateUAC won't be executed when the user:
  ; a) is a member of the administrators group (e.g. elevation is required)
  ; b) is not a member of the administrators group and chooses to elevate
  ${ElevateUAC}

  SetShellVarContext all  ; Set SHCTX to all users (e.g. HKLM)
  ${SetClientsMail} "HKLM"
  ${SetClientsNews} "HKLM"
  ${SetClientsCalendar} "HKLM"

  ${RemoveDeprecatedKeys}
  ${MigrateTaskBarShortcut} "$R0"

  ClearErrors
  ${GetParameters} $0
  ${GetOptions} "$0" "/UAC:" $0
  ${If} ${Errors}
    ClearErrors
    ${GetOptions} "$R0" "Mail" $R1
    ${Unless} ${Errors}
      Call SetAsDefaultMailAppUserHKCU
    ${EndUnless}
    ClearErrors
    ${GetOptions} "$R0" "News" $R1
    ${Unless} ${Errors}
      Call SetAsDefaultNewsAppUserHKCU
    ${EndUnless}
  ${Else}
    ${GetOptions} "$R0" "Mail" $R1
    ${Unless} ${Errors}
      GetFunctionAddress $0 SetAsDefaultMailAppUserHKCU
      UAC::ExecCodeSegment $0
    ${EndUnless}
    ClearErrors
    ${GetOptions} "$R0" "News" $R1
    ${Unless} ${Errors}
      GetFunctionAddress $0 SetAsDefaultNewsAppUserHKCU
      UAC::ExecCodeSegment $0
    ${EndUnless}
  ${EndIf}
FunctionEnd
!define SetAsDefaultAppUser "Call SetAsDefaultAppUser"

!endif

; Sets this installation as the default mailer by setting the registry keys
; under HKEY_CURRENT_USER via registry calls and using the AppAssocReg NSIS
; plugin. This is a function instead of a macro so it is
; easily called from an elevated instance of the binary. Since this can be
; called by an elevated instance logging is not performed in this function.
Function SetAsDefaultMailAppUserHKCU
  ; Only set as the user's Mail client if the StartMenuInternet
  ; registry keys are for this install.
  ClearErrors
  ReadRegStr $0 HKLM "Software\Clients\Mail\${ClientsRegName}\DefaultIcon" ""
  ${Unless} ${Errors}
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        WriteRegStr HKCU "Software\Clients\Mail" "" "${ClientsRegName}"
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)

  ${SetHandlersMail}

  ClearErrors
  ReadRegStr $0 HKLM "Software\RegisteredApplications" "${AppRegNameMail}"
  ; Only register as the handler if the app registry name exists
  ; under the RegisteredApplications registry key.
  ${Unless} ${Errors}
    AppAssocReg::SetAppAsDefaultAll "${AppRegNameMail}"
  ${EndUnless}
FunctionEnd

; The !ifdef NO_LOG prevents warnings when compiling the installer.nsi due to
; this function only being used by SetAsDefaultAppUser.
!ifdef NO_LOG

; Sets this installation as the default news client by setting the registry keys
; under HKEY_CURRENT_USER via registry calls and using the AppAssocReg NSIS
; plugin. This is a function instead of a macro so it is
; easily called from an elevated instance of the binary. Since this can be
; called by an elevated instance logging is not performed in this function.
Function SetAsDefaultNewsAppUserHKCU
  ; Only set as the user's News client if the StartMenuInternet
  ; registry keys are for this install.
  ClearErrors
  ReadRegStr $0 HKLM "Software\Clients\News\${ClientsRegName}\DefaultIcon" ""
  ${Unless} ${Errors}
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        WriteRegStr HKCU "Software\Clients\News" "" "${ClientsRegName}"
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)

  ${SetHandlersNews}

  ClearErrors
  ReadRegStr $0 HKLM "Software\RegisteredApplications" "${AppRegNameNews}"
  ; Only register as the handler if the app registry name exists
  ; under the RegisteredApplications registry key.
  ${Unless} ${Errors}
    AppAssocReg::SetAppAsDefaultAll "${AppRegNameNews}"
  ${EndUnless}
FunctionEnd

; Sets this installation as the default calendar client by setting the registry keys
; under HKEY_CURRENT_USER via registry calls and using the AppAssocReg NSIS
; plugin. This is a function instead of a macro so it is
; easily called from an elevated instance of the binary. Since this can be
; called by an elevated instance logging is not performed in this function.
Function SetAsDefaultCalendarAppUserHKCU
  ; Only set as the user's Calendar client if the StartMenuInternet
  ; registry keys are for this install.
  ClearErrors
  ReadRegStr $0 HKLM "Software\Clients\Calendar\${ClientsRegName}\DefaultIcon" ""
  ${Unless} ${Errors}
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        WriteRegStr HKCU "Software\Clients\Calendar" "" "${ClientsRegName}"
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)

  ${SetHandlersCalendar}

  ClearErrors
  ReadRegStr $0 HKLM "Software\RegisteredApplications" "${AppRegNameCalendar}"
  ; Only register as the handler if the app registry name exists
  ; under the RegisteredApplications registry key.
  ${Unless} ${Errors}
    AppAssocReg::SetAppAsDefaultAll "${AppRegNameCalendar}"
  ${EndUnless}
FunctionEnd

!endif

!macro WriteToastNotificationRegistration RegKey
  ; Find or create a GUID to use for this installation.  For simplicity, We
  ; always update our registration.
  ClearErrors
  ReadRegStr $0 SHCTX "Software\Classes\AppUserModelId\${ToastAumidPrefix}$AppUserModelID" "CustomActivator"
  ${If} "$0" == ""
    ; Create a GUID.
    System::Call "rpcrt4::UuidCreate(g . r0)i"
    ; StringFromGUID2 (which is what System::Call uses internally to stringify
    ; GUIDs) includes braces in its output.  In this case, we want the braces.
  ${EndIf}

  ; Check if this is an ESR release.
  ClearErrors
  ${WordFind} "${UpdateChannel}" "esr" "E#" $1
  ${If} ${Errors}
    StrCpy $1 ""
  ${Else}
    StrCpy $1 " ESR"
  ${EndIf}

  ; Write the following keys and values to the registry.
  ; HKEY_CURRENT_USER\Software\Classes\AppID\{GUID}                                     DllSurrogate    : REG_SZ        = ""
  ;                                   \AppUserModelId\{ToastAumidPrefix}{install hash}  CustomActivator : REG_SZ        = {GUID}
  ;                                                                                     DisplayName     : REG_EXPAND_SZ = {display name}
  ;                                                                                     IconUri         : REG_EXPAND_SZ = {icon path}
  ;                                   \CLSID\{GUID}                                     AppID           : REG_SZ        = {GUID}
  ;                                                \InprocServer32                      (Default)       : REG_SZ        = {notificationserver.dll path}
  ${WriteRegStr2} ${RegKey} "Software\Classes\AppID\$0" "DllSurrogate" "" 0
  ${WriteRegStr2} ${RegKey} "Software\Classes\AppUserModelId\${ToastAumidPrefix}$AppUserModelID" "CustomActivator" "$0" 0
  ${WriteRegStr2} ${RegKey} "Software\Classes\AppUserModelId\${ToastAumidPrefix}$AppUserModelID" "DisplayName" "${BrandFullNameInternal}$1" 0
  ; Sadly, we can't use embedded resources like `firefox.exe,1`.
  ${WriteRegStr2} ${RegKey} "Software\Classes\AppUserModelId\${ToastAumidPrefix}$AppUserModelID" "IconUri" "$INSTDIR\browser\VisualElements\VisualElements_70.png" 0
  ${WriteRegStr2} ${RegKey} "Software\Classes\CLSID\$0" "AppID" "$0" 0
  ${WriteRegStr2} ${RegKey} "Software\Classes\CLSID\$0\InProcServer32" "" "$INSTDIR\notificationserver.dll" 0
!macroend
!define WriteToastNotificationRegistration "!insertmacro WriteToastNotificationRegistration"

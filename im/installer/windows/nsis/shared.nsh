# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

!macro PostUpdate
  ${CreateShortcutsLog}

  ; Remove registry entries for non-existent apps and for apps that point to our
  ; install location in the Software\Mozilla key and uninstall registry entries
  ; that point to our install location for both HKCU and HKLM.
  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
  ${RegCleanMain} "Software\Mozilla"
  ${RegCleanUninstall}

  ; setup the application model id registration value
  ${InitHashAppModelId} "$INSTDIR" "Software\Mozilla\${AppName}\TaskBarIDs"

  ClearErrors
  WriteRegStr HKLM "Software\Mozilla" "${BrandShortName}InstallerTest" "Write Test"
  ${If} ${Errors}
    StrCpy $TmpVal "HKCU" ; used primarily for logging
  ${Else}
    SetShellVarContext all    ; Set SHCTX to all users (e.g. HKLM)
    DeleteRegValue HKLM "Software\Mozilla" "${BrandShortName}InstallerTest"
    StrCpy $TmpVal "HKLM" ; used primarily for logging
    ${RegCleanMain} "Software\Mozilla"
    ${RegCleanUninstall}

    ; Only update the Clients\IM registry key values if they don't exist or
    ; this installation is the same as the one set in those keys.
    ReadRegStr $0 HKLM "Software\Clients\IM\${ClientsRegName}\DefaultIcon" ""
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
    ${EndIf}
    ${If} "$0" == "$INSTDIR"
      ${SetClientsIM}
    ${EndIf}
  ${EndIf}

  ${RemoveDeprecatedKeys}

  ${SetAppKeys}
  ${SetUninstallKeys}

  ; Remove files that may be left behind by the application in the
  ; VirtualStore directory.
  ${CleanVirtualStore}

  ; Remove talkback if it is present (remove after bug 386760 is fixed)
  ${If} ${FileExists} "$INSTDIR\extensions\talkback@mozilla.org\"
    RmDir /r "$INSTDIR\extensions\talkback@mozilla.org\"
  ${EndIf}
!macroend
!define PostUpdate "!insertmacro PostUpdate"

!macro SetAsDefaultAppGlobal
  ${RemoveDeprecatedKeys}

  SetShellVarContext all      ; Set SHCTX to all users (e.g. HKLM)
  ${SetClientsIM}
  ${ShowShortcuts}
  WriteRegStr HKLM "Software\Clients\IM" "" "${ClientsRegName}"
!macroend
!define SetAsDefaultAppGlobal "!insertmacro SetAsDefaultAppGlobal"

; Removes shortcuts for this installation.
!macro HideShortcuts
  StrCpy $R1 "Software\Clients\IM\${ClientsRegName}\InstallInfo"
  WriteRegDWORD HKLM "$R1" "IconsVisible" 0
  SetShellVarContext all  ; Set $DESKTOP to All Users
  ${Unless} ${FileExists} "$DESKTOP\${BrandFullName}.lnk"
    SetShellVarContext current  ; Set $DESKTOP to the current user's desktop
  ${EndUnless}

  ${If} ${FileExists} "$DESKTOP\${BrandFullName}.lnk"
    ShellLink::GetShortCutArgs "$DESKTOP\${BrandFullName}.lnk"
    Pop $0
    ${If} "$0" == ""
      ShellLink::GetShortCutTarget "$DESKTOP\${BrandFullName}.lnk"
      Pop $0
      ; Needs to handle short paths
      ${If} "$0" == "$INSTDIR\${FileMainEXE}"
        Delete "$DESKTOP\${BrandFullName}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ${If} ${FileExists} "$QUICKLAUNCH\${BrandFullName}.lnk"
    ShellLink::GetShortCutArgs "$QUICKLAUNCH\${BrandFullName}.lnk"
    Pop $0
    ${If} "$0" == ""
      ShellLink::GetShortCutTarget "$QUICKLAUNCH\${BrandFullName}.lnk"
      Pop $0
      ; Needs to handle short paths
      ${If} "$0" == "$INSTDIR\${FileMainEXE}"
        Delete "$QUICKLAUNCH\${BrandFullName}.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
!define HideShortcuts "!insertmacro HideShortcuts"

; Adds shortcuts for this installation.
!macro ShowShortcuts
  StrCpy $R1 "Software\Clients\IM\${ClientsRegName}\InstallInfo"
  WriteRegDWORD HKLM "$R1" "IconsVisible" 1
  SetShellVarContext all  ; Set $DESKTOP to All Users
  ${Unless} ${FileExists} "$DESKTOP\${BrandFullName}.lnk"
    CreateShortCut "$DESKTOP\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
    ShellLink::SetShortCutWorkingDirectory "$DESKTOP\${BrandFullName}.lnk" "$INSTDIR"
    ${If} ${AtLeastWin7}
    ${AndIf} "$AppUserModelID" != ""
      ApplicationID::Set "$DESKTOP\${BrandFullName}.lnk" "$AppUserModelID"
    ${EndIf}
    ${Unless} ${FileExists} "$DESKTOP\${BrandFullName}.lnk"
      SetShellVarContext current  ; Set $DESKTOP to the current user's desktop
      ${Unless} ${FileExists} "$DESKTOP\${BrandFullName}.lnk"
        CreateShortCut "$DESKTOP\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
        ShellLink::SetShortCutWorkingDirectory "$DESKTOP\${BrandFullName}.lnk" "$INSTDIR"
        ${If} ${AtLeastWin7}
        ${AndIf} "$AppUserModelID" != ""
          ApplicationID::Set "$DESKTOP\${BrandFullName}.lnk" "$AppUserModelID"
        ${EndIf}
      ${EndUnless}
    ${EndUnless}
  ${EndUnless}
  ${Unless} ${FileExists} "$QUICKLAUNCH\${BrandFullName}.lnk"
    CreateShortCut "$QUICKLAUNCH\${BrandFullName}.lnk" "$INSTDIR\${FileMainEXE}" "" "$INSTDIR\${FileMainEXE}" 0
    ShellLink::SetShortCutWorkingDirectory "$QUICKLAUNCH\${BrandFullName}.lnk" "$INSTDIR"
    ${If} ${AtLeastWin7}
    ${AndIf} "$AppUserModelID" != ""
      ApplicationID::Set "$QUICKLAUNCH\${BrandFullName}.lnk" "$AppUserModelID"
    ${EndIf}
  ${EndUnless}
!macroend
!define ShowShortcuts "!insertmacro ShowShortcuts"


; Adds the HKLM\Software\Clients\IM\INSTANTBIRD.EXE registry
; entries (does not use SHCTX).
;
; The values for StartMenuInternet are only valid under HKLM and there can only
; be one installation registerred under StartMenuInternet per application since
; the key name is derived from the main application executable.
; http://support.microsoft.com/kb/297878
;
; Note: we might be able to get away with using the full path to the
; application executable for the key name in order to support multiple
; installations.
!macro SetClientsIM
  ${GetLongPath} "$INSTDIR\${FileMainEXE}" $8
  ${GetLongPath} "$INSTDIR\uninstall\helper.exe" $7

  StrCpy $0 "Software\Clients\IM\${ClientsRegName}"

  WriteRegStr HKLM "$0" "" "${ClientsRegName}"
  WriteRegStr HKLM "$0\DefaultIcon" "" "$8,0"
  WriteRegStr HKLM "$0" "DLLPath" "$6"
  WriteRegStr HKLM "$0\DefaultIcon" "" "$8,0"

  ; The Reinstall Command is defined at
  ; http://msdn.microsoft.com/library/default.asp?url=/library/en-us/shellcc/platform/shell/programmersguide/shell_adv/registeringapps.asp
  WriteRegStr HKLM "$0\InstallInfo" "HideIconsCommand" "$\"$7$\" /HideShortcuts"
  WriteRegStr HKLM "$0\InstallInfo" "ShowIconsCommand" "$\"$7$\" /ShowShortcuts"
  WriteRegStr HKLM "$0\InstallInfo" "ReinstallCommand" "$\"$7$\" /SetAsDefaultAppGlobal"

  ClearErrors
  ReadRegDWORD $1 HKLM "$0\InstallInfo" "IconsVisible"
  ; If the IconsVisible name value pair doesn't exist add it otherwise the
  ; application won't be displayed in Set Program Access and Defaults.
  ${If} ${Errors}
    ${If} ${FileExists} "$QUICKLAUNCH\${BrandFullName}.lnk"
      WriteRegDWORD HKLM "$0\InstallInfo" "IconsVisible" 1
    ${Else}
      WriteRegDWORD HKLM "$0\InstallInfo" "IconsVisible" 0
    ${EndIf}
  ${EndIf}

  WriteRegStr HKLM "$0\shell\open\command" "" "$8"

  ; options
  WriteRegStr HKLM "$0\shell\properties" "" "$(CONTEXT_OPTIONS)"
  WriteRegStr HKLM "$0\shell\properties\command" "" "$\"$8$\" -preferences"

  ; safemode
  WriteRegStr HKLM "$0\shell\safemode" "" "$(CONTEXT_SAFE_MODE)"
  WriteRegStr HKLM "$0\shell\safemode\command" "" "$\"$8$\" -safe-mode"

  ; Vista Capabilities registry keys
  WriteRegStr HKLM "$0\Capabilities" "ApplicationDescription" "$(REG_APP_DESC)"
  WriteRegStr HKLM "$0\Capabilities" "ApplicationIcon" "$8,0"
  WriteRegStr HKLM "$0\Capabilities" "ApplicationName" "${BrandShortName}"

  ; Vista Registered Application
  WriteRegStr HKLM "Software\RegisteredApplications" "${AppRegName}" "$0\Capabilities"
!macroend
!define SetClientsIM "!insertmacro SetClientsIM"

; Add Software\Mozilla\ registry entries (uses SHCTX).
!macro SetAppKeys
  ${GetLongPath} "$INSTDIR" $8
  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Main"
  ${WriteRegStr2} $TmpVal "$0" "Install Directory" "$8" 0
  ${WriteRegStr2} $TmpVal "$0" "PathToExe" "$8\${FileMainEXE}" 0

  StrCpy $0 "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Uninstall"
  ${WriteRegStr2} $TmpVal "$0" "Description" "${BrandFullNameInternal} (${AppVersion})" 0

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
  ${WriteRegStr2} $TmpVal "$0" "" "${GREVersion}" 0
  ${WriteRegStr2} $TmpVal "$0" "CurrentVersion" "${AppVersion} (${AB_CD})" 0
!macroend
!define SetAppKeys "!insertmacro SetAppKeys"

; Add uninstall registry entries. This macro tests for write access to determine
; if the uninstall keys should be added to HKLM or HKCU.
!macro SetUninstallKeys
  StrCpy $0 "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BrandFullNameInternal} (${AppVersion})"

  WriteRegStr HKLM "$0" "${BrandShortName}InstallerTest" "Write Test"
  ${If} ${Errors}
    StrCpy $1 "HKCU"
    SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
  ${Else}
    StrCpy $1 "HKLM"
    SetShellVarContext all     ; Set SHCTX to all users (e.g. HKLM)
    DeleteRegValue HKLM "$0" "${BrandShortName}InstallerTest"
  ${EndIf}

  ${GetLongPath} "$INSTDIR" $8

  ; Write the uninstall registry keys
  ${WriteRegStr2} $1 "$0" "Comments" "${BrandFullNameInternal}" 0
  ${WriteRegStr2} $1 "$0" "DisplayIcon" "$8\${FileMainEXE},0" 0
  ${WriteRegStr2} $1 "$0" "DisplayName" "${BrandFullNameInternal} (${AppVersion})" 0
  ${WriteRegStr2} $1 "$0" "DisplayVersion" "${AppVersion} (${AB_CD})" 0
  ${WriteRegStr2} $1 "$0" "InstallLocation" "$8" 0
  ${WriteRegStr2} $1 "$0" "Publisher" "Instantbird" 0
  ${WriteRegStr2} $1 "$0" "UninstallString" "$8\uninstall\helper.exe" 0
  ${WriteRegStr2} $1 "$0" "URLInfoAbout" "${URLInfoAbout}" 0
  ${WriteRegStr2} $1 "$0" "URLUpdateInfo" "${URLUpdateInfo}" 0
  ${WriteRegDWORD2} $1 "$0" "NoModify" 1 0
  ${WriteRegDWORD2} $1 "$0" "NoRepair" 1 0

  ${If} "$TmpVal" == "HKLM"
    SetShellVarContext all     ; Set SHCTX to all users (e.g. HKLM)
  ${Else}
    SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)
  ${EndIf}
!macroend
!define SetUninstallKeys "!insertmacro SetUninstallKeys"

; Removes various registry entries for reasons noted below (does not use SHCTX).
!macro RemoveDeprecatedKeys
  ; Remove the app compatibility registry key
  StrCpy $0 "Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers"
  DeleteRegValue HKLM "$0" "$INSTDIR\${FileMainEXE}"
  DeleteRegValue HKCU "$0" "$INSTDIR\${FileMainEXE}"

!macroend
!define RemoveDeprecatedKeys "!insertmacro RemoveDeprecatedKeys"

; Creates the shortcuts log ini file with the appropriate entries if it doesn't
; already exist.
!macro CreateShortcutsLog
  ${GetShortcutsLogPath} $0
  ${Unless} ${FileExists} "$0"
    ; Default to ${BrandFullName} for the Start Menu Folder
    StrCpy $TmpVal "${BrandFullName}"
    ; Prior to Unicode installer the Start Menu directory was written to the
    ; registry and this value can be used to set the Start Menu directory.
    ClearErrors
    ReadRegStr $0 SHCTX "Software\Mozilla\${BrandFullNameInternal}\${AppVersion} (${AB_CD})\Main" "Start Menu Folder"
    ${If} ${Errors}
      ${FindSMProgramsDir} $0
      ${If} "$0" != ""
        StrCpy $TmpVal "$0"
      ${EndIf}
    ${Else}
      StrCpy $TmpVal "$0"
    ${EndUnless}

    ${LogSMProgramsDirRelPath} "$TmpVal"
    ${LogSMProgramsShortcut} "${BrandFullName}.lnk"
    ${LogSMProgramsShortcut} "${BrandFullName} ($(SAFE_MODE)).lnk"
    ${LogQuickLaunchShortcut} "${BrandFullName}.lnk"
    ${LogDesktopShortcut} "${BrandFullName}.lnk"
  ${EndUnless}
!macroend
!define CreateShortcutsLog "!insertmacro CreateShortcutsLog"

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
  Push "sandboxbroker.dll"
  Push "xpcom.dll"
  Push "crashreporter.exe"
  Push "updater.exe"
  Push "xpicleanup.exe"
  Push "${FileMainEXE}"
!macroend
!define PushFilesToCheck "!insertmacro PushFilesToCheck"


; Sets this installation as the default IM app by setting the registry keys
; under HKEY_CURRENT_USER via registry calls and using the AppAssocReg NSIS
; plugin for Vista and above. This is a function instead of a macro so it is
; easily called from an elevated instance of the binary. Since this can be
; called by an elevated instance logging is not performed in this function.
Function SetAsDefaultAppUserHKCU
  ; Only set as the user's IM app if the IM
  ; registry keys are for this install.
  ${StrFilter} "${FileMainEXE}" "+" "" "" $R9
  ClearErrors
  ReadRegStr $0 HKLM "Software\Clients\IM\$R9\DefaultIcon" ""
  ${Unless} ${Errors}
    ${GetPathFromString} "$0" $0
    ${GetParent} "$0" $0
    ${If} ${FileExists} "$0"
      ${GetLongPath} "$0" $0
      ${If} "$0" == "$INSTDIR"
        WriteRegStr HKCU "Software\Clients\IM" "" "$R9"
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  SetShellVarContext current  ; Set SHCTX to the current user (e.g. HKCU)

  ${If} ${AtLeastWinVista}
    ; Only register as the handler on Vista and above if the app registry name
    ; exists under the RegisteredApplications registry key. The protocol and
    ; file handlers set previously at the user level will associate this install
    ; as the default browser.
    ClearErrors
    ReadRegStr $0 HKLM "Software\RegisteredApplications" "${AppRegName}"
    ${Unless} ${Errors}
      AppAssocReg::SetAppAsDefaultAll "${AppRegName}"
    ${EndUnless}
  ${EndIf}
  ${RemoveDeprecatedKeys}
FunctionEnd

; The !ifdef NO_LOG prevents warnings when compiling the installer.nsi due to
; this function only being used by the uninstaller.nsi.
!ifdef NO_LOG

Function SetAsDefaultAppUser
  ; It is only possible to set this installation of the application as the
  ; StartMenuInternet handler if it was added to the HKLM StartMenuInternet
  ; registry keys.
  ; http://support.microsoft.com/kb/297878

  ; Check if this install location registered as the StartMenuInternet client
  ${StrFilter} "${FileMainEXE}" "+" "" "" $R9
  ClearErrors
  ReadRegStr $0 HKLM "Software\Clients\IM\$R9\DefaultIcon" ""
  ${Unless} ${Errors}
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
          Call SetAsDefaultAppUserHKCU
        ${Else} ; Elevated - execute the function in the unelevated process
          GetFunctionAddress $0 SetAsDefaultAppUserHKCU
          UAC::ExecCodeSegment $0
        ${EndIf}
        Return ; Nothing more needs to be done
      ${EndIf}
    ${EndIf}
  ${EndUnless}

  ; The code after ElevateUAC won't be executed on Vista and above when the
  ; user:
  ; a) is a member of the administrators group (e.g. elevation is required)
  ; b) is not a member of the administrators group and chooses to elevate
  ${ElevateUAC}

  ${SetClientsIM}

  SetShellVarContext all  ; Set SHCTX to all users (e.g. HKLM)
  ${RemoveDeprecatedKeys}

  ClearErrors
  ${GetParameters} $0
  ${GetOptions} "$0" "/UAC:" $0
  ${If} ${Errors}
    Call SetAsDefaultAppUserHKCU
  ${Else}
    GetFunctionAddress $0 SetAsDefaultAppUserHKCU
    UAC::ExecCodeSegment $0
  ${EndIf}
FunctionEnd
!define SetAsDefaultAppUser "Call SetAsDefaultAppUser"

!endif

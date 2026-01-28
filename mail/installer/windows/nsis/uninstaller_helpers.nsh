# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

/**
 * Called from the uninstaller's .onInit function not to be confused with the
 * installer's .onInit or the uninstaller's un.onInit functions.
 */
!macro UninstallOnInitCommon

  !ifndef UninstallOnInitCommon
    !insertmacro ElevateUAC
    !insertmacro GetLongPath
    !insertmacro GetOptions
    !insertmacro GetParameters
    !insertmacro GetParent
    !insertmacro UnloadUAC
    !insertmacro UpdateShortcutAppModelIDs
    !insertmacro UpdateUninstallLog

    !verbose push
    !verbose ${_MOZFUNC_VERBOSE}
    !define UninstallOnInitCommon "!insertmacro UninstallOnInitCommonCall"

    Function UninstallOnInitCommon
      ; Prevents breaking apps that don't use SetBrandNameVars
      !ifdef SetBrandNameVars
        ${SetBrandNameVars} "$EXEDIR\distribution\setup.ini"
      !endif

      ; Prevent launching the application when a reboot is required and this
      ; executable is the main application executable
      IfFileExists "$EXEDIR\${FileMainEXE}.moz-upgrade" +1 +4
      MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(WARN_RESTART_REQUIRED_UPGRADE)" IDNO +2
      Reboot
      Quit ; Nothing initialized so no need to call OnEndCommon

      ${GetParent} "$EXEDIR" $INSTDIR
      ${GetLongPath} "$INSTDIR" $INSTDIR
      IfFileExists "$INSTDIR\${FileMainEXE}" +2 +1
      Quit ; Nothing initialized so no need to call OnEndCommon

!ifmacrodef InitHashAppModelId
      ; setup the application model id registration value
      !ifdef AppName
      ${InitHashAppModelId} "$INSTDIR" "Software\Mozilla\${AppName}\TaskBarIDs"
      !endif
!endif

      ; Prevents breaking apps that don't use SetBrandNameVars
      !ifdef SetBrandNameVars
        ${SetBrandNameVars} "$INSTDIR\distribution\setup.ini"
      !endif

      ; Application update uses a directory named tobedeleted in the $INSTDIR to
      ; delete files on OS reboot when they are in use. Try to delete this
      ; directory if it exists.
      ${If} ${FileExists} "$INSTDIR\${TO_BE_DELETED}"
        RmDir /r "$INSTDIR\${TO_BE_DELETED}"
      ${EndIf}

      ; Prevent all operations (e.g. set as default, postupdate, etc.) when a
      ; reboot is required and the executable launched is helper.exe
      IfFileExists "$INSTDIR\${FileMainEXE}.moz-upgrade" +1 +4
      MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(WARN_RESTART_REQUIRED_UPGRADE)" IDNO +2
      Reboot
      Quit ; Nothing initialized so no need to call OnEndCommon

      !ifdef HAVE_64BIT_BUILD
        SetRegView 64
      !endif

      ${GetParameters} $R0

      ${Unless} ${Silent}
        ; Manually check for /S in the command line due to Bug 506867
        ClearErrors
        ${GetOptions} "$R0" "/S" $R2
        ${Unless} ${Errors}
          SetSilent silent
        ${Else}
          ; Support for the deprecated -ms command line argument.
          ClearErrors
          ${GetOptions} "$R0" "-ms" $R2
          ${Unless} ${Errors}
            SetSilent silent
          ${EndUnless}
        ${EndUnless}
      ${EndUnless}

      StrCmp "$R0" "" continue hideshortcuts

      ; Require elevation if the user can elevate
      hideshortcuts:
      ClearErrors
      ${GetOptions} "$R0" "/HideShortcuts" $R2
      IfErrors showshortcuts +1
!ifndef NONADMIN_ELEVATE
      ${ElevateUAC}
!endif
      ${HideShortcuts}
      GoTo finish

      ; Require elevation if the user can elevate
      showshortcuts:
      ClearErrors
      ${GetOptions} "$R0" "/ShowShortcuts" $R2
      IfErrors defaultappuser +1
!ifndef NONADMIN_ELEVATE
      ${ElevateUAC}
!endif
      ${ShowShortcuts}
      GoTo finish

      ; Require elevation if the the StartMenuInternet registry keys require
      ; updating and the user can elevate
      defaultappuser:
      ClearErrors
      ${GetOptions} "$R0" "/SetAsDefaultAppUser" $R2
      IfErrors defaultappglobal +1
      ${SetAsDefaultAppUser}
      GoTo finish

      ; Require elevation if the user can elevate
      defaultappglobal:
      ClearErrors
      ${GetOptions} "$R0" "/SetAsDefaultAppGlobal" $R2
      IfErrors postupdate +1
      ${ElevateUAC}
      ${SetAsDefaultAppGlobal}
      GoTo finish

      ; Do not attempt to elevate. The application launching this executable is
      ; responsible for elevation if it is required.
      postupdate:
      ${WordReplace} "$R0" "$\"" "" "+" $R0
      ClearErrors
      ${GetOptions} "$R0" "/PostUpdate" $R2
      IfErrors continue +1
      ; If the uninstall.log does not exist don't perform post update
      ; operations. This prevents updating the registry for zip builds.
      IfFileExists "$EXEDIR\uninstall.log" +2 +1
      Quit ; Nothing initialized so no need to call OnEndCommon
      ${PostUpdate}
      ClearErrors
      ${GetOptions} "$R0" "/UninstallLog=" $R2
      IfErrors updateuninstalllog +1
      StrCmp "$R2" "" finish +1
      GetFullPathName $R3 "$R2"
      IfFileExists "$R3" +1 finish
      Delete "$INSTDIR\uninstall\*wizard*"
      Delete "$INSTDIR\uninstall\uninstall.log"
      CopyFiles /SILENT /FILESONLY "$R3" "$INSTDIR\uninstall\"
      ${GetParent} "$R3" $R4
      Delete "$R3"
      RmDir "$R4"
      GoTo finish

      ; Do not attempt to elevate. The application launching this executable is
      ; responsible for elevation if it is required.
      updateuninstalllog:
      ${UpdateUninstallLog}

      finish:
      ${UnloadUAC}
      ${RefreshShellIcons}
      Quit ; Nothing initialized so no need to call OnEndCommon

      continue:

      ; If the uninstall.log does not exist don't perform uninstall
      ; operations. This prevents running the uninstaller for zip builds.
      IfFileExists "$INSTDIR\uninstall\uninstall.log" +2 +1
      Quit ; Nothing initialized so no need to call OnEndCommon

      ; When silent, try to avoid elevation if we have a chance to succeed.  We
      ; can succeed when we can write to (hence delete from) the install
      ; directory and when we can clean up all registry entries.  Now, the
      ; installer when elevated writes privileged registry entries for the use
      ; of the Maintenance Service, even when the service is not and will not be
      ; installed.  (In fact, even when a service installed in the future will
      ; never update the installation, for example due to not being in a
      ; privileged location.)  In practice this means we can only truly silently
      ; remove an unelevated install: an elevated installer writing to an
      ; unprivileged install directory will still write privileged registry
      ; entries, requiring an elevated uninstaller to completely clean up.
      ;
      ; This avoids a wrinkle, whereby an uninstaller which runs unelevated will
      ; never itself launch the Maintenance Service uninstaller, because it will
      ; fail to remove its own service registration (removing the relevant
      ; registry key would require elevation).  Therefore the check for the
      ; service being unused will fail, which will prevent running the service
      ; uninstaller.  That's both subtle and possibly leaves the service
      ; registration hanging around, which might be a security risk.
      ;
      ; That is why we look for a privileged service registration for this
      ; installation when deciding to elevate, and elevate unconditionally if we
      ; find one, regardless of the result of the write check that would avoid
      ; elevation.

      ; The reason for requiring elevation, or "" for not required.
      StrCpy $R4 ""

      ${IfNot} ${Silent}
        ; In normal operation, require elevation if the user can elevate so that
        ; we are most likely to succeed.
        StrCpy $R4 "not silent"
      ${EndIf}

      GetTempFileName $R6 "$INSTDIR"
      FileOpen $R5 "$R6" w
      FileWrite $R5 "Write Access Test"
      FileClose $R5
      Delete $R6
      ${If} ${Errors}
        StrCpy $R4 "write"
      ${EndIf}

      !ifdef MOZ_MAINTENANCE_SERVICE
        ; We don't necessarily have $MaintCertKey, so use temporary registers.
        ServicesHelper::PathToUniqueRegistryPath "$INSTDIR"
        Pop $R5

        ${If} $R5 != ""
          ; Always use the 64bit registry for certs on 64bit systems.
          ${If} ${RunningX64}
          ${OrIf} ${IsNativeARM64}
            SetRegView 64
          ${EndIf}

          EnumRegKey $R6 HKLM $R5 0
          ClearErrors

          ${If} ${RunningX64}
          ${OrIf} ${IsNativeARM64}
            SetRegView lastused
          ${EndIf}

          ${IfNot} "$R6" == ""
            StrCpy $R4 "mms"
          ${EndIf}
        ${EndIf}
      !endif

      ${If} "$R4" != ""
        ; In the future, we might not try to elevate to remain truly silent.  Or
        ; we might add a command line arguments to specify behaviour.  One
        ; reason to not do that immediately is that we have no great way to
        ; signal that we exited without taking action.
        ${ElevateUAC}
      ${EndIf}

      ; Now we've elevated, try the write access test again.
      ClearErrors
      GetTempFileName $R6 "$INSTDIR"
      FileOpen $R5 "$R6" w
      FileWrite $R5 "Write Access Test"
      FileClose $R5
      Delete $R6
      ${If} ${Errors}
        ; Nothing initialized so no need to call OnEndCommon
        Quit
      ${EndIf}

      !ifdef MOZ_MAINTENANCE_SERVICE
        ; And verify that if we need to, we're going to clean up the registry
        ; correctly.
        ${If} "$R4" == "mms"
          WriteRegStr HKLM "Software\Mozilla" "${BrandShortName}InstallerTest" "Write Test"
          ${If} ${Errors}
            ; Nothing initialized so no need to call OnEndCommon
            Quit
          ${Endif}
          DeleteRegValue HKLM "Software\Mozilla" "${BrandShortName}InstallerTest"
        ${EndIf}
      !endif

      ; If we made it this far then this installer is being used as an uninstaller.
      WriteUninstaller "$EXEDIR\uninstaller.exe"

      ${If} ${Silent}
        StrCpy $R1 "$\"$EXEDIR\uninstaller.exe$\" /S"
      ${Else}
        StrCpy $R1 "$\"$EXEDIR\uninstaller.exe$\""
      ${EndIf}

      ; When the uninstaller is launched it copies itself to the temp directory
      ; so it won't be in use so it can delete itself.
      ExecWait $R1
      ${DeleteFile} "$EXEDIR\uninstaller.exe"
      ${UnloadUAC}
      SetErrorLevel 0
      Quit ; Nothing initialized so no need to call OnEndCommon

    FunctionEnd

    !verbose pop
  !endif
!macroend

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
    StrCpy $RegHive "HKCU"
  ${Else}
    SetShellVarContext all    ; Set SHCTX to all users (e.g. HKLM)
    DeleteRegValue HKLM "Software\Mozilla" "${BrandShortName}InstallerTest"
    StrCpy $RegHive "HKLM"
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
  ${If} $RegHive == "HKLM"
    SetShellVarContext all
  ${ElseIf} $RegHive == "HKCU"
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
  ${AndIf} $RegHive == "HKLM"
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

  ${WriteToastNotificationRegistration} $RegHive
!macroend
!define PostUpdate "!insertmacro PostUpdate"

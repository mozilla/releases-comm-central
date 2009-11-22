# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is the Instantbird messenging client, released
# 2007.
#
# The Initial Developer of the Original Code is
# Florian QUEZE <florian@instantbird.org>.
# Portions created by the Initial Developer are Copyright (C) 2007
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK ***** -->

  <script type="application/javascript" src="chrome://global/content/globalOverlay.js"/>
  <script type="application/javascript" src="chrome://instantbird/content/menus.js"/>

  <stringbundle id="updatesBundle" src="chrome://instantbird/locale/updates.properties"/>
  <stringbundle id="awayBundle" src="chrome://instantbird/locale/away.properties"/>

  <commandset id="maincommandset">
    <command id="accountmanager" oncommand="menus.accounts()"/>
    <command id="cmd_quitApplication" oncommand="goQuitApplication()"/>
  </commandset>

  <keyset id="mainkeyset">
    <key id="accountsetup" key="&account.commandkey;" command="accountmanager" modifiers="accel"/>
    <key id="errorConsoleKey" key="&errorConsoleCmd.commandkey;" oncommand="menus.errors();" modifiers="accel,shift"/>
#ifdef XP_UNIX
    <key id="key_quitApplication" key="&quitApplicationCmdMac.key;" command="cmd_quitApplication" modifiers="accel"/>
#endif
  </keyset>

  <menubar id="blistMenubar">
    <menu label="&file.menu;" id="fileMenu" accesskey="&file.accesskey;">
      <menupopup id="fileMenuPopup" onpopupshowing="menus.updateFileMenuitems();">
        <menuitem id="addBuddyMenuItem" label="&addBuddy;" oncommand="menus.addBuddy()"/>
        <menuitem id="joinChatMenuItem" label="&joinChat;" oncommand="menus.joinChat()"/>
        <menuseparator/>
        <menuitem id="getAwayMenuItem" label="&getAway;" oncommand="menus.getAway()"/>
        <menuseparator id="menu_FileQuitSeparator"/>
        <menuitem id="menu_FileQuitItem"
#ifdef XP_WIN
                  label="&quitApplicationCmdWin.label;"
                  accesskey="&quitApplicationCmdWin.accesskey;"
#else
#ifdef XP_MACOSX
                  label="&quitApplicationCmdMac.label;"
#else
                  label="&quitApplicationCmd.label;"
                  accesskey="&quitApplicationCmd.accesskey;"
#endif
#ifdef XP_UNIX
                  key="key_quitApplication"
#endif
#endif
                  command="cmd_quitApplication"/>
      </menupopup>
    </menu>
    <menu label="&tools.menu;" id="toolsMenu" accesskey="&tools.accesskey;">
#ifdef XP_MACOSX
      <menupopup id="toolsMenuPopup" onpopupshowing="menus.displayUpdateStatus();">
#else
      <menupopup id="toolsMenuPopup">
#endif
        <menuitem id="accountsMenuItem" label="&accountManager;" command="accountmanager" key="accountsetup" accesskey="&account.accesskey;"/>
        <menuitem id="addonsMenuItem" label="&addonManager;" oncommand="menus.addons()"/>
        <menuseparator/>
        <menuitem id="errorConsoleMenuItem" label="&errorConsoleCmd.label;" oncommand="menus.errors()" key="errorConsoleKey" accesskey="&errorConsoleCmd.accesskey;"/>
#ifdef XP_UNIX
#ifdef XP_MACOSX
        <menuseparator/>
        <menuitem id="updatesMenuItem" label="&checkForUpdates;" oncommand="menus.updates()"/>
#else
        <menuseparator id="prefSep"/>
        <menuitem id="menu_preferences"
                  label="&preferencesCmdUnix.label;"
                  accesskey="&preferencesCmdUnix.accesskey;"
                  oncommand="menus.preferences();"/>
#endif
#else
        <menuseparator id="prefSep"/>
        <menuitem id="menu_preferences"
                  label="&preferencesCmd.label;"
                  accesskey="&preferencesCmd.accesskey;"
                  oncommand="menus.preferences();"/>
#endif
      </menupopup>
    </menu>
#ifdef XP_MACOSX
    <!-- Mac window menu -->
#include ../../../mozilla/toolkit/content/macWindowMenu.inc
    <menu label="&help.menu;" id="aboutSeparator" accesskey="&help.accesskey;"><!-- This ID ensures it gets hidden. -->
#else
#ifdef XP_WIN
    <menu label="&helpWin.menu;" id="helpMenu" accesskey="&helpWin.accesskey;">
#else
    <menu label="&help.menu;" id="helpMenu" accesskey="&help.accesskey;">
#endif
#endif
#ifndef XP_MACOSX
      <menupopup id="helpMenuPopup" onpopupshowing="menus.displayUpdateStatus();">
        <menuitem id="updatesMenuItem" label="&checkForUpdates;" oncommand="menus.updates()"/>
        <menuseparator/>
#else
      <menupopup id="helpMenuPopup">
#endif
        <menuitem id="aboutName" label="&about.menu;" oncommand="menus.about()"/>
      </menupopup>
    </menu>
  </menubar>

#ifdef XP_MACOSX
  <!-- nsMenuBarX hides these and uses them to build the Application menu. -->
  <menupopup id="menu_ToolsPopup">
    <menuitem id="menu_preferences" label="&preferencesCmdMac.label;" key="key_preferencesCmdMac" oncommand="menus.preferences();"/>
    <menuitem id="menu_mac_services" label="&servicesMenuMac.label;"/>
    <menuitem id="menu_mac_hide_app" label="&hideThisAppCmdMac.label;" key="key_hideThisAppCmdMac"/>
    <menuitem id="menu_mac_hide_others" label="&hideOtherAppsCmdMac.label;" key="key_hideOtherAppsCmdMac"/>
    <menuitem id="menu_mac_show_all" label="&showAllAppsCmdMac.label;"/>
  </menupopup>
  <!-- These are used to build the Application menu under Cocoa widgets -->
  <keyset id="baseMenuKeyset">
    <key id="key_preferencesCmdMac"
         key="&preferencesCmdMac.commandkey;"
         modifiers="accel"/>
    <key id="key_hideThisAppCmdMac"
         key="&hideThisAppCmdMac.commandkey;"
         modifiers="accel"/>
    <key id="key_hideOtherAppsCmdMac"
         key="&hideOtherAppsCmdMac.commandkey;"
         modifiers="accel,alt"/>
  </keyset>
#endif

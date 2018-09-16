# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

    <hbox id="statusTextBox" ondblclick="openActivityMgr();" flex="1">
      <hbox class="statusbar-progresspanel">
        <toolbarbutton id="offline-status" oncommand="MailOfflineMgr.toggleOfflineStatus();"/>
      </hbox>
      <statusbarpanel id="statusText" label="&statusText.label;" flex="1"/>
      <hbox id="statusbar-progresspanel" class="statusbar-progresspanel statusbarpanel-progress" collapsed="true">
        <html:progress class="progressmeter-statusbar" id="statusbar-icon" value="0" max="100"/>
      </hbox>
      <hbox id="quotaPanel" class="statusbar-progresspanel statusbarpanel-progress" hidden="true">
        <stack>
          <html:progress id="quotaMeter" class="progressmeter-statusbar" value="0" max="100"/>
          <label id="quotaLabel"
                 onclick="gFolderTreeController.editFolder('QuotaTab');" />
        </stack>
      </hbox>
    </hbox>

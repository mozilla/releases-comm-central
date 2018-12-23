# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

  <vbox flex="1" id="copiesAndFolders">
    <stringbundleset id="stringbundleset">
    <stringbundle id="bundle_messenger" src="chrome://messenger/locale/messenger.properties"/>
    </stringbundleset>

    <label hidden="true" wsm_persist="true" id="identity.fccFolder"
                  pref="true" preftype="string" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.fcc_folder"/>
    <label hidden="true" wsm_persist="true" id="identity.draftFolder"
                  pref="true" preftype="string" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.draft_folder"/>
    <label hidden="true" wsm_persist="true" id="identity.archiveFolder"
                  pref="true" preftype="string" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.archive_folder"/>
    <label hidden="true" wsm_persist="true" id="identity.stationeryFolder"
                  pref="true" preftype="string" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.stationary_folder"/>
    <label hidden="true" wsm_persist="true" id="identity.email"/>
    <label hidden="true" wsm_persist="true" id="identity.fccFolderPickerMode"
                  pref="true" preftype="int" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.fcc_folder_picker_mode"/>
    <label hidden="true" wsm_persist="true" id="identity.draftsFolderPickerMode"
                  pref="true" preftype="int" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.drafts_folder_picker_mode"/>
    <label hidden="true" wsm_persist="true" id="identity.archivesFolderPickerMode"
                  pref="true" preftype="int" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.archives_folder_picker_mode"/>
    <label hidden="true" wsm_persist="true" id="identity.tmplFolderPickerMode"
                  pref="true" preftype="int" prefattribute="value"
                  prefstring="mail.identity.%identitykey%.tmpl_folder_picker_mode"/>
    <groupbox id="copiesGroup">
      <label class="header">&sendingPrefix.label;</label>

      <hbox align="center">
        <checkbox wsm_persist="true" id="identity.doFcc" label="&fccMailFolder.label;"
                  accesskey="&fccMailFolder.accesskey;"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.fcc"
                  oncommand="setupFccItems();"/>
      </hbox>
        <radiogroup id="doFcc" aria-labelledby="identity.doFcc">
        <grid class="specialFolderPickerGrid">
          <columns>
            <column/>
            <column flex="1"/>
          </columns>
          <rows>
            <row align="center">
              <radio id="fcc_selectAccount"
                     class="depends-on-do-fcc"
                     value="0" label="&sentFolderOn.label;"
                     accesskey="&sentFolderOn.accesskey;"
                     oncommand="setPickersState('msgFccAccountPicker', 'msgFccFolderPicker', event)"/>
                <menulist id="msgFccAccountPicker"
                          class="folderMenuItem depends-on-do-fcc"
                          aria-labelledby="fcc_selectAccount">
                  <menupopup id="msgFccAccountPopup" type="folder" mode="filing"
                             expandFolders="false"
                             oncommand="noteSelectionChange('fcc', 'Account', event)"/>
                </menulist>
            </row>
            <row align="center">
              <radio id="fcc_selectFolder"
                     class="depends-on-do-fcc"
                     value="1" label="&sentInOtherFolder.label;"
                     accesskey="&sentInOtherFolder.accesskey;"
                     oncommand="setPickersState('msgFccFolderPicker', 'msgFccAccountPicker', event)"/>
                <menulist id="msgFccFolderPicker"
                          class="folderMenuItem depends-on-do-fcc"
                          aria-labelledby="fcc_selectFolder"
                          displayformat="verbose">
                  <menupopup id="msgFccFolderPopup" type="folder" mode="filing"
                             class="menulist-menupopup"
                             showFileHereLabel="true"
                             oncommand="noteSelectionChange('fcc', 'Folder', event)"/>
                </menulist>
            </row>
          </rows>
        </grid>
      </radiogroup>

      <hbox align="center" class="fccReplyFollowsParent" hidable="true" hidefor="nntp,rss">
        <checkbox id="identity.fccReplyFollowsParent" wsm_persist="true"
                  class="depends-on-do-fcc"
                  label="&fccReplyFollowsParent.label;"
                  accesskey="&fccReplyFollowsParent.accesskey;"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.fcc_reply_follows_parent"/>
      </hbox>

      <grid>
        <columns>
          <column/>
          <column flex="1"/>
        </columns>

        <rows>
          <row align="center">
            <checkbox wsm_persist="true" id="identity.doCc" label="&ccAddress.label;"
                  accesskey="&ccAddress.accesskey;"
                  control="identity.doCcList"
                  oncommand="setupCcTextbox();"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.doCc"/>
            <textbox wsm_persist="true" id="identity.doCcList" flex="1"
                  aria-labelledby="identity.doCc"
                  prefstring="mail.identity.%identitykey%.doCcList" class="uri-element"
                  placeholder="&ccAddressList.placeholder;"/>
          </row>
          <row align="center">
            <checkbox wsm_persist="true" id="identity.doBcc" label="&bccAddress.label;"
                  accesskey="&bccAddress.accesskey;"
                  control="identity.doBccList"
                  oncommand="setupBccTextbox();"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.doBcc"/>
            <textbox wsm_persist="true" id="identity.doBccList" flex="1"
                  aria-labelledby="identity.doBcc"
                  prefstring="mail.identity.%identitykey%.doBccList" class="uri-element"
                  placeholder="&bccAddressList.placeholder;"/>
          </row>
        </rows>
      </grid>

    </groupbox>

    <groupbox id="archivesGroup">
      <label class="header">&archivesTitle.label;</label>

      <hbox align="center">
        <checkbox wsm_persist="true" id="identity.archiveEnabled"
                  label="&keepArchives.label;"
                  accesskey="&keepArchives.accesskey;"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.archive_enabled"
                  oncommand="setupArchiveItems();"/>
        <spacer flex="1"/>
        <button id="archiveHierarchyButton"
                class="depends-on-archive"
                label="&archiveHierarchyButton.label;"
                accesskey="&archiveHierarchyButton.accesskey;"
                oncommand="ChangeArchiveHierarchy();"/>
      </hbox>

      <radiogroup id="messageArchives">
        <grid class="specialFolderPickerGrid">
          <columns>
            <column/>
            <column flex="1"/>
          </columns>
          <rows>
            <row align="center">
              <radio id="archive_selectAccount"
                     class="depends-on-archive"
                     value="0" label="&archivesFolderOn.label;"
                     accesskey="&archivesFolderOn.accesskey;"
                     oncommand="setPickersState('msgArchivesAccountPicker', 'msgArchivesFolderPicker', event)"/>
              <menulist id="msgArchivesAccountPicker"
                        class="folderMenuItem depends-on-archive"
                        aria-labelledby="archive_selectAccount">
                <menupopup id="msgArchivesAccountPopup" type="folder" mode="filing"
                           expandFolders="false"
                           oncommand="noteSelectionChange('archive', 'Account', event)"/>
              </menulist>
            </row>
            <row align="center">
              <radio id="archive_selectFolder"
                     class="depends-on-archive"
                     value="1" label="&archiveInOtherFolder.label;"
                     accesskey="&archiveInOtherFolder.accesskey;"
                     oncommand="setPickersState('msgArchivesFolderPicker', 'msgArchivesAccountPicker', event)"/>
              <menulist id="msgArchivesFolderPicker"
                        class="folderMenuItem depends-on-archive"
                        aria-labelledby="archive_selectFolder"
                        displayformat="verbose">
                <menupopup id="msgArchivesFolderPopup" type="folder" mode="filing"
                           class="menulist-menupopup"
                           showFileHereLabel="true"
                           oncommand="noteSelectionChange('archive', 'Folder', event)"/>
              </menulist>
            </row>
          </rows>
        </grid>
      </radiogroup>
    </groupbox>

    <groupbox id="foldersGroup">
      <label class="header">&specialFolders.label;</label>

      <hbox align="center">
        <label value="&keepDrafts2.label;" control="messageDrafts"/>
      </hbox>

      <radiogroup id="messageDrafts">
        <grid class="specialFolderPickerGrid">
          <columns>
            <column/>
            <column flex="1"/>
          </columns>
          <rows>
            <row align="center">
              <radio id="draft_selectAccount"
                     oncommand="setPickersState('msgDraftsAccountPicker', 'msgDraftsFolderPicker', event)"
                     value="0" label="&draftsFolderOn.label;"
                     accesskey="&draftsFolderOn.accesskey;"/>
              <menulist id="msgDraftsAccountPicker"
                        class="folderMenuItem"
                        aria-labelledby="draft_selectAccount">
                <menupopup id="msgDraftAccountPopup" type="folder" mode="filing"
                           expandFolders="false"
                           oncommand="noteSelectionChange('draft', 'Account', event)"/>
              </menulist>
            </row>
            <row align="center">
              <radio id="draft_selectFolder"
                     oncommand="setPickersState('msgDraftsFolderPicker', 'msgDraftsAccountPicker', event)"
                     value="1" label="&draftInOtherFolder.label;"
                     accesskey="&draftInOtherFolder.accesskey;"/>
              <menulist id="msgDraftsFolderPicker"
                        class="folderMenuItem"
                        aria-labelledby="draft_selectFolder"
                        displayformat="verbose">
                <menupopup id="msgDraftFolderPopup" type="folder" mode="filing"
                           class="menulist-menupopup"
                           showFileHereLabel="true"
                           oncommand="noteSelectionChange('draft', 'Folder', event)"/>
              </menulist>
            </row>
          </rows>
        </grid>
      </radiogroup>

      <hbox align="center">
        <label value="&keepTemplates.label;" control="messageTemplates"/>
      </hbox>

      <radiogroup id="messageTemplates">
        <grid class="specialFolderPickerGrid">
          <columns>
            <column/>
            <column flex="1"/>
          </columns>
          <rows>
            <row align="center">
              <radio id="tmpl_selectAccount"
                     oncommand="setPickersState('msgStationeryAccountPicker', 'msgStationeryFolderPicker', event)"
                     value="0" label="&templatesFolderOn.label;"
                     accesskey="&templatesFolderOn.accesskey;"/>
              <menulist id="msgStationeryAccountPicker"
                        class="folderMenuItem"
                        aria-labelledby="tmpl_selectAccount">
                <menupopup id="msgFccAccountPopup" type="folder" mode="filing"
                           expandFolders="false"
                           oncommand="noteSelectionChange('tmpl', 'Account', event)"/>
              </menulist>
            </row>
            <row align="center">
              <radio id="tmpl_selectFolder"
                     oncommand="setPickersState('msgStationeryFolderPicker', 'msgStationeryAccountPicker', event)"
                     value="1" label="&templateInOtherFolder.label;"
                     accesskey="&templateInOtherFolder.accesskey;"/>
              <menulist id="msgStationeryFolderPicker"
                        class="folderMenuItem"
                        aria-labelledby="tmpl_selectFolder"
                        displayformat="verbose">
                <menupopup id="msgTemplFolderPopup" type="folder" mode="filing"
                           class="menulist-menupopup"
                           showFileHereLabel="true"
                           oncommand="noteSelectionChange('tmpl', 'Folder', event)"/>
              </menulist>
            </row>
          </rows>
        </grid>
      </radiogroup>
      <hbox align="center">
        <checkbox wsm_persist="true" id="identity.showSaveMsgDlg" label="&saveMessageDlg.label;"
                  accesskey="&saveMessageDlg.accesskey;"
                  prefattribute="value"
                  prefstring="mail.identity.%identitykey%.showSaveMsgDlg"/>
      </hbox>
    </groupbox>
  </vbox>

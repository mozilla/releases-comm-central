# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import VARIABLE_REFERENCE, transforms_from
from fluent.syntax import ast as FTL


def migrate(ctx):
    """Bug 2069617 - Migrate compose command strings to Fluent, part {index}."""

    source = "mail/chrome/messenger/messengercompose/composeMsgs.properties"
    target = reference = "mail/messenger/messengercompose/messengercompose.ftl"

    address_replacements = {"%1$S": VARIABLE_REFERENCE("address")}
    apostrophe_replacements = {"n't": FTL.TextElement("n’t")}
    brand_replacements = {"%1$S": VARIABLE_REFERENCE("brand")}
    field_replacements = {"%1$S": VARIABLE_REFERENCE("field")}
    filename_replacements = {"%1$S": VARIABLE_REFERENCE("filename")}
    folder_replacements = {"%1$S": VARIABLE_REFERENCE("folder")}
    identity_replacements = {"%1$S": VARIABLE_REFERENCE("identity")}
    provider_replacements = {"%1$S": VARIABLE_REFERENCE("provider")}
    provider_filename_replacements = {
        "%1$S": VARIABLE_REFERENCE("provider"),
        "%2$S": VARIABLE_REFERENCE("filename"),
    }
    save_success_replacements = {
        "%1$S": VARIABLE_REFERENCE("folder"),
        "%2$S": VARIABLE_REFERENCE("server"),
    }
    url_replacements = {"%1$S": VARIABLE_REFERENCE("url")}
    window_title_replacements = {
        "%1$S": VARIABLE_REFERENCE("subject"),
        "%2$S": VARIABLE_REFERENCE("brand"),
    }

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
compose-initialization-error-title = { COPY(from_path, "initErrorDlogTitle") }
compose-initialization-error = { COPY(from_path, "initErrorDlgMessage") }
compose-default-subject = { COPY(from_path, "defaultSubject") }
compose-window-title = { REPLACE(from_path, "windowTitleWrite", window_title_replacements) }
compose-save-message-title = { COPY(from_path, "saveDlogTitle") }
compose-save-message-prompt = { REPLACE(from_path, "saveDlogMessages3", folder_replacements) }
compose-discard-changes-button = { COPY(from_path, "discardButtonLabel") }
compose-send-confirm-title = { COPY(from_path, "sendMessageCheckWindowTitle") }
compose-send-confirm-prompt = { COPY(from_path, "sendMessageCheckLabel") }
compose-send-confirm-button = { COPY(from_path, "sendMessageCheckSendButtonLabel") }
compose-do-not-show-again = { COPY(from_path, "CheckMsg") }
compose-empty-subject-title = { COPY(from_path, "subjectEmptyTitle") }
compose-empty-subject-prompt = { REPLACE(from_path, "subjectEmptyMessage", apostrophe_replacements) }
compose-empty-subject-send-button = { COPY(from_path, "sendWithEmptySubjectButton") }
compose-empty-subject-cancel-button = { COPY(from_path, "cancelSendingButton") }
compose-attachment-reminder-title = { COPY(from_path, "attachmentReminderTitle") }
compose-attachment-reminder-prompt = { COPY(from_path, "attachmentReminderMsg") }
compose-attachment-reminder-send-button = { COPY(from_path, "attachmentReminderFalseAlarm") }
compose-attachment-reminder-add-button = { COPY(from_path, "attachmentReminderYesIForgot") }
compose-newsgroups-not-supported-title = { COPY(from_path, "noNewsgroupSupportTitle") }
compose-newsgroups-not-supported = { COPY(from_path, "recipientDlogMessage") }
compose-invalid-address-title = { COPY(from_path, "addressInvalidTitle") }
compose-no-recipients = { COPY(from_path, "noRecipients") }
compose-invalid-address = { REPLACE(from_path, "addressInvalid", address_replacements) }
compose-quit-sending-title = { COPY(from_path, "quitComposeWindowTitle") }
compose-quit-saving-title = { COPY(from_path, "quitComposeWindowSaveTitle") }
compose-quit-sending-prompt = { REPLACE(from_path, "quitComposeWindowMessage2", brand_replacements) }
compose-quit-saving-prompt = { REPLACE(from_path, "quitComposeWindowSaveMessage", brand_replacements) }
compose-quit-button = { COPY(from_path, "quitComposeWindowQuitButtonLabel2") }
compose-wait-button = { COPY(from_path, "quitComposeWindowWaitButtonLabel2") }
compose-attach-file-picker-title = { COPY(from_path, "chooseFileToAttach") }
compose-attach-page-title = { COPY(from_path, "attachPageDlogTitle") }
compose-attach-page-prompt = { COPY(from_path, "attachPageDlogMessage") }
compose-message-part-attachment-name = { COPY(from_path, "partAttachmentSafeName") }
compose-attachment-bucket-attach-files-tooltip = { COPY(from_path, "attachmentBucketAttachFilesTooltip") }
compose-attachment-bucket-clear-selection-tooltip = { COPY(from_path, "attachmentBucketClearSelectionTooltip") }
compose-file-attachment-not-found = { REPLACE(from_path, "errorFileAttachMessage", filename_replacements) }
compose-file-attachment-error-title = { COPY(from_path, "errorFileAttachTitle") }
compose-message-file-error-title = { COPY(from_path, "errorFileMessageTitle") }
compose-message-file-not-found = { REPLACE(from_path, "errorFileMessageMessage", filename_replacements) }
compose-message-file-load-error = { REPLACE(from_path, "errorLoadFileMessageMessage", filename_replacements) }
compose-save-success-title = { COPY(from_path, "SaveDialogTitle") }
compose-save-success-message = { REPLACE(from_path, "SaveDialogMsg", save_success_replacements) }
compose-rename-attachment-title = { COPY(from_path, "renameAttachmentTitle") }
compose-rename-attachment-prompt = { COPY(from_path, "renameAttachmentMessage") }
remind-later-button =
    .label = { COPY(from_path, "remindLaterButton") }
    .accesskey = { COPY(from_path, "remindLaterButton.accesskey") }
disable-attachment-reminder-menu-item =
    .label = { COPY(from_path, "disableAttachmentReminderButton") }
find-replace-button =
    .label = { COPY(from_path, "replaceButton.label") }
    .accesskey = { COPY(from_path, "replaceButton.accesskey") }
    .tooltiptext = { COPY(from_path, "replaceButton.tooltip") }
compose-custom-from-address-placeholder = { REPLACE(from_path, "msgIdentityPlaceholder", identity_replacements) }
compose-custom-from-address-title = { COPY(from_path, "customizeFromAddressTitle") }
compose-custom-from-address-warning = { COPY(from_path, "customizeFromAddressWarning") }
compose-custom-from-address-ignore = { COPY(from_path, "customizeFromAddressIgnore") }
compose-blocked-content-options-button = { COPY(from_path, "blockedContentPrefLabel") }
compose-blocked-content-options-accesskey = { COPY(from_path, "blockedContentPrefAccesskey") }
compose-blocked-content-preferences-button = { COPY(from_path, "blockedContentPrefLabelUnix") }
compose-blocked-content-preferences-accesskey = { COPY(from_path, "blockedContentPrefAccesskeyUnix") }
compose-unblock-resource =
    .label = { REPLACE(from_path, "blockedAllowResource", url_replacements) }
compose-remove-address-row-title = { REPLACE(from_path, "confirmRemoveRecipientRowTitle2", field_replacements) }
compose-remove-address-row-prompt = { REPLACE(from_path, "confirmRemoveRecipientRowBody2", field_replacements) }
compose-remove-address-row-button = { COPY(from_path, "confirmRemoveRecipientRowButton") }
big-file-learn-more-button =
    .label = { COPY(from_path, "learnMore.label") }
    .accesskey = { COPY(from_path, "learnMore.accesskey") }
big-file-link-button =
    .label = { COPY(from_path, "bigFileShare.label") }
    .accesskey = { COPY(from_path, "bigFileShare.accesskey") }
big-file-ignore-button =
    .label = { COPY(from_path, "bigFileAttach.label") }
    .accesskey = { COPY(from_path, "bigFileAttach.accesskey") }
big-file-choose-account-title = { COPY(from_path, "bigFileChooseAccount.title") }
big-file-choose-account-prompt = { COPY(from_path, "bigFileChooseAccount.text") }
big-file-hide-notification-title = { REPLACE(from_path, "bigFileHideNotification.title", apostrophe_replacements) }
big-file-hide-notification-prompt = { REPLACE(from_path, "bigFileHideNotification.text", apostrophe_replacements) }
big-file-hide-notification-checkbox = { COPY(from_path, "bigFileHideNotification.check") }
cloudfile-uploading-stop-button =
    .label = { COPY(from_path, "stopShowingUploadingNotification.label") }
    .accesskey = { COPY(from_path, "stopShowingUploadingNotification.accesskey") }
cloud-file-privacy-warning = { COPY(from_path, "cloudFilePrivacyNotification") }
cloud-file-uploading-tooltip = { REPLACE(from_path, "cloudFileUploadingTooltip", provider_replacements) }
cloud-file-uploaded-tooltip = { REPLACE(from_path, "cloudFileUploadedTooltip", provider_replacements) }
cloud-file-attach-picker-title = { REPLACE(from_path, "chooseFileToAttachViaCloud", provider_replacements) }
cloud-file-authentication-error-title = { COPY(from_path, "errorCloudFileAuth.title") }
cloud-file-authentication-error = { REPLACE(from_path, "errorCloudFileAuth.message", provider_replacements) }
cloud-file-upload-error-title = { COPY(from_path, "errorCloudFileUpload.title") }
cloud-file-upload-error = { REPLACE(from_path, "errorCloudFileUpload.message", provider_filename_replacements) }
cloud-file-quota-error-title = { COPY(from_path, "errorCloudFileQuota.title") }
cloud-file-quota-error = { REPLACE(from_path, "errorCloudFileQuota.message", provider_filename_replacements) }
cloud-file-size-error-title = { COPY(from_path, "errorCloudFileLimit.title") }
cloud-file-size-error = { REPLACE(from_path, "errorCloudFileLimit.message", provider_filename_replacements) }
cloud-file-unknown-error-title = { COPY(from_path, "errorCloudFileOther.title") }
cloud-file-unknown-error = { REPLACE(from_path, "errorCloudFileOther.message", provider_replacements) }
cloud-file-deletion-error-title = { COPY(from_path, "errorCloudFileDeletion.title") }
cloud-file-deletion-error = { REPLACE(from_path, "errorCloudFileDeletion.message", provider_filename_replacements) }
            """,
            from_path=source,
            address_replacements=address_replacements,
            apostrophe_replacements=apostrophe_replacements,
            brand_replacements=brand_replacements,
            field_replacements=field_replacements,
            filename_replacements=filename_replacements,
            folder_replacements=folder_replacements,
            identity_replacements=identity_replacements,
            provider_replacements=provider_replacements,
            provider_filename_replacements=provider_filename_replacements,
            save_success_replacements=save_success_replacements,
            url_replacements=url_replacements,
            window_title_replacements=window_title_replacements,
        ),
    )

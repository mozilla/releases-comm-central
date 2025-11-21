/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod change_read_status;
mod change_read_status_all;
mod check_connectivity;
pub(crate) mod copy_move_operations;
mod create_folder;
mod create_message;
mod delete_messages;
mod erase_folder;
mod get_message;
mod mark_as_junk;
mod send_message;
pub(crate) mod server_version;
mod sync_folder_hierarchy;
mod sync_messages_for_folder;
mod update_folder;

use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
    env,
    ops::ControlFlow,
};

use ews::{
    create_item::CreateItem,
    get_folder::{GetFolder, GetFolderResponseMessage},
    get_item::GetItem,
    response::{ResponseClass, ResponseCode, ResponseError},
    server_version::ExchangeServerVersion,
    soap,
    update_item::{UpdateItem, UpdateItemResponse},
    BaseFolderId, BaseItemId, BaseShape, Folder, FolderId, FolderShape, ItemResponseMessage,
    ItemShape, Operation, OperationResponse, PathToElement, RealItem,
};
use fxhash::FxHashMap;
use mail_parser::MessageParser;
use mailnews_ui_glue::{
    handle_auth_failure, handle_transport_sec_failure, maybe_handle_connection_error,
    report_connection_success, AuthErrorOutcome, UserInteractiveServer,
};
use moz_http::Response;
use protocol_shared::{
    authentication::{
        credentials::{AuthValidationOutcome, AuthenticationProvider, Credentials},
        ntlm::{self, NTLMAuthOutcome},
    },
    error::ProtocolError,
};
use url::Url;
use uuid::Uuid;
use xpcom::{RefCounted, RefPtr};

use crate::{
    client::server_version::{read_server_version, DEFAULT_EWS_SERVER_VERSION},
    error::XpComEwsError,
    safe_xpcom::{
        handle_error, SafeEwsFolderListener, SafeEwsMessageCreateListener, SafeListener,
        StaleMsgDbHeader, UpdatedMsgDbHeader,
    },
};

// Flags to use for setting the `PR_MESSAGE_FLAGS` MAPI property.
//
// See
// <https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagmessageflags-canonical-property>,
// although the specific values are set in `Mapidefs.h` from the Windows SDK:
// <https://github.com/microsoft/MAPIStubLibrary/blob/1d30c31ebf05ef444371520cd4268d6e1fda8a3b/include/MAPIDefS.h#L2143-L2154>
//
// Message flags are of type `PT_LONG`, which corresponds to i32 (signed 32-bit
// integers) according to
// https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/property-types
const MSGFLAG_READ: i32 = 0x00000001;
const MSGFLAG_UNMODIFIED: i32 = 0x00000002;
const MSGFLAG_UNSENT: i32 = 0x00000008;

const EWS_ROOT_FOLDER: &str = "msgfolderroot";

// The environment variable that controls whether to include request/response
// payloads when logging. We only check for the variable's presence, not any
// specific value.
const LOG_NETWORK_PAYLOADS_ENV_VAR: &str = "THUNDERBIRD_LOG_NETWORK_PAYLOADS";

/// Options to to control the behavior of
/// [`XpComEwsClient::make_operation_request`].
#[derive(Debug, Clone, Copy, Default)]
struct OperationRequestOptions {
    /// Behavior to follow when an authentication failure arises.
    auth_failure_behavior: AuthFailureBehavior,

    /// Behavior to follow when a transport security failure arises.
    transport_sec_failure_behavior: TransportSecFailureBehavior,
}

/// The behavior to follow when an operation request results in an
/// authentication failure.
#[derive(Debug, Clone, Copy, Default)]
enum AuthFailureBehavior {
    /// Attempt to authenticate again or ask the user for new credentials.
    #[default]
    ReAuth,

    /// Fail immediately without attempting to authenticate again or asking the
    /// user for new credentials.
    Silent,
}

/// The behavior to follow when an operation request results in a transport
/// security failure (e.g. because of an invalid certificate). This specifically
/// controls the behaviour of `XpComEwsClient::make_operation_request`.
#[derive(Debug, Clone, Copy, Default)]
enum TransportSecFailureBehavior {
    /// Immediately alert the user about the security failure.
    #[default]
    Alert,

    /// Don't alert the user and propagate the failure to the consumer (which
    /// might or might not alert the user).
    Silent,
}

pub(crate) struct XpComEwsClient<ServerT: RefCounted + 'static> {
    endpoint: Url,
    server: RefPtr<ServerT>,
    credentials: RefCell<Credentials>,
    client: moz_http::Client,
    server_version: Cell<ExchangeServerVersion>,
}

/// Shorthand for the most common server type constraints.
pub(crate) trait ServerType:
    AuthenticationProvider + UserInteractiveServer + RefCounted
{
}
impl<T> ServerType for T where T: AuthenticationProvider + UserInteractiveServer + RefCounted {}

impl<ServerT: ServerType + 'static> XpComEwsClient<ServerT> {
    pub(crate) fn new(
        endpoint: Url,
        server: RefPtr<ServerT>,
        credentials: Credentials,
    ) -> Result<XpComEwsClient<ServerT>, XpComEwsError> {
        let server_version = read_server_version(&endpoint)?.unwrap_or(DEFAULT_EWS_SERVER_VERSION);

        Ok(XpComEwsClient {
            endpoint,
            server,
            credentials: RefCell::new(credentials),
            client: moz_http::Client::new(),
            server_version: Cell::new(server_version),
        })
    }

    /// Builds a map from remote folder ID to distinguished folder ID.
    ///
    /// This allows translating from the folder ID returned by `GetFolder`
    /// calls and well-known IDs associated with special folders.
    async fn get_well_known_folder_map(
        &self,
        listener: &SafeEwsFolderListener,
    ) -> Result<FxHashMap<String, &str>, XpComEwsError> {
        const DISTINGUISHED_IDS: &[&str] = &[
            EWS_ROOT_FOLDER,
            "inbox",
            "deleteditems",
            "drafts",
            "outbox",
            "sentitems",
            "junkemail",
            // The `archive` distinguished id isn't documented at
            // https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/distinguishedfolderid
            // but it does provide the Exchange account's archive folder when
            // requested, while the other documented `archive*` distinguished
            // ids result in folder not found errors.
            "archive",
        ];

        // We should always request the root folder first to simplify processing
        // the response below.
        assert_eq!(
            DISTINGUISHED_IDS[0], EWS_ROOT_FOLDER,
            "expected first fetched folder to be root"
        );

        let ids = DISTINGUISHED_IDS
            .iter()
            .map(|id| BaseFolderId::DistinguishedFolderId {
                id: id.to_string(),
                change_key: None,
            })
            .collect();

        // Fetch all distinguished folder IDs at once, since we have few enough
        // that they fit within Microsoft's recommended batch size of ten.
        let op = GetFolder {
            folder_shape: FolderShape {
                base_shape: BaseShape::IdOnly,
            },
            folder_ids: ids,
        };

        let response = self.make_operation_request(op, Default::default()).await?;

        let response_messages = response.into_response_messages();
        validate_response_message_count(&response_messages, DISTINGUISHED_IDS.len())?;

        // We expect results from EWS to be in the same order as given in the
        // request. EWS docs aren't explicit about response ordering, but
        // responses don't contain another means of mapping requested ID to
        // response.
        let mut message_iter = DISTINGUISHED_IDS.iter().zip(response_messages);

        // Record the root folder for messages before processing the other
        // responses. We're okay to unwrap since we request a static number of
        // folders and we've already checked that we have that number of
        // responses.
        let (_, response_class) = message_iter.next().unwrap();
        let message = process_response_message_class(GetFolder::NAME, response_class)?;

        // Any error fetching the root folder is fatal, since we can't correctly
        // set the parents of any folders it contains without knowing its ID.
        let root_folder_id = validate_get_folder_response_message(&message)?;
        listener.on_new_root_folder(root_folder_id)?;

        // Build the mapping for the remaining folders.
        message_iter
            .filter_map(|(&distinguished_id, response_class)| {
                let message = match process_response_message_class(GetFolder::NAME, response_class)
                {
                    Ok(message) => Some(message),

                    // Not every Exchange account will have all queried
                    // well-known folders, so we skip any which were not
                    // found.
                    Err(XpComEwsError::ResponseError(ResponseError {
                        response_code: ResponseCode::ErrorFolderNotFound,
                        ..
                    })) => None,

                    // Return any other error.
                    Err(err) => {
                        return Some(Err(err));
                    }
                };

                message.map(|message| {
                    // Validate the message (and propagate any error) if it's
                    // not `None`.
                    match validate_get_folder_response_message(&message) {
                        // Map from EWS folder ID to distinguished ID.
                        Ok(folder_id) => Ok((folder_id.id, distinguished_id)),
                        Err(err) => Err(err),
                    }
                })
            })
            .collect()
    }

    async fn push_sync_state_to_ui(
        &self,
        listener: &SafeEwsFolderListener,
        create_ids: Vec<String>,
        update_ids: Vec<String>,
        delete_ids: Vec<String>,
        sync_state: &str,
        well_known_map: &Option<FxHashMap<String, &str>>,
    ) -> Result<(), XpComEwsError> {
        if !create_ids.is_empty() {
            let created = self.batch_get_folders(create_ids).await?;
            for folder in created {
                match folder {
                    Folder::Folder {
                        folder_id,
                        parent_folder_id,
                        display_name,
                        ..
                    } => listener.on_folder_created(
                        folder_id,
                        parent_folder_id,
                        display_name,
                        well_known_map,
                    )?,
                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
                }
            }
        }

        if !update_ids.is_empty() {
            let updated = self.batch_get_folders(update_ids).await?;
            for folder in updated {
                match folder {
                    Folder::Folder {
                        folder_id,
                        parent_folder_id,
                        display_name,
                        ..
                    } => listener.on_folder_updated(folder_id, parent_folder_id, display_name)?,
                    _ => return Err(nserror::NS_ERROR_FAILURE.into()),
                }
            }
        }

        for id in delete_ids {
            listener.on_folder_deleted(id)?;
        }

        listener.on_sync_state_token_changed(sync_state)?;

        Ok(())
    }

    async fn batch_get_folders(&self, ids: Vec<String>) -> Result<Vec<Folder>, XpComEwsError> {
        let mut folders = Vec::with_capacity(ids.len());
        let mut ids = ids.into_iter().peekable();
        let mut buf = Vec::with_capacity(10);

        loop {
            // Per Microsoft's recommendation, we batch `GetFolder` operations
            // in chunks of 10 to avoid throttling.
            //
            // https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/mailbox-synchronization-and-ews-in-exchange
            for _ in 0..10 {
                // This is sort of a terrible way to do this, but
                // `array_chunks()`, `next_chunk()`, etc. are still nightly
                // features on `Iterator` as of this writing and we want to take
                // ownership rather than cloning.
                match ids.next() {
                    Some(value) => buf.push(value),
                    None => break,
                }
            }

            let to_fetch = buf
                .drain(..)
                .map(|id| BaseFolderId::FolderId {
                    id,
                    change_key: None,
                })
                .collect();

            // Execute the request and collect all mail folders found in the
            // response.
            let op = GetFolder {
                folder_shape: FolderShape {
                    base_shape: BaseShape::AllProperties,
                },
                folder_ids: to_fetch,
            };

            let response = self.make_operation_request(op, Default::default()).await?;
            let messages = response.into_response_messages();

            let mut fetched = messages
                .into_iter()
                .filter_map(|response_class| {
                    let message = match process_response_message_class(GetFolder::NAME, response_class) {
                        Ok(message) => message,
                        Err(err) => {return Some(Err(err));}
                    };
                    if let Err(err) = validate_get_folder_response_message(&message) {
                        return Some(Err(err));
                    }

                    message
                        .folders
                        .inner
                        .into_iter()
                        .next()
                        .and_then(|folder| match &folder {
                            Folder::Folder {
                                folder_class,
                                display_name,
                                ..
                            } => {
                                let folder_class =
                                    folder_class.as_ref().map(|string| string.as_str());

                                // Filter out non-mail folders. According to EWS
                                // docs, this should be any folder which class
                                // start is "IPF.Note", or starts with
                                // "IPF.Note." (to allow some systems to define
                                // custom mail-derived classes).
                                //
                                // See
                                // <https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/folders-and-items-in-ews-in-exchange>
                                match folder_class {
                                    Some(folder_class) => {
                                        if folder_class == "IPF.Note"
                                            || folder_class.starts_with("IPF.Note.")
                                        {
                                            Some(Ok(folder))
                                        } else {
                                            log::debug!("Skipping folder with unsupported class: {folder_class}");
                                            None
                                        }
                                    }
                                    None => {
                                        log::warn!(
                                            "Skipping folder without a class: {}",
                                            display_name.clone().unwrap_or("unknown".to_string())
                                        );

                                        None
                                    }
                                }
                            }

                            _ => None,
                        })
                })
                .collect::<Result<_, _>>()?;

            folders.append(&mut fetched);

            if ids.peek().is_none() {
                break;
            }
        }

        Ok(folders)
    }

    /// Fetches items from the remote Exchange server.
    async fn get_items<IdColl>(
        &self,
        ids: IdColl,
        fields: &[&str],
        include_mime_content: bool,
    ) -> Result<Vec<RealItem>, XpComEwsError>
    where
        IdColl: IntoIterator<Item = String>,
    {
        // Build a `VecDeque` so that we can drain it from the front. It would
        // be better to do this with `array_chunks()` once we have a suitable
        // MSRV.
        // https://github.com/rust-lang/rust/issues/74985
        let mut ids: VecDeque<_> = ids.into_iter().collect();
        let mut items = Vec::with_capacity(ids.len());

        while !ids.is_empty() {
            let batch_ids: Vec<_> = {
                let range_end = usize::min(10, ids.len());
                ids.drain(0..range_end)
            }
            .map(|id| BaseItemId::ItemId {
                id,
                change_key: None,
            })
            .collect();

            let additional_properties: Vec<_> = fields
                .iter()
                .map(|&field| PathToElement::FieldURI {
                    field_URI: String::from(field),
                })
                .collect();

            let additional_properties = if additional_properties.is_empty() {
                None
            } else {
                Some(additional_properties)
            };

            let op = GetItem {
                item_shape: ItemShape {
                    // We use `IdOnly` with the `AdditionalProperties` field to
                    // get finer control over what we request. `Default`
                    // includes the message body, which we would discard if we
                    // are only getting the message header.
                    base_shape: BaseShape::IdOnly,
                    additional_properties,
                    include_mime_content: Some(include_mime_content),
                },
                item_ids: batch_ids,
            };

            let response = self.make_operation_request(op, Default::default()).await?;
            for response_message in response.into_response_messages() {
                let message = process_response_message_class(GetItem::NAME, response_message)?;

                // The expected shape of the list of response messages is
                // underspecified, but EWS always seems to return one message
                // per requested ID, containing the item corresponding to that
                // ID. However, it allows for multiple items per message, so we
                // need to be sure we aren't throwing some away.
                let items_len = message.items.inner.len();
                if items_len != 1 {
                    log::warn!(
                        "GetItemResponseMessage contained {} items, only 1 expected",
                        items_len
                    );
                }

                items.extend(message.items.inner.into_iter());
            }
        }

        Ok(items)
    }

    /// Performs a [`CreateItem` operation] and processes its response.
    ///
    /// [`CreateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/createitem-operation-email-message
    async fn make_create_item_request(
        &self,
        create_item: CreateItem,
        transport_sec_failure_behavior: TransportSecFailureBehavior,
    ) -> Result<ItemResponseMessage, XpComEwsError> {
        let response = self
            .make_operation_request(
                create_item,
                OperationRequestOptions {
                    transport_sec_failure_behavior,
                    ..Default::default()
                },
            )
            .await?;

        // We have only sent one message, therefore the response should only
        // contain one response message.
        let response_messages = response.into_response_messages();
        let response_message = single_response_or_error(response_messages)?;
        process_response_message_class(CreateItem::NAME, response_message)
    }

    /// Performs an [`UpdateItem` operation]. The caller must processes the Ok response to check for
    /// any errors.
    ///
    /// [`UpdateItem` operation]: https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/updateitem-operation
    async fn make_update_item_request(
        &self,
        update_item: UpdateItem,
    ) -> Result<UpdateItemResponse, XpComEwsError> {
        let expected_response_count = update_item.item_changes.len();
        // Make the operation request using the provided parameters.
        let response = self
            .make_operation_request(update_item, Default::default())
            .await?;

        // Get all response messages.
        let response_messages = response.response_messages();
        validate_response_message_count(response_messages, expected_response_count)?;

        Ok(response)
    }

    /// Handles an authentication failure from the server.
    ///
    /// This method instructs its consumer on whether to retry
    /// ([`ControlFlow::Continue`]) or cancel the request
    /// ([`ControlFlow::Break`]) based on user input and the authentication
    /// method.
    // Clippy warns that this method keeps a borrow on `self.credentials` while
    // awaiting futures. This is not an issue here, because we never take a
    // mutable borrow of `self.credentials`, and we only call `replace()` on it
    // outside of blocks that take an immutable borrow on it.
    #[allow(clippy::await_holding_refcell_ref)]
    async fn handle_authentication_failure(&self) -> Result<ControlFlow<()>, XpComEwsError> {
        if let Credentials::Ntlm {
            username,
            password,
            ews_url,
        } = &*self.credentials.borrow()
        {
            // NTLM is a bit special since it authenticates through additional
            // requests to complete a challenge, and the result of this flow is
            // persisted through a cookie. This means we might be getting a 401
            // response because the cookie expired, so we should try refreshing
            // it before prompting for a new password.
            match ntlm::authenticate(username, password, ews_url).await? {
                NTLMAuthOutcome::Success => return Ok(ControlFlow::Continue(())),
                NTLMAuthOutcome::Failure => (),
            }
        }

        loop {
            let outcome = handle_auth_failure(self.server.clone())?;

            // Refresh the credentials before potentially retrying, because they
            // might have changed (e.g. if the user entered a new password after
            // being prompted for one), and should we emit more requests using
            // this client, we should be using up to date credentials.
            let credentials = self.server.get_credentials()?;
            self.credentials.replace(credentials);

            match outcome {
                AuthErrorOutcome::RETRY => {
                    match self.credentials.borrow().validate().await? {
                        // The credentials work, let's move on.
                        AuthValidationOutcome::Valid => break,

                        // The credentials are still invalid, let's prompt the
                        // user for more info.
                        AuthValidationOutcome::Invalid => continue,
                    }
                }

                // The user has cancelled from the password prompt, or the
                // selected authentication method does not support retrying at
                // this stage, let's stop here.
                AuthErrorOutcome::ABORT => return Ok(ControlFlow::Break(())),
            }
        }

        Ok(ControlFlow::Continue(()))
    }

    /// Makes a request to the EWS endpoint to perform an operation.
    ///
    /// If the entire request or first response is throttled, the request will
    /// be repeatedly retried (after the delay given in the response) until it
    /// succeeds or some other error occurs.
    async fn make_operation_request<Op>(
        &self,
        op: Op,
        options: OperationRequestOptions,
    ) -> Result<Op::Response, XpComEwsError>
    where
        Op: Operation,
    {
        let op_name = <Op as Operation>::NAME;
        let envelope = soap::Envelope {
            headers: vec![soap::Header::RequestServerVersion {
                version: self.server_version.get(),
            }],
            body: op,
        };
        let request_body = envelope.as_xml_document()?;

        // Loop in case we need to retry the request after a delay or an
        // authentication failure.
        loop {
            let response = match self
                .send_authenticated_request(&request_body, op_name)
                .await
            {
                Ok(response) => response,
                Err(err) => {
                    // Handle authentication, network and transport security
                    // failures early because we know how to process them
                    // without requiring more data from the response body.
                    match err {
                        // If the error is an authentication failure, try to
                        // authenticate again (by asking the user for new
                        // credentials if relevant), but only if the consumer
                        // asked us to.
                        XpComEwsError::Protocol(ProtocolError::Authentication)
                            if matches!(
                                options.auth_failure_behavior,
                                AuthFailureBehavior::ReAuth
                            ) =>
                        {
                            match self.handle_authentication_failure().await? {
                                // We should continue with the authentication
                                // attempts, and retry the request with
                                // refreshed credentials.
                                ControlFlow::Continue(_) => continue,

                                // We've been instructed to abort the request
                                // here (either because the user asked us to, or
                                // because the selected authentication method
                                // does not support retrying at this stage).
                                ControlFlow::Break(_) => return Err(err),
                            }
                        }

                        // If the error is a transport security failure (e.g. an
                        // invalid certificate), handle it here by alerting the
                        // user, but only if the consumer asked us to.
                        XpComEwsError::Protocol(ProtocolError::Http(
                            moz_http::Error::TransportSecurityFailure {
                                status: _,
                                ref transport_security_info,
                            },
                        )) if matches!(
                            options.transport_sec_failure_behavior,
                            TransportSecFailureBehavior::Alert
                        ) =>
                        {
                            handle_transport_sec_failure(
                                self.server.clone(),
                                transport_security_info.0.clone(),
                            )?;
                            return Err(err);
                        }

                        // If the error is network-related, optionally alert the
                        // user (depending on which specific error it is) before
                        // propagating it.
                        XpComEwsError::Protocol(ProtocolError::Http(ref http_error)) => {
                            maybe_handle_connection_error(http_error.into(), self.server.clone())?;
                            return Err(err);
                        }

                        _ => return Err(err),
                    };
                }
            };

            // If we managed to connect to the server, but the response's HTTP
            // status code is an error (e.g. because the server encountered an
            // internal error, the path is invalid, etc.), we should also raise
            // a connection error. From manual testing, it does not look like
            // throttling results in actual 429 responses (but instead in 200
            // responses with the relevant response message).
            let response = match response.error_from_status() {
                Ok(response) => {
                    report_connection_success(self.server.clone())?;
                    response
                }
                Err(moz_http::Error::StatusCode { status, response }) if status.0 == 500 => {
                    log::error!("Request FAILED with status 500, attempting to parse for backoff");
                    response
                }
                Err(err) => {
                    if let moz_http::Error::StatusCode { ref response, .. } = err {
                        log::error!("Request FAILED with status {}: {err}", response.status()?);
                    } else {
                        log::error!("moz_http::Response::error_from_status returned an unexpected error: {err:?}");
                    }

                    maybe_handle_connection_error((&err).into(), self.server.clone())?;
                    return Err(err.into());
                }
            };

            // Don't immediately propagate in case the error represents a
            // throttled request, which we can address with retry.
            let op_result: Result<soap::Envelope<Op::Response>, _> =
                soap::Envelope::from_xml_document(response.body());

            break match op_result {
                Ok(envelope) => {
                    // If the server responded with a version identifier, store
                    // it so we can use it later.
                    if let Some(header) = envelope
                        .headers
                        .into_iter()
                        // Filter out headers we don't care about.
                        .filter_map(|hdr| match hdr {
                            soap::Header::ServerVersionInfo(server_version_info) => {
                                Some(server_version_info)
                            }
                            _ => None,
                        })
                        .next()
                    {
                        self.update_server_version(header)?;
                    }

                    // Check if the first response is a back off message, and
                    // retry if so.
                    if let Some(ResponseClass::Error(ResponseError {
                        message_xml: Some(ews::MessageXml::ServerBusy(server_busy)),
                        ..
                    })) = envelope.body.response_messages().first()
                    {
                        let delay_ms = server_busy.back_off_milliseconds;
                        log::debug!(
                            "{op_name} returned busy message, will retry after {delay_ms} milliseconds"
                        );
                        xpcom_async::sleep(delay_ms).await?;
                        continue;
                    }

                    Ok(envelope.body)
                }
                Err(err) => {
                    // Check first to see if the request has been throttled and
                    // needs to be retried.
                    let backoff_delay_ms = maybe_get_backoff_delay_ms(&err);
                    if let Some(backoff_delay_ms) = backoff_delay_ms {
                        log::debug!(
                            "{op_name} request throttled, will retry after {backoff_delay_ms} milliseconds"
                        );

                        xpcom_async::sleep(backoff_delay_ms).await?;
                        continue;
                    }

                    // If not, propagate the error.
                    Err(err.into())
                }
            };
        }
    }

    /// Send an authenticated EWS operation request with the given body.
    async fn send_authenticated_request(
        &self,
        request_body: &[u8],
        op_name: &str,
    ) -> Result<Response, XpComEwsError> {
        // Fetch the Authorization header value for each request in case of
        // token expiration between requests.
        let credentials = self.credentials.borrow().clone();
        let auth_header_value = credentials.to_auth_header_value().await?;

        // Generate random id for logging purposes.
        let request_id = Uuid::new_v4();
        log::info!("Making operation request {request_id}: {op_name}");

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the request body if requested.
            log::info!("C: {}", String::from_utf8_lossy(request_body));
        }

        let mut request_builder = self.client.post(&self.endpoint)?;

        if let Some(ref hdr_value) = auth_header_value {
            // Only set an `Authorization` header if necessary.
            request_builder = request_builder.header("Authorization", hdr_value);
        }

        let response = request_builder
            .body(request_body, "text/xml; charset=utf-8")
            .send()
            .await?;

        let response_body = response.body();
        let response_status = response.status()?;
        log::info!(
            "Response received for request {request_id} (status {response_status}): {op_name}"
        );

        if env::var(LOG_NETWORK_PAYLOADS_ENV_VAR).is_ok() {
            // Also log the response body if requested.
            log::info!("S: {}", String::from_utf8_lossy(response_body));
        }

        // Catch authentication errors quickly so we can react to them
        // appropriately.
        if response_status.0 == 401 {
            Err(XpComEwsError::Protocol(ProtocolError::Authentication))
        } else {
            Ok(response)
        }
    }
}

/// Gets the time to wait before retrying a throttled request, if any.
///
/// When an Exchange server throttles a request, the response will specify a
/// delay which should be observed before the request is retried.
fn maybe_get_backoff_delay_ms(err: &ews::Error) -> Option<u32> {
    if let ews::Error::RequestFault(fault) = err {
        // We successfully sent a request, but it was rejected for some reason.
        // Whatever the reason, retry if we're provided with a backoff delay.
        let message_xml = fault.as_ref().detail.as_ref()?.message_xml.as_ref()?;

        match message_xml {
            ews::MessageXml::ServerBusy(server_busy) => Some(server_busy.back_off_milliseconds),
            _ => None,
        }
    } else {
        None
    }
}

/// Look at the response class of a response message, and do nothing, warn or
/// return an error accordingly.
fn process_response_message_class<T>(
    op_name: &str,
    response_class: ResponseClass<T>,
) -> Result<T, XpComEwsError> {
    match response_class {
        ResponseClass::Success(message) => Ok(message),

        ResponseClass::Warning(message) => {
            log::warn!("{op_name} operation encountered unknown warning");
            Ok(message)
        }

        ResponseClass::Error(err) => Err(err.to_owned().into()),
    }
}

/// Verifies that a response message for a GetFolder request is valid for a
/// standard folder.
///
/// Returns the ID of a valid folder for convenience.
fn validate_get_folder_response_message(
    message: &GetFolderResponseMessage,
) -> Result<FolderId, XpComEwsError> {
    if message.folders.inner.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: format!(
                "expected exactly one folder per response message, got {}",
                message.folders.inner.len()
            ),
        });
    }

    // Okay to unwrap as we've verified the length.
    match message.folders.inner.first().unwrap() {
        Folder::Folder { folder_id, .. } => {
            folder_id.clone().ok_or(XpComEwsError::MissingIdInResponse)
        }

        _ => Err(XpComEwsError::Processing {
            message: String::from("expected folder to be of type Folder"),
        }),
    }
}

/// Uses the provided `ItemResponseMessage` to create, populate and commit
/// an `nsIMsgDBHdr` for a newly created message.
fn create_and_populate_header_from_create_response(
    response_message: ItemResponseMessage,
    content: &[u8],
    listener: &SafeEwsMessageCreateListener,
) -> Result<UpdatedMsgDbHeader, XpComEwsError> {
    // If we're saving the message (rather than sending it), we must create a
    // new database entry for it and associate it with the message's EWS ID.
    let items = response_message.items.inner;
    if items.len() != 1 {
        return Err(XpComEwsError::Processing {
            message: String::from("expected only one item in CreateItem response"),
        });
    }

    let item = &items[0];
    let message = item.inner_message();

    let ews_id = &message
        .item_id
        .as_ref()
        .ok_or(XpComEwsError::MissingIdInResponse)?
        .id;

    // Signal that copying the message to the server has succeeded, which will
    // trigger its content to be streamed to the relevant message store.
    let hdr: StaleMsgDbHeader = listener.on_remote_create_successful(ews_id)?;

    // Parse the message and use its headers to populate the `nsIMsgDBHdr`
    // before committing it to the database. We parse the original content
    // rather than use the `Message` from the `CreateItemResponse` because the
    // latter only contains the item's ID, and so is missing the required
    // fields.
    let message = MessageParser::default()
        .parse(content)
        .ok_or(XpComEwsError::Processing {
            message: String::from("failed to parse message"),
        })?;

    let hdr = hdr.populate_from_message_headers(message)?;
    listener.on_hdr_populated(&hdr)?;

    Ok(hdr)
}

fn validate_response_message_count<T>(
    response_messages: &[ResponseClass<T>],
    expected_len: usize,
) -> Result<(), XpComEwsError> {
    if response_messages.len() != expected_len {
        return Err(XpComEwsError::UnexpectedResponseMessageCount {
            expected: expected_len,
            actual: response_messages.len(),
        });
    }

    Ok(())
}

/// For responses where we expect a single message, extract that message. Returns
/// [`XpComEwsError::Processing`] if no messages are available, prints a warning but succesfully
/// returns the first message if more than one message is available.
fn single_response_or_error<T>(responses: Vec<T>) -> Result<T, XpComEwsError> {
    let responses_len = responses.len();
    let Some(message) = responses.into_iter().next() else {
        return Err(XpComEwsError::Processing {
            message: "expected 1 response message, got none".to_string(),
        });
    };
    if responses_len != 1 {
        log::warn!("expected 1 response message, got {responses_len}");
    }
    Ok(message)
}

/// Convert the response into a vector of its message type, or return the first error
/// encountered. Warnings are logged but otherwise considered successes.
fn response_into_messages<OpResponse: OperationResponse>(
    response: OpResponse,
) -> Result<Vec<OpResponse::Message>, ResponseError> {
    response
        .into_response_messages()
        .into_iter()
        .map(|response_class| match response_class {
            ResponseClass::Success(message) => Ok(message),
            ResponseClass::Error(err) => Err(err),
            ResponseClass::Warning(message) => {
                log::warn!("into_messages found a warning!");
                Ok(message)
            }
        })
        .collect()
}

/// Where [`Operation`] represents the types and (de)serialization of an EWS operation,
/// this trait represents the client implementation of performing an operation.
pub(crate) trait DoOperation {
    /// A name of the operation for logging purposes.
    ///
    /// This is usually the same as [`Operation::NAME`], but not always, because some
    /// implementations of `DoOperation` don't correspond 1-to-1 with an EWS operation.
    const NAME: &str;

    /// The success case return type of [`Self::do_operation`].
    type Okay;

    /// The listener this operation uses to report success/failure.
    type Listener: SafeListener;

    /// Do the operation represented. Includes most of the logic, returning any errors encountered.
    async fn do_operation<ServerT: ServerType>(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError>;

    /// Turn the succesesfully completed operation into the argument for [`SafeListener::on_success`].
    fn into_success_arg(self, ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg;

    /// Turn the failed operation into the argument for [`SafeListener::on_failure`].
    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg;

    /// Handle the operation done in [`Self::do_operation`]. I.e., calls `do_operation`, and handles
    /// any errors returned as appropriate.
    async fn handle_operation<ServerT: ServerType>(
        mut self,
        client: &XpComEwsClient<ServerT>,
        listener: &Self::Listener,
    ) where
        Self: Sized,
    {
        match self.do_operation(client).await {
            Ok(okay) => {
                if let Err(err) = listener.on_success(self.into_success_arg(okay)) {
                    log::warn!(
                        "listener for {} success callback returned an error: {err}",
                        Self::NAME
                    );
                }
            }
            Err(err) => {
                handle_error(listener, Self::NAME, &err, self.into_failure_arg());
            }
        }
    }
}

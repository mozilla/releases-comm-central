/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod delete_folder;
mod empty_folder;

use ews::{
    delete_folder::{DeleteFolder, DeleteFolderResponse},
    empty_folder::{EmptyFolder, EmptyFolderResponse},
    response::{ResponseCode, ResponseError},
    BaseFolderId, DeleteType, Operation, OperationResponse,
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback,
};
use std::marker::PhantomData;

use super::{process_response_message_class, ServerType, XpComEwsClient, XpComEwsError};

use crate::macros::queue_operation;

/// Marker trait for [`DeleteFolder`] and [`EmptyFolder`], which are nearly
/// identical in their purpose and implementation, differing primarily in
/// whether the target folder itself is removed.
trait EraseFolder: Operation {
    /// Pushes the current operation to the back of the client, and waits for a
    /// response.
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        folder_ids: Vec<BaseFolderId>,
    ) -> Result<Self::Response, XpComEwsError>;
}

struct DoEraseFolder<Op: EraseFolder> {
    pub folder_ids: Vec<String>,
    pub _op_type: PhantomData<Op>,
}

impl<ServerT: ServerType, Op: EraseFolder + 'static>
    DoOperation<XpComEwsClient<ServerT>, XpComEwsError> for DoEraseFolder<Op>
{
    const NAME: &'static str = <Op as Operation>::NAME;
    type Okay = UseLegacyFallback;
    type Listener = SafeEwsSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComEwsClient<ServerT>,
    ) -> Result<Self::Okay, XpComEwsError> {
        let base_folder_ids = self
            .folder_ids
            .iter()
            .map(|id| BaseFolderId::FolderId {
                id: id.clone(),
                change_key: None,
            })
            .collect();

        let response = Op::queue_operation(client, base_folder_ids).await?;

        let response_messages = response.into_response_messages();
        let name = <Self as DoOperation<XpComEwsClient<ServerT>, _>>::NAME;
        for (folder_id, response_message) in self.folder_ids.iter().zip(response_messages) {
            if let Err(err) = process_response_message_class(name, response_message) {
                match err {
                    XpComEwsError::ResponseError(ResponseError {
                        response_code: ResponseCode::ErrorItemNotFound,
                        ..
                    }) => {
                        // Something happened in a previous attempt that caused
                        // the folder to be deleted on the EWS server but not in
                        // the database. In this case, we don't want to force a
                        // zombie folder in the account, so we ignore the error
                        // and move on with the local deletion.
                        log::warn!("found folder that was deleted from the EWS server but not the local db: {folder_id}");
                    }
                    _ => return Err(err),
                }
            }
        }
        Ok(UseLegacyFallback::No)
    }

    fn into_success_arg(self, ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg {
        (std::iter::empty::<String>(), ok).into()
    }

    fn into_failure_arg(self) {}
}

impl EraseFolder for DeleteFolder {
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        folder_ids: Vec<BaseFolderId>,
    ) -> Result<Self::Response, XpComEwsError> {
        let op = DeleteFolder {
            delete_type: DeleteType::HardDelete,
            folder_ids,
        };

        let rcv = queue_operation!(client, DeleteFolder, op, Default::default());

        rcv.await?
    }
}

impl EraseFolder for EmptyFolder {
    async fn queue_operation<ServerT: ServerType>(
        client: &XpComEwsClient<ServerT>,
        folder_ids: Vec<BaseFolderId>,
    ) -> Result<Self::Response, XpComEwsError> {
        let op = EmptyFolder {
            delete_type: DeleteType::HardDelete,
            delete_sub_folders: true,
            folder_ids,
        };

        let rcv = queue_operation!(client, EmptyFolder, op, Default::default());

        rcv.await?
    }
}

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

mod delete_folder;
mod empty_folder;

use ews::{
    BaseFolderId, DeleteType, Operation, OperationResponse,
    delete_folder::DeleteFolder,
    empty_folder::EmptyFolder,
    response::{ResponseCode, ResponseError},
};
use protocol_shared::client::DoOperation;
use protocol_shared::safe_xpcom::{
    SafeEwsSimpleOperationListener, SafeListener, UseLegacyFallback,
};
use std::marker::PhantomData;

use super::{ServerType, XpComEwsClient, XpComEwsError, process_response_message_class};

/// Marker trait for [`DeleteFolder`] and [`EmptyFolder`], which are nearly
/// identical in their purpose and implementation, differing primarily in
/// whether the target folder itself is removed.
trait EraseFolder: Operation {
    fn new(folder_ids: Vec<BaseFolderId>) -> Self;
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

        let op = Op::new(base_folder_ids);
        let response = client.enqueue_and_send(op, Default::default()).await?;

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
                        log::warn!(
                            "found folder that was deleted from the EWS server but not the local db: {folder_id}"
                        );
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
    fn new(folder_ids: Vec<BaseFolderId>) -> Self {
        DeleteFolder {
            delete_type: DeleteType::HardDelete,
            folder_ids,
        }
    }
}

impl EraseFolder for EmptyFolder {
    fn new(folder_ids: Vec<BaseFolderId>) -> Self {
        EmptyFolder {
            delete_type: DeleteType::HardDelete,
            delete_sub_folders: true,
            folder_ids,
        }
    }
}

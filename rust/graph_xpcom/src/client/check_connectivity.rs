/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{Select, paths, types::user};
use protocol_shared::{
    ServerType,
    client::DoOperation,
    operation_sender::{AuthFailureBehavior, OperationRequestOptions},
    safe_xpcom::{SafeUrlListener, uri::SafeUri},
};

use crate::error::XpComGraphError;

use super::XpComGraphClient;

struct DoCheckConnectivity<'a> {
    pub listener: &'a SafeUrlListener,
    pub uri: SafeUri,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoCheckConnectivity<'_>
{
    const NAME: &'static str = "check connectivity";
    type Okay = ();
    type Listener = SafeUrlListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let base_url = client.base_url();

        log::info!("Start running for URI {base_url}");
        self.listener
            .on_start_running_url(self.uri.clone())
            .to_result()?;

        let base_url = base_url.to_string();
        let mut get_me = paths::me::Get::new(base_url);
        get_me.select(vec![user::UserSelection::AboutMe]);

        client
            .send_request(
                get_me,
                OperationRequestOptions {
                    auth_failure_behavior: AuthFailureBehavior::Silent,
                    ..Default::default()
                },
            )
            .await?;
        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) -> SafeUri {
        self.uri
    }

    fn into_failure_arg(self) -> SafeUri {
        self.uri
    }
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Perform a connectivity check by querying the [user information] endpoint.
    ///
    /// [user information]: https://learn.microsoft.com/en-us/graph/api/user-get
    pub async fn check_connectivity(
        self: Arc<XpComGraphClient<ServerT>>,
        uri: SafeUri,
        listener: SafeUrlListener,
    ) {
        let operation = DoCheckConnectivity {
            listener: &listener,
            uri,
        };
        operation.handle_operation(&self, &listener).await;
    }
}

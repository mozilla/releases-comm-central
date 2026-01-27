/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use ms_graph_tb::{Select, paths, types::user};
use protocol_shared::{
    authentication::credentials::AuthenticationProvider,
    client::DoOperation,
    safe_xpcom::{SafeUrlListener, uri::SafeUri},
};
use xpcom::RefCounted;

use crate::error::XpComGraphError;

use super::XpComGraphClient;

struct DoCheckConnectivity<'a> {
    pub listener: &'a SafeUrlListener,
    pub uri: SafeUri,
}

impl<ServerT: AuthenticationProvider + RefCounted>
    DoOperation<XpComGraphClient<ServerT>, XpComGraphError> for DoCheckConnectivity<'_>
{
    const NAME: &'static str = "check connectivity";
    type Okay = ();
    type Listener = SafeUrlListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        log::info!("Start running for URI {}", self.uri);
        self.listener.on_start_running_url(self.uri.clone());

        let mut get_me = paths::me::Get::new();
        get_me.select(vec![user::UserSelection::AboutMe]);

        client
            .send_request::<user::User, paths::me::Get>(get_me)
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

impl<ServerT: AuthenticationProvider + RefCounted> XpComGraphClient<ServerT> {
    /// Perform a connectivity check by querying the user information endpoint.
    pub async fn check_connectivity(self, uri: SafeUri, listener: SafeUrlListener) {
        let operation = DoCheckConnectivity {
            listener: &listener,
            uri,
        };
        operation.handle_operation(&self, &listener).await
    }
}

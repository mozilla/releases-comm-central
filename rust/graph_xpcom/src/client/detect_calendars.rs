/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{Select, paths::me::calendars, types::calendar::CalendarSelection};
use nserror::NS_ERROR_UNEXPECTED;
use protocol_shared::{
    ServerType, client::DoOperation, safe_xpcom::calendar_listener::SafeCalendarListener,
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoDetectCalendars<'a> {
    pub listener: &'a SafeCalendarListener,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoDetectCalendars<'_>
{
    const NAME: &'static str = "detect calendars";
    type Okay = ();
    type Listener = SafeCalendarListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let base_url = client.base_api_url()?;

        let select_properties = vec![
            CalendarSelection::Name,
            CalendarSelection::IsDefaultCalendar,
            CalendarSelection::Owner,
            CalendarSelection::CanEdit,
        ];

        let mut request = calendars::Get::new(base_url.to_string());
        request.select(select_properties);

        let response = client
            .send_request_json_response(request, Default::default())
            .await?;

        let calendars = response.response.value.ok_or(NS_ERROR_UNEXPECTED)?;

        for calendar in calendars {
            let id = calendar.entity.id.ok_or(XpComGraphError::Processing {
                message: "Missing calendar ID".to_string(),
            })?;
            let name = calendar.name.flatten().ok_or(XpComGraphError::Processing {
                message: "Missing calendar name".to_string(),
            })?;
            let read_only = !calendar.can_edit.flatten().unwrap_or(false);

            self.listener
                .on_calendar_discovered(id, name, read_only)
                .to_result()?;
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    /// Perform calendar detection by querying the Microsoft Graph calendars API.
    ///
    /// This method queries the user's Microsoft Graph account to discover all
    /// available calendars, including primary, shared, and other calendars.
    ///
    /// # Arguments
    ///
    /// * `self` - The Graph client instance
    /// * `listener` - Listener for calendar discovery notifications
    ///
    /// # Returns
    ///
    /// A vector of discovered calendar IDs
    pub(crate) async fn detect_calendars(
        self: Arc<XpComGraphClient<ServerT>>,
        listener: SafeCalendarListener,
    ) {
        let operation = DoDetectCalendars {
            listener: &listener,
        };

        operation.handle_operation(&self, &listener).await;
    }
}

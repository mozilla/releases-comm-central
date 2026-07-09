/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{Select, notnull, paths::me::calendars, types::calendar::CalendarSelection};
use nserror::NS_ERROR_UNEXPECTED;
use nsstring::nsCString;
use protocol_shared::{
    ServerType, client::DoOperation, safe_xpcom::calendar_listener::SafeCalendarListener,
};
use thin_vec::ThinVec;

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoDetectCalendars {}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoDetectCalendars
{
    const NAME: &'static str = "detect calendars";
    type Okay = ThinVec<nsCString>;
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
        ];

        let mut request = calendars::Get::new(base_url.to_string());
        request.select(select_properties);

        let response = client
            .send_request_json_response(request, Default::default())
            .await?;

        let calendars = response.response.value.ok_or(NS_ERROR_UNEXPECTED)?;

        let mut detected_calendars: Vec<String> = Vec::new();

        for calendar in calendars {
            if let notnull!(calendar_name) = calendar.name {
                detected_calendars.push(calendar_name);
            } else {
                return Err(XpComGraphError::Processing {
                    message: "Calendar name is not present".to_string(),
                });
            }
        }

        log::info!("Detected {} calendars", detected_calendars.len());

        let detected_calendars = detected_calendars
            .into_iter()
            .map(nsCString::from)
            .collect();

        Ok(detected_calendars)
    }

    fn into_success_arg(self, ok: Self::Okay) -> ThinVec<nsCString> {
        ok
    }

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
        let operation = DoDetectCalendars {};

        operation.handle_operation(&self, &listener).await;
    }
}

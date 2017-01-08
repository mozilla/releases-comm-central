/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file contains code that uses react.js

/* exported gTopComponent, DatePicker, TopComponent */

var gTopComponent = null;

var Tabstrip = React.createClass({
    handleChange: function(index) {
        // The click handler will update the state with
        // the index of the focused menu entry
        this.props.onInput(this.props.keyprop, index);
    },
    render: function() {
        return React.DOM.ul(
            { id: "tabstrip" },
            this.props.tabs.map((tab, index) => {
                let style = (this.props.activeTab == index) ? "activeTab" : "";
                // The bind() method makes the index
                // available to the handleChange function:
                return React.DOM.li({
                    className: style + " tab",
                    key: "tabkey" + index,
                    onClick: this.handleChange.bind(this, index)
                }, tab);
            })
        );
    }
});

var TextField = React.createClass({
    handleChange: function(event) {
        this.props.onInput(this.props.keyprop, event.target.value);
    },
    render: function() {
        return React.DOM.input({
            type: "text",
            // placeholder: "New Event"
            value: this.props.value,
            onChange: this.handleChange
        });
    }
});

var TextArea = React.createClass({
    handleChange: function(event) {
        this.props.onInput(this.props.keyprop, event.target.value);
    },
    render: function() {
        return React.DOM.textarea({
            type: "text",
            // placeholder: "New Event"
            value: this.props.value,
            onChange: this.handleChange,
            placeholder: "Description",
            rows: 10,
            id: "descriptionTextArea"
        });
    }
});

var Checkbox = React.createClass({
    handleChange: function(event) {
        this.props.onInput(this.props.keyprop, event.target.checked);
    },
    render: function() {
        return React.DOM.input({
            type: "checkbox",
            checked: this.props.checked,
            onChange: this.handleChange
        });
    }
});

var Dropdown = React.createClass({
    handleChange: function(event) {
        this.props.onInput(this.props.keyprop, event.target.value);
    },
    render: function() {
        return React.DOM.select({
            value: this.props.value,
            onChange: this.handleChange
        }, this.props.options.map((option, index) => {
            return React.DOM.option({
                // could use option[0] here instead of index...
                key: this.props.keyprop + "Option" + index,
                onChange: this.handleChange,
                value: option[0],
                disabled: this.props.disabled || false
            }, option[1]);
        }));
    }
});

var Link = React.createClass({
    handleClick: function() {
        this.props.onInput(this.props.value);
    },
    render: function() {
        return React.DOM.a({
            // href: "",
            onClick: this.handleClick
        },
        this.props.value
        );
    }
});

var DatePicker = React.createClass({
    render: function() {
        return React.DOM.input({ type: "date" });
    }
});

var Capsule = React.createClass({
    handleDelete: function() {
        this.props.onDelete(this.props.keyprop, this.props.value);
    },
    render: function() {
        return React.DOM.span(
            {
                className: "capsule",
                style: { background: "ButtonHighlight" },
            },
            this.props.value,
            React.DOM.span({
                className: "deleteCapsule",
                onClick: this.handleDelete
            },
            "x"
            )
        );
    }
});

var TopComponent = React.createClass({
    getDefaultProps: function() {
        return {
            // these "initial" props are passed in as props but
            // immediately become state (state can change, props do not)
            initialTitle: "New Event",
            initialLocation: "",
            initialAllDay: false,
            initialRepeat: "none",
            initialRepeatUntilDate: "forever",
            initialReminders: 0,
            initialDescription: "",
            initialShowTimeAs: "OPAQUE",
            initialCalendarId: 0,
            initialPrivacy: 0,
            initialStatus: 0,
            initialPriority: 0,
            initialUrl: "",
            initialShowUrl: false,
            initialCategories: [],
            initialCategoriesList: [],
            initialAttachments: {},

            tabs: ["Description", "More", "Reminders", "Attachments", "Attendees"],
            calendarList: [
                [0, "Home"],
                [1, "Work"]
            ],
            privacyList: [
                ["NONE", "Not Specified"],
                ["PUBLIC", "Public Event"],
                ["CONFIDENTIAL", "Show Time and Date Only"],
                ["PRIVATE", "Private Event"]
            ],
            statusList: [
                ["NONE", "Not Specified"],
                ["TENTATIVE", "Tentative"],
                ["CONFIRMED", "Confirmed"],
                ["CANCELLED", "Canceled"]
            ],
            priorityList: [
                // XXX what about other numbers?
                [0, "Not Specified"],
                [9, "Low"],
                [5, "Normal"],
                [1, "High"]
            ],
            showTimeAsList: [
                ["OPAQUE", true],
                ["TRANSPARENT", false]
            ],
            repeatList: [
                ["none", "Does Not Repeat"],
                ["daily", "Daily"],
                ["weekly", "Weekly"],
                ["every.weekday", "Every Weekday"],
                ["bi.weekly", "Bi-weekly"],
                ["monthly", "Monthly"],
                ["yearly", "Yearly"],
                ["custom", "Custom..."]
            ],
            remindersList: [
                [0, "No Reminder"],
                [1, "0 Minutes Before"],
                [2, "5 Minutes Before"],
                [3, "15 Minutes Before"],
                [4, "30 Minutes Before"],
                [5, "1 Hour Before"],
                [6, "2 Hours Before"],
                [7, "12 Hours Before"],
                [8, "1 Day Before"],
                [9, "2 Days Before"],
                [10, "1 Week Before"],
                [11, "Custom..."]
            ],
            supportsPriority: false
        };
    },
    getInitialState: function() {
        // all the passed-in props that begin with 'initial' become state
        return {
            title: this.props.initialTitle,
            location: this.props.initialLocation,
            startTimezone: this.props.initialStartTimezone,
            endTimezone: this.props.initialEndTimezone,
            startDate: this.props.initialStartDate,
            startTime: this.props.initialStartTime,
            endDate: this.props.initialEndDate,
            endTime: this.props.initialEndTime,
            allDay: this.props.initialAllDay,
            repeat: this.props.initialRepeat,
            repeatUntilDate: this.props.initialRepeatUntilDate,
            reminders: this.props.initialReminders,
            description: this.props.initialDescription,
            showTimeAs: this.props.initialShowTimeAs,
            calendarId: this.props.initialCalendarId,
            privacy: this.props.initialPrivacy,
            status: this.props.initialStatus,
            priority: this.props.initialPriority,
            url: this.props.initialUrl,
            showUrl: this.props.initialShowUrl,
            categories: this.props.initialCategories,
            categoriesList: this.props.initialCategoriesList,
            attachments: this.props.initialAttachments,

            isWideview: (window.innerWidth > 750),
            activeTab: 0
        };
    },
    updateWideview: function() {
        let wideview = (window.innerWidth > 750);
        if (wideview != this.state.isWideview) {
            this.setState({ isWideview: wideview });
        }
    },
    componentWillMount: function() {
        this.updateWideview();
    },
    componentDidMount: function() {
        window.addEventListener("resize", this.updateWideview);
    },
    componentWillUnmount: function() {
        window.removeEventListener("resize", this.updateWideview);
    },
    exportState: function() {
        // Use this to access this component's state from above/outside
        // the react component hierarchy, for example, when saving changes.
        return this.state;
    },
    importState: function(aStateObj) {
        // Use this to impose state changes from above/outside of the
        // react component hierarchy.
        this.setState(aStateObj);
    },
    handleSimpleChange: function(aKey, aValue) {
        let obj = {};
        obj[aKey] = aValue;
        this.setState(obj);
    },
    handleShowTimeAsChange: function(aKey, aValue) {
        // convert from true/false to OPAQUE/TRANSPARENT
        let list = this.props.showTimeAsList;
        let index = list.findIndex(i => (i[1] == aValue));
        let newValue = list[index][0];
        this.handleSimpleChange(aKey, newValue);
    },
    linkClicked: function(aValue) {

    },
    onDeleteCapsule: function(aKey, aValue) {
        let a = this.state[aKey];
        let index = a.indexOf(aValue);
        a.splice(index, 1);
        this.setState({ aKey: a });
    },
    render: function() {
        // 'key' doesn't seem to work as a prop name (presumably because
        // already used by react?), so using 'keyprop' instead for now.
        let titleDiv = React.DOM.div(
            { id: "titleDiv", className: "box" },
            "Title ",
            React.createElement(TextField, {
                keyprop: "title",
                value: this.state.title,
                onInput: this.handleSimpleChange
            })
        );
        let locationDiv = React.DOM.div(
            { id: "locationDiv", className: "box" },
            "Location ",
            React.createElement(TextField, {
                keyprop: "location",
                value: this.state.location,
                onInput: this.handleSimpleChange
            })
        );
        let startDiv = React.DOM.div(
            { id: "startDiv", className: "box" },
            "Start ",
            // React.createElement(DatePicker, { }),
            React.createElement(TextField, {
                keyprop: "startDate",
                value: this.state.startDate,
                onInput: this.handleSimpleChange
            }),
            React.createElement(TextField, {
                keyprop: "startTime",
                value: this.state.startTime,
                onInput: this.handleSimpleChange
            })
        );
        let endDiv = React.DOM.div(
            { id: "endDiv", className: "box" },
            "End ",
            React.createElement(TextField, {
                keyprop: "endDate",
                value: this.state.endDate,
                onInput: this.handleSimpleChange
            }),
            React.createElement(TextField, {
                keyprop: "endTime",
                value: this.state.endTime,
                onInput: this.handleSimpleChange
            })
            // React.createElement(DatePicker, { }),
        );
        let allDayDiv = React.DOM.div(
            { id: "allDayDiv", className: "box" },
            React.createElement(Checkbox, {
                keyprop: "allDay",
                checked: this.state.allDay,
                onInput: this.handleSimpleChange
            }),
            "All day event"
        );
        let repeatDiv = React.DOM.div(
            { id: "repeatDiv", className: "box" },
            "Repeat ",
            React.createElement(Dropdown, {
                keyprop: "repeat",
                value: this.state.repeat,
                options: this.props.repeatList,
                onInput: this.handleSimpleChange
            }),
            (this.state.repeat == "none" ? null : " Until "),
            (this.state.repeat == "none"
                ? null
                : React.createElement(TextField, {
                    keyprop: "repeatUntilDate",
                    value: this.state.repeatUntilDate,
                    onInput: this.handleSimpleChange
                }))
        );
        let calendarDiv = React.DOM.div(
            { id: "calendarDiv", className: "box" },
            "Calendar ",
            React.createElement(Dropdown, {
                keyprop: "calendarId",
                value: this.state.calendarId,
                options: this.props.calendarList,
                onInput: this.handleSimpleChange
            })
        );
        let categoriesCapsules;
        if (this.state.categories) {
            categoriesCapsules =
                this.state.categories.map((cat, index) => {
                    return React.createElement(Capsule, {
                        // color: this.props.categoryList.color,
                        value: cat,
                        key: cat + "key",
                        keyprop: "categories",
                        onDelete: this.onDeleteCapsule
                    });
                });
        } else {
            categoriesCapsules = null;
        }
        let categoriesDiv = React.DOM.div(
            { id: "categoriesDiv", className: "box" },
            "Categories ",
            categoriesCapsules,
            React.createElement(Link, {
                value: "Add Categories",
                onInput: this.linkClicked
            })
        );
        let attendeesDiv = React.DOM.div(
            { id: "attendeesDiv", className: "box" },
            "Attendees ",
            React.createElement(Link, {
                value: "Add Attendees",
                onInput: this.linkClicked
            })
        );
        let remindersDiv = React.DOM.div(
            { id: "remindersDiv", className: "box" },
            "Reminders ",
            React.createElement(Dropdown, {
                keyprop: "reminders",
                value: this.state.reminders,
                options: this.props.remindersList,
                onInput: this.handleSimpleChange
            })
        );
        let attachmentsDiv = React.DOM.div(
            { id: "attachmentsDiv", className: "box" },
            "Attachments ",
            React.createElement(Link, {
                value: "Add Attachments",
                onInput: this.linkClicked
            })
        );
        let urlDiv = (this.state.showUrl ?
            React.DOM.div(
            { id: "urlDiv", className: "box" },
            "Event link ",
            React.createElement(Link, {
                value: this.state.url,
                onInput: this.linkClicked
            }))
            : null
        );

        let privacyDiv = React.DOM.div(
            { id: "privacyDiv", className: "box" },
            "Privacy ",
            React.createElement(Dropdown, {
                keyprop: "privacy",
                value: this.state.privacy,
                options: this.props.privacyList,
                onInput: this.handleSimpleChange
            })
        );
        let statusDiv = React.DOM.div(
            { id: "statusDiv", className: "box" },
            "Status ",
            React.createElement(Dropdown, {
                keyprop: "status",
                value: this.state.status,
                options: this.props.statusList,
                onInput: this.handleSimpleChange
            })
        );
        let priorityDiv = React.DOM.div(
            { id: "priorityDiv", className: "box" },
            "Priority ",
            React.createElement(Dropdown, {
                keyprop: "priority",
                value: this.state.priority,
                options: this.props.priorityList,
                onInput: this.handleSimpleChange,
                disabled: !this.props.supportsPriority
            })
        );

        let tIndex = this.props.showTimeAsList.findIndex(i => (i[0] == this.state.showTimeAs));
        let showTimeAsDiv = React.DOM.div(
            { id: "showTimeAsDiv", className: "box" },
            React.createElement(Checkbox, {
                keyprop: "showTimeAs",
                checked: (tIndex == -1 ? false : this.props.showTimeAsList[tIndex][1]),
                onInput: this.handleShowTimeAsChange,
                options: this.props.showTimeAsList
            }),
            "Show Time As Busy"
        );
        let descriptionDiv = React.DOM.div(
            { id: "description", value: "Description" },
            React.createElement(TextArea, {
                keyprop: "description",
                value: this.state.description,
                onInput: this.handleSimpleChange
            })
        );

        if (this.state.isWideview) {
            // wideview
            return React.DOM.div(
                { id: "topwrapper" },
                React.DOM.div(
                    { className: "wrapper" },
                    titleDiv,
                    startDiv,
                    endDiv,
                    allDayDiv,
                    repeatDiv,
                    attendeesDiv,
                    locationDiv,
                    calendarDiv,
                    categoriesDiv,
                    remindersDiv,
                    attachmentsDiv,
                    urlDiv
                    ),
                descriptionDiv,
                React.DOM.div(
                    { className: "wrapper", id: "wrapper2" },
                    privacyDiv,
                    statusDiv,
                    priorityDiv,
                    showTimeAsDiv
                )
            );
        } else {
            // narrowview
            let tabpanelChildren = [
                descriptionDiv,
                React.DOM.div({
                    className: "wrapper",
                    style: { flexDirection: "column" },
                }, statusDiv, priorityDiv, showTimeAsDiv),
                remindersDiv,
                attachmentsDiv,
                attendeesDiv
            ];
            let tabpanels = this.props.tabs.map((elem, index) => {
                return React.DOM.div({
                    className: "box tabpanel " + (this.state.activeTab == index ? "" : "hidden"),
                    key: "tabpanelkey " + index
                }, tabpanelChildren[index]);
            });
            return React.DOM.div({ id: "topwrapper" },
                React.DOM.div({ className: "wrapper" },
                    titleDiv,
                    locationDiv,
                    startDiv,
                    endDiv,
                    allDayDiv,
                    repeatDiv,
                    React.DOM.div(
                        { style: { flexDirection: "row", display: "flex" } },
                        calendarDiv,
                        privacyDiv
                    ),
                    categoriesDiv,
                    React.createElement(
                        Tabstrip, {
                            tabs: this.props.tabs,
                            keyprop: "activeTab",
                            activeTab: this.state.activeTab,
                            onInput: this.handleSimpleChange
                        }),
                    tabpanels,
                    urlDiv
                )
            );
        }
    }
});

window.onload = function() {
    onLoad();
};

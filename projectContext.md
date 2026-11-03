# GLOBAL TRANSPORT CRM

## Complete Project Context Handoff Document

This document reconstructs the full CRM project context established throughout the conversation. It is intended to be provided directly to another AI or development team so work can continue without access to the original chat.

Where requirements evolved, the most recent rule is treated as canonical, while earlier decisions and changes are noted.

---

# Part 1 — Project Foundation, Product Vision and Current Status

## 1. Project Purpose

The project is a bespoke enterprise CRM for businesses selling, brokering and operating:

- Coach hire
- Minibus hire
- Bus hire
- Airport transfers
- Corporate transport
- School transport
- Event transport
- Tours
- Chauffeur and executive transport
- Multi-country group transport services

The CRM must manage the complete business lifecycle:

```text
Lead received
→ Enquiry created
→ User assigned
→ Customer contacted
→ Cost estimated
→ Quote created
→ Quote sent
→ Customer accepts or rejects
→ Invoice issued
→ Customer pays
→ Payment verified
→ Transport company or driver allocated
→ Journey completed
→ Final supplier costs confirmed
→ Final margin calculated
→ User commission calculated
→ Financial reporting and optimisation
```

The system is intended to support a transport brokerage as well as businesses that operate their own drivers and vehicles.

The CRM must be capable of handling multiple:

- Companies
- Brands
- Websites
- Countries
- Currencies
- Sales teams
- Operations teams
- Accounts teams
- Transport companies
- Drivers
- Customer communication channels

The CRM should feel like a premium enterprise platform comparable in usability to established CRM and business-management products, but designed specifically around coach, minibus and transport operations.

---

## 2. Existing CRM Context

A public login page was provided:

```text
https://transportcrm.co.uk/admin/login
```

A business email login identifier was also provided in the conversation, but no usable password was supplied. The value entered as the password was the login URL again.

No authenticated inspection of the existing CRM was completed.

Therefore:

- The requirements in this document are based on the user's requested future system.
- They are not a verified inventory of the current production CRM.
- No assumptions should be made that any backend feature already exists.
- Existing data structures, APIs and integrations still need to be inspected separately.
- Credentials must not be copied into development documentation or source control.

Publicly described features of the referenced CRM were mentioned as possible benchmarks, including quoting, booking calendars, invoicing, driver functionality, vehicle tracking, broker functionality and supplier invoice uploads. These were not verified inside an authenticated session.

---

## 3. Product Naming

The main project has been referred to as:

- Global Transport CRM
- Transport CRM
- Global Transport Control Centre

The generated React prototype uses the temporary interface name:

```text
TransFlow Enterprise CRM
```

This is only a placeholder front-end name and has not been approved as the final product name.

The final product name remains unresolved.

---

## 4. Chosen Graphic Design

Five CRM design concepts were requested.

The user selected:

```text
Template 4 — Sunset Orange
```

The design direction is now:

- Sunset orange primary accent
- Charcoal or dark navy sidebar
- White content background
- Very light grey application background
- Emerald green for confirmed, paid and completed states
- Amber for pending, warning and attention states
- Red for overdue, rejected, failed and cancelled states
- Blue can be used for informational states
- Rounded cards
- Spacious layouts
- Large readable typography
- Modern icons
- Minimal visual clutter
- Responsive desktop, tablet and mobile layouts
- Optional dark mode
- Premium enterprise appearance

The React prototype currently uses approximately:

```text
Primary orange: #f97316
Dark sidebar: #192233
Light application background: #f6f7fb
```

The exact design-token system should be formalised later.

---

## 5. Current Development Status

A React and Tailwind front-end prototype has already been created.

### Technology used in the prototype

- React
- Vite
- Tailwind CSS
- JavaScript
- Lucide React icons
- Recharts
- Static demonstration data

### Existing prototype package

The package was created as:

```text
global-transport-crm-sunset-orange.zip
```

The underlying source folder was:

```text
/mnt/data/transport-crm
```

### Prototype modules with interactive demonstration screens

- Global Transport Control Centre
- Leads
- Accounting
- Commissions
- Attendance
- Email Centre
- AI Optimisation
- Business Intelligence

### Prototype modules represented in navigation but currently placeholders

- Quotes
- Bookings
- Dispatch
- Customers
- Suppliers
- WhatsApp
- Calls
- Live Chat
- Documents
- Automations
- KPIs and Targets
- Team Chat
- Tasks
- Customer Experience
- Integrations

### Prototype interactions already demonstrated

- Navigation between modules
- Responsive mobile sidebar
- Global search field
- Brand selector
- New Lead action
- Clock-in, break and clock-out states
- Claiming a lead from the open pool
- Bank-transfer payment verification
- AI opportunity approval
- Email reply demonstration
- KPI charts
- Revenue and profit charts
- Lead-channel charts
- Team performance table
- Global operations map-style panel

### Prototype limitations

The existing package is a front-end prototype, not a production CRM.

It currently does not include:

- Production database
- Authentication
- Role-based access enforcement
- Real Google Maps
- Real Stripe payments
- Bank feeds
- Email account integration
- WhatsApp Business integration
- Telephony integration
- Live chat integration
- File storage
- Background jobs
- Webhooks
- Real AI model integration
- Server-side accounting ledger
- Supplier portal
- Customer portal
- Driver application
- Production audit trail
- Automated tests
- Deployment configuration for a chosen hosting environment

The npm package registry timed out in the original environment, so a compiled production `dist` folder was not generated there. The source is intended to be installed and built with:

```bash
npm install
npm run dev
npm run build
```

---

## 6. Other Existing Artifacts

### Initial slideshow

An initial PowerPoint was created:

```text
Global_Transport_CRM_User_Guide_Demo.pptx
```

It contains a basic approximately ten-slide overview covering:

- Introduction
- System overview
- Dashboard
- Lead management
- Quoting and bookings
- Operations
- Accounting
- AI
- Administration
- Closing overview

It is not the final complete training presentation.

A future complete training presentation was proposed at approximately 120–150 slides, with real screenshots and detailed demonstrations.

### Graphic-design concepts

A CRM template image collection was generated with a file name similar to:

```text
crm_dashboard_ui_templates_collection.png
```

The user chose Sunset Orange from those concepts.

### Quote-screen design

The user requested a graphic design showing how a user adds a quote.

A generated graphic file was created with the filename:

```text
واجهة_مستخدم_لإنشاء_الاقتباس.png
```

The image-generation response was not successfully displayed in the conversation, so the design needs to be reopened, reviewed or recreated.

---

# Part 2 — Business Structure, Users, Roles and Permissions

## 7. System User Types

The CRM must support a role hierarchy with both predefined and custom roles.

### 7.1 Master Admin

The Master Admin is the system owner and highest-level user.

The Master Admin can:

- Create users
- Invite users
- Suspend users
- Disable users
- Delete or deactivate users
- Reset passwords
- Force password changes
- End all active user sessions
- Require two-factor authentication
- Assign roles
- Create custom roles
- Assign permissions
- Assign users to teams
- Assign users to countries and territories
- Assign users to brands
- Assign users to offices and branches
- Assign lead-routing rules
- Assign dispatch modes
- Configure automatic dispatch
- Configure AI auto-quoting
- Configure accounting
- Configure bank accounts
- Configure Stripe
- Configure email integrations
- Configure WhatsApp and telephony
- Configure system-wide automations
- Configure commissions
- Configure company identities
- Configure email branding
- Configure invoice branding
- Configure document templates
- View all financial reporting
- View all user performance
- View all attendance
- View all audit logs
- Export company data
- Manage integrations and API keys
- Create another Master Admin
- Change ownership-level settings
- Permanently close or remove company-level data, subject to financial retention requirements

Only the Master Admin should normally be able to:

- Create another Master Admin
- Change account ownership
- Configure legal company identities
- Configure global accounting settings
- Configure group-wide bank accounts
- Configure high-risk AI automation
- Permanently delete or close the full tenant

---

### 7.2 Administrator

An Administrator can manage most operational areas but cannot:

- Remove the Master Admin
- Change ownership
- Change highly sensitive company-level settings unless explicitly authorised
- Permanently remove posted accounting records

---

### 7.3 Sales Manager

The Sales Manager can:

- View users in assigned teams
- View team enquiries
- View team quotes
- Reassign leads
- Review response times
- Review conversion rates
- Set or monitor targets
- Approve pricing or discounts where permitted
- Review user performance
- View team revenue
- View team profit if permitted
- Review follow-up performance
- Approve certain commission or quote exceptions

---

### 7.4 Sales User

A Sales User can normally:

- Receive leads
- Claim leads from permitted lead pools
- Create manual enquiries
- Contact customers
- Create quotations
- View AI cost estimates
- Enter a manual selling price
- Send quotations
- Follow up quotations
- View their own bookings
- View payment status
- View their own revenue
- View their own targets
- View estimated and approved commission
- Use assigned brands
- Use assigned email accounts
- Clock in and clock out

A Sales User must not normally be able to:

- Mark bank transfers as paid
- Edit posted payments
- Delete accounting records
- View all users' salaries or commissions
- View supplier bank details unless required
- View full company bank balances
- Change company legal details
- Change global accounting settings
- Configure automatic AI quoting
- Configure system-wide dispatch rules

---

### 7.5 Operations Manager

The Operations Manager can:

- Manage accepted and paid bookings
- Allocate transport companies
- Allocate drivers
- Review automatic dispatch
- Override dispatch
- Reassign jobs
- Manage supplier responses
- Review live operations
- Review driver and vehicle details
- Handle operational alerts
- Confirm job completion
- Review supplier compliance

---

### 7.6 Operations User

An Operations User can perform operational work within assigned permissions, such as:

- Send jobs
- Allocate suppliers
- Allocate drivers
- Request vehicle details
- Request driver details
- Update journey status
- Record operational notes
- Complete operational checklists

---

### 7.7 Finance Manager

The Finance Manager can:

- Review customer invoices
- Verify bank transfers
- Reconcile bank accounts
- Approve supplier invoices
- Process refunds
- Issue credit notes
- Review tax reports
- Review accounting reports
- Approve final job costs
- Approve commissions where required
- Manage payroll commission exports

---

### 7.8 Accounts User

An Accounts User can:

- Process invoices
- Record payments
- Match bank transactions
- Verify bank transfers if authorised
- Review supplier invoices
- Process day-to-day finance work
- Send payment reminders
- Export permitted reports

Approval limits may restrict:

- Refund amounts
- Supplier invoice amounts
- Journal entries
- Credit notes
- Write-offs

---

### 7.9 Read-Only User

A Read-Only User can view only the modules and records explicitly permitted.

They cannot:

- Create
- Edit
- Delete
- Send
- Approve
- Export, unless export permission is separately enabled

---

### 7.10 Transport Company / Supplier User

A transport company receives access to a supplier portal.

Supplier users can only access:

- Their company profile
- Their fleet
- Their documents
- Job offers sent to them
- Jobs allocated to them
- Their submitted prices
- Their driver and vehicle submissions
- Their invoices
- Their payment statuses
- Messages made available to them

They must not see:

- Other transport companies
- Internal sales margin
- Customer information before release
- Internal staff notes
- Customer selling price unless specifically configured
- Global supplier database

---

### 7.11 Driver

A driver can only access:

- Jobs offered directly to them
- Jobs allocated to them
- Journey information required to perform the job
- Navigation
- Operational updates
- Driver checklists
- Upload functions
- Expense submission
- Incident reporting

---

### 7.12 Auditor or Accountant

An auditor or external accountant can receive read-only access to:

- General ledger
- Trial balance
- Invoices
- Supplier bills
- Bank reconciliation
- Tax reports
- Audit history
- Supporting documents

---

### 7.13 Brand Administrator

A Brand Administrator can manage only the brands explicitly assigned to them.

They may manage:

- Brand templates
- Brand users
- Brand inboxes
- Brand reporting
- Brand-specific operational settings

They should not automatically have access to other brands.

---

## 8. Custom Permission System

The Master Admin must be able to create custom roles using granular permissions.

Permission examples include:

### Enquiries

- View enquiries
- Add enquiries
- Edit enquiries
- Delete enquiries
- View own enquiries
- View team enquiries
- View all enquiries
- Reassign enquiries
- Claim open leads
- Return leads to pool

### Quotes

- Create quotations
- Edit quotations
- Send quotations
- Resend quotations
- Cancel quotations
- Apply discounts
- Override AI pricing
- View supplier cost
- View selling price
- View estimated margin
- View final margin
- Approve low-margin quotes
- Manually accept a quote
- Change quote expiry

### Bookings and dispatch

- View bookings
- Edit bookings
- Dispatch jobs
- Send jobs manually
- Use assisted dispatch
- Use automatic dispatch
- Override automatic allocation
- Reassign supplier
- Reassign driver
- Confirm completion
- Cancel booking

### Finance

- View invoices
- Create invoices
- Edit draft invoices
- Approve invoices
- Verify bank transfers
- Record payments
- Process refunds
- Issue credit notes
- View bank details
- View profit
- View commissions
- Approve commissions
- Export financial information

### Suppliers

- Add transport companies
- Invite suppliers
- Approve suppliers
- Edit supplier records
- View supplier prices
- View supplier performance
- Send supplier jobs
- Suspend suppliers
- Override expired documents

### Administration

- Add users
- Change roles
- Manage brands
- Manage templates
- Manage integrations
- Manage workflow automation
- Change accounting settings
- Export company data
- View audit logs

Sensitive permissions should be disabled by default for ordinary users.

---

## 9. User Creation and Invitation

The Master Admin can create a user using:

- Full name
- Email
- Telephone
- Job title
- Department
- Username
- Temporary password or password-setup invitation
- Role
- Account status
- Preferred language
- Default currency
- Assigned company
- Assigned brand
- Assigned office
- Assigned branch
- Assigned countries
- Assigned territories
- Manager
- Team
- Profile photograph
- Email signature configuration
- Account expiry date
- Two-factor authentication requirement

The invitation email should include:

- CRM login link
- Username
- Secure password-setup link
- Company information
- Activation instructions

The user should be required to create a new password on first login.

Passwords must not be emailed in plain text.

---

## 10. User Management

The Master Admin can:

- Activate
- Suspend
- Disable
- Archive
- Change role
- Change permissions
- Change territory
- Change team
- Change manager
- Reset password
- Force password reset
- Require two-factor authentication
- Log the user out from every device
- Set access expiry
- Transfer records when the user leaves
- Reassign customers
- Reassign enquiries
- Reassign bookings
- Reassign tasks

Historical records should retain the original user attribution even if the user is later deactivated.

---

# Part 3 — Multi-Company, Brand and Legal Identity Management

## 11. Multi-Brand Architecture

The CRM must support multiple brands and legal companies within one environment.

Examples used during requirements discussion include:

- Global Bus Rental
- Coach Hire Rental
- Prime Coach Hire
- Coach Hire Dubai
- Buses Dubai
- A2B Transport Agency

These are examples, not necessarily the final complete brand list.

Each brand profile should contain:

- Legal company name
- Trading name
- Company registration number
- VAT or tax number
- Registered address
- Trading address
- Telephone
- Email
- Website
- Logo
- Secondary logo
- Favicon
- Brand colours
- Email header
- Email footer
- Social-media links
- Terms and conditions
- Privacy-policy link
- Cancellation policy
- Payment instructions
- Bank accounts
- Default currency
- Default language
- Quote numbering pattern
- Booking numbering pattern
- Invoice numbering pattern
- Receipt numbering pattern
- Credit-note numbering pattern

---

## 12. Brand Assignment

The Master Admin can assign:

- One default brand to a user
- Multiple authorised brands to a user
- A brand to a team
- A brand to a country
- A brand to an office
- A brand to a website
- A brand to a lead source
- A brand to a customer
- A brand to a booking

A lead received from a particular website should automatically receive the matching brand.

Example:

```text
Lead received from coachhiredubai.com
→ Brand: Coach Hire Dubai
→ Currency: AED
→ Dubai email identity
→ Dubai quote template
→ Dubai invoice company details
→ Dubai bank account
→ Dubai terms and conditions
```

---

## 13. Brand Resolution Priority

The system should determine the brand using the following general priority:

```text
Website or lead source
→ Existing customer or contracted account
→ Explicit booking brand
→ Assigned team
→ Assigned office
→ User default brand
→ Manual selection by authorised user
```

The exact rule order should be configurable by the Master Admin.

---

## 14. Brand Selector

A user authorised to work across multiple brands should see a clear brand selector in the header.

The active brand controls:

- Dashboard context
- Leads displayed
- Email sender identity
- Email signature
- Email templates
- Quote templates
- Invoice details
- Bank details
- Default currency
- Terms and conditions
- Reports
- Numbering sequences

The active brand must always be clearly visible to prevent users from sending a quote or invoice under the wrong identity.

---

## 15. Historical Brand Immutability

When a quote, invoice, receipt or booking document is issued, the exact brand configuration used at that moment must be stored.

Later changes to:

- Logo
- Address
- Legal company name
- Bank details
- Tax registration
- Terms
- Template layout

must not silently alter historical documents.

Historical documents should use a stored template version or rendered document snapshot.

---

## 16. Email Branding by User and Brand

The Master Admin can configure for each user and brand:

- Sender display name
- Sender email address
- Reply-to address
- User name
- Job title
- Direct telephone
- WhatsApp number
- Company name
- Company logo
- Brand colours
- Signature layout
- Legal disclaimer
- Office address
- Website
- Social links
- User photograph, optionally
- Department
- Review or accreditation badges

The Master Admin can:

- Lock signatures
- Allow editing of selected fields only
- Preview signatures
- Create separate signatures by brand
- Create plain-text fallback signatures
- Create mobile-friendly signatures
- Add campaign banners
- Schedule temporary promotional banners
- Require legal text

Users must not be able to remove mandatory legal information.

---

## 17. Invoice Branding

Invoices must display the correct company identity for the booking:

- Logo
- Legal company name
- Trading name
- Registered address
- Company number
- VAT or tax number
- Telephone
- Email
- Website
- Invoice number
- Quote reference
- Booking reference
- Customer details
- Journey details
- Currency
- Net amount
- Tax
- Gross amount
- Deposit requirement
- Amount paid
- Balance
- Payment terms
- Bank details
- Stripe link
- Terms
- Legal footer

Bank details must be selected according to:

- Legal company
- Brand
- Currency
- Country
- Customer type
- Payment method

The system must prevent bank details belonging to one legal company from being placed on another company's invoice.

---

# Part 4 — Core Business Entities and Relationships

## 18. Main Entities

The expected domain model includes at least:

- Tenant or organisation
- Legal company
- Brand
- Office
- Branch
- Department
- Team
- User
- Role
- Permission
- Territory
- Lead source
- Lead
- Enquiry
- Customer
- Customer contact
- Journey
- Journey leg
- Stop or via point
- Quote
- Quote version
- Quote option
- Quote line item
- Customer decision
- Booking
- Invoice
- Invoice line
- Payment
- Refund
- Credit note
- Bank account
- Bank transaction
- Supplier
- Supplier depot
- Supplier service area
- Supplier user
- Supplier document
- Supplier vehicle
- Driver
- Driver document
- Job offer
- Supplier response
- Driver response
- Dispatch wave
- Job allocation
- Job status event
- Supplier invoice
- Expense
- Accounting account
- Journal
- Journal entry
- Currency
- Exchange rate
- Commission plan
- Commission record
- Payroll batch
- Attendance record
- Shift
- Break
- Leave request
- Email account
- Email conversation
- Email message
- WhatsApp conversation
- Call record
- Live-chat conversation
- Task
- Workflow
- Workflow execution
- Document
- Template
- Notification
- Audit event
- AI estimate
- AI recommendation
- AI action
- KPI
- Target
- Survey
- Customer feedback
- Complaint
- API key
- Webhook subscription

---

## 19. Important Entity Relationships

A lead may:

- Come from one channel
- Belong to one brand
- Be assigned to one user
- Be reassigned many times
- Create one enquiry
- Merge with an existing customer
- Be linked to multiple communication records

An enquiry may:

- Belong to one customer
- Contain one or more journey legs
- Generate one or more quote versions
- Have an AI cost estimate
- Have multiple users involved
- Become one booking

A quote may:

- Belong to an enquiry
- Have multiple versions
- Have multiple vehicle or pricing options
- Use one currency
- Define allowed payment methods
- Define allowed deposit percentages
- Be viewed, accepted, rejected or expired
- Generate an invoice when accepted

A booking may:

- Belong to one accepted quote
- Belong to one customer
- Belong to one brand
- Have one assigned sales owner
- Have one or more journey legs
- Have one or more customer invoices
- Have one or more payments
- Be dispatched to many suppliers or drivers
- Be allocated to one final supplier or driver per operating requirement
- Have many direct costs
- Have one final margin
- Produce one or more commission records

A transport company may:

- Have many depots
- Have many service areas
- Have many vehicles
- Have many supplier users
- Have many documents
- Receive many job offers
- Submit many prices
- Perform many bookings
- Upload many supplier invoices

---

# Part 5 — Lead Capture and Omnichannel Lead Centre

## 20. Supported Lead Sources

Leads must enter the CRM through:

- Website quote forms
- Email
- WhatsApp
- Telephone calls
- Live chat
- Manual user entry
- Social-media messages
- Partner websites
- Affiliate websites
- API integrations
- Advertising lead forms where integrated

Every lead must retain its original source permanently.

---

## 21. Unified Omnichannel Lead Inbox

All leads and customer conversations should enter one central workspace called:

```text
Omnichannel Lead Centre
```

Suggested queues:

- New
- Assigned to Me
- My Assigned Leads
- Leads I Have Taken
- Open Lead Pool
- Available Leads
- Unassigned
- Awaiting Response
- Follow-Up Due
- Unread Messages
- Urgent
- At Risk
- Closed

Each lead should display a source icon for:

- Website
- Email
- WhatsApp
- Telephone
- Live Chat

Users should not need to switch between unrelated applications to process enquiries.

---

## 22. Website Quote Form Integration

Website forms should connect using a secure API or webhook.

Data expected from a website form includes:

### Customer information

- Name
- Company
- Email
- Telephone
- WhatsApp
- Country
- Preferred language

### Journey information

- Pickup
- Destination
- Via points
- Travel date
- Pickup time
- Return date
- Return time
- Passenger count
- Vehicle requested
- Luggage
- Accessibility requirements
- Special requirements
- Notes

### Attribution information

- Website
- Brand
- Landing page
- Referrer
- UTM source
- UTM medium
- UTM campaign
- UTM term
- UTM content
- Advertising click reference where available
- Selected website language
- Browser language
- Customer IP country
- Date and time
- Consent data

### Website lead processing

```text
Submission received
→ Validate required fields
→ Run spam checks
→ Detect duplicate
→ Identify brand
→ Geocode journey
→ Estimate value and cost
→ Apply routing rules
→ Assign user or open pool
→ Send acknowledgement
→ Start response timer
```

Spam controls should include:

- CAPTCHA
- Rate limiting
- Duplicate detection
- Blocked IP rules
- Suspicious-pattern detection
- Honeypot fields where useful

---

## 23. Email Leads

Incoming emails should be analysed and converted into leads.

The system should extract:

- Name
- Email
- Telephone
- Journey date
- Pickup
- Destination
- Passenger count
- Vehicle requirement
- Return details
- Questions
- Attachments

If extraction confidence is high, the system may create the lead automatically.

If confidence is low, the email enters:

```text
Review Required
```

The original email must remain linked to the resulting lead.

Replies should update the existing enquiry where possible rather than creating duplicates.

Matching can use:

- Sender address
- Telephone number
- Quote reference
- Booking reference
- Invoice reference
- Existing conversation thread
- Journey similarity

---

## 24. WhatsApp Leads

The CRM should integrate with WhatsApp Business.

It should capture:

- Telephone number
- Profile name
- Message history
- Images
- Documents
- Voice notes
- Shared location
- Timestamps
- Delivery status
- Read status

Users should be able to:

- Reply from CRM
- Send approved templates
- Request journey details
- Send quotations
- Send invoices
- Send payment links
- Convert chat to a lead
- Link chat to a customer
- Link chat to a booking
- Transfer conversation
- Add internal notes

An optional WhatsApp assistant may collect:

- Pickup
- Destination
- Date
- Time
- Passengers
- Vehicle type
- Return details
- Email

The assistant should transfer to a user when:

- The customer requests a person
- The enquiry is complex
- Confidence is low
- The customer complains
- The journey is urgent
- The estimated value exceeds a configured threshold

---

## 25. Telephone Leads

The CRM should support an integrated call-handling screen.

When a call arrives, the user may see:

- Caller number
- Existing customer
- Previous enquiries
- Open quotes
- Upcoming bookings
- Outstanding balances
- Account owner

The quick telephone lead form should include:

- Customer name
- Telephone
- Email
- Pickup
- Destination
- Date
- Time
- Passengers
- Vehicle
- Notes

The form should autosave while the call is in progress.

Call records should capture:

- Incoming or outgoing
- User
- Start time
- End time
- Duration
- Missed call
- Call outcome
- Follow-up
- Lead created
- Quote created
- Booking created

Call recording may be integrated only with appropriate legal and consent controls.

Missed calls can:

- Create a callback task
- Create a provisional lead
- Match an existing customer
- Enter a territory queue
- Trigger an SMS or WhatsApp acknowledgement
- Escalate when not returned

---

## 26. Live Chat Leads

Website live chat should feed directly into the CRM.

Captured information includes:

- Name
- Email
- Telephone
- Website
- Current page
- Chat transcript
- Journey details
- Customer location
- Language
- Waiting time
- Assigned user

Live chat routing can use:

- Pickup country
- Website
- Language
- User availability
- Department
- Existing customer owner
- Round robin

Normally only clocked-in and available users should receive live chats.

Users can:

- Accept chat
- Transfer chat
- Invite another user
- Add an internal note
- Send files
- Send quote links
- Convert chat to lead
- Schedule follow-up
- Close
- Reopen

---

## 27. Duplicate Prevention

Potential duplicates should be detected using:

- Email
- Telephone
- WhatsApp
- Similar journey
- Same date
- IP address
- Existing conversation
- Quote reference
- Booking reference

Users should be offered:

- Merge
- Link
- Keep separate
- Mark unrelated

The CRM should not automatically merge important records unless the match is sufficiently reliable.

---

# Part 6 — Geographic Lead Routing and Open Lead Pool

## 28. User Territories

The Master Admin can assign users to:

- Countries
- Regions
- States
- Counties
- Cities
- Postcodes
- Airports
- Custom geographic zones
- Languages
- Websites
- Brands
- Lead types
- Vehicle types

Example:

```text
User A: United Kingdom
User B: France and Belgium
User C: UAE
User D: Germany, Austria and Switzerland
```

---

## 29. Lead Routing Location

The Master Admin chooses whether routing is based on:

- Pickup
- Destination
- Customer location
- Website country
- Both pickup and destination
- Custom rule

For transport enquiries, pickup should normally be the primary geographic routing value.

---

## 30. Lead Assignment Priority

The proposed default priority is:

```text
Existing customer owner
→ Dedicated account manager
→ Exact city or postcode
→ Region
→ Country
→ Language
→ Team round robin
→ Open lead pool
```

The Master Admin can reorder this logic.

---

## 31. Directly Assigned Leads

A matching lead appears under:

```text
My New Leads
```

The user should receive:

- Dashboard notification
- Email notification
- Optional SMS
- Optional push notification
- Response countdown
- Priority
- Source
- Journey summary
- Estimated value

The lead may be reserved for that user for a configurable period.

---

## 32. Open Lead Pool

Leads that do not match a dedicated user enter:

```text
Open Lead Pool
```

Eligible users can click:

```text
Take Lead
```

When taken:

- The lead becomes assigned to that user
- It leaves the pool
- Other users can no longer claim it
- The claim is timestamped
- The response timer begins
- Revenue attribution is assigned according to configured rules
- The lead appears in the user's dashboard

Database-level locking is required to stop two users claiming the same lead simultaneously.

---

## 33. Lead Pool Visibility

Visibility can be limited by:

- Country
- Region
- Language
- Team
- Department
- Brand
- Website
- Lead type
- Vehicle type
- Shift
- Experience
- Estimated value

Users should not automatically see every unassigned lead globally.

---

## 34. Round-Robin Options

When several users cover the same area, routing can use:

- Equal round robin
- Weighted round robin
- Fewest active leads
- Best conversion
- Fastest response
- Current availability
- Shift schedule
- Revenue target balancing

High-value leads may be weighted toward senior users.

---

## 35. Availability and Capacity

Assignment should consider whether a user is:

- Clocked in
- Working
- On break
- Away
- On leave
- Offline
- Outside working hours
- At maximum capacity

Capacity rules can include:

- Maximum new leads per hour
- Maximum active leads
- Maximum unanswered leads
- Daily allocation limit
- Territory-specific limit

---

## 36. Lead Release

A lead can return to the pool when:

- The user does not open it in time
- No valid first action is recorded
- The user goes offline
- The user clocks out
- The reservation expires
- A manager releases it
- The user returns it, where allowed

The user should receive a warning before automatic release.

---

## 37. Valid First Response

A first response should require a meaningful action such as:

- Customer called
- Email sent
- WhatsApp sent
- Quote created
- Meaningful note added
- Follow-up scheduled

Simply viewing a dashboard should not count as responding.

Opening a lead may be tracked separately from actual response.

---

## 38. Priority Leads

Priority may be determined from:

- Passenger count
- Estimated value
- Urgency
- Same-day travel
- Corporate customer
- Returning customer
- Airport booking
- Event booking
- VIP requirement
- International itinerary

Priority leads may go directly to senior users or managers.

---

# Part 7 — Enquiries and Journey Details

## 39. Enquiry Creation

Users can manually add a minibus or coach-hire enquiry.

The enquiry form must capture full customer and job details.

### Customer fields

- Company name
- Contact name
- Email
- Telephone
- Mobile
- WhatsApp
- Billing address
- Country
- VAT or tax number
- Preferred language
- Existing customer link
- Customer notes
- Account manager

### Journey fields

- Pickup date
- Pickup time
- Return date
- Return time
- One way
- Return
- Multi-day
- Disposal hire
- Pickup address
- Destination
- Via points
- Passenger count
- Luggage amount
- Vehicle required
- Seat capacity
- Wheelchair requirement
- Child seats
- Driver accommodation
- Ferry
- Flight number
- Cruise details
- Special requirements
- Customer-visible notes
- Internal notes

### Additional recommended fields

- Lead source
- Brand
- Assigned user
- Territory
- Quote deadline
- Response SLA
- Customer budget
- Accessibility details
- Meet-and-greet
- Signage
- Parking requirements
- Driver working-hour considerations
- Overnight itinerary
- Multiple vehicles
- Multiple journey legs

---

## 40. Enquiry Statuses

Proposed statuses:

- New
- Assigned
- Opened
- Contacted
- Awaiting Information
- Ready to Quote
- Quoting
- Quote Draft
- Awaiting Customer
- Accepted
- Declined
- Expired
- Cancelled
- Converted to Booking
- Completed

The system should distinguish lead status, quote status and booking status rather than using one status field for everything.

---

## 41. Enquiry Form UX

The form should be a step-by-step flow:

```text
1. Customer details
2. Journey details
3. Vehicle requirements
4. Additional requirements
5. Review and save
```

Requirements:

- Autosave
- Draft recovery
- Address autocomplete
- Returning-customer autocomplete
- Duplicate detection
- Inline validation
- Clear required fields
- Mobile support
- Ability to duplicate a previous enquiry
- Ability to create return legs and multiple legs

---

# Part 8 — AI Job Costing and Quote Assistant

## 42. User AI Cost Estimate

Users should see estimated job costs generated by AI.

The AI should consider:

- Pickup
- Destination
- Actual route distance
- Route duration
- Vehicle type
- Seat capacity
- Passenger count
- Date
- Time
- One-way, return, disposal or multi-day
- Waiting time
- Driver hours
- Overnight requirements
- Driver accommodation
- Parking
- Tolls
- Ferries
- Road charges
- Airport fees
- Event access fees
- Weekend rates
- Night rates
- Public-holiday rates
- Seasonal demand
- Country
- Local market
- Historical supplier prices
- Historical completed jobs
- Current supplier availability
- Currency

---

## 43. Estimate Display

The user should see:

- Low supplier-cost estimate
- Expected supplier cost
- High supplier-cost estimate
- Recommended selling price
- Estimated gross profit
- Estimated margin
- Confidence score
- Main cost factors
- Comparable historical jobs

Example used during discussion:

```text
Estimated Supplier Cost: €820–€980
Recommended Selling Price: €1,180
Suggested Gross Profit: €280
Suggested Margin: 23.7%
Confidence: High
```

This is an example only.

The AI should normally display a range, not a single guaranteed number.

---

## 44. Manual Pricing

Users retain the ability to manually enter:

- Supplier cost
- Selling price
- Discount
- Tax
- Currency
- Deposit
- Payment method
- Quote expiry

The AI must not overwrite a manually entered price without permission.

Warnings should appear when:

- Selling price is below estimated supplier cost
- Margin is below minimum
- Price is unusually high
- Known charges appear omitted
- Exchange rate is outdated
- Required data is missing

Depending on permissions, the user can:

- Continue
- Request manager approval
- Revise the quote

---

## 45. Comparable Jobs

The AI quote interface should show similar previous work, including:

- Route
- Vehicle
- Supplier cost
- Selling price
- Result
- Date
- Final margin
- Supplier

This provides evidence for the recommendation.

---

## 46. Customer Acceptance Probability

The AI may estimate acceptance likelihood at different prices.

Example:

```text
Recommended Price: €1,180
Estimated acceptance probability: 72%

At €1,100: approximately 81%
At €1,180: approximately 72%
At €1,300: approximately 55%
```

These values are guidance and must not be represented as guaranteed.

---

## 47. AI Quote Modes

The Master Admin controls three modes:

### Estimate Only

- AI calculates a recommendation
- User creates and sends the quote

### AI Draft Quote

- AI creates a complete quote draft
- User or manager reviews it
- User sends it

### AI Auto-Send

- AI calculates the price
- AI creates the quote
- AI sends it automatically
- Only when configured conditions pass

---

## 48. AI Auto-Quote Rules

Rules may be configured by:

- User
- Team
- Lead source
- Website
- Brand
- Country
- Region
- Vehicle type
- Journey type
- Customer type
- Quote value
- Time of day

Pricing controls include:

- Minimum gross profit
- Minimum margin
- Standard markup
- Country markup
- Vehicle markup
- Peak surcharge
- Weekend surcharge
- Night surcharge
- Public-holiday surcharge
- Airport fee
- Waiting-time charge
- Accommodation allowance
- Currency rounding
- Minimum booking price
- Maximum automatic quote value
- Contingency percentage

---

## 49. Confidence Rules

Confidence levels:

- High
- Medium
- Low

Low confidence may result from:

- New destination
- Unusual vehicle
- International route
- Ferry
- Border crossing
- Major event
- Limited supplier history
- Complex multi-day itinerary

Only high-confidence quotes should normally be eligible for automatic sending.

---

## 50. Auto-Quote Safety Restrictions

The CRM should not automatically send a quote when:

- Route is unclear
- Required details are missing
- Margin is below minimum
- Value exceeds configured limit
- Supplier availability is uncertain
- Ferry or border requirements are complex
- Confidence is below threshold
- A major event may affect pricing
- Customer has contracted rates
- Manual approval is required

Every estimate, edit, approval and automatic send must be audited.

---

# Part 9 — Quote Builder and Customer Decision

## 51. Quote Builder

The quote builder should display journey and customer details on one side and pricing controls on the other.

### Quote content

- Vehicle
- Vehicle description
- Supplier, optional before allocation
- Estimated supplier cost
- Confirmed supplier cost
- Selling price
- Margin
- Currency
- Tax
- Quote expiry
- Notes
- Attachments
- Terms
- Cancellation policy
- Payment options
- Deposit options

The system should support:

- One quote
- Multiple quote versions
- Multiple vehicle options
- Multiple price options
- Duplicate quote
- Revision history
- Live customer preview

---

## 52. Quote Payment Options

When sending the quote, the user chooses permitted payment methods using tick boxes:

- Stripe
- Bank transfer
- Both

The customer should only see the payment methods enabled for that quote.

---

## 53. Deposit and Partial Payment Options

The original required options are:

- 25%
- 50%
- Full payment

The expanded design also proposes:

- 75%
- Custom percentage
- Custom amount
- Multiple instalments

The canonical rule is:

- The user determines which options are available when sending the quote.
- The Master Admin can control which percentages users are allowed to offer.
- At minimum, 25%, 50% and full payment must be supported.

---

## 54. Quote Email

The customer receives a branded email containing:

- Journey details
- Vehicle
- Price
- Currency
- Quote reference
- Expiry
- Terms
- Accept button
- Reject button
- Link to customer quote page

---

## 55. Customer Quote Portal

The customer can:

- View quote
- View journey details
- View price
- View terms
- Accept
- Reject
- Download quote
- Ask a question
- Select a permitted payment option after acceptance

The CRM should track:

- Delivered
- Viewed
- Accepted
- Rejected
- Expired

---

## 56. Quote Rejection

When rejecting, the customer may choose:

- Too expensive
- Cancelled trip
- Booked elsewhere
- Dates changed
- Requirements changed
- Other

An optional free-text reason may be included.

The assigned user sees the rejection immediately in their dashboard.

---

## 57. Quote Statuses

- Draft
- Ready for Approval
- Approved
- Sent
- Delivered
- Viewed
- Awaiting Customer
- Accepted
- Rejected
- Expired
- Superseded
- Cancelled
- Converted to Booking

Dashboard filters should include:

- All Quotes
- Draft Quotes
- Sent Quotes
- Viewed
- Accepted
- Rejected
- Expired
- Paid
- Cancelled

Search by:

- Customer
- Email
- Reference
- Vehicle
- Journey date
- Country
- Currency
- User
- Brand

---

# Part 10 — Invoices, Customer Payments and Payment Verification

## 58. Invoice Creation

When the customer accepts a quote:

```text
Quote accepted
→ Booking created or confirmed
→ Invoice generated
→ Customer receives invoice email
→ Customer uses permitted payment method
```

The invoice includes:

- Invoice number
- Quote reference
- Booking reference
- Customer details
- Journey details
- Currency
- Net
- Tax
- Gross
- Deposit required
- Amount paid
- Outstanding balance
- Due date
- Payment methods
- Bank details
- Stripe link
- Payment history
- Downloadable PDF

---

## 59. Invoice Statuses

- Draft
- Issued
- Partially Paid
- Paid
- Overdue
- Cancelled
- Refunded
- Partially Refunded
- Written Off

---

## 60. Stripe Payments

Stripe payments should update automatically through webhooks.

On a successful payment:

- Payment recorded
- Invoice updated
- Booking updated
- Receipt generated
- Customer balance updated
- Accounting ledger updated
- User dashboard updated
- Commission estimate updated if relevant
- Notifications sent

Stripe events should include:

- Successful payment
- Partial payment
- Failed payment
- Refund
- Dispute
- Payout
- Processing fee

---

## 61. Bank Transfers

Bank transfers remain:

```text
Pending Verification
```

until a Manager, Finance Manager or authorised Accounts User verifies them.

Standard sales users cannot mark bank transfers as paid.

The bank-transfer verification queue shows:

- Customer
- Invoice
- Booking
- Sales user
- Amount due
- Amount received
- Currency
- Bank account
- Reference
- Payment date
- Remittance attachment
- Suggested invoice match

The authorised reviewer can:

- Approve full payment
- Approve partial payment
- Reject payment
- Request investigation
- Add note
- Allocate to another invoice
- Split across invoices where permitted

---

## 62. Result of Payment Verification

When bank transfer is approved:

- Payment is posted
- Invoice becomes Paid or Partially Paid
- Booking payment status updates
- User dashboard updates
- Collected revenue updates
- Customer balance updates
- Accounting ledger updates
- Receipt is generated
- Customer may be notified
- Assigned user is notified
- Commission remains pending until job completion

---

## 63. User Payment Visibility

The assigned user can see:

- Unpaid
- Deposit Paid
- Partially Paid
- Paid
- Refunded
- Payment Failed
- Overdue

The user's dashboard should update automatically after verification.

Users can:

- View status
- View payment history
- Send reminders
- Upload remittance advice

Users cannot:

- Mark bank transfer paid
- Delete payments
- Edit posted payments
- Reverse payments

---

## 64. Revenue Definitions

The CRM must keep these separate:

- Quoted Revenue
- Accepted Revenue
- Invoiced Revenue
- Collected Revenue
- Outstanding Revenue
- Deferred Revenue
- Cancelled Revenue
- Refunded Revenue

Accepted revenue must not be presented as cash collected.

---

# Part 11 — Transport Companies and Supplier Portal

## 65. Transport Company Creation

A CRM user can add a transport company.

Supplier information includes:

- Legal company name
- Trading name
- Country
- Contact
- Telephone
- Email
- WhatsApp
- Website
- Registered address
- Depot address
- Additional depots
- Fleet
- Vehicle capacities
- Currencies
- Languages
- Service areas
- Maximum radius
- Airport coverage
- International capability
- Emergency availability
- Bank details
- VAT details
- Rating
- Internal notes
- Preferred status
- Blocked status

---

## 66. Supplier Invitation and Registration

Process:

```text
User adds transport company
→ Invitation email sent
→ Supplier opens secure registration link
→ Supplier creates password
→ Supplier accepts registration
→ Supplier uploads required information
→ Internal review
→ Supplier approved
→ Supplier may receive jobs
```

Required uploads may include:

- Insurance
- Operator licence
- Vehicle list
- Driver details
- Bank details
- VAT information
- Company documents

Statuses may include:

- Invited
- Registration Pending
- Submitted
- Under Review
- Approved
- Suspended
- Rejected
- Expired Compliance

---

## 67. Supplier Portal Features

Suppliers can:

- Receive jobs
- Accept
- Reject
- Submit a price
- Request information
- Confirm availability
- Upload driver
- Upload vehicle
- Upload documents
- Message operations
- Upload invoice
- Mark journey complete
- View payment status
- Maintain fleet
- Maintain availability
- Maintain depots
- Maintain service areas

---

## 68. Supplier Rejection Reasons

- No vehicle
- Outside area
- Price too low
- Timing unavailable
- Vehicle type unavailable
- Driver unavailable
- Compliance issue
- Other

---

## 69. Supplier Performance

Supplier scoring should use:

- Acceptance rate
- Response speed
- Price competitiveness
- Completion rate
- Punctuality
- Complaint rate
- Customer feedback
- Vehicle quality
- Invoice accuracy
- Compliance
- Profit generated
- Cancellation rate

Supplier performance should feed into geo matching and AI optimisation.

---

# Part 12 — Google Maps, Geocoding and Smart Supplier Matching

## 70. Supplier Location Storage

Supplier addresses should use Google Places Autocomplete.

Store:

- Formatted address
- Latitude
- Longitude
- Google Place ID
- Country
- Region
- City
- Postal code

A supplier may have multiple depots.

---

## 71. Journey Geocoding

The system should geocode:

- Pickup
- Destination
- Via points
- Airports
- Hotels
- Venues
- Attractions

Coordinates should be stored so addresses do not need to be repeatedly geocoded.

---

## 72. Matching Basis

Suppliers can be matched by proximity to:

- Pickup
- Drop-off
- Both
- Selected via point
- Depot

Pickup should normally have the greatest weight because it determines dead mileage.

For long-distance one-way journeys, the CRM may identify:

- Suppliers near pickup
- Suppliers near destination
- Suppliers operating between both areas
- Suppliers with depots near both ends

---

## 73. Matching Filters

Distance alone is not sufficient.

The system must consider:

- Vehicle type
- Seat capacity
- Availability
- Operating region
- International permissions
- Airport access
- Port access
- Accessibility
- Luggage capacity
- Approval status
- Insurance validity
- Operator-licence validity
- Document expiry
- Rating
- Acceptance rate
- Response speed
- Price history
- Preferred status
- Blocked status

Expired suppliers should normally be excluded unless a Master Admin overrides.

---

## 74. Ranking Score

Supplier ranking can include:

- Distance from pickup
- Distance from destination
- Actual driving time
- Vehicle match
- Availability
- Rating
- Acceptance rate
- Response time
- Previous performance
- Price history
- Compliance
- Preferred relationship

The Master Admin can configure weightings.

---

## 75. Interactive Allocation Map

The booking page should display:

- Pickup marker
- Destination marker
- Via markers
- Supplier depots
- Nearby companies
- Distance
- Driving time
- Supplier status
- Matching vehicles

Clicking a supplier marker may show:

- Company
- Distance
- Fleet
- Rating
- Previous jobs
- Contact
- Send Job action

A sortable list must also be available.

---

## 76. Service Areas

Suppliers can define coverage using:

- Radius
- Cities
- Postcodes
- Counties
- Regions
- Countries
- Airports
- Custom drawn polygons

Different vehicles may have different service areas.

---

## 77. Efficient Map API Strategy

Recommended technical approach:

```text
Use stored coordinates
→ Fast straight-line geographic shortlist
→ Apply vehicle and compliance filters
→ Use Google Routes or route matrix only for shortlist
→ Rank using road distance and travel time
```

This reduces API cost.

---

# Part 13 — Manual, Assisted and Automatic Job Dispatch

## 78. Dispatch Modes

Each CRM user can be configured for:

### Manual Dispatch

The user selects suppliers or drivers and sends the job.

### Assisted Dispatch

The CRM recommends recipients, but the user approves sending.

### Automatic Dispatch

The CRM sends jobs using Master Admin rules.

---

## 79. Master Admin Dispatch Controls

Can be configured by:

- User
- Team
- Office
- Country
- Region
- Vehicle
- Job type
- Brand

Controls include:

- Manual, assisted or automatic mode
- Maximum recipients
- Search radius
- Minimum rating
- Minimum acceptance rate
- Required documents
- Dispatch delay
- Widening rules
- Override permission
- Approval for high-value jobs

---

## 80. Manual Multi-Send

Users can select multiple:

- Transport companies
- Individual drivers
- Preferred suppliers
- Nearby suppliers
- Suppliers with matching vehicles
- Suppliers near destination

Before sending, show:

- Recipients
- Distance
- Vehicle match
- Rating
- Supplier amount or request-for-price mode
- Response deadline
- Information being shared

---

## 81. Automatic Dispatch Waves

Suggested pattern:

### Wave 1

Send to the top three preferred matches.

### Wave 2

If no response after a configured interval, send to the next five.

### Wave 3

Expand the radius and send to additional companies.

### Final Escalation

Notify the assigned user, manager or Master Admin.

All numbers and times are configurable.

---

## 82. Allocation Modes

### First Accepted Wins

The first eligible acceptance receives provisional or final allocation.

### User Approval

An acceptance is provisional until the user approves.

### Best Offer

Suppliers submit prices and the user chooses.

### Ranked Auto-Selection

The system waits until a deadline and chooses using:

- Price
- Distance
- Rating
- Performance
- Match quality

For brokerage, manual selection or ranked selection may be safer than simple first acceptance.

---

## 83. Driver Dispatch

Direct drivers can also receive jobs.

Driver matching should check:

- Availability
- Assigned vehicle
- Capacity
- Current location
- Driving hours
- Licence validity
- Qualifications
- Existing work
- Distance to pickup

Drivers can:

- Accept
- Reject
- Request details
- Confirm arrival estimate

---

## 84. Preventing Double Allocation

Once awarded:

- Booking is locked
- Other recipients are notified
- Further acceptance is blocked
- Allocation method is recorded
- Reassignment creates a new audit entry

---

## 85. Information Privacy During Dispatch

Before acceptance, suppliers may see:

- Pickup area
- Destination area
- Date
- Time
- Passenger count
- Vehicle
- Luggage
- Special requirements
- Supplier amount or request for price

The system may hide:

- Customer name
- Exact private address
- Telephone
- Email

Sensitive information is released after formal assignment.

---

# Part 14 — Booking Operations

## 86. Booking Creation

An accepted quote becomes a booking.

The booking should retain:

- Enquiry
- Quote version
- Customer
- Brand
- Sales owner
- Journey
- Vehicle
- Customer selling price
- Estimated supplier cost
- Actual supplier cost
- Payment status
- Dispatch status
- Supplier
- Driver
- Vehicle details
- Operational notes
- Completion status
- Final margin
- Commission status

---

## 87. Booking Statuses

Suggested high-level statuses:

- Quote Accepted
- Awaiting Invoice
- Awaiting Payment
- Deposit Paid
- Paid
- Ready to Dispatch
- Supplier Search
- Supplier Offered
- Supplier Accepted
- Supplier Assigned
- Driver Details Pending
- Vehicle Details Pending
- Confirmed
- In Progress
- Completed
- Cancelled
- Refunded
- Closed

Payment, dispatch and journey statuses should preferably be separate fields rather than one overloaded status.

---

## 88. Operations View

The CRM should show:

- Today's journeys
- Tomorrow's journeys
- Unassigned jobs
- Supplier response status
- Driver details missing
- Vehicle details missing
- Jobs at risk
- In-progress journeys
- Completed journeys
- Cancelled journeys

---

# Part 15 — Full Accounting Suite

## 89. Accounting Scope

The Master Admin requires a complete accounting suite connected to:

- Quotes
- Bookings
- Customer invoices
- Stripe
- Bank transfers
- Supplier costs
- Supplier invoices
- Expenses
- Refunds
- Credit notes
- Commissions
- Multiple currencies

---

## 90. Financial Dashboard

Show:

- Sales revenue
- Revenue collected
- Revenue outstanding
- Gross profit
- Net profit
- Supplier costs
- Operating expenses
- Deposits
- Customer balances
- Supplier balances
- Tax payable
- Refunds
- Credit notes
- Stripe fees
- Bank fees
- Commission liability
- Cash position

Filters:

- Date
- User
- Team
- Office
- Brand
- Company
- Currency
- Country
- Customer
- Supplier

---

## 91. Supplier Costs

Booking cost fields include:

- Supplier price
- Driver expenses
- Accommodation
- Parking
- Tolls
- Ferry
- Airport fees
- Meet and greet
- Additional mileage
- Waiting time
- Overtime
- Processing fees
- Refunds
- Credit notes
- Other direct costs

The system should compare estimated versus actual cost.

---

## 92. Supplier Invoices

Suppliers upload invoices through their portal.

Fields:

- Supplier
- Supplier invoice number
- Booking
- Date
- Due date
- Currency
- Net
- Tax
- Total
- Approval status
- Payment status
- Attachment

Workflow:

```text
Supplier uploads
→ Booking and price matched
→ Accounts review
→ Manager approval
→ Scheduled for payment
→ Paid
```

Statuses:

- Submitted
- Under Review
- Approved
- Disputed
- Scheduled
- Paid
- Rejected

---

## 93. Expenses

Business expenses include:

- Advertising
- Wages
- Commission
- Software
- Telephone
- Rent
- Professional fees
- Travel
- Bank charges
- Stripe fees
- Insurance
- General expenses

Expenses may be:

- One-off
- Recurring
- Assigned to company
- Assigned to office
- Assigned to department
- Assigned to user
- Assigned to booking
- Assigned to country
- Assigned to cost centre

Receipts can be uploaded.

---

## 94. Chart of Accounts

Example categories:

### Assets

- Bank
- Stripe clearing
- Accounts receivable
- Prepaid expenses
- Deposits paid

### Liabilities

- Accounts payable
- Customer deposits
- Tax payable
- Accruals
- Supplier balances

### Income

- Coach hire
- Minibus hire
- Airport transfers
- Tours
- Chauffeur services
- Cancellation income
- Booking fees

### Cost of Sales

- Supplier transport
- Driver costs
- Vehicle hire
- Tolls
- Ferries
- Parking
- Accommodation

### Operating Expenses

- Marketing
- Payroll
- Software
- Office
- Professional services
- Bank fees

---

## 95. Double-Entry Accounting

Financial events must create balanced journal entries.

Examples:

- Customer invoice
- Customer payment
- Supplier invoice
- Supplier payment
- Refund
- Credit note
- Stripe fee
- Currency gain or loss

Posted records must not be edited invisibly.

Corrections use:

- Reversal
- Credit note
- Adjustment journal
- Write-off

---

## 96. Bank Accounts and Reconciliation

Bank-account fields:

- Company
- Brand
- Currency
- Country
- Account name
- Bank
- IBAN
- Sort code
- Account number
- SWIFT/BIC

Reconciliation should match:

- Customer payments
- Supplier payments
- Stripe payouts
- Bank transfers
- Refunds
- Fees
- Unmatched items

Support:

- Manual statement upload
- CSV import
- Direct bank feeds as an integration

---

## 97. Stripe Accounting

Record separately:

- Customer gross payment
- Stripe processing fee
- Net Stripe balance
- Payout
- Destination bank account
- Refund
- Dispute

---

## 98. Multi-Currency

Original user requirement:

```text
Default currency: EUR
Then USD
Then GBP
```

Expanded system behaviour:

- EUR is the initial operational default
- USD and GBP are prominently enabled
- Any authorised ISO currency can be supported
- AED is required for UAE brands and examples
- Brand defaults may override system default
- Quote currency is selected per quote
- Accounting base currency is configurable

Each transaction stores:

- Original currency
- Original amount
- Exchange rate
- Base-currency amount
- Rate date
- Rate source
- Currency gain or loss

Historical exchange rates must remain unchanged.

The prototype currently uses AED demonstration values, which does not replace the EUR default requirement.

---

## 99. Tax

Tax rules should be configurable by:

- Company
- Customer location
- Supplier location
- Service
- Tax rate
- Registration status
- Reverse charge
- Zero-rated status
- Exempt status

Reports:

- Sales tax
- Purchase tax
- Liability
- Transaction export

Tax logic should be configurable by an accountant and not hard-coded globally.

---

## 100. Credit Notes and Refunds

Authorised users can:

- Create full credit note
- Create partial credit note
- Refund Stripe
- Record bank refund
- Apply credit to another invoice
- Write off a balance
- Record cancellation charge

All actions require audit history.

---

## 101. Accounting Reports

- Profit and loss
- Balance sheet
- Cash flow
- Trial balance
- General ledger
- Receivables ageing
- Payables ageing
- Sales by user
- Revenue by customer
- Profit by booking
- Supplier spend
- Tax reports
- Payment method
- Currency exposure
- Commission report
- Refund report
- Cancellation report
- Stripe reconciliation

Export:

- PDF
- Excel
- CSV

---

# Part 16 — User Revenue and Commission

## 102. User Revenue Dashboard

Each user should see their authorised personal performance:

- Enquiries assigned
- Quotes sent
- Accepted quotes
- Rejected quotes
- Invoiced revenue
- Collected revenue
- Outstanding accepted value
- Gross profit, if permitted
- Average booking
- Conversion
- Target
- Estimated commission
- Pending commission
- Approved commission
- Paid commission

Users must not automatically see:

- Other users' pay
- Company bank balances
- Full company profit
- Other users' commission
- Supplier banking
- Tax reports

---

## 103. Revenue Attribution

The Master Admin can define attribution based on:

- Enquiry creator
- Quote sender
- User who secured acceptance
- Assigned sales owner
- Split between users
- Manager override

The selected attribution must be stored on the booking so historical reporting does not change when reassigned.

---

## 104. Commission Timing

Latest and canonical rule:

```text
Commission is not final when quote is accepted.
Commission is not final when customer pays.
Commission becomes final only after the booking takes place, is completed and actual costs are confirmed.
```

Reason:

- Supplier invoice may differ
- Waiting time may be added
- Parking may be added
- Tolls may be added
- Ferry may be added
- Accommodation may be added
- Overtime may be added
- Extra mileage may be added
- Exchange rate may change
- Refund may occur
- Credit note may occur
- Cancellation may occur

---

## 105. Commission Lifecycle

```text
Quote accepted
→ Payment received
→ Job dispatched
→ Job completed
→ Actual costs collected
→ Supplier invoice confirmed
→ Final margin calculated
→ Commission calculated
→ Manager or Finance approval
→ Payroll
→ Paid
```

---

## 106. Commission Statuses

- Not Eligible
- Estimated
- Pending Job Completion
- Awaiting Supplier Costs
- Awaiting Financial Review
- Ready for Calculation
- Awaiting Manager Approval
- Approved
- Included in Payroll
- Paid
- Adjusted
- Reversed

---

## 107. Margin Formula

General calculation:

```text
Customer selling price
− Supplier cost
− Driver expenses
− Accommodation
− Parking
− Tolls
− Ferries
− Airport fees
− Processing fees
− Refunds
− Credit notes
− Other approved direct costs
= Final gross profit
```

Commission is then calculated from the configured plan.

---

## 108. Estimated versus Final Commission

Before completion, users may see:

- Estimated margin
- Estimated commission

These must be clearly labelled as estimates.

After completion and approval:

- Final margin
- Approved commission

---

## 109. Cancellation Adjustment

Cancellation outcomes may include:

- No commission
- Reduced commission based on retained fee
- Commission reversal
- Supplier cancellation cost deduction
- Refund adjustment
- No revenue recognition

If commission was already paid, later changes should normally create a carry-forward payroll adjustment rather than silently altering a closed payroll period.

---

## 110. Commission Plans

Commission can use:

- Percentage of revenue
- Percentage of gross profit
- Fixed amount
- Tiered target
- Vehicle-specific rate
- Country-specific rate
- Brand-specific rate
- Team commission
- Split commission

Gross-profit-based commission is the preferred design because final margin is important.

---

# Part 17 — User Performance and Management Analytics

## 111. Performance Dashboard

Managers can view:

- Individual
- Team
- Department
- Office
- Branch
- Company

Date filters:

- Today
- Yesterday
- Week
- Last week
- Month
- Quarter
- Year
- Custom

---

## 112. Speed of Quoting

Record timestamps for:

- Lead received
- Lead assigned
- User opened lead
- First contact
- Quote created
- Quote sent
- Customer response

Metrics:

- Average quote time
- Median quote time
- Fastest
- Slowest
- Percentage under 15 minutes
- Percentage under 30 minutes
- Percentage under one hour
- Overdue quotes
- Created but unsent quotes

Timers should pause outside configured business hours where appropriate.

---

## 113. Response Rate

Show:

- Enquiries assigned
- Opened
- Contacted
- Quoted
- No action
- Followed up
- Average first contact
- Percentage receiving quote
- Percentage receiving follow-up

A verified response should be based on a logged action, not merely opening a screen.

---

## 114. Conversion

Measure:

- Quotes sent
- Quotes viewed
- Accepted
- Rejected
- Expired
- Awaiting
- Quote-to-booking
- Enquiry-to-booking
- Accepted value
- Paid value

Compare by:

- User
- Team
- Vehicle
- Lead source
- Country
- Journey type
- Quote value
- Brand
- Channel

---

## 115. Revenue and Profit Performance

Per user:

- Quoted value
- Accepted value
- Invoiced value
- Paid value
- Supplier cost
- Gross profit
- Margin
- Booking value
- Discounts
- Refunds
- Cancellations
- Outstanding balances

Multi-currency reporting should retain original currency and convert to a selected reporting currency.

---

## 116. Follow-Up Performance

- Follow-ups due
- Completed on time
- Overdue
- Average follow-ups
- Conversion after each follow-up
- Viewed but not accepted
- Accepted but unpaid

Automatic schedules may include:

- One hour
- 24 hours
- 48 hours
- Before expiry

---

## 117. Performance Score

Optional score out of 100 with configurable weights.

Example:

- Quote response speed: 20%
- Response rate: 15%
- Conversion: 25%
- Gross profit: 20%
- Follow-up completion: 10%
- Data quality: 10%

Master Admin can change or disable this score.

---

## 118. Fair Measurement

Performance calculations should:

- Exclude spam
- Exclude duplicates
- Categorise cancellations
- Track reassignment time by user
- Observe business hours
- Exclude test enquiries
- Distinguish qualified and unqualified leads
- Preserve deleted-record audit history
- Record manager changes

Lead volume and quality must be shown so users are assessed fairly.

---

## 119. Targets

Targets may be daily, weekly, monthly, quarterly or annual.

Sales targets:

- Leads handled
- Quotes sent
- Revenue
- Profit
- Margin
- Conversion
- Follow-up
- Response time
- Paid bookings

Operations targets:

- Jobs dispatched
- Supplier response time
- On-time completion

Accounts targets:

- Collections
- Reconciliation
- Overdue balance reduction

---

# Part 18 — Dashboards and User Experience

## 120. User Dashboard

The user dashboard should focus on actions required today.

### Main cards

- New enquiries
- Quotes awaiting action
- Quotes sent today
- Accepted quotes
- Payments received
- Overdue follow-ups

### Priority panel

- New enquiries not opened
- Enquiries requiring quote
- Draft quotes
- Viewed quotes awaiting response
- Accepted quotes awaiting payment
- Follow-ups due
- Overdue follow-ups

### Quick actions

- Open enquiry
- Create quote
- Send quote
- Call
- Email
- WhatsApp
- Add note
- Complete follow-up

### Personal performance

- Average quote time
- Quotes sent
- Conversion
- Accepted value
- Paid value
- Follow-up completion
- Monthly target
- Estimated commission
- Approved commission

### Recent activity

- Quote sent
- Quote viewed
- Accepted
- Rejected
- Payment received
- Supplier accepted
- Customer replied
- Manager reassigned

---

## 121. Master Admin Dashboard

### Executive cards

- New enquiries
- Quote value
- Accepted sales
- Payments received
- Gross profit
- Conversion
- Outstanding invoices
- Active users

### Attention required

- Unanswered leads
- Overdue quotes
- Accepted unpaid jobs
- Supplier offers unanswered
- Low-margin bookings
- Expiring supplier documents
- Failed Stripe payments
- Users below target
- Complaints
- Jobs without supplier

### Team performance table

- User
- Enquiries
- Average quote time
- Quotes
- Conversion
- Revenue
- Profit
- Attendance status

### Operations

- Today's journeys
- Tomorrow's journeys
- Awaiting allocation
- Supplier acceptance
- Driver details
- Vehicle details
- At-risk jobs
- Completed jobs

---

## 122. Dashboard Customisation

The Master Admin should be able to:

- Show or hide widgets
- Reorder widgets
- Save layouts
- Define role-specific dashboards
- Define brand-specific dashboards

Widget examples:

- Sales
- Profit
- Team performance
- Response time
- Lead sources
- Top customers
- Top suppliers
- Payments
- Currency
- Upcoming bookings
- Document expiry
- Activity feed

---

## 123. Global Navigation

Proposed navigation:

- Dashboard or Control Centre
- Leads
- Enquiries
- Quotes
- Bookings
- Dispatch
- Customers
- Transport Companies or Suppliers
- Drivers
- Vehicles
- Calendar
- Email Centre
- WhatsApp
- Calls
- Live Chat
- Accounting
- Commissions
- Attendance
- Business Intelligence
- Documents
- Automations
- KPIs and Targets
- Team Chat
- Tasks
- Customer Experience
- Integrations
- AI Optimisation
- Users
- Settings

---

## 124. Global Search

Search by:

- Lead reference
- Enquiry reference
- Quote reference
- Booking reference
- Invoice reference
- Customer
- Email
- Telephone
- Pickup
- Destination
- Travel date
- Supplier
- Driver
- Vehicle
- Document

---

## 125. General UX Requirements

- Minimal clicks
- Fast performance
- Autosave
- Inline editing
- Keyboard shortcuts
- Mobile support
- Tablet support
- Confirmation before destructive actions
- Undo where feasible
- Tooltips
- Guided setup
- Duplicate previous quote
- Journey templates
- Returning-customer autofill
- Margin auto-calculation
- Automatic references
- Bulk follow-up
- Email templates
- WhatsApp templates
- Light and dark mode

---

# Part 19 — Attendance and Login Tracking

## 126. Clock Controls

Users should have:

- Clock In
- Start Break
- End Break
- Clock Out

Logging into CRM does not automatically equal clocking in unless the Master Admin enables that behaviour.

Track separately:

- Login time
- Clock-in time
- Breaks
- Clock-out
- Last activity
- Active time
- Attendance time

---

## 127. Attendance Statuses

- Not Clocked In
- Working
- On Break
- Away
- Clocked Out
- On Leave
- Absent

A live timer should show current shift duration.

---

## 128. Login History

Record:

- User
- Login
- Logout
- Session duration
- Device
- Browser
- IP
- Approximate IP location
- Successful login
- Failed login
- Forced logout
- Expired session

Users can view their own history.

Managers can view their team.

---

## 129. Shifts

Shift configuration:

- Working days
- Start
- Finish
- Break allowance
- Weekly hours
- Office or remote
- Time zone
- Grace period
- Overtime rules

Store timestamps in UTC but display in assigned local time.

---

## 130. Attendance Exceptions

Automatically calculate:

- Late arrival
- Early departure
- Overtime
- Extended break
- Missing clock-out
- Short hours
- Absence

---

## 131. Break Types

- Lunch
- Short break
- Prayer
- Personal
- Manager-approved
- Other

Breaks may be paid or unpaid.

---

## 132. Activity Monitoring

CRM activity may be used to show:

- Active
- Idle
- Away
- Disconnected

Activity examples:

- Opening enquiry
- Creating quote
- Sending email
- Updating booking
- Contacting supplier
- Processing payment

The system should not use invasive monitoring such as:

- Screenshots
- Webcam
- Keystroke recording

Idle time should not automatically be treated as unpaid without a configured lawful policy.

---

## 133. Attendance Corrections

Users can request corrections for:

- Missed clock-in
- Missed clock-out
- Wrong break
- System issue
- Approved overtime

A manager approves or rejects.

Original values must remain in the audit log.

---

## 134. Leave

Support:

- Annual leave
- Sick leave
- Unpaid leave
- Emergency leave
- Maternity
- Paternity
- Compassionate leave
- Public holiday
- Custom leave

---

# Part 20 — Integrated Email Client

## 135. Mailboxes

The CRM should support:

- Inbox
- Sent
- Drafts
- Starred
- Archived
- Spam
- Trash
- Custom folders
- Shared inboxes

Shared examples:

- Sales
- Bookings
- Operations
- Accounts
- Supplier Relations
- Support

---

## 136. Email Providers

- Microsoft 365
- Outlook
- Gmail
- Google Workspace
- IMAP
- SMTP
- Multiple accounts
- Shared mailboxes

OAuth should be used where supported.

---

## 137. CRM Linking

Emails should link to:

- Customer
- Lead
- Enquiry
- Quote
- Booking
- Invoice
- Payment
- Supplier
- Driver
- Job

Automatic matching can use:

- Email address
- Reference
- Subject
- Thread
- Telephone extracted from email

Manual linking must also be possible.

---

## 138. Communication Timeline

Customer, enquiry and booking records should show one chronological timeline containing:

- Website submission
- Email
- WhatsApp
- Call
- Live chat
- Quote
- Invoice
- Payment
- Internal note
- Supplier communication

---

## 139. Composer

The composer includes:

- To
- CC
- BCC
- Subject
- Rich text
- Attachments
- Signature
- Template
- Quote
- Invoice
- Payment link
- Booking confirmation
- Itinerary
- Supplier job sheet
- Schedule send
- Save draft

---

## 140. Templates

Templates include:

- Enquiry acknowledgement
- Quote
- Quote follow-up
- Expiry reminder
- Booking confirmation
- Deposit request
- Balance reminder
- Payment confirmation
- Driver details
- Supplier job request
- Supplier confirmation
- Cancellation
- Refund
- Complaint response
- Invoice reminder
- Review request

Dynamic fields include:

```text
{{customer_name}}
{{quote_reference}}
{{booking_reference}}
{{pickup_address}}
{{destination}}
{{journey_date}}
{{journey_time}}
{{vehicle_type}}
{{passenger_count}}
{{quote_total}}
{{deposit_amount}}
{{payment_link}}
{{assigned_user}}
{{brand_logo}}
{{company_name}}
```

---

## 141. Email AI

AI capabilities:

- Draft reply
- Summarise thread
- Rewrite professionally
- Adjust tone
- Translate
- Suggest follow-up
- Detect urgency
- Extract journey details
- Identify complaint
- Suggest CRM action

AI output remains editable before sending unless a specifically approved automation applies.

---

## 142. Shared Inbox Collaboration

Users can:

- Assign conversation
- Claim conversation
- Add internal note
- Mention user
- Set priority
- Set follow-up
- Mark waiting for customer
- Mark waiting for supplier
- Resolve
- Reopen

Conversation statuses:

- New
- Open
- Assigned
- Awaiting Customer
- Awaiting Supplier
- Follow-Up Due
- Resolved
- Closed

---

## 143. Email Tracking

Where permitted:

- Delivered
- Opened
- Link clicked
- Quote viewed
- Invoice viewed
- Payment link clicked
- Replied
- Bounced

Tracking should be configurable because it is not always reliable or appropriate.

---

## 144. Email Security

- OAuth
- Encrypted secrets
- Role access
- Two-factor authentication
- Malware scanning
- Audit logs
- Retention rules
- Export restrictions
- Deletion controls
- Forwarding controls

Passwords must not be stored in plain text.

---

# Part 21 — Workflow Automation Builder

## 145. Visual Builder

The Master Admin should have a no-code drag-and-drop automation builder.

Elements:

- Trigger
- Condition
- Delay
- Branch
- Action
- Approval
- Notification
- Stop

Example:

```text
New lead
→ Assign user
→ Wait 15 minutes
→ Quote sent?
    Yes → Stop
    No → Notify manager
```

---

## 146. Automation Examples

- Send enquiry acknowledgement
- Assign lead
- Release inactive lead
- Notify quote overdue
- Follow up quote
- Remind before expiry
- Request deposit
- Chase balance
- Verify supplier confirmation
- Request driver details
- Expand dispatch wave
- Request review after completion
- Start commission review
- Flag expired supplier documents
- Notify manager of low margin
- Reverse estimated commission after cancellation

All workflow executions require logs.

---

# Part 22 — Business Intelligence and Reporting

## 147. Business Intelligence Centre

Reports should include:

- Revenue by company
- Revenue by brand
- Revenue by country
- Revenue by website
- Revenue by channel
- Revenue by user
- Revenue by supplier
- Revenue by vehicle
- Gross profit
- Net profit
- Conversion
- Customer acquisition cost
- Customer lifetime value
- Forecasts
- Monthly trends
- Year-over-year
- Cancellations
- Booking value
- Supplier profitability
- Customer profitability
- Currency exposure
- Response time
- Quote speed

Charts should be interactive and exportable.

---

## 148. KPI and Targets

The KPI system should support:

- Individual target
- Team target
- Department target
- Brand target
- Company target

Real-time leaderboards may rank by:

- Revenue
- Gross profit
- Conversion
- Response speed
- Quotes
- Paid bookings
- Follow-up completion
- Customer satisfaction

---

# Part 23 — Document Centre

## 149. Document Types

- Supplier licence
- Insurance
- Driver licence
- Vehicle registration
- Contract
- NDA
- Customer agreement
- Quote
- Invoice
- Receipt
- Credit note
- Email attachment
- WhatsApp attachment
- Image
- PDF
- Passenger list
- Itinerary

---

## 150. Document Features

- Folders
- Role permissions
- Version history
- Digital signatures
- Expiry reminders
- OCR search
- Tags
- Record linking
- Audit history
- Malware scanning
- Retention policy
- Secure download links

---

# Part 24 — Internal Team Collaboration

## 151. Internal Chat

Features:

- Direct messages
- Team channels
- Voice notes
- Files
- Mentions
- Announcements
- Polls
- Read status
- Search

Messages may link to:

- Lead
- Quote
- Booking
- Customer
- Supplier
- Invoice
- Task

Internal chat is intended to reduce use of external informal messaging for operational discussions.

---

## 152. Task Management

Tasks support:

- Personal tasks
- Team tasks
- Due date
- Priority
- Assignee
- Dependencies
- Recurring tasks
- Checklist
- Kanban
- Calendar
- Gantt
- Notifications
- Record linking

Examples:

- Call customer
- Create quote
- Confirm supplier
- Allocate driver
- Verify payment
- Chase balance

---

# Part 25 — Customer Experience

## 153. Customer Feedback

After completion:

- Send thank-you
- Request review
- Request satisfaction survey
- Measure NPS
- Record comments
- Detect poor feedback
- Create follow-up case

Metrics:

- Satisfaction
- Response time
- Complaint resolution
- Repeat booking
- NPS
- Customer retention

---

# Part 26 — API and Integration Centre

## 154. Native Integrations

Planned integrations:

- Google Maps
- Google Places
- Google Routes
- Stripe
- Microsoft 365
- Outlook
- Gmail
- Google Workspace
- WhatsApp Business
- Telephony provider
- Live chat
- Meta Lead Ads
- Google Ads
- Google Analytics
- Google Tag Manager
- QuickBooks
- Xero
- Sage
- Mailchimp
- HubSpot
- Zapier
- Make

---

## 155. Developer Platform

- API keys
- OAuth
- Webhooks
- Documentation
- Rate limits
- Sandbox
- Event logs
- API scopes
- Key rotation
- Integration health
- Retry logs

---

# Part 27 — AI Operations Assistant

## 156. Operations Monitoring

The AI Operations Assistant should detect:

- Job without supplier
- Job without driver
- Duplicate booking
- Double-booked supplier
- Missing invoice
- Missing payment
- Missing driver details
- Capacity mismatch
- Expiring insurance
- Late supplier confirmation
- Low-margin job
- Overdue balance
- Scheduling conflict
- Insufficient dispatch time
- High-risk route

It should alert the appropriate team before customer impact.

---

# Part 28 — AI Executive Assistant

## 157. Natural-Language Business Queries

The Master Admin can ask:

- How much profit did we make yesterday?
- Which users have not followed up?
- Show bookings above a value.
- Which suppliers have the best acceptance rate?
- Forecast next month.
- How much commission is due?
- Show cancellations.
- Show jobs awaiting supplier confirmation.
- Show revenue by brand.
- Show work in London tomorrow.
- Forecast cash flow.

The AI must answer from live authorised CRM data.

Access rules must prevent it from revealing data the requesting user cannot normally access.

---

# Part 29 — Global Transport Control Centre

## 158. Purpose

This is the flagship Master Admin dashboard.

It provides a live worldwide view of:

- Leads
- Quotes
- Bookings
- Jobs
- Suppliers
- Drivers
- Finance
- Staff
- Communications
- Alerts

---

## 159. Live Map

Display:

- New leads
- Active quotes
- Confirmed bookings
- Vehicles, where GPS exists
- Suppliers
- Drivers, where permitted
- Pickups
- Airports
- Demand hotspots

---

## 160. Live KPIs

- Revenue Today
- Revenue This Month
- Gross Profit
- Net Profit
- Leads Waiting
- Quotes Outstanding
- Bookings Today
- Jobs Operating
- Jobs Completed
- Payments Received
- Outstanding Invoices
- Supplier Payments Due
- Commission Liability
- Cash Position

---

## 161. Live Operations Panel

- Jobs starting soon
- Delayed journeys
- Supplier issues
- Driver issues
- Unallocated jobs
- Complaints
- Emergency alerts

---

## 162. Live Staff Panel

- Clocked-in users
- Current status
- Active leads
- Quotes in progress
- Emails waiting
- WhatsApp queue
- Calls waiting
- Live chats waiting
- Response time

---

## 163. AI Alerts

Examples:

- High-value lead not contacted
- Supplier insurance expires
- Overdue invoices
- Revenue ahead of target
- Best-performing brand
- Duplicate booking risk
- Low-margin cluster
- Dispatch failure

---

# Part 30 — AI Business Optimisation Engine

## 164. Purpose

The AI Business Optimisation Engine is a central intelligence layer across the CRM.

It does not only report history. It identifies opportunities to improve:

- Revenue
- Profit
- Conversion
- Response time
- Supplier performance
- Productivity
- Retention
- Cash collection
- Operations

---

## 165. Sales Optimisation

Identify:

- Leads likely to convert
- Leads at risk
- Best follow-up time
- Low conversion users
- Strong user-territory combinations
- Prices too high
- Prices too low
- High-value customers
- Unworked leads
- Customers likely to return

Actions:

- Reassign
- Create task
- Send follow-up
- Escalate
- Change lead priority
- Suggest coaching

---

## 166. Pricing and Margin Optimisation

Compare:

- Estimated supplier cost
- Final supplier cost
- Selling price
- Final profit
- Historical margins
- Supplier trends
- Acceptance rates

Recommend:

- Price increase
- Price reduction
- Minimum safe price
- Target margin
- Better supplier
- Route surcharge
- Market-specific adjustment

---

## 167. Supplier Optimisation

Recommend:

- Preferred suppliers
- Suppliers requiring review
- Suppliers becoming expensive
- Coverage gaps
- Suppliers suitable for more work
- Suppliers to restrict

---

## 168. Customer Retention

Identify:

- Likely repeat customer
- Reduced booking frequency
- Dormant high-value customer
- Poor payment history
- Repeated complaint
- Contract-pricing opportunity

Actions:

- Call
- Email
- Assign account manager
- Offer pricing
- Request feedback
- Start campaign

---

## 169. Staff Optimisation

Use:

- Lead volume
- Lead quality
- Territory
- Response time
- Quotes
- Conversion
- Revenue
- Final profit
- Cancellation
- Follow-up
- Attendance
- Feedback

Recommend:

- Coaching
- Different lead types
- More leads
- Reduced workload
- Pricing training
- Different territory
- Recognition

Revenue alone must not determine staff quality.

---

## 170. Cash-Flow Optimisation

Monitor:

- Receivables
- Customer payment behaviour
- Supplier payments
- Refund exposure
- Stripe payouts
- Bank verification
- Payroll
- Commission
- Expected receipts
- Currency exposure

Forecast:

- Seven-day cash
- Thirty-day cash
- Expected collection
- Late payment risk
- Supplier payment pressure

---

## 171. Marketing Optimisation

Compare:

- Website
- Landing page
- Campaign
- Keyword
- Country
- Device
- Channel
- Revenue
- Profit
- Conversion

Recommend:

- Increase campaign
- Reduce campaign
- Target profitable country
- Remove poor keyword
- Improve landing page
- Invest in higher-value channel

---

## 172. Forecasting

Forecast:

- Leads
- Quotes
- Bookings
- Revenue
- Gross profit
- Cash
- Supplier demand
- User workload
- Commission liability
- Seasonal demand

Include:

- Expected
- Best case
- Worst case
- Confidence
- Assumptions

---

## 173. Opportunity Feed

Each recommendation contains:

- Opportunity or issue
- Estimated financial impact
- Confidence
- Reason
- Recommended action
- Owner
- Deadline
- Status

Possible actions:

- Approve
- Reject
- Assign
- Snooze
- Apply
- Create task
- Launch workflow
- Request deeper analysis

---

## 174. Automation Levels

### Advisory

AI recommends only.

### Approval Required

AI prepares action; manager approves.

### Automatic

AI performs approved low-risk actions.

High-risk financial, legal, pricing or customer actions should normally require human approval.

---

## 175. Explainability

Every recommendation must show:

- Data used
- Reason
- Expected benefit
- Risk
- Confidence
- Historical comparison

The system should not make unexplained decisions.

---

## 176. Learning Loop

Track:

- Recommendation accepted or rejected
- Action taken
- Conversion change
- Margin change
- Response-time change
- Forecast accuracy
- Customer reaction
- Financial impact

The engine should improve using company-specific historical outcomes.

Sensitive CRM data must not be used to train public models.

---

## 177. Daily Executive Brief

The Master Admin may receive a daily AI-generated summary of:

- Revenue against target
- Margin change
- Supplier-cost issues
- High-value leads
- Overdue invoices
- Priority actions
- Estimated opportunity impact

---

# Part 31 — Notifications

## 178. Notification Channels

- In-app
- Email
- SMS
- WhatsApp
- Push
- Team chat

---

## 179. Notification Events

- New lead
- Lead assigned
- Lead about to be released
- Quote viewed
- Quote accepted
- Quote rejected
- Quote expired
- Payment received
- Payment failed
- Bank transfer verified
- Supplier accepted
- Supplier rejected
- Driver accepted
- Dispatch widened
- Job allocated
- Supplier document expiring
- Follow-up due
- Invoice overdue
- Job starting
- Driver details missing
- Customer complaint
- Commission approved
- Attendance exception

Users should be able to configure non-critical notification preferences.

Mandatory security and financial alerts may not be disabled.

---

# Part 32 — Audit, Security and Data Governance

## 180. Audit Trail

Audit events should include:

- Login
- Failed login
- Clock-in
- Enquiry creation
- Lead assignment
- Lead claim
- Quote creation
- Quote edit
- Price change
- Discount
- Quote send
- Acceptance
- Rejection
- Invoice creation
- Payment
- Bank-transfer verification
- Refund
- Supplier allocation
- Job status change
- Completion
- Commission calculation
- Commission approval
- User change
- Permission change
- Brand change
- Data export
- Record deletion
- Automation action
- AI action

Record:

- User
- Date
- Time
- IP
- Device where relevant
- Previous value
- New value
- Reason
- Related record

Audit entries should not be editable by ordinary users.

---

## 181. Security Requirements

- Role-based access
- Tenant isolation
- Brand isolation
- Two-factor authentication
- Strong password policy
- Secure reset
- Session timeout
- Device history
- IP history
- Account lockout
- Country or IP restrictions, optional
- Encryption at rest
- Encryption in transit
- Secret management
- Domain-restricted API keys
- Malware scanning
- Data export controls
- File-access controls
- Financial immutability
- Webhook signature validation
- Rate limiting
- CSRF protection where relevant
- Content security policy
- Regular backups
- Disaster recovery

---

# Part 33 — Document and Template Builder

## 182. Documents Using Brand Templates

- Quotes
- Pro-forma invoices
- Invoices
- Booking confirmations
- Receipts
- Credit notes
- Refund notices
- Itineraries
- Driver details
- Supplier job sheets
- Statements

---

## 183. Template Builder

The Master Admin should have a visual editor with:

- Drag-and-drop sections
- Logo placement
- Header
- Footer
- Fonts
- Colours
- Tables
- Margins
- Background
- Watermark
- Dynamic fields
- Terms
- Payment section
- Signature
- QR payment code
- QR booking code

Formats:

- HTML email
- PDF
- Print
- Mobile

---

# Part 34 — Customer, Supplier and Driver Portals

## 184. Customer Portal

Although not separately selected from the later recommendations, customer-facing portal functionality is required by the quote acceptance and payment workflow.

Customers should be able to:

- View quote
- Accept or reject
- Pay
- Download invoice
- Download receipt
- View booking
- View itinerary
- View journey status
- Rebook
- Message account manager
- Leave feedback

---

## 185. Supplier Portal

Supplier portal is explicitly required.

It supports registration, job offers, pricing, acceptance, allocation, driver and vehicle submission, invoices and payments.

---

## 186. Driver Portal or App

Direct driver functionality is required by the multi-driver dispatch requirement.

Possible functions:

- Receive job
- Accept or reject
- Navigate
- Update status
- Upload photos
- Capture signature
- Record mileage
- Upload receipts
- Report incident
- Submit expense
- Complete inspection

A dedicated mobile application was recommended but not yet formally approved as a separate deliverable.

---

# Part 35 — Features Recommended but Not Explicitly Selected

The user explicitly selected features numbered:

```text
5, 6, 9, 10, 11, 12, 13, 14, 15, 17, 20
plus the Global Transport Control Centre
plus the AI Business Optimisation Engine
```

These correspond to:

- AI Quote Assistant
- AI Operations Assistant
- Business Intelligence
- Document Centre
- Workflow Automation
- KPI and Targets
- Internal Chat
- Task Management
- Customer Experience
- API and Integration Centre
- AI Executive Assistant
- Global Transport Control Centre
- AI Business Optimisation Engine

Other recommended items not explicitly selected in that later list were:

- Standalone fleet management
- Fraud and risk detection
- Separate native mobile apps
- Customer relationship scoring as a standalone module
- Multi-company support as a separate named item

However, several of these are already implied by approved requirements:

- Multi-company and multi-brand support is required.
- Supplier performance scoring is required.
- Customer portal functions are required.
- Supplier portal functions are required.
- Driver portal functions are required.
- Some operational risk detection is part of AI Operations.

Standalone owned-fleet maintenance, fraud detection and native mobile apps remain optional future phases unless later approved.

---

# Part 36 — End-to-End Canonical Workflows

## 187. Standard Website Lead Workflow

```text
Website quote form submitted
→ Secure webhook
→ Brand identified
→ Duplicate check
→ Pickup and destination geocoded
→ Lead territory determined
→ Available user selected
→ Lead assigned or placed in open pool
→ Response timer starts
→ User contacts customer
→ AI cost estimate created
→ User enters or approves selling price
→ Quote sent
→ Customer views
→ Customer accepts
→ Invoice generated
→ Customer pays
→ Payment verified
→ Booking ready for dispatch
→ Nearby compliant suppliers matched
→ Job sent manually, assisted or automatically
→ Supplier selected
→ Driver and vehicle confirmed
→ Journey completed
→ Supplier invoice confirmed
→ Final margin calculated
→ Commission approved
→ Customer review requested
→ AI optimisation learns from outcome
```

---

## 188. Open Lead Pool Workflow

```text
Lead does not match territory
→ Open pool
→ Eligible users see it
→ User clicks Take Lead
→ Database lock prevents duplicate claim
→ Lead assigned
→ Timer starts
→ Lead appears in user dashboard
→ Performance and revenue attribution recorded
```

---

## 189. Bank Transfer Workflow

```text
Invoice issued
→ Customer selects bank transfer
→ Payment remains pending
→ Remittance may be uploaded
→ Bank transaction appears
→ Manager or Accounts verifies
→ Invoice becomes partial or paid
→ User dashboard updates
→ Accounting ledger posts
→ Booking progresses
```

---

## 190. Automatic Dispatch Workflow

```text
Paid or approved booking
→ Geocode route
→ Find suppliers
→ Filter vehicle, availability and compliance
→ Rank by distance, performance and price
→ Wave 1 sent
→ Wait
→ Wave 2 if required
→ Expand radius if required
→ Responses collected
→ First accepted, manual selection or ranked selection
→ Job locked
→ Other suppliers notified
→ Customer details released
```

---

## 191. Commission Workflow

```text
Booking accepted
→ Estimated commission visible
→ Customer pays
→ Journey takes place
→ Booking completed
→ Actual supplier invoice received
→ Direct costs finalised
→ Refunds or credits applied
→ Final margin calculated
→ Commission calculated
→ Manager or Finance approval
→ Payroll
→ Paid
```

---

# Part 37 — Suggested Technical Architecture

This section was not fully agreed in the chat but is the practical architecture implied by the requirements.

## 192. Front End

The existing prototype is React and Tailwind.

For production, suitable choices include:

- React with Vite, or
- Next.js with App Router

The existing code is Vite React.

Use:

- TypeScript
- Tailwind CSS
- Component library or custom design system
- React Query or equivalent
- Form validation
- Map component
- Accessible UI
- Responsive layout

---

## 193. Backend Requirements

A production backend requires:

- REST or GraphQL API
- Authentication
- Role and permission enforcement
- Relational database
- Background jobs
- Event queue
- Webhooks
- File storage
- Search
- Audit service
- Reporting
- AI service layer
- Integration service

Potential technology choices were not finalised.

---

## 194. Database Characteristics

A relational database is strongly suited because the system requires:

- Accounting integrity
- Transactional booking workflows
- Complex relationships
- Auditability
- Role permissions
- Reporting

PostgreSQL would be a reasonable implementation choice, but it was not explicitly approved in this conversation.

Location searching may use geospatial support.

---

## 195. Background Jobs

Required for:

- Email sync
- WhatsApp sync
- Lead routing
- Quote reminders
- Payment webhooks
- Bank import
- Dispatch waves
- Supplier reminders
- Document expiry
- AI analysis
- Daily brief
- Report generation
- Commission processing

---

## 196. Event-Driven Updates

Important domain events include:

- LeadCreated
- LeadAssigned
- QuoteSent
- QuoteViewed
- QuoteAccepted
- QuoteRejected
- InvoiceIssued
- PaymentReceived
- PaymentVerified
- BookingReadyForDispatch
- SupplierInvited
- SupplierAccepted
- JobAllocated
- JourneyCompleted
- SupplierInvoiceApproved
- MarginFinalised
- CommissionApproved

These events should trigger notifications and workflows.

---

# Part 38 — Current Prototype Screen Details

## 197. Prototype Navigation

The generated sidebar contains:

- Control Centre
- Leads
- Quotes
- Bookings
- Dispatch
- Customers
- Suppliers
- Email Centre
- WhatsApp
- Calls
- Live Chat
- Accounting
- Commissions
- Attendance
- Business Intelligence
- Documents
- Automations
- KPIs and Targets
- Team Chat
- Tasks
- Customer Experience
- Integrations
- AI Optimisation

---

## 198. Prototype Header

Contains:

- Mobile menu
- Search
- Brand selector
- Attendance state
- Notifications
- New Lead button

Demo brands:

- Global Bus Rental
- Coach Hire Dubai
- Prime Coach Hire
- A2B Transport Agency

---

## 199. Prototype Control Centre

Includes:

- Revenue Today
- Gross Profit
- New Leads
- Jobs Operating
- Global operations map
- AI priority feed
- Revenue and profit chart
- Lead channel chart
- Team performance
- Open lead pool

---

## 200. Prototype Leads

Includes:

- My Assigned
- Open Pool
- Average Response
- Conversion
- Lead table
- Take Lead action
- Search and filter presentation

Demo sources:

- Website
- WhatsApp
- Telephone
- Email
- Live Chat

---

## 201. Prototype Accounting

Includes:

- Collected revenue
- Outstanding
- Gross profit
- Supplier payable
- Bank-transfer verification queue
- Accounts receivable ageing
- Verify Paid action

---

## 202. Prototype Commission

Includes:

- Estimated
- Awaiting completion
- Ready to approve
- Paid this month
- Commission lifecycle display

---

## 203. Prototype Attendance

Includes:

- Clock in
- Break
- Clock out
- Live status
- Team table
- Clock-in time
- Active time

---

## 204. Prototype Email Centre

Includes:

- Inbox folders
- Conversation list
- Booking-linked email
- Reply composer
- Attachment
- AI action
- Send action

---

## 205. Prototype Optimisation

Includes example opportunities:

- Revenue opportunity
- Lead rescue
- Supplier saving
- Customer retention

Includes:

- Confidence
- Financial impact
- Approve Action
- View Analysis
- Executive AI command input

---

## 206. Prototype Business Intelligence

Includes:

- Monthly revenue forecast
- Actual versus forecast
- Profit by brand

---

# Part 39 — Demonstration and Training Requirements

## 207. User Training Slideshow

A complete future demonstration deck should include:

- Login
- Navigation
- User dashboard
- Master Admin dashboard
- Add enquiry
- Claim lead
- Geo routing
- Create quote
- Use AI estimate
- Send quote
- Customer acceptance
- Customer rejection
- Invoice
- Stripe payment
- Bank payment verification
- Supplier invitation
- Supplier portal
- Geo matching
- Manual dispatch
- Automatic dispatch
- Driver allocation
- Booking completion
- Supplier invoice
- Margin finalisation
- Commission
- Accounting
- Attendance
- Email
- WhatsApp
- Calls
- Live chat
- Documents
- Tasks
- Automations
- KPIs
- Business Intelligence
- Global Control Centre
- AI Executive Assistant
- AI Business Optimisation
- Branding
- User management
- Permissions
- Security
- Troubleshooting

The current short PowerPoint is only an initial outline.

---

## 208. Quote-Screen Graphic Requirement

The user specifically requested a graphic design showing:

```text
How a user adds a quote
```

The desired screen should eventually demonstrate:

- Customer summary
- Journey details
- Vehicle selection
- AI estimated supplier-cost range
- Recommended selling price
- Manual selling-price entry
- Currency
- Margin
- Deposit options
- Stripe and bank-transfer tick boxes
- Quote expiry
- Terms
- Live customer preview
- Save Draft
- Send Quote

The existing generated image needs to be reviewed or recreated because it did not display successfully.

---

# Part 40 — Unresolved Decisions and Required Clarifications

## 209. Product and Technical Decisions Still Open

- Final CRM product name
- Whether production uses Vite React or Next.js
- Backend technology
- Database provider
- Hosting provider
- Authentication provider
- File-storage provider
- Job queue provider
- AI provider
- Email synchronisation provider
- WhatsApp provider
- Telephony provider
- Live-chat provider
- Bank-feed provider
- Accounting integration priority
- Exact Google Maps APIs
- Mobile app timing
- GPS tracking requirements
- Owned-fleet management scope

---

## 210. Business-Rule Decisions Still Open

- Exact default quote expiry
- Whether quote acceptance immediately creates booking or provisional booking
- Whether payment is required before dispatch for every job
- Whether selected account customers receive credit terms
- Which users can override low margin
- Whether suppliers see a fixed supplier amount or submit bids
- Default dispatch allocation mode
- Default dispatch wave timings
- Default search radius
- Required supplier documents by country
- Exact commission formula
- Commission approval hierarchy
- Exact tax treatment by legal company
- Accounting base currency
- Exchange-rate provider
- User revenue attribution rule
- Whether login automatically clocks users in
- Idle-time policy
- Lead reservation duration
- Lead release SLA
- Response SLAs by channel
- Exact AI auto-quote confidence threshold
- Maximum automatic quote value
- Whether users may select multiple brands on one customer account
- Whether customer portal requires password or secure token links

---

## 211. Known Naming Inconsistencies

The prototype calls the application:

```text
TransFlow Enterprise CRM
```

The project documentation calls it:

```text
Global Transport CRM
```

The generated prototype uses a demo user:

```text
Yasser Hussain
```

This was a placeholder introduced in the prototype and is not a confirmed real user identity.

The prototype displays AED financial examples, while the original system currency priority is:

```text
EUR → USD → GBP
```

These should be resolved before production.

---

# Part 41 — Development Priorities

## 212. Recommended Implementation Order

### Phase 1 — Foundation

- Tenant
- Companies
- Brands
- Users
- Roles
- Permissions
- Authentication
- Audit logs
- Core database
- Design system

### Phase 2 — Sales CRM

- Lead API
- Omnichannel lead model
- Enquiries
- Customers
- Geo routing
- Open pool
- Quotes
- Customer quote page
- Accept and reject

### Phase 3 — Payments and Bookings

- Invoices
- Stripe
- Bank-transfer verification
- Booking creation
- Payment statuses
- Customer portal

### Phase 4 — Suppliers and Dispatch

- Transport companies
- Supplier invitations
- Supplier portal
- Google Maps
- Geo matching
- Manual dispatch
- Automatic dispatch
- Drivers
- Job allocation

### Phase 5 — Operations and Completion

- Operations board
- Journey states
- Driver and vehicle details
- Completion
- Supplier invoice
- Actual cost

### Phase 6 — Accounting and Commission

- General ledger
- Bank reconciliation
- Supplier payables
- Expenses
- Tax
- Final margin
- Commission
- Payroll export

### Phase 7 — Communications

- Email
- WhatsApp
- Telephony
- Live chat
- Communication timeline

### Phase 8 — Enterprise Modules

- Documents
- Workflows
- Tasks
- Team chat
- KPI
- Business Intelligence
- Customer Experience

### Phase 9 — AI

- Cost estimate
- Quote assistant
- Auto-quote
- Operations assistant
- Executive assistant
- Business Optimisation Engine

### Phase 10 — Training and Deployment

- Testing
- Security review
- Data migration
- User training
- Documentation
- Production deployment
- Monitoring
- Backup and recovery

---

# Part 42 — Canonical Non-Negotiable Rules

The following are the strongest confirmed business requirements and should not be changed without user approval:

1. Users must be able to create complete coach and minibus enquiries.

2. Users must be able to send quotes to customers by email.

3. Customers must be able to accept or reject quotes online.

4. Users must immediately see accepted and rejected states.

5. Accepted quotes must generate invoices.

6. The quote sender chooses whether Stripe, bank transfer or both are available.

7. Partial-payment options must include 25%, 50% and full payment, with optional expanded choices.

8. Users must be able to filter all, sent, accepted, rejected and paid quotes.

9. Transport companies must be invited and approve registration before receiving work.

10. Transport companies must be matched geographically using Google Maps data.

11. Jobs must be sendable manually to multiple suppliers or drivers.

12. Master Admin must be able to enable assisted or automatic dispatch per user.

13. Users must see AI cost estimates but may manually enter prices.

14. Master Admin must control AI auto-quoting.

15. The Master Admin must have a full accounting suite.

16. Users must see their own revenue.

17. Bank transfers must be verified by authorised management or accounts staff before showing as paid.

18. Final user commission must only be calculated after the booking is completed and actual costs are final.

19. The CRM must track login, clock-in, breaks and clock-out.

20. The CRM must include an integrated email client.

21. Website, email, WhatsApp, phone and live-chat leads must enter one system.

22. Leads must route geographically to designated users.

23. Unmatched leads must enter an open pool where eligible users can claim them.

24. Master Admin must control user creation, permissions, brands, email identity and invoice identity.

25. User and Master Admin dashboards must be premium, easy to use and visually strong.

26. Sunset Orange is the selected design direction.

27. The system must include the Global Transport Control Centre.

28. The system must include the AI Business Optimisation Engine.

29. Every important financial, pricing, allocation and user action must have an audit history.

30. Historical invoices and issued documents must not silently change when branding settings change.

---

# Part 43 — Final Handoff Instruction for the Next AI

Treat this document as the canonical project brief.

The current React package is an interactive design prototype, not a completed deployable enterprise backend.

Before writing production code, the next AI should:

- Inspect the existing source package
- Confirm the final product name
- Choose the production architecture
- Create the database schema
- Implement authentication and permissions
- Implement core workflows before advanced AI
- Keep finance transactional and auditable
- Keep brand and tenant boundaries strict
- Preserve original currency and exchange rates
- Preserve historical document versions
- Keep AI actions explainable and permission-controlled
- Never calculate final commission before job completion and cost finalisation
- Never allow standard sales users to verify bank transfers
- Never allow two users to claim the same open lead
- Never allocate the same job twice
- Never release private customer information to unassigned suppliers
- Never allow automated quotes outside Master Admin rules
- Never treat the existing front-end demonstration values as production data

This is the complete project context established in the conversation.

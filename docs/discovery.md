# Chosen School Website --- Product Discovery

**Document status:** Approved\
**Phase:** Product Discovery\
**Approval status:** Approved by project owner, 22 October 2026\
**Last updated:** 21 October 2026

> This document captures the product decisions discussed so far. It is a
> discovery artifact, not an implementation specification. Items marked
> **Open** still need confirmation. No implementation should begin until
> the discovery document is reviewed and approved, and the relevant
> planning documents and readiness gates are completed.

## 1. Product overview

Chosen School is a primary and secondary school that needs a
professional public website and a private administrator dashboard. The
website should help prospective parents learn about the school and apply
for admission, while giving existing parents a reliable place to find
school announcements and academic calendar information. The dashboard
should reduce paper-based administrative work and help the school manage
enquiries and admission applications.

The website will be built by the user, who intends to use free tools and
hosting options such as Vercel and Render. The site is intended for real
production use, including genuine admission applications and real
student and parent information; it is not merely a demo.

## 2. Goals

### Confirmed goals

1.  Improve Chosen School's online presence and present the school
    professionally.
2.  Help prospective parents learn about the school and its offerings.
3.  Let parents submit admission applications online.
4.  Make announcements and academic calendar information easier for
    parents to find than messages buried in WhatsApp chats.
5.  Reduce paperwork and repetitive manual work involved in managing
    admission records.
6.  Provide a private dashboard for routine school-content and
    application management.
7.  Keep operating and deployment costs at zero by using suitable free
    tools/services.

### Not an initial goal

-   Parent or student accounts/portals.
-   Application-status tracking for parents.
-   Automatic email or WhatsApp notifications.
-   Online fee payment or a public fees page.
-   Results or attendance management.
-   Direct video-file uploads.
-   A dedicated website-wide search feature.
-   Multi-language support beyond English.
-   Complex analytics.

These may be reconsidered later, but they are not part of the currently
agreed initial scope.

## 3. Audiences

The website should serve:

-   **Prospective parents/guardians:** learn about the school, review
    admission requirements, apply, contact the school, and request a
    visit.
-   **Existing parents/guardians:** find announcements, calendar events,
    FAQs, and contact information.
-   **Students:** access public school information and notices.
-   **Teachers:** view public announcements and school information.
-   **School administrator:** manage applications, enquiries, visit
    requests, school content, announcements, calendar events, gallery
    content, FAQs, and testimonials.

## 4. Current situation and problems

The school currently uses paperwork for administration and WhatsApp to
communicate information to parents.

Problems identified: - Paper records are difficult to organize. -
Repetitive manual work takes time. - Important WhatsApp messages can get
buried and become difficult to find. - The school needs a more
professional online presence.

The website should improve access to public information and organize
records, while WhatsApp remains available as a communication channel.

## 5. Product shape and access

### Public website

-   Public information and published content are accessible without
    signing in.
-   No parent/student portal or login is included in the initial
    release.
-   The site must be responsive on mobile phones, tablets, and desktop
    computers.
-   English is the only language in the initial release.
-   Navigation should be straightforward; a separate website search is
    not required initially.

### Private administrator dashboard

-   One administrator account is in scope.
-   The administrator signs in using email and password.
-   Passwords must be securely hashed and never stored as plain text.
-   Dashboard access must be protected by server-side authorization.
-   Login attempts should be rate-limited and common security
    protections applied.
-   Password recovery will be developer-assisted for the initial
    version; no email delivery service is required for password
    recovery.
-   The administrator manages routine content and records. The developer
    remains responsible for technical maintenance and structural/visual
    design changes.

### Dashboard overview

After signing in, the administrator should see a summary dashboard
with: - Total admission applications. - New contact enquiries. - Visit
requests requiring follow-up. - Recently published announcements. -
Quick links to the main management sections.

Exact definitions for summary counts remain **Open** and should be set
during requirements planning.

## 6. Public pages and capabilities

The following page structure is the current agreed direction. Exact
labels and final navigation order may be refined during design.

1.  Home
2.  About the School
3.  Classes and Facilities
4.  Admissions
5.  Announcements and Academic Calendar
6.  Photo Gallery
7.  Parent Testimonials
8.  Frequently Asked Questions (FAQ)
9.  Contact and Visit Requests

### Home page

A balanced homepage should: - Introduce Chosen School. - Make admissions
and the application form easy to find. - Highlight classes, facilities,
teaching approach, and extracurricular activities. - Show recent
announcements and relevant academic calendar information. - Use approved
school imagery and the school's existing identity.

### About and school information

The website should support school-provided information about: - School
history. - Mission and vision. - Primary and secondary classes
offered. - Teaching approach. - Extracurricular activities. -
Facilities. - Admission requirements. - Other relevant school
information.

**Important:** The school must supply or approve factual details. Do not
invent the school's history, facilities, policies, class structure, or
other official information.

### School fees

There will be no dedicated fees page in the initial version. Parents can
ask about fees using the contact form or the school's published contact
details.

### FAQ

A dedicated FAQ page is included. The administrator can add, edit,
organize, and remove questions and answers. Only approved content should
be published; school policies and answers must be supplied or approved
by the school.

## 7. Admission application

### Parent-facing flow

1.  A parent opens the public admission form.
2.  The parent selects a section: Primary or Secondary.
3.  The parent selects a class within that section.
4.  The parent selects the relevant academic session.
5.  The parent fills in the form and submits it.
6.  The server validates the submission and saves it.
7.  Only after successful saving, the parent sees an on-screen
    confirmation: **"Your admission application has been submitted
    successfully."**
8.  No application reference number, email, WhatsApp notification, or
    parent-facing application-status tracking is included initially.

Parents must complete and submit the form in one visit; saving drafts
and returning later is out of scope. If a recoverable submission error
occurs, the form should preserve entered information where practical.
The system should not show success until the record is actually saved.

### Form fields discussed

The source paper form contains student, parent/guardian, and
school-administration fields. School-only administrative fields are
excluded from the parent-facing online form.

**Proposed required fields** - Student surname. - Student first name. -
Date of birth. - Gender. - Parent/guardian name. - Home address. -
Parent/guardian phone number. - Intended section (Primary or
Secondary). - Class applying for. - Academic session. - Typed
parent/guardian full name as a signature.

**Proposed optional fields** - Student middle name. - Religion. -
Ethnicity. - State of origin. - Previous school. - Last class
attended. - Parent/guardian email. - Parent/guardian occupation. -
Parent/guardian office address. - Student photograph. - Relevant health
information.

Religion and ethnicity were explicitly requested for inclusion. The
student photograph is optional. Relevant health information is optional
and should be clearly described as information the parent considers
important for the school to know. Because health information is
sensitive, access must be restricted and retention practices must be
defined before launch.

The typed parent/guardian name is intended to serve as a signature for
the online application. The system must not make unverified claims about
its legal validity.

**Resolved 24 October 2026.** The field list above was approved as the baseline (ADR-031), with
the typed parent/guardian full name required as a signature. That is a product decision, not
legal or policy approval: the typed name must not be represented as legally valid, and whether it
can serve as a signature remains a question for the school and counsel (L-04 in `SECURITY.md`
§13.3).

### Excluded school-administration fields

The following fields from the paper form should not appear in the
parent-facing online form: - Exam scores. - Date of admission. - Class
of admission (as a staff decision field; the parent-facing class
applying for is included). - Transportation service Yes/No. -
Headmistress signature.

### Photograph handling

-   Student photograph upload is optional.
-   Only approved image formats should be accepted.
-   Enforce file-size and type restrictions on the server.
-   Do not allow arbitrary files to be uploaded.
-   Admin can view the photo if supplied.

### Validation and error handling

-   Validate fields on both client and server.
-   Show understandable field-level errors.
-   Preserve entered data after recoverable errors where practical.
-   Prevent accidental duplicate submissions where practical.
-   Use sensible submission limits and file-upload restrictions.
-   Do not expose stack traces, credentials, or sensitive technical
    details in user-facing errors.

## 8. Administrator application management

The administrator should be able to: - View a full application. - Search
by applicant name or parent/guardian phone number. - Filter and sort
applications. - Filter by section, class, and academic session. - Edit
submitted application details when corrections are needed. - Record when
an application was edited and that the administrator made the change. -
Preserve original submission details for important changes where
practical. - Print an individual application or export it as a PDF. -
Select multiple applications and export/print them together. - Move an
application to Trash. - Restore an application from Trash. - Permanently
delete an application from Trash after a confirmation step.

No admission outcome status such as Pending, Accepted, or Not Accepted
will be tracked in the initial version.

**Open:** Define record-retention periods, criteria for permanent
deletion, and the procedure for handling deletion requests before
launch.

## 9. Contact enquiries and visit requests

### Contact enquiry form

Fields: - Parent/guardian name. - Phone number. - Email address
(optional). - Child's intended section: Primary or Secondary. - Message.

Submissions are saved in the administrator dashboard. No automatic email
or WhatsApp notification is sent to the school.

### Visit-request form

Fields: - Parent/guardian name. - Phone number. - Email address
(optional). - Child's intended section: Primary or Secondary. -
Preferred visit date. - Preferred visit time. - Message (optional).

A request is not an automatic confirmation of a visit. The administrator
follows up manually and confirms or proposes another time.

### Enquiry and visit-request inbox

The administrator should be able to: - View and search submissions. -
Open a submission to view its details. - Mark it as **New**,
**Reviewed**, or **Responded to**. - Archive it when it is no longer
active.

Admission applications remain separate from general contact enquiries
and visit requests.

## 10. Announcements and academic calendar

The administrator can create, edit, publish, and remove announcements
and calendar events. Examples include: - Resumption dates. - Examination
schedules. - Holidays. - PTA meetings. - School events. - Urgent
notices. - Changes to activities. - Other school information approved
for publication.

### Organization and publishing

-   Announcements can be categorized.
-   Events can have start and end dates.
-   Announcements can be marked/highlighted as urgent.
-   An optional expiry date can automatically hide an announcement from
    the public website after that date.
-   Announcements without an expiry date remain published until the
    administrator unpublishes or removes them.
-   Expired items may remain in the dashboard for administrative
    reference.
-   Public visitors see published content, not drafts.
-   All announcements, including urgent ones, use the normal
    draft/review/publish workflow. There is no urgent-publication
    bypass.
-   The administrator can use a **Share on WhatsApp** action to open
    WhatsApp with announcement text prepared for manual sharing. The
    administrator chooses the recipient/group and sends the message.

Exact category list, date/time handling, and calendar display details
remain **Open** for the PRD.

## 11. Gallery and YouTube links

A dedicated photo gallery is included.

The administrator can: - Upload and remove photos. - Add captions. -
Organize photos into categories. - Reorder photos. - Control which
approved photos appear publicly. - Add, edit, and remove YouTube video
links.

Videos will **not** be uploaded directly to the school's server. The
website may display or embed YouTube videos using links provided by the
administrator. The implementation should consider third-party privacy
implications and avoid unnecessary scripts where practical.

Because the gallery may include children, the school must ensure it has
appropriate authorization to publish identifiable student images. Image
metadata and unnecessary personal information should not be exposed.

## 12. Testimonials

-   Parents can submit text testimonials through a public form.
-   The administrator can add testimonials received through other
    channels, provided appropriate permission to publish has been
    obtained.
-   The administrator can edit, review, publish, unpublish, or remove
    testimonials.
-   Parent submissions are not published automatically; administrator
    approval is required.
-   Testimonials are text-only; parents cannot upload a photo with a
    testimonial.
-   Do not generate or publish fake testimonials.
-   The public form's exact fields and the wording of the
    consent/permission notice remain **Open**.

## 13. Contact information and social links

The Contact page should include: - School's approved physical address. -
A map or map link to the school's confirmed location. - Official phone
number. - Official email address, if available. - WhatsApp contact
button using the school's official WhatsApp number. - Contact enquiry
form. - Visit-request form. - Links to confirmed official social media
accounts.

Social media links should appear in appropriate places such as the
footer and Contact page. The website will use links only; it will not
embed live social media feeds.

Official addresses, phone numbers, email, WhatsApp number, social URLs,
and map location must be supplied by the school. Do not guess or invent
these details.

## 14. Branding, visual design, and accessibility

### Visual direction

-   Balanced school identity: professional and trustworthy for parents,
    with warm, child-friendly elements.
-   The school has some existing branding, but the identity needs
    refinement.
-   Preserve the existing school identity where possible.
-   Refine typography, colour usage, imagery, and presentation
    consistently.
-   The developer controls visual design, layout, structure, logo
    treatment, and technical settings.
-   The administrator can manage approved content and supported images,
    but cannot change the site's layout, colours, sections, or overall
    design.

The school logo, exact official colours, fonts, and approved imagery are
**Open** and must be supplied or confirmed.

### Accessibility

Aim for comprehensive accessibility, including: - Readable text and
suitable contrast. - Semantic page structure. - Keyboard-friendly
navigation. - Visible focus indicators. - Screen-reader support. -
Labels and instructions for form controls. - Accessible validation and
error messages. - Alternative text for meaningful images. - Free-tool
accessibility checks during development and testing.

Use recognized accessibility guidance as a target and test with real
pages and forms. Do not claim full compliance without verification.

## 15. Security, privacy, and data handling

The site will handle real information about children and parents,
including contact details and optional health information. Security and
privacy are core requirements, not optional enhancements.

Planned safeguards: - Secure administrator authentication and
server-side authorization. - Secure password hashing. - Rate limits on
login and public form submissions. - Server-side validation of all
user-submitted data. - Restricted and validated image uploads. - Safe
handling of sessions/tokens and cookies, as appropriate to the selected
architecture. - Secure transport (HTTPS) in production. - Avoid exposing
personal data in logs, URLs, error messages, or public pages. - Restrict
sensitive application details to the administrator dashboard. - Protect
exported PDFs and database backups. - Keep credentials and environment
secrets out of source control. - Use least-privilege access and a
documented recovery procedure. - Define retention, deletion, backup, and
restoration practices before launch.

The implementation must be checked against applicable Nigerian
data-protection obligations and any school-specific policies before
production use. This document does not constitute legal advice.

## 16. Backups, monitoring, and recovery

### Backups

-   Manual backups are selected.
-   The intended frequency is daily while the system is in use,
    particularly during active admissions.
-   Backups should be stored securely, separately from the live
    database, and not committed to Git.
-   Document how to create, label, protect, and restore backups.
-   Test restoration before launch.

Manual backups can lose recent records if the latest backup is older
than the incident; this risk should be acknowledged.

**Note (24 October 2026).** The selected database provider's free tier
does not include a backup service that can be relied on. Its optional
backup add-on is a paid preview requiring a payment method, and is not
assumed here. Backups are therefore entirely self-managed: an encrypted
export taken by the developer, stored with a different provider from the
database, with the encryption key held offline. The daily manual
frequency above remains the floor, and the requirement to test
restoration before launch is unchanged and not yet satisfied.

### Monitoring and recovery

-   Provide a backend health-check endpoint.
-   Use a suitable free monitoring option if its terms and limits permit
    it.
-   Show visitors friendly error messages rather than technical details.
-   Document how to investigate outages, restart/redeploy services, and
    restore data.
-   Health checks must not expose credentials, database details, or
    personal information.

## 17. Hosting and cost constraints

### Confirmed constraint

-   No paid tools or services should be required for the initial
    release.
-   The developer intends to use free options such as Vercel and Render
    and has used these platforms before.
-   The site is expected to serve a modest school audience.
-   A custom domain has not been purchased or selected; the developer
    will check options near launch.
-   Free deployment URLs may be used during development and until a
    domain is selected.

### Important technical planning requirement

Because this is a real production website holding sensitive records, the
selected free hosting, database, image storage, monitoring, map, and
other services must be checked against their current: - Terms of use and
permitted purpose. - Free-tier limits and expiry policies. - Persistent
storage and database durability. - Backup/export and restoration
capabilities. - Sleep/cold-start behaviour and availability
limitations. - Security and privacy characteristics.

Do not assume that every service's free plan is suitable merely because
it is free. Prefer a compliant free architecture where possible. If a
critical requirement cannot be met under the no-cost constraint,
document the specific limitation and present options for the developer
to decide; do not silently introduce a paid dependency.

### Two launch stages (added 24 October 2026)

The product is now delivered in two stages, and this affects what
"launch" means in this document.

**Stage 1 — demonstration.** An online presence, so the school, parents
and visitors can experience the website and the school can become
familiar with the dashboard. The school does not replace its paper
admission process, and the website does not accept real admission
applications or real personal information. This stage is expected to
have very little traffic.

**Stage 2 — official production use.** Real applications, real
parent/guardian and student information, and real student photographs.

The goals, audiences and scope recorded earlier in this document are
unchanged. What changes is that the production requirements in sections
15 and 16 apply in full only to Stage 2, and a setup that is acceptable
for a demonstration is not automatically acceptable for handling real
children's information.

**Hosting eligibility.** The preferred frontend provider's free plan is
restricted to non-commercial personal use, and a school website
advertising its admissions may fall outside that restriction. Low
traffic does not resolve this, because the restriction is about purpose
rather than volume. This must be confirmed with the provider in writing
before Stage 1, and is a blocker for Stage 2 unless resolved. It is
recorded rather than concealed, and the provider will not be changed
without a decision.

## 18. Success criteria (initial proposals)

The following are proposed measures of success and should be confirmed
or refined: - Parents can use the website on mobile, tablet, and
desktop. - Prospective parents can find school information, admission
requirements, contact options, and visit requests without signing in. -
A valid admission application is saved and appears in the administrator
dashboard. - Invalid submissions are rejected with clear, useful
messages. - The administrator can search, filter, edit, print, export,
restore, and permanently delete application records as permitted. -
Enquiries and visit requests can be tracked through New, Reviewed, and
Responded to. - The administrator can publish and update school content,
announcements, calendar items, gallery content, FAQs, and testimonials
without code changes. - Public visitors cannot access private
application records or the dashboard. - Manual backup and restoration
procedures are documented and tested. - Core pages and forms are
responsive and have been accessibility-tested. - No paid dependency is
introduced without explicit discussion and approval.

## 19. Open questions and information needed from the school

These details are not yet confirmed and should be collected before
launch and/or clarified in the PRD:

### School identity and public content

-   Official school name formatting and approved logo.
-   Official brand colours and any existing brand assets.
-   School history, mission, and vision.
-   Confirmed class list for Primary and Secondary.
-   Teaching approach, extracurricular activities, and facilities.
-   Admission requirements and approved admission instructions.
-   Academic session names and the process for maintaining them.
-   Approved photographs and photo-publication permissions.
-   Approved testimonials and permission to publish them.
-   FAQ questions and official answers.

### Contact and launch details

-   Official address and map location.
-   Phone number and WhatsApp number.
-   Official email address, if available.
-   Social media account URLs.
-   Domain name (to be checked by the developer later).
-   Expected launch date or deadline.

### Form and records policy

-   ~~Final confirmation of required and optional admission fields.~~
    Resolved 24 October 2026 (ADR-031).
-   ~~Confirmation of whether the typed parent/guardian signature must be
    required.~~ Resolved 24 October 2026 (ADR-031). The legal effect of a
    typed name remains a separate question for the school and counsel.
-   Exact wording for consent, privacy notice, and form instructions.
-   Whether any additional information is needed for admissions and why.
-   Record-retention periods and permanent-deletion rules.
-   Permission and review process for student photographs and
    testimonials.
-   Whether parents need a way to request correction or deletion of
    submitted personal information.

### Technical and operational details

-   Final stack and deployment architecture.
-   Suitable free database and image-storage options.
-   Backup location and restoration steps.
-   Free monitoring approach.
-   Map implementation choice.
-   Exact administrator account provisioning and password-reset
    procedure.

## 20. Decisions summary

  -----------------------------------------------------------------------
  Area                                Current decision
  ----------------------------------- -----------------------------------
  Product                             Public school website plus private
                                      admin dashboard

  Main goals                          Professional online presence,
                                      admissions, parent information,
                                      reduced manual admin

  Audience                            Prospective/existing parents,
                                      students, teachers, administrator

  Public access                       No login required for public
                                      information

  Admin access                        One administrator account

  Admin login                         Email and password

  Password recovery                   Developer-assisted

  Devices                             Responsive mobile, tablet, and
                                      desktop

  Language                            English only

  Domain                              To be selected later

  Costs                               No paid tools/services intended for
                                      initial release

  Admission flow                      Basic public application form; save
                                      to dashboard; on-screen success
                                      only

  Parent application status           Not included

  Student photo                       Optional

  Religion and ethnicity              Included as optional fields in the
                                      current proposal

  Health information                  Optional field, with restricted
                                      access

  Parent signature                    Typed full name; final requiredness
                                      to confirm

  Application management              Search, filter, edit, print/export,
                                      bulk export, Trash, restore,
                                      permanent delete with confirmation

  Admission decision status           Not included

  Contact enquiries                   Dashboard inbox with New, Reviewed,
                                      Responded to

  Visit requests                      Dashboard inbox; manual follow-up,
                                      no automatic confirmation

  School content                      Administrator can manage content;
                                      developer controls design and
                                      structure

  Content publishing                  Draft and publish workflow

  Announcements                       Categories, event dates, urgent
                                      highlighting, optional expiry

  Urgent announcements                Normal publishing workflow; no
                                      bypass

  WhatsApp                            Direct contact button and manual
                                      sharing of announcements

  Gallery                             Photos with captions, categories,
                                      ordering; YouTube links, no direct
                                      video upload

  Testimonials                        Parent submissions and
                                      admin-created entries; approval
                                      required; text only

  FAQ                                 Dedicated page managed by
                                      administrator

  Search                              No site-wide search initially

  School fees                         No dedicated fees page initially

  Social media                        Links only; no embedded feeds

  Accessibility                       Comprehensive accessibility
                                      practices and testing

  Backups                             Manual, intended daily

  Monitoring                          Health check plus suitable free
                                      monitoring

  Map                                 Include map or map link using
                                      confirmed school location
  -----------------------------------------------------------------------

## 21. Approval record

**Approved by:** project owner, 22 October 2026.

This document was reviewed against the four checks above and approved as
the baseline for the PRD, the design specification, and technical
architecture planning.

Approval covers the product scope, goals, audiences, and operational
constraints recorded in this document. It does **not** resolve the open
questions listed in section 19, and it does not authorise the collection
of real personal data. Those items remain pre-launch gates and must be
closed before the site accepts genuine admission applications.

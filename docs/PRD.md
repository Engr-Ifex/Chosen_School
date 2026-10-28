# Chosen School Website — Product Requirements Document (PRD)

**Document status:** Approved  
**Phase:** Product Requirements  
**Approval status:** Approved by project owner, 22 October 2026  
**Baseline:** Approved `discovery.md` plus decisions confirmed during requirements discussion  
**Last updated:** 21 October 2026

> This document translates the approved product discovery into testable requirements. It is not an implementation plan. Requirements that depend on school policy, supplied school content, legal review, or final provider selection are explicitly marked as open or as pre-launch gates. This PRD was approved on 22 October 2026 and is the baseline for the design specification and technical architecture.

## 1. Product summary

Chosen School needs a professional, responsive public website and a private administrator dashboard for its primary and secondary school. The public website will help prospective parents learn about the school, submit admission applications, ask questions, and request a visit. Existing parents, students, and teachers will be able to find published school information, announcements, and upcoming academic events without relying solely on messages buried in WhatsApp chats.

The private dashboard will allow one administrator to manage admission applications, enquiries, visit requests, school information, announcements and events, gallery content, FAQs, and testimonials. The product should reduce paper-based administration and repetitive work while protecting personal information about children and their families.

The product is intended for real production use, not merely as a demo. The developer's initial-release constraint is **no required paid tools or services**. The intended hosting approach may use free services such as Vercel and Render, subject to checking current terms, durability, privacy, security, and operational limits before launch.

### 1.1 Problem statement

- The school uses paper records for some administration, making records harder to organize and manage.
- Important school information shared through WhatsApp can become difficult for parents to find later.
- Prospective parents need a central place to learn about the school and start an admission application.
- Staff currently need a manageable way to review applications, contact enquiries, and visit requests.
- The school needs a consistent, trustworthy online presence.

### 1.2 Product principles

1. **Protect children and families.** Treat application records, contact details, student photographs, and optional health information as sensitive.
2. **Keep the public experience simple.** Public information and forms must not require an account.
3. **One administrator in MVP.** Do not introduce staff accounts, role management, or multi-user permissions in the initial release.
4. **Manual communication remains manual.** Do not imply that a visit is confirmed or that a message was sent automatically.
5. **Do not invent school facts.** Official school information, policies, contact details, photographs, and testimonials must be supplied or approved.
6. **No hidden paid dependency.** If a critical requirement cannot be met safely and reliably using free services, explain the exact limitation and request a decision before adding a paid service.
7. **Accessible and responsive by design.** Test real pages and forms; do not claim compliance without verification.
8. **No success without persistence.** A form must not show successful submission until the server confirms that the record was saved.

## 2. Users and needs

### 2.1 Prospective parents and guardians
Need to understand the school, review admission information, submit an application, contact the school, and request a visit using a phone or computer without creating an account.

### 2.2 Existing parents and guardians
Need a reliable public location for announcements, upcoming events, FAQs, and contact details.

### 2.3 Students and teachers
Need access to public school information and published notices without access to private administrative records.

### 2.4 School administrator
Needs to review and manage admission applications, contact enquiries, visit requests, and public website content from one protected dashboard. The administrator must be able to correct records and export or print application information when required.

### 2.5 Developer / technical maintainer
Maintains the technical implementation, hosting, security, backups, recovery procedures, and visual/layout changes. Routine content management should not require code changes.

## 3. Goals and success criteria

Success criteria are proposed targets for acceptance and release review. They are not claims that the product has already achieved them.

| Goal | Success criterion |
|---|---|
| Professional online presence | Approved school information and branding are presented consistently on responsive public pages. |
| Make school information easy to find | Visitors can navigate to school information, admissions, announcements/events, FAQs, gallery, testimonials, and contact/visit options without signing in. |
| Support online admissions | A valid application is saved and appears in the dashboard; invalid submissions are rejected with clear errors. |
| Reduce manual record handling | The administrator can search, filter, edit, print/export, move to Trash, restore, and permanently delete applications using the agreed workflow. |
| Organize enquiries and visits | Contact enquiries and visit requests are stored in the dashboard and can be marked New, Reviewed, or Responded to, then archived. |
| Enable routine content updates | The administrator can manage supported content without editing source code. |
| Protect private data | Unauthenticated visitors cannot access the dashboard or private records; sensitive fields are not exposed in public pages, URLs, logs, or error messages. |
| Improve communication access | Published announcements and an upcoming-events list are publicly accessible; announcement sharing opens WhatsApp for manual sending. |
| Support safe operations | Daily manual backups are planned while the system is in use, restore steps are documented, and a restoration test is completed before launch. |
| Respect cost constraint | No paid service is required for the initial release without explicit discussion and approval. |
| Support inclusive access | Core pages and forms are tested for responsive behavior, keyboard navigation, labels, focus visibility, contrast, and useful validation errors. |

## 4. MVP scope

### 4.1 Included in MVP

- Responsive public website in English.
- Public pages: Home; About the School; Classes and Facilities; Admissions; Announcements and Academic Calendar; Photo Gallery; Parent Testimonials; FAQ; Contact and Visit Requests.
- Public admission application form for Primary or Secondary, with class and academic-session selection.
- Optional student photograph and optional relevant health information field, subject to security and privacy safeguards.
- Private dashboard protected by one administrator account with full administrative permissions.
- Dashboard summary showing application totals, new contact enquiries, visit requests needing follow-up, recent announcements, and quick links.
- Application search, filtering, sorting, editing, edit audit information, individual printing/PDF export, bulk export/print, Trash, restore, and confirmed permanent deletion.
- Contact enquiry and visit-request forms and their dashboard inbox.
- Content management for school information, FAQs, announcements, events, photo gallery, YouTube links, and testimonials.
- Draft/publish workflow for public content.
- Upcoming-events list ordered by date; no monthly calendar view.
- Optional announcement expiry, urgent highlighting, and manual WhatsApp sharing.
- Parent testimonial submission with a required explicit consent checkbox and administrator approval before publication.
- Manual daily backup procedure, health-check endpoint, and suitable free monitoring if available and permitted.
- Accessibility and responsive testing.
- Documentation of security, privacy, hosting limits, backup, and recovery requirements.

### 4.2 Explicit non-goals for MVP

- Parent or student accounts or portals.
- Public application-status tracking or application reference numbers.
- Admission outcome/status workflow such as Pending, Accepted, or Not Accepted.
- Automatic email or WhatsApp notifications.
- Automatic visit confirmation.
- Online payments or a public fees page.
- Student results or attendance management.
- Direct video uploads; only administrator-provided YouTube links are supported.
- Website-wide search.
- Multi-language support.
- Advanced analytics.
- Multiple staff accounts, role management, or configurable staff permissions.
- Public access to private applications, enquiries, visit requests, or sensitive records.
- Administrator controls for changing site layout, global colors, navigation structure, or page sections.
- Embedded social-media feeds.
- Automated duplicate-admission detection or blocking.
- Saving unfinished admission forms as drafts for later completion.

### 4.3 Later-phase possibilities (not commitments)

Parent/student accounts, application-status tracking, notifications, payments, results, attendance, multilingual support, advanced analytics, and additional staff roles may be reconsidered after MVP. They must not be added implicitly to this release.

### 4.4 Delivery stages

**Added 24 October 2026 — project owner decision.**

The product is delivered in two stages. A configuration that is acceptable for Stage 1 is **not**
thereby acceptable for Stage 2, and this PRD's production requirements apply in full only to
Stage 2.

**Stage 1 — demonstration and familiarisation.** The school gains an online presence; parents and
visitors explore public information; the school becomes familiar with the dashboard; functionality
is tested and feedback gathered. The school does **not** replace its paper admission process, and
the website **must not accept real admission applications or real personal data** during this
stage. The admission form is either disabled or explicitly labelled as a demonstration.

**Stage 2 — official production use.** Real admission applications, real parent/guardian and
student information, and real student photographs.

The following are **release conditions, not functional requirements**. They are numbered `SG-`
to keep them distinct from `FR-` requirements.

| ID | Condition before real applications are accepted |
|---|---|
| SG-01 | Frontend hosting plan eligibility confirmed in writing for the school's actual use, or hosting changed |
| SG-02 | Database tier decision recorded and accepted by the school in writing, including its documented limitations and absence of an uptime guarantee |
| SG-03 | Backup and restore procedure documented **and a restore performed successfully** |
| SG-04 | Retention and permanent-deletion policy approved by the school and implemented |
| SG-05 | Privacy notice and consent wording approved, including for children's data |
| SG-06 | Nigerian data-protection obligations reviewed and resulting actions closed |
| SG-07 | Authorization reviewed: every administrative route enumerated and confirmed protected |
| SG-08 | Authentication verified on the real deployed domains, including cookie behaviour |
| SG-09 | File-upload security verified, including that private photographs cannot be reached publicly |
| SG-10 | Accessibility testing completed and residual issues documented |
| SG-11 | Monitoring and an incident runbook in place |
| SG-12 | The school has been told in writing what the system does and does not do |

**Rule.** No functional requirement in section 6 may be deleted because a free tier cannot support
it. If a requirement cannot be met safely within the no-cost constraint, it is recorded as a
limitation or a launch blocker with options presented, per section 8.7.

## 5. User journeys

### 5.1 Parent applies for admission
1. Parent opens Admissions.
2. Parent selects Primary or Secondary.
3. Parent selects a class available in that section and an academic session.
4. Parent completes the form and optionally supplies a student photograph and relevant health information.
5. Client-side validation provides immediate guidance; the server validates the submitted data independently.
6. If validation fails or saving fails, the site explains the problem and preserves entered data where practical.
7. If the server confirms the record was saved, the site displays exactly: **“Your admission application has been submitted successfully.”**
8. No reference number, automatic notification, parent account, or status tracker is provided.

### 5.2 Administrator manages applications
1. Administrator signs in.
2. Dashboard summary provides access to application records.
3. Administrator searches by applicant name or parent/guardian phone number and may filter/sort by section, class, or academic session.
4. Administrator opens an application, reviews it, and may edit it when a correction is needed.
5. The system records that the administrator edited the application and when the edit occurred; original values for important changes should be preserved where practical.
6. Administrator may print/export one application or select multiple applications for bulk print/export.
7. Administrator may move a record to Trash, restore it, or permanently delete it from Trash after confirmation.

### 5.3 Parent sends a contact enquiry
1. Parent enters name, phone number, optional email, intended section, and message.
2. The server validates and saves the enquiry.
3. The parent receives a clear on-screen submission confirmation only after saving succeeds.
4. The enquiry appears in the administrator's enquiry inbox; no automatic school email or WhatsApp message is sent.
5. Administrator reviews it and updates its status to New, Reviewed, or Responded to, or archives it.

### 5.4 Parent requests a visit
1. Parent enters name, phone number, optional email, intended section, preferred date/time, and optional message.
2. The server validates and saves the request.
3. The page clearly states that the request has been received and is **not yet a confirmed visit**.
4. Administrator follows up manually and confirms or proposes another time.

### 5.5 Administrator publishes an announcement/event
1. Administrator creates a draft with approved text, category, relevant event dates, optional expiry, and optional urgent highlight.
2. Administrator reviews and publishes it through the normal publishing workflow.
3. Public visitors see published items only.
4. An item with an expiry date is hidden from the public after expiry but may remain in the dashboard.
5. Administrator may use Share on WhatsApp to open WhatsApp with prepared text and then manually choose recipients and send.

### 5.6 Parent submits a testimonial
1. Parent submits text and ticks a required explicit consent checkbox.
2. The submission is stored privately and is not published automatically.
3. Administrator reviews it and may edit, approve/publish, unpublish, or remove it.
4. Testimonials received through other channels can be published only after permission to publish has been obtained.
5. The form does not support photo uploads; fake testimonials must not be created or published.

## 6. Functional requirements

Priority definitions: **Must** = required for MVP; **Should** = expected where feasible and included in acceptance planning; **Open** = requires a decision or school-supplied input before the relevant feature can be finalized.

### 6.1 Public website and navigation

**FR-001 — Public pages (Must)**  
The website shall provide Home, About the School, Classes and Facilities, Admissions, Announcements and Academic Calendar, Photo Gallery, Parent Testimonials, FAQ, and Contact and Visit Requests pages.  
**Acceptance criteria**
- Each agreed page is reachable through clear navigation.
- Public pages do not require sign-in.
- The navigation works on mobile, tablet, and desktop layouts.
- Unpublished or private content is not rendered publicly.

**FR-002 — Homepage content (Must)**  
The homepage shall introduce the school, provide a prominent admissions/application route, highlight approved school information and imagery, and surface recent announcements and relevant upcoming events.  
**Acceptance criteria**
- Admission access is easy to find.
- Homepage content uses only school-approved facts and assets.
- The layout remains usable on narrow screens.

**FR-003 — School information management (Must)**  
The administrator shall be able to manage supported school information, including history, mission/vision, classes, teaching approach, facilities, extracurricular activities, and admission requirements, without source-code edits.  
**Acceptance criteria**
- The dashboard supports creating/updating/removing supported content.
- Public pages show only published/approved content.
- Missing school-supplied information is not replaced with invented facts.

**FR-004 — FAQ management (Must)**  
The administrator shall be able to add, edit, organize, publish, unpublish, and remove FAQ entries.  
**Acceptance criteria**
- Only published answers appear publicly.
- Changes appear on the public FAQ page after publication.
- The administrator can correct or remove outdated answers.

**FR-005 — Responsive and English-only interface (Must)**  
The initial release shall support English and responsive layouts for phones, tablets, and desktop computers.  
**Acceptance criteria**
- Core navigation, forms, dashboard tables, and record details remain usable at supported viewport sizes.
- Long labels and text wrap without breaking layout.
- No separate language selector is shown in MVP.

**FR-006 — No site-wide search (Must / exclusion)**  
A dedicated site-wide search is not included in MVP. This does not remove the dashboard search requirements for applications and inbox records.

### 6.2 Admission application

**FR-007 — Application form and selections (Must)**  
The public form shall let a parent select Primary or Secondary, then a class belonging to that section, and an academic session.  
**Acceptance criteria**
- Class choices correspond to the selected section.
- Required selection values are validated on the server.
- Class and academic-session options can be maintained according to the agreed data-management approach.
- The final class list and session naming must be supplied or approved by the school before launch.

**FR-008 — Admission fields (Must; baseline approved 24 October 2026)**  
The form shall support the following fields, approved as the baseline on 24 October 2026 (ADR-031, D-01):

- Required: student surname, student first name, date of birth, gender, parent/guardian name, home address, parent/guardian phone, intended section, class applying for, academic session, and typed parent/guardian full name as a signature.
- Optional: student middle name, religion, ethnicity, state of origin, previous school, last class attended, parent/guardian email, occupation, office address, student photograph, and relevant health information.

`gender` accepts exactly `male` or `female` (ADR-031, D-02).

School-only fields such as exam scores, date of admission, staff-assigned class of admission, transport-service choice, and headmistress signature are excluded from the parent-facing form.  
**Acceptance criteria**
- Field labels and required/optional status match the approved baseline.
- The form clearly marks required fields.
- Changing this list — adding a field, removing one, or altering requiredness — is a schema change requiring a migration plan and a new decision, not a form tweak.
- Optional health information is described as information the parent considers important for the school to know.
- The typed full name must not be represented as legally valid in all circumstances without appropriate verification.

**FR-009 — Validation and error handling (Must)**  
The client and server shall validate submitted admission data.  
**Acceptance criteria**
- Missing or malformed required values produce clear, actionable errors.
- Server validation cannot be bypassed by submitting directly to the API.
- Recoverable failures preserve entered data where practical.
- Technical details, stack traces, credentials, and private record data are not shown in public errors.
- The form does not show success when validation or persistence fails.

**FR-010 — Persist and confirm application (Must)**  
A valid application shall be saved before success is displayed.  
**Acceptance criteria**
- The exact success message is “Your admission application has been submitted successfully.”
- The saved application becomes available in the administrator dashboard.
- No application reference number, automatic notification, or parent-facing status tracking is generated in MVP.

**FR-011 — Duplicate submissions (Must)**  
The system shall not implement automated duplicate-admission detection or blocking in MVP. Valid submissions are accepted even if they resemble existing applications; the administrator handles duplicates manually.  
**Acceptance criteria**
- No duplicate-detection rule rejects a valid submission solely because similar details already exist.
- Normal field validation, abuse controls, and safe submission handling still apply.

**FR-012 — Student photograph upload (Must, optional for parent)**  
A parent may attach a student photograph, but the upload is not required.  
**Acceptance criteria**
- The server accepts only explicitly supported image formats and enforces a configured size limit.
- Arbitrary file types are rejected server-side.
- Upload failures are communicated clearly and do not cause a false success.
- The administrator can view the supplied image from the protected application record.
- Image storage and access are protected; images are not made public by virtue of being uploaded with an application.

**FR-013 — No draft saving (Must / exclusion)**  
Parents must complete and submit the application in one visit. Draft saving and parent accounts are not included in MVP.

### 6.3 Administrator authentication and dashboard

**FR-014 — Single administrator account (Must)**  
The MVP shall provide one administrator account with full administrative permissions. No staff accounts, role-management interface, or multi-user permission system is included.  
**Acceptance criteria**
- The administrator signs in using email and password.
- Unauthenticated users cannot access protected dashboard pages or private APIs.
- Server-side authorization protects private operations; hiding links in the UI alone is insufficient.
- The dashboard does not expose a public registration flow.

**FR-015 — Secure credential handling (Must)**  
Administrator passwords shall be stored using a suitable secure password-hashing algorithm, never in plain text. Login attempts shall be rate-limited and common web security protections applied.  
**Acceptance criteria**
- Passwords are never returned by API responses or displayed in the dashboard.
- Login failures do not reveal whether a password or account secret was correct beyond necessary user guidance.
- Secrets are kept out of source control and ordinary logs.
- The production site uses HTTPS.

**FR-016 — Developer-assisted password recovery (Must)**  
Password recovery for the initial release shall be developer-assisted; an email delivery service is not required.  
**Acceptance criteria**
- No unsupported “forgot password” flow promises an email that cannot be sent.
- The reset procedure is documented, access-controlled, and does not expose secrets.
- The administrator can regain access through the documented recovery process.

**FR-017 — Dashboard summary (Must)**  
After sign-in, the dashboard shall show total admission applications, new contact enquiries, visit requests requiring follow-up, recently published announcements, and quick links to management areas.  
**Acceptance criteria**
- Each count has a documented definition.
- Summary values reflect stored records and their relevant statuses.
- The dashboard contains no public-facing exposure of individual private records beyond the authenticated session.

**FR-018 — Application search/filter/sort (Must)**  
The administrator shall be able to search applications by applicant name or parent/guardian phone number, and filter/sort by relevant fields including section, class, and academic session.  
**Acceptance criteria**
- Search and filters work against saved records.
- Empty results are explained clearly.
- Filters can be cleared and combined where practical.
- Search is restricted to the authorized dashboard.

**FR-019 — View and edit applications (Must)**  
The administrator shall be able to view full application details and edit them when corrections are needed.  
**Acceptance criteria**
- All agreed fields are visible to the authorized administrator.
- The system records that an edit occurred, its timestamp, and the administrator actor.
- Original values for important changes are preserved where practical.
- Sensitive health information is accessible only within the protected application-management experience.

**FR-020 — Print and PDF export (Must)**  
The administrator shall be able to print or export one application and select multiple applications for bulk print/export.  
**Acceptance criteria**
- Output is legible and includes the relevant application details.
- Bulk operations clearly identify the selected records.
- Exported files are generated only through authorized actions.
- The interface warns the administrator to handle downloaded records securely where appropriate.
- Export failures do not alter or delete application records.

**FR-021 — Application Trash, restore, and permanent deletion (Must)**  
The administrator shall be able to move an application to Trash, restore it, and permanently delete it from Trash after an explicit confirmation step.  
**Acceptance criteria**
- Moving to Trash does not immediately permanently erase the record.
- The administrator can find and restore trashed records.
- Permanent deletion requires a clear confirmation that identifies the irreversible action.
- The implementation follows the final approved retention/deletion policy.
- Backup behavior and whether backups retain deleted records are documented.

**FR-022 — No admission decision statuses (Must / exclusion)**  
The dashboard shall not implement Pending, Accepted, Not Accepted, or other admission outcome workflow in MVP.

### 6.4 Contact enquiries and visit requests

**FR-023 — Contact enquiry form (Must)**  
The public contact form shall collect parent/guardian name, phone number, optional email, intended section (Primary or Secondary), and message.  
**Acceptance criteria**
- Server-side validation is applied.
- Successful submissions are stored and available in the dashboard.
- The visitor receives confirmation only after successful saving.
- No automatic email or WhatsApp notification is sent to the school.

**FR-024 — Visit-request form (Must)**  
The public visit-request form shall collect parent/guardian name, phone number, optional email, intended section, preferred date, preferred time, and optional message.  
**Acceptance criteria**
- The server validates and saves the request.
- The success message clearly explains that the request is received, not automatically confirmed.
- No automated confirmation or calendar booking is implied.
- The administrator can follow up manually.

**FR-025 — Enquiry and visit inbox (Must)**  
The administrator shall be able to search and view contact enquiries and visit requests, set each status to New, Reviewed, or Responded to, and archive records when no longer active.  
**Acceptance criteria**
- Enquiries and visit requests are distinguishable from admission applications.
- Status changes are saved and shown in the inbox.
- Archived records are not confused with deleted records.
- Private records cannot be accessed without administrator authorization.

### 6.5 Announcements and academic events

**FR-026 — Announcement and event management (Must)**  
The administrator shall be able to create, edit, draft, publish, unpublish, and remove announcements and academic events. Supported examples include resumption dates, examinations, holidays, PTA meetings, school events, urgent notices, and changes to activities.  
**Acceptance criteria**
- Only published items appear publicly.
- Drafts remain private.
- The administrator can update or remove an item.
- Content comes from or is approved by the school.

**FR-027 — Categories, dates, urgency, expiry (Must)**  
Announcements shall support categories, event start/end dates, an optional urgent highlight, and an optional expiry date.  
**Acceptance criteria**
- The chosen category and date details are visible where relevant.
- Expired items are hidden from the public after the configured expiry date and may remain in the dashboard.
- Items without an expiry date remain published until unpublished or removed.
- Urgent items use the normal draft/review/publish workflow; urgency does not bypass publication controls.
- The final category list and date/time rules are documented before implementation.

**FR-028 — Upcoming-events list (Must)**  
The public calendar experience shall be an upcoming-events list ordered by date. A monthly calendar view is not included in MVP.  
**Acceptance criteria**
- Public event entries are ordered chronologically by relevant event date.
- Entries show the approved event title, date, and available details.
- Unpublished and expired items are not shown publicly.
- The list is usable on mobile devices.

**FR-029 — Manual WhatsApp sharing (Must)**  
The administrator shall be able to activate a Share on WhatsApp action for an announcement.  
**Acceptance criteria**
- The action opens WhatsApp or WhatsApp Web with prepared announcement text where supported.
- The administrator chooses recipients and manually sends the message.
- The website does not automatically send messages or require the WhatsApp Business API.

### 6.6 Gallery and videos

**FR-030 — Photo gallery management (Must)**  
The administrator shall be able to upload and remove photos, add captions, organize photos into categories, reorder photos, and control public visibility.  
**Acceptance criteria**
- Only approved/publicly visible gallery photos appear on the public site.
- Uploaded files are validated and size-limited server-side.
- Meaningful images have appropriate alternative text or a supported way to provide it.
- The school confirms appropriate permission to publish identifiable student images.
- Unnecessary image metadata and personal information are not exposed.

**FR-031 — YouTube links only (Must)**  
The administrator shall be able to add, edit, and remove YouTube video links. Direct video-file uploads are out of scope.  
**Acceptance criteria**
- Invalid or unsupported URLs are rejected or safely handled.
- Videos are presented without accepting direct video uploads to the school server.
- Third-party privacy implications are considered; avoid loading unnecessary third-party scripts before needed where practical.

### 6.7 Testimonials

**FR-032 — Public testimonial submission with consent (Must)**  
Parents shall be able to submit text testimonials through a public form with a required explicit consent checkbox authorizing publication if the testimonial is approved.  
**Acceptance criteria**
- The consent checkbox is required to submit the form.
- Consent wording is approved before launch and is clear about intended public use.
- The submission is stored privately and never automatically published.
- The form is text-only and does not allow photo uploads.

**FR-033 — Testimonial moderation (Must)**  
The administrator shall be able to review, edit, approve/publish, unpublish, and remove testimonials. Testimonials supplied through other channels may be published only after permission has been obtained.  
**Acceptance criteria**
- Public pages display only approved/published testimonials.
- Parent-submitted testimonials remain private until administrator publication.
- The system does not create or publish fabricated testimonials.
- Unpublished or removed testimonials are not exposed on public pages.

### 6.8 Contact information, map, and social links

**FR-034 — Official contact details (Must; school input required)**  
The Contact page shall support the school's approved physical address, map or map link, official phone number, official email if available, and official WhatsApp contact button.  
**Acceptance criteria**
- Only confirmed school details are published.
- The WhatsApp button opens the app/web using the official number and does not send automatically.
- Missing information is omitted or clearly handled until supplied; it is not invented.

**FR-035 — Official social links (Must)**  
The site shall support links to confirmed official social accounts in suitable places such as the footer and Contact page. Embedded social feeds are out of scope.  
**Acceptance criteria**
- Each displayed link is confirmed as an official account.
- Links work and are accessible by keyboard.
- No embedded live feeds are included in MVP.

### 6.9 Privacy, security, accessibility, and operations

**FR-036 — Private data isolation (Must)**  
Admission applications, enquiries, visit requests, sensitive health information, and administrative exports shall remain private to authorized dashboard access.  
**Acceptance criteria**
- Unauthenticated requests to private API routes are denied.
- Public endpoints return only explicitly public content.
- Sensitive data is not included in public URLs, logs, or error messages.
- Authorization is enforced server-side.

**FR-037 — Public form abuse protection (Must)**  
Public forms and file uploads shall use reasonable validation, rate limits, and abuse protections appropriate to the chosen architecture.  
**Acceptance criteria**
- Invalid input and unsupported file types are rejected server-side.
- Request limits are documented and tested.
- Failure responses do not reveal internal implementation details.
- Abuse controls do not intentionally implement duplicate-application blocking.

**FR-038 — Accessibility practices (Must)**  
The public website and dashboard shall use accessible structure and interaction patterns.  
**Acceptance criteria**
- Form controls have labels and instructions.
- Validation errors are associated with relevant fields and understandable.
- Keyboard users can navigate core flows and see focus indicators.
- Text and controls have suitable contrast and readable sizing.
- Meaningful images have appropriate alt text.
- Core pages and forms are checked using free accessibility tools and manual keyboard checks.
- No unverified claim of full legal or technical accessibility compliance is made.

**FR-039 — Manual backups (Must)**  
The operational process shall support manual backups, intended daily while the system is in use, especially during active admissions.  
**Acceptance criteria**
- Backup steps, naming, secure storage, and restoration steps are documented.
- Backups are stored separately from the live database and are not committed to Git.
- Backup files and credentials are protected from public access.
- Restoration is tested before launch.
- The known limitation that manual backups may omit changes made since the last backup is documented.

**FR-040 — Health check and recovery (Must)**  
The backend shall provide a health-check endpoint and a documented recovery approach. A suitable free monitoring option may be used if its terms and limits permit.  
**Acceptance criteria**
- The health check reports basic service health without credentials, database secrets, or personal data.
- Visitor-facing failures show friendly messages rather than stack traces.
- Recovery notes describe how to investigate service issues, redeploy/restart where appropriate, and restore data.
- Monitoring is not described as configured or verified until actually tested.

**FR-041 — Free-tier and provider review (Must / release gate)**  
Before production launch, the selected hosting, database, image storage, monitoring, and other external services shall be checked against current terms, free-tier limits, persistence/durability, backups, availability, security, and privacy.  
**Acceptance criteria**
- The provider and relevant free-tier restrictions are documented.
- Persistent data is not placed on ephemeral storage without a verified durable storage plan.
- Backup/export and restore paths are demonstrated.
- No paid dependency is added without explicit user approval.
- Any critical unmet requirement is reported with its specific limitation and decision options before launch.

**FR-042 — Privacy and retention policy (Must / release gate)**  
Before production use, the school and developer shall define and document the privacy notice, retention/deletion rules, sensitive-data access controls, and the process for correction/deletion requests. Applicable Nigerian data-protection obligations and school policies must be checked.  
**Acceptance criteria**
- A clear public privacy notice and appropriate form notices are approved before launch.
- Retention periods and permanent-deletion rules are documented.
- Handling of optional health information and student photographs is documented.
- The school confirms permissions for publication of student images and testimonials.
- Legal/regulatory questions requiring qualified review are flagged; the PRD does not claim legal compliance by itself.

## 7. Business rules and permissions

1. Public visitors can view published school information and submit public forms without an account.
2. One administrator account has full administrative permissions in MVP. No staff accounts or role management.
3. All private records and management actions require authenticated, server-authorized access.
4. Parents do not receive accounts, application reference numbers, or application-status tracking.
5. Valid admission applications are accepted even if similar records already exist; duplicates are handled manually.
6. A successful form confirmation is shown only after persistence succeeds.
7. The administrator may edit submitted applications; edits must be recorded, and original important values should be preserved where practical.
8. Application deletion is staged through Trash and restoration; permanent deletion requires explicit confirmation and must follow the approved retention policy.
9. No admission outcome workflow is provided.
10. Contact enquiries and visit requests use New, Reviewed, and Responded to statuses and can be archived.
11. A visit request is not a confirmed appointment. Confirmation is manual.
12. Announcements and events must be published before becoming public.
13. Urgent announcements do not bypass the standard publication workflow.
14. An expired announcement is hidden publicly but may remain in the dashboard.
15. WhatsApp actions prepare a message for the administrator to send manually; they do not send automatically.
16. Videos are represented by YouTube links; direct video uploads are excluded.
17. Parent-submitted testimonials require explicit consent and administrator approval before publication.
18. Testimonials received elsewhere require permission to publish.
19. No school facts, contact details, policy answers, testimonials, or student imagery may be invented or published without approval.
20. No paid service may be introduced without explicit discussion and approval.

## 8. Non-functional requirements

### 8.1 Performance
- Public pages and core form interactions should remain usable on typical mobile connections.
- Optimize images and avoid unnecessarily large assets.
- Provider-specific performance targets should be set after the architecture and hosting constraints are verified.
- Do not promise a numerical uptime or latency target without measurement and provider evidence.

### 8.2 Reliability and data integrity
- Do not show successful submission before persistence succeeds.
- Failed edits or exports must not silently corrupt or delete records.
- Backup and restoration procedures must be documented and tested before launch.
- Clearly communicate when a service is unavailable without exposing internal details.

### 8.3 Security
- Use HTTPS in production.
- Hash administrator passwords with an appropriate algorithm.
- Enforce server-side authorization and validation.
- Apply rate limits to login and public forms.
- Validate uploaded files and enforce size limits.
- Protect session/token/cookie handling according to the selected architecture.
- Keep secrets out of Git and logs.
- Avoid leaking personal information through URLs, error messages, logs, public APIs, or health checks.
- Protect backups and exported PDFs.

### 8.4 Privacy
- Collect only fields approved as necessary by the school.
- Treat children's personal data and optional health information as sensitive.
- Restrict application-level information to the administrator.
- Obtain and document permission before publishing identifiable student images or testimonials.
- Define retention and deletion practices before launch.
- Verify applicable Nigerian data-protection requirements and school policy before production use.

### 8.5 Accessibility
- Use semantic structure, readable text, suitable contrast, visible focus, keyboard navigation, labeled controls, useful validation messages, and appropriate image alternatives.
- Test core journeys using free tools and manual checks.
- Record any known accessibility limitations; do not claim full compliance without evidence.

### 8.6 Maintainability
- Routine supported content changes should not require code edits.
- Document setup, environment variables, deployment, backup, restore, and recovery.
- Keep secrets out of version control.
- Keep implementation details and provider choices documented in the appropriate technical planning artifacts after PRD approval.

### 8.7 Cost
- Initial release should require no paid services.
- Free-tier availability, limitations, and permitted use must be checked at the time of provider selection and again before launch.
- If a required control cannot be achieved within the no-cost constraint, pause that decision and present options rather than silently reducing the control or adding a paid dependency.
- **Added 24 October 2026.** A free tier that its own provider documents as unsuitable for production use must be treated as a Stage 2 blocker (SG-02), not accepted by default because it is free. The absence of a paid invoice is not evidence of suitability.
- Low traffic does not make a provider's plan terms applicable to the school's use. Eligibility is determined by purpose, not volume.
- Any paid dependency — including a provider's paid backup add-on — requires explicit owner approval before it is enabled.

## 9. Edge cases and failure scenarios

| Scenario | Expected behavior |
|---|---|
| Required application field is missing | Show a clear validation error; do not save as a successful application. |
| Client-side validation is bypassed | Server rejects invalid data. |
| Database is unavailable during form submission | Show a friendly failure message; do not show success; preserve entered data where practical. |
| Backend service is waking from an idle state (cold start) | Show an honest "starting up, this may take a moment" state. Never a spinner that implies completion, and never a success message. |
| Database cluster is paused by the provider | Report that the service is temporarily unavailable. Do not claim the submission was saved. Recovery requires a manual provider action, which must be documented. |
| User submits a valid application similar to an existing one | Accept it; no automated duplicate blocking; administrator handles possible duplicates manually. |
| Photo is too large or has an unsupported format | Reject it safely and explain the issue; do not accept arbitrary files. |
| Parent enters an invalid class/section combination | Reject or require a valid class selection on the server. |
| Parent submits without testimonial consent | Do not accept the testimonial submission. |
| Testimonial is submitted successfully | Keep it private until administrator approval and publication. |
| A draft announcement is opened by a public visitor | Do not expose it. |
| Announcement passes its expiry date | Hide it from the public; it may remain in the dashboard. |
| Urgent announcement is created | Require the normal draft/review/publish workflow. |
| WhatsApp is unavailable or not installed | The site does not claim that a message was sent; the administrator may share by another route. |
| Visit request is submitted | Confirm receipt only; state that it is not yet a confirmed visit. |
| Unauthenticated visitor requests a private record | Deny access without disclosing whether the record exists. |
| Administrator moves an application to Trash | Keep it restorable until permanent deletion under the approved policy. |
| Administrator permanently deletes a record | Require confirmation and follow the approved retention policy; document backup implications. |
| Bulk export fails | Report failure without altering the selected records. |
| Backup is older than the latest submissions | Document the possible loss window; do not imply that manual backups are continuous. |
| Free provider changes its limits or removes a needed capability | Reassess before relying on it for production data; report the impact and options. |
| School has not supplied official details or approved imagery | Leave the content pending or omit it; do not fabricate it. |

## 10. Dependencies and external services

**Revised 24 October 2026.** The technology direction is now chosen. Provider details, verified
limits and sources are recorded in `ARCHITECTURE.md`; this section records only the dependency and
its status.

| Dependency | Selected | Status |
|---|---|---|
| Frontend hosting | Vercel | Chosen. **Eligibility unconfirmed** — SG-01 |
| Backend/API hosting | Render, free web service | Chosen. Documented by the provider as not for production use |
| Database | MongoDB Atlas, Free (M0) | Chosen. **Stage 2 tier decision required** — SG-02 |
| Object storage for photographs and gallery images | Not yet selected (Cloudflare R2 proposed) | Open |
| Off-site backup destination | Not yet selected (Cloudflare R2 proposed) | Open |
| Map | Simple map link | Chosen; requires the school's confirmed location |
| YouTube | Administrator-provided links only | Chosen; no uploads, no embedded player until requested |
| WhatsApp | Manual sharing via link | Chosen; the site never sends a message |
| Monitoring | Free uptime service | Not yet selected |

For each selected provider, technical planning must document the account/plan, data location where
known, free-tier restrictions, persistent storage behavior, credentials required, backup/export
method, and verification steps. Never place production secrets in chat or source control. No
provider should be described as configured or verified until that status is actually confirmed.

**Note on the frontend/backend split.** The two are hosted by different providers, so they are
different sites as far as the browser is concerned. Authentication, cookies, CORS and CSRF must
therefore be designed for that arrangement and **verified on the real deployed domains**; a
localhost test does not demonstrate that admin sign-in works.

**Tracking.** Provider status, credentials, permissions and verification results for every
dependency in this table are maintained in `INTEGRATIONS.md`. Configuration values are registered
in `ENVIRONMENT_VARIABLES.md`. Neither document describes anything as working until it has been
tested.

## 11. Risks and mitigations

| Risk | Mitigation / required action |
|---|---|
| Sensitive child/parent data exposed | Server-side authorization, data minimization, secure storage, safe logs/errors, HTTPS, and pre-launch privacy/security review. |
| Optional health information creates elevated privacy risk | Confirm necessity with the school, restrict access, define retention, and review applicable obligations before launch. |
| Student images published without authorization | Require school approval/appropriate permissions; restrict private application photos; document gallery publication workflow. |
| Free hosting has ephemeral storage or restrictive limits | Verify current provider terms and data durability before selecting the architecture; demonstrate backup and restore. |
| Manual backup is out of date | Daily backup routine, backup log, secure separate storage, restore test, and explicit documentation of the potential data-loss window. |
| School information is inaccurate or invented | Require school-supplied or school-approved facts and contact details. |
| Parent thinks visit is confirmed | State clearly that the form submits a request and that the school must follow up manually. |
| Duplicate applications accumulate | No automated blocking in MVP; administrator handles duplicates manually. |
| Admin loses access | Document developer-assisted password recovery and secure provisioning. |
| Permanent deletion conflicts with retention or backups | Agree retention/deletion rules before launch; document backup behavior and restoration implications. |
| Accessibility is assumed rather than tested | Test core pages and forms with keyboard and free accessibility tools; record limitations. |
| Free service limits change | Re-check before launch and document a no-cost fallback or request a decision if a critical requirement is affected. |
| Frontend hosting plan does not permit the school's use | Confirm eligibility in writing before Stage 1; if not permitted, present hosting options rather than proceeding on an assumption (SG-01). |
| Database free tier pauses through inactivity | Document that data is retained but the service stops accepting connections, and that resuming requires a manual action. Monitor so this is detected rather than discovered by a parent. |
| Backend cold start delays a parent's submission | Show an honest loading state; ensure a slow response is never rendered as success. Measure the real delay on the deployed domains. |
| Private photograph reaches a public surface | Separate storage for private and public images, with no code path that promotes one to the other; verify by test (SG-09). |

## 12. Assumptions

- Chosen School serves both Primary and Secondary sections.
- The public website is English-only for MVP.
- The expected audience is modest, but actual traffic is not measured yet.
- The school will supply or approve factual content, class lists, academic sessions, branding, official contact information, photos, policies, and testimonial permissions.
- The administrator can manually follow up with parents using the school's existing communication channels.
- The developer will maintain the system and conduct routine deployment/backup tasks.
- The no-paid-services constraint remains in force unless the user explicitly changes it.
- The product must not imply that free hosting is automatically durable or suitable for sensitive production data without verification.

## 13. Open questions and pre-launch decisions

These items should not block writing this PRD, but the relevant ones must be resolved before implementing the affected behavior or launching with real data.

### 13.1 School-provided information
- Official school name formatting, logo, colors, fonts, and approved imagery.
- Approved school history, mission/vision, classes, teaching approach, extracurricular activities, facilities, and admission requirements.
- Final class list for each section and academic-session options.
- Official address/map location, phone, WhatsApp number, email if available, and official social URLs.
- FAQ content and approved public announcements/events.
- Expected launch date or deadline and any school-specific review process.

### 13.2 Admission form and privacy
- **Resolved 24 October 2026:** the required/optional status of each admission field (D-01), the typed signature being required, and the permitted `gender` values (D-02) — see ADR-031.
- Approve privacy notice, field explanations, and submission consent wording.
- Confirm whether religion and ethnicity are necessary for the school's process and the appropriate handling of those fields.
- Confirm the necessity and exact wording for optional health information.
- Set student-photo file size/format limits during technical planning.
- Define retention periods, deletion rules, and how parents can request correction/deletion.
- Verify applicable Nigerian data-protection obligations and any school policies with qualified support where needed.

### 13.3 Operations and technical architecture

**Revised 24 October 2026.**

*Resolved:* frontend/backend stack and deployment architecture (React/Vite/TypeScript + Express/
TypeScript, hosted on Vercel and Render); database and ODM (MongoDB Atlas with Mongoose); map
implementation (link, not an embedded map).

*Still open:*

- Frontend hosting plan eligibility for the school's actual use (SG-01).
- Database tier acceptable for Stage 2, or the school's written acceptance of the free tier's
  documented limitations (SG-02).
- Object storage provider for private photographs and public gallery images.
- Secure backup location, process, and restore procedure, including the retention period.
- Free monitoring option and its alerting limitations.
- Administrator account provisioning and developer-assisted password-reset procedure.
- Definitions for dashboard summary counts.
- Final announcement category list and event date/time behaviour.
- Final retention behaviour for Trash, permanent deletion, and backups.
- Whether the administrator can edit school information directly, and where.

## 14. Traceability: goals to requirements

| Goal | Related requirements |
|---|---|
| Professional public presence | FR-001, FR-002, FR-003, FR-005, FR-034, FR-035 |
| Help prospective parents learn and apply | FR-001, FR-007–FR-013, FR-023, FR-024 |
| Make announcements and events easier to find | FR-026–FR-029 |
| Reduce paper-based administration | FR-017–FR-025 |
| Enable routine content management | FR-003, FR-004, FR-026, FR-030–FR-035 |
| Protect private data | FR-014–FR-016, FR-019–FR-021, FR-036–FR-042 |
| Respect the no-paid-services constraint | FR-039–FR-041 |
| Support responsive and accessible use | FR-005, FR-038 |
| Ensure operational recovery | FR-039–FR-041 |

## 15. Approval record

**Approved by:** project owner, 22 October 2026.

The seven checks above were reviewed and the document was approved as the
requirements baseline for design and technical architecture.

Approval confirms the scope, the single-administrator model, the
application behaviour, the upcoming-events-only public calendar, the
testimonial consent and approval rule, and the security, privacy, backup
and no-paid-services constraints.

Approval does **not** close the open items recorded elsewhere in this
document — retention and deletion policy, consent wording, the necessity
of religion and ethnicity, dashboard count definitions, and provider
selection. Those remain pre-launch gates. Implementation may proceed only
after the relevant planning documents and readiness gates are complete.

**Subsequent decisions.** The admission field baseline and `gender` values were approved on
24 October 2026 (ADR-031), and the admin editing of school information was settled as fixed
structured fields (ADR-030). Neither authorises the collection of real personal data before the
Stage 2 gates in §4.4 are satisfied.

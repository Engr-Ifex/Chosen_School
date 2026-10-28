# Chosen School Website — Design Specification

**Document status:** Approved  
**Phase:** Design  
**Approval status:** Approved by project owner, 22 October 2026  
**Product baseline:** Approved `discovery.md` and approved `PRD.md`  
**Last updated:** 21 October 2026

> This document defines the intended user experience and interface behavior. It is not implementation code. This document was approved on 22 October 2026 and is the baseline for UI implementation. School-specific facts, branding assets, photographs, policy wording, and contact details must be supplied or approved by the school; do not invent them.

## 1. Purpose and design outcomes

Design a professional, trustworthy, accessible and responsive public website for Chosen School's Primary and Secondary sections, paired with a private dashboard for one administrator. The public experience should help families understand the school, find important information, apply for admission, ask questions and request a visit. The dashboard should make routine content and record management clear without exposing private family information.

### 1.1 Design principles

1. **Clarity before decoration.** Use clear page hierarchy, concise headings, predictable navigation and generous spacing.
2. **Professional and welcoming.** Use a modern, restrained visual style with authentic school imagery and warm, child-friendly touches.
3. **Mobile-first, not mobile-only.** Public forms and administrative workflows must work on phones, tablets and desktop screens.
4. **Accessible by default.** Use semantic structure, keyboard support, visible focus, adequate contrast, labels and understandable feedback.
5. **Privacy-aware presentation.** Avoid exposing sensitive information in public views, previews, URLs, browser titles or error messages. Keep optional health information out of application list previews.
6. **Honest feedback.** Show success only after a server confirms the action was saved. Clearly distinguish a visit request from a confirmed appointment and WhatsApp sharing from a message sent automatically.
7. **Consistent patterns.** Reuse form controls, buttons, status labels, tables, dialogs, empty states and feedback messages.
8. **No invented school facts.** Use placeholders during design and development; replace them with school-approved content before launch.
9. **Protect against accidental loss.** Use Trash and recovery for supported records, with a separate confirmation for permanent deletion.
10. **No silent scope expansion.** Do not introduce accounts for parents, automated messaging, payments, site-wide search or other excluded features.

## 2. Visual direction and design system

### 2.1 Approved direction

- Modern and professional.
- Clean layouts and generous whitespace.
- Restrained colours and strong typography.
- Authentic school photography and facilities.
- Preserve and refine the school's existing identity rather than inventing a replacement brand.

### 2.2 Decisions to make during visual design

The exact logo, official colours, typography, button treatment, icon style, border radii, shadows and spacing tokens remain to be confirmed after the school supplies its branding. Use a provisional neutral design system during implementation and clearly mark temporary assets. Do not treat provisional colours or stock imagery as final branding.

### 2.3 Component conventions

- Establish consistent page containers, spacing scale, type scale, colour tokens and focus styles.
- Use one primary action per major page region where practical; secondary actions should be visually quieter.
- Use text labels alongside icons for important administrative actions.
- Use consistent status labels for drafts, published content, new/reviewed/responded records and trashed items.
- Destructive actions should be visually distinct and require a clear confirmation step.
- Avoid relying on colour alone to communicate status or validation.

## 3. Information architecture

### 3.1 Public navigation

Desktop top navigation:

- Home
- About
- Academics dropdown: Primary, Secondary
- Admissions
- News & Events
- Gallery
- Contact
- A visually distinct **Apply for Admission** action

On smaller screens, replace the full navigation with an accessible menu control. Keep the admission action easy to find without overwhelming the menu. The school logo/name links to Home. The active page or section should be identifiable beyond colour alone.

### 3.2 Footer navigation

Use a structured multi-column footer with school identity and approved contact information, quick links, Primary and Secondary pathways, Admissions, FAQs, Testimonials, privacy information and approved social links. Stack columns on narrow screens. Do not add a newsletter form in the MVP.

### 3.3 Admin navigation

Use a persistent, labelled sidebar on desktop, with the current section clearly highlighted. On smaller screens, collapse it into an accessible menu. Sections:

1. Dashboard
2. Applications
3. Enquiries
4. Visit Requests
5. Announcements & Events
6. Gallery
7. FAQs
8. Testimonials
9. Settings

Provide a clear sign-out action. The current page title and any section-specific primary action should appear in the main workspace. Do not make the admin navigation icon-only by default.

## 4. Public screen inventory

### 4.1 Home

**Purpose:** Introduce the school, route visitors to Primary or Secondary, make admissions easy to find, and surface timely information.

**Structure:**
1. Header and primary navigation.
2. Split hero: school introduction and admission CTA on one side, school-approved photograph on the other.
3. Two visual pathway cards for Primary and Secondary, each with a photograph, short approved introduction and “Explore section” link.
4. School overview and selected approved information about learning/facilities.
5. Admissions feature with clear CTA.
6. Recent announcements in compact cards or a simple list.
7. Upcoming events ordered by date.
8. Selected approved parent testimonials.
9. Footer.

Use a logical heading hierarchy and avoid making the hero a wall of text. Temporary stock photography may be used in development only and must be tracked and replaced before launch. Do not use identifiable children without appropriate authorization.

### 4.2 About

**Purpose:** Explain the school's identity and story using school-approved information.

Use readable content sections, meaningful headings and approved imagery where useful. Do not fabricate history, mission statements, values, awards, facilities or results. Keep long content readable on small screens.

### 4.3 Academics: Primary and Secondary

**Purpose:** Give each school section a focused overview and help parents find relevant classes and admissions information.

Each section page should include an introduction, school-confirmed class information, approved facilities/learning information, approved photography and a clear admissions CTA. Do not display class lists or academic claims until confirmed by the school.

### 4.4 Admissions

**Purpose:** Explain the process using approved content and allow a parent/guardian to submit an application without creating an account.

Use a short introduction followed by a single-page form with visually separated groups:

1. Student Information
2. Parent/Guardian Information
3. School Placement
4. Any approved optional details, such as student photo and relevant health information, with clear optional labels and privacy context
5. Parent/guardian typed-name signature, if confirmed as required by school policy

The section choice controls which classes are available. Mark required fields clearly and in text, not just with colour or an asterisk. Use appropriate input types, date controls and phone input guidance. On mobile, fields stack in one column; on wider screens, related low-risk fields may share a row. Avoid multi-column layouts that make form order confusing.

Do not add an application draft/save-for-later feature or public status tracking. Do not block similar submissions automatically.

### 4.5 Application confirmation

Only after the server confirms successful persistence, show the exact message:

> Your admission application has been submitted successfully.

Include a **Return to Homepage** link. Do not promise admission, provide a made-up reference number, or imply that an email/WhatsApp notification was sent.

### 4.6 News & Events

**Purpose:** Make current published information easy to find.

Use one page with two accessible tabs: **Announcements** and **Upcoming Events**. Announcements use compact, readable cards or a simple list; an urgent item may receive a clear text label and distinct visual treatment. Upcoming events are ordered by date. Do not add a monthly calendar view or site-wide search. Show only published items; expired events are hidden from the public view but retained in the dashboard as specified by product rules. Provide a useful empty state when no content is published.

### 4.7 Gallery

**Purpose:** Present approved school photographs in a visual, responsive collection.

Use a responsive image grid and category filters. Selecting a photo opens a larger viewer with an accessible close control, keyboard support and a useful caption where supplied. Keep images optimized and avoid exposing file metadata or private information. Only approved public gallery images may appear here; admission photos remain private. YouTube videos are represented by administrator-provided links or privacy-conscious embeds; direct video upload is not supported.

### 4.8 Contact

**Purpose:** Make contact information, enquiries and visit requests straightforward.

Display only school-approved address, phone, email (if available), map or map link, WhatsApp link and social links. Place two distinct forms on the page:

**Send an Enquiry** — parent/guardian name, phone, optional email, intended section and message.

**Request a School Visit** — name, phone, optional email, intended section, preferred date/time and optional message.

Visually separate the forms and give each a clear heading and submit action. A visit request confirmation must state that the request was received, not that a visit is booked; the administrator follows up manually. Do not show success until the server confirms saving.

### 4.9 FAQs

Use a readable question-and-answer list, with accessible expandable items if an accordion is used. Keyboard users must be able to open/close answers, and expanded state must be announced appropriately. Include only school-approved answers. Provide a simple empty state if no FAQs have been published.

### 4.10 Testimonials

Display only testimonials approved for publication. The public submission form is text-only and includes an explicit consent checkbox and clear notice that submission does not guarantee publication. Do not publish submissions automatically and do not fabricate testimonials. Show a useful state when there are no approved testimonials.

## 5. Public user flows

### 5.1 Learn about the school

Home → About or Primary/Secondary pathway → relevant information → Admissions or Contact CTA.

### 5.2 Submit an admission application

Admissions → select section → select available class and academic session → complete grouped fields → receive accessible validation feedback → submit → server saves → exact success confirmation.

If validation or persistence fails, display a clear message near the relevant field or form summary, preserve entered data where practical and allow retry. Do not clear the form on recoverable errors. Prevent accidental repeated submission while a request is in progress, without implementing duplicate-detection rules.

### 5.3 Send an enquiry

Contact → Send an Enquiry form → validate → submit → server confirms save → show confirmation and explain that the school will follow up manually without promising a response time.

### 5.4 Request a visit

Contact → Request a School Visit form → select preferred date/time → validate → submit → server confirms save → explain that this is a request and the school will contact the parent/guardian to confirm or propose another time.

### 5.5 Find announcements and events

Navigation → News & Events → choose Announcements or Upcoming Events tab → open an item if a detail view is provided. Empty states should explain that there is currently no published content rather than appearing broken.

### 5.6 Browse the gallery

Navigation → Gallery → optionally filter by category → open image viewer → close viewer and return to the same grid/filter position.

### 5.7 Submit a testimonial

Testimonials page/form → enter text → review consent notice → check explicit consent → submit → show a received confirmation only after persistence. Explain that an administrator reviews submissions before publication.

## 6. Admin screen inventory and behavior

### 6.1 Sign-in

Use a compact, clearly labelled email/password form with a sign-in action, password visibility toggle if practical, visible validation and generic authentication errors that do not reveal whether an account exists. Show loading/disabled submit state during authentication. Do not expose public registration. Password recovery remains developer-assisted for MVP.

### 6.2 Dashboard home

Show summary cards for:
- Total admission applications
- New contact enquiries
- Visit requests requiring follow-up

Also show recently published announcements/events and quick links to common tasks. Summary counts need explicit, consistent definitions before implementation; do not guess them silently. Cards should link to the relevant filtered list where useful. Empty states should provide a next action rather than empty decorative cards.

### 6.3 Applications list

Provide a page title, search field (applicant name or parent/guardian phone), filters for section/class/academic session, sortable columns and pagination. Desktop table columns: applicant name, section, class, academic session, submission date and actions. On narrow screens, use a compact record-card layout or controlled horizontal overflow with clear affordances; do not squeeze every column into unreadable widths.

Provide visible loading, no-records, no-results, error/retry and pagination states. Sensitive optional health details must not appear in list previews.

### 6.4 Application detail and edit

Present a readable record view with sections for Student Information, Parent/Guardian Information and School Placement. Keep sensitive optional information clearly separated and accessible only in the protected admin view. Use a separate edit mode with Save and Cancel; warn before discarding unsaved changes. Show when an administrator edit is saved and record edit metadata according to the PRD.

Provide a distinct action area for Edit, Print, Export PDF, Move to Trash and other supported actions. Print/PDF output should be formatted for paper and omit dashboard navigation and irrelevant controls. Bulk print/export actions belong on the list view and must clearly show which records are selected.

### 6.5 Trash

Provide a separate Trash view for records that support recovery. Each row/card should identify the record type and enough non-sensitive information to distinguish it. Offer Restore and Permanently Delete. Permanent deletion must use a separate confirmation that identifies the selected record or count and makes irreversibility clear. Avoid accidentally deleting records due to row-click behavior. Retention period and policy remain a pre-launch decision.

### 6.6 Enquiries and Visit Requests

Use separate searchable tables, as approved. Show relevant contact details, submission date and status. The full record view should display the message and all submitted details. For visit requests, make the requested date/time prominent.

Supported statuses: **New**, **Reviewed**, **Responded to**. Provide a clear control to update status and feedback after save. Status changes do not send messages automatically and do not confirm a visit. Archive behavior should be available if required by the PRD; archived records must remain distinguishable from deleted records.

### 6.7 Announcements & Events list and editor

Provide a list view with clear draft/published/expired status, type/category, relevant dates and actions. Support creating, editing, previewing where practical, saving as draft, publishing, unpublishing and moving/removing content according to the approved record workflow.

The editor is a structured form with labelled fields for title, category, content, date and publishing controls. Use a simple content editor for readable text, links and basic formatting, not a full complex rich-text suite. Show event-specific start/end date fields when applicable, optional expiry where relevant, and optional urgent highlighting. Do not show irrelevant fields for the selected content type. All content, including urgent notices, uses the normal draft/review/publish workflow.

Provide Save Draft, Publish/Update, Cancel and preview actions as appropriate. Warn before leaving with unsaved changes. Publishing errors must leave the draft content available for correction.

### 6.8 Gallery management

Use a visual grid of image thumbnails. Each image item supports editing caption, assigning category, changing order, changing public visibility and removing/moving to Trash as defined by the common record workflow. Provide a clear upload area with accepted file guidance, upload progress, success/error states and retry where possible. Newly uploaded images are not public by default; the administrator explicitly controls visibility. Show an image preview before publication and avoid exposing private admission uploads.

YouTube video links are managed separately from photo uploads. Validate that the supplied link is an allowed YouTube URL and show a useful preview or link label where practical. Do not provide direct video upload.

### 6.9 FAQs management

Use a manageable list with question, publication state, ordering and actions. Editing uses labelled question and answer fields plus save/cancel/publish controls. Preview the public rendering where practical. Show empty, loading, error and success states.

### 6.10 Testimonials management

List submissions and administrator-created entries with review/publication state. Provide full text view, edit, approve/publish, unpublish and removal actions. Public submissions require explicit consent and administrator approval before publication. Never expose private moderation notes or unpublished text publicly.

### 6.11 Settings

Use one central settings page organized into labelled sections:
- School information
- Contact information
- Branding/logo
- Social links

Each section should have clear fields, validation, Save and Cancel controls, unsaved-change protection and success/error feedback. Do not show unconfirmed example contact details as if real. A successful save updates shared public values only after the server confirms persistence.

## 7. Responsive behavior

Use content-driven breakpoints rather than tying behavior to a particular device model. The exact pixel values can be selected during implementation and recorded in design tokens.

- **Small/mobile:** one-column content and forms; compact header/menu; stacked cards; touch-friendly controls; avoid hover-only functionality; admin sidebar becomes a menu; tables become record cards or carefully supported horizontal scrolling.
- **Medium/tablet:** flexible two-column layouts when content remains readable; cards wrap; admin navigation remains accessible without consuming the whole workspace.
- **Large/desktop:** split hero, two-card Primary/Secondary pathways, multi-column footer, persistent admin sidebar and full data tables where space permits.
- Images should preserve aspect ratio and use appropriate crops. Avoid layout shifts while images load.
- Dialogs and image viewers must fit within the viewport, scroll internally when necessary and remain usable in landscape orientation.

## 8. Accessibility requirements

Accessibility is a design and test requirement, not a claim of certification.

- Use semantic landmarks, meaningful page titles and logical heading order.
- All navigation, tabs, accordions, dialogs, menus, forms, tables and image viewers must be operable by keyboard.
- Provide a visible focus indicator and ensure focus is not hidden behind sticky elements.
- Associate every field with a persistent label; provide instructions and identify required/optional fields in text.
- Announce validation errors and asynchronous submission results to assistive technology; provide an error summary when a long form has multiple errors.
- Move focus appropriately when opening/closing dialogs and after important navigation changes.
- Use sufficient text/background contrast and never rely on colour alone for state.
- Provide meaningful alternative text for informative images and empty alternative text for decorative images.
- Give icon-only controls accessible names; prefer labelled controls for important admin actions.
- Respect reduced-motion preferences and avoid unnecessary animation.
- Use accessible data-table headers and ensure mobile alternatives preserve reading order.
- Test with keyboard-only navigation, zoom, responsive layouts and free accessibility-checking tools. Resolve serious issues before launch and document remaining limitations.

## 9. Forms, validation and feedback patterns

### 9.1 Form behavior

- Put field labels above or consistently beside controls; placeholders are examples, not substitutes for labels.
- Group related fields under clear headings and use the same order on mobile and desktop.
- Validate obvious issues on the client for immediate guidance and always validate again on the server.
- Explain what needs correction and place the message next to the relevant field, with a summary for long forms.
- Preserve entered data after recoverable errors where practical.
- Disable or guard repeated submission while a request is in progress, and show progress text or indicator.
- Do not show success until persistence is confirmed by the server.
- Do not reveal technical traces, database details, credentials or sensitive submitted values in error messages.

### 9.2 Standard feedback states

Use a consistent set of states across pages and dashboard sections:

- **Loading:** a visible progress indicator or skeleton that does not imply completion.
- **Starting up:** because the backend may take up to a minute to wake from an idle state, the first request after a quiet period can be slow. Show an honest message such as "Starting up — this may take a moment", keep the submit control disabled, and never let a slow response resolve into a success message. This state must be distinguishable from a normal short load so a parent does not assume the form has failed.
- **Empty:** explain that no items exist and provide an appropriate next action for the administrator.
- **No results:** explain that filters/search returned nothing and provide a way to clear filters.
- **Validation error:** specific, actionable field/form message.
- **Save/submit error:** state that the action did not complete and offer retry where safe; retain entered content where possible.
- **Success:** brief confirmation only after server-confirmed persistence.
- **Permission denied/session expired:** explain that the page/action is unavailable and offer sign-in without exposing private data.
- **Offline/network failure:** state that the request could not be completed; do not imply that the record was saved. Allow safe retry.
- **Destructive confirmation:** identify what will happen, distinguish Trash from permanent deletion, and offer a clear Cancel action.

Use inline feedback for field-specific issues and a restrained status/toast message for completed admin actions. Important messages must remain perceivable and not disappear too quickly.

## 10. Interaction details

- Buttons use action labels such as “Save changes”, “Save draft”, “Publish”, “Move to Trash”, “Restore” and “Permanently delete”. Avoid vague labels such as “OK” when the action can be named.
- Cancel returns to the prior view without saving; if there are unsaved changes, confirm before discarding.
- Status controls must make the current status and resulting action clear.
- Search and filter controls should preserve sensible state when opening a record and returning to the list.
- Tab controls on News & Events must expose selected state accessibly and work with keyboard input.
- Gallery viewer closes with a visible close button and appropriate keyboard support; return the user to the same filtered grid position.
- WhatsApp share opens WhatsApp with prepared text for the administrator to send manually. Do not display “sent” as a success state because the website does not send the message itself.
- Map should be a school-confirmed map or map link. Do not invent a location.

## 11. Content and imagery rules

- School name, address, contacts, class lists, sessions, policies, academic information, logo and official social URLs must be confirmed by the school.
- Temporary licensed stock photography may be used during development, recorded in an asset inventory and replaced before launch.
- Obtain appropriate authorization before publishing identifiable student photographs. Avoid names, metadata or captions that unnecessarily identify children.
- Only public-approved gallery images appear in the public gallery. Admission photographs remain private.
- Testimonials require explicit permission and admin approval. Do not fabricate or automatically publish submissions.
- Avoid placeholder content that could be mistaken for real information in a production environment.

## 12. Design-to-PRD traceability

The following table maps key design surfaces and flows to the approved PRD requirement IDs.

| Design surface / flow | PRD requirements |
|---|---|
| Public navigation, Home, About, Primary/Secondary pages | FR-001, FR-002, FR-003, FR-005, FR-006 |
| Admissions form and success/error flow | FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013 |
| Admin sign-in and protected dashboard | FR-014, FR-015, FR-016, FR-036 |
| Dashboard summary and Applications list/detail/edit | FR-017, FR-018, FR-019, FR-020, FR-021, FR-022 |
| Contact enquiry form and admin inbox | FR-023, FR-025, FR-036, FR-037 |
| Visit request form and admin inbox | FR-024, FR-025, FR-036, FR-037 |
| News & Events public tabs and admin editor | FR-026, FR-027, FR-028, FR-029 |
| Gallery, photo visibility and YouTube links | FR-030, FR-031, FR-036 |
| FAQ page and admin management | FR-004 |
| Testimonial submission and moderation | FR-032, FR-033, FR-036, FR-037 |
| Contact details, map and social links/settings | FR-034, FR-035 |
| Responsive patterns and accessibility | FR-005, FR-038 |
| Form abuse, private data and permission states | FR-036, FR-037, FR-038 |
| Operational messages and pre-launch safety considerations | FR-039, FR-040, FR-041, FR-042 |

## 13. Open decisions and pre-launch gates

These items are not permission to invent defaults that affect school policy or privacy. Resolve them before the relevant implementation or before launch as appropriate.

1. **Brand assets:** obtain the official logo, confirm colours/fonts and supply approved photography.
2. **Official content:** verify school history, academic details, class lists, facilities, admissions instructions, contact details, social links and map location.
3. **Admission field policy:** confirm which proposed optional fields are necessary, final requiredness of the typed signature, and privacy wording; avoid collecting unnecessary sensitive data.
4. **Retention and deletion:** define retention periods, permanent-deletion rules and handling of requests to correct/delete personal information before launch.
5. **Consent and privacy notices:** approve clear wording for admission forms, student imagery, testimonials and handling of children's/parents' personal data.
6. **Dashboard count definitions:** define exactly which records contribute to summary cards and what qualifies as a visit request needing follow-up.
7. **Archived versus trashed records:** confirm whether archive behavior for enquiries/visits differs from Trash and how archived records are restored or deleted.
8. **Publishing dates/time zone:** confirm school-local date/time handling and rules for event expiry before implementation.
9. **Hosting and storage:** verify the selected no-cost providers' current terms, data persistence, privacy/security, backups, file limits and availability before using real data.
10. **Operational readiness:** complete security/privacy review, backup and restoration test, access checks and accessibility testing before production launch.

## 14. Approval record

**Approved by:** project owner, 22 October 2026.

The page inventory, navigation, user flows, admin patterns, responsive
behavior and open decisions were reviewed and this document was approved
as the baseline for UI implementation.

Approval confirms the design direction and interaction patterns. It does
**not** resolve the open decisions and pre-launch gates listed in
section 13 — brand assets, official content, admission field policy,
retention, consent wording, dashboard count definitions, date/time
handling and provider selection. Those must be closed before the
corresponding implementation or before launch as stated there.

/**
 * `applications` — the admission application record (FR-007–FR-022).
 *
 * Structure and validation rules: docs/DATA_MODEL.md §4.
 *
 * Two things worth stating up front, because they are easy to "improve" later
 * into a policy the school never agreed to:
 *   - There is **no admission-outcome field**. The PRD excludes Pending /
 *     Accepted / Not Accepted. Adding one is a scope change.
 *   - There is **no age-eligibility rule**. The PRD defines none, so enforcing
 *     one would be inventing school policy.
 */

import { Schema, model, type Types } from 'mongoose';
import { normalisePhone, PHONE_PATTERN } from '../lib/phone.js';

export const SECTIONS = ['primary', 'secondary'] as const;
export type Section = (typeof SECTIONS)[number];

export const GENDERS = ['male', 'female'] as const;
export type Gender = (typeof GENDERS)[number];

export interface StudentShape {
  surname: string;
  firstName: string;
  middleName?: string | null;
  dateOfBirth: Date;
  gender: Gender;
  religion?: string | null;
  ethnicity?: string | null;
  stateOfOrigin?: string | null;
  previousSchool?: string | null;
  lastClassAttended?: string | null;
}

export interface GuardianShape {
  name: string;
  homeAddress: string;
  /** Stored digits-only. See `lib/phone.ts`. */
  phone: string;
  email?: string | null;
  occupation?: string | null;
  officeAddress?: string | null;
}

export interface PlacementShape {
  section: Section;
  classApplyingFor: string;
  academicSession: string;
}

export interface SignatureShape {
  typedName: string;
  /** Server-set. Never accepted from the client. */
  signedAt: Date;
}

export interface PhotoShape {
  key: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
  uploadedAt: Date;
}

export interface RevisionShape {
  at: Date;
  by: Types.ObjectId;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface SearchShape {
  studentName: string;
  guardianPhone: string;
}

export interface ApplicationShape {
  student: StudentShape;
  guardian: GuardianShape;
  placement: PlacementShape;
  signature: SignatureShape;
  healthInformation?: string | null;
  photo?: PhotoShape | null;
  revisions: RevisionShape[];
  search: SearchShape;
  submittedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null;
}

const MAX_REVISIONS = 50;

/**
 * The derived values that make FR-018 searchable. Pure, so it can be tested
 * without a database — which matters because a silently empty `search` field
 * makes every search return nothing, and nothing else would fail.
 */
export function deriveSearch(student: StudentShape, guardian: GuardianShape): SearchShape {
  const parts = [student?.surname, student?.firstName, student?.middleName];
  return {
    studentName: parts
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
      .join(' ')
      .toLowerCase()
      .trim(),
    guardianPhone: normalisePhone(guardian?.phone ?? ''),
  };
}

const trimmed = (max: number) => ({
  type: String,
  trim: true,
  maxlength: max,
});

const studentSchema = new Schema<StudentShape>(
  {
    surname: { ...trimmed(80), required: [true, 'Student surname is required'], minlength: 1 },
    firstName: { ...trimmed(80), required: [true, 'Student first name is required'], minlength: 1 },
    middleName: trimmed(80),
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: (value: Date): boolean => {
          if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false;
          const now = Date.now();
          if (value.getTime() >= now) return false;
          // Reject implausible dates without inventing an eligibility rule.
          const hundredYearsAgo = new Date();
          hundredYearsAgo.setFullYear(hundredYearsAgo.getFullYear() - 100);
          return value.getTime() >= hundredYearsAgo.getTime();
        },
        message: 'Date of birth must be in the past and within the last 100 years',
      },
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: { values: [...GENDERS], message: 'Gender must be male or female' },
    },
    religion: trimmed(60),
    ethnicity: trimmed(60),
    stateOfOrigin: trimmed(60),
    previousSchool: trimmed(120),
    lastClassAttended: trimmed(60),
  },
  { _id: false },
);

const guardianSchema = new Schema<GuardianShape>(
  {
    name: { ...trimmed(120), required: [true, 'Parent or guardian name is required'], minlength: 1 },
    homeAddress: {
      ...trimmed(300),
      required: [true, 'Home address is required'],
      minlength: 1,
    },
    phone: {
      type: String,
      required: [true, 'Parent or guardian phone is required'],
      set: normalisePhone,
      validate: {
        validator: (value: string): boolean => PHONE_PATTERN.test(value),
        message: 'Phone must contain between 7 and 15 digits',
      },
    },
    email: { ...trimmed(254), lowercase: true },
    occupation: trimmed(80),
    officeAddress: trimmed(300),
  },
  { _id: false },
);

const placementSchema = new Schema<PlacementShape>(
  {
    section: {
      type: String,
      required: [true, 'Section is required'],
      enum: { values: [...SECTIONS], message: 'Section must be primary or secondary' },
    },
    classApplyingFor: {
      ...trimmed(60),
      required: [true, 'Class applying for is required'],
      minlength: 1,
    },
    academicSession: {
      ...trimmed(40),
      required: [true, 'Academic session is required'],
      minlength: 1,
    },
  },
  { _id: false },
);

const signatureSchema = new Schema<SignatureShape>(
  {
    typedName: { ...trimmed(120), required: [true, 'Typed signature is required'], minlength: 1 },
    signedAt: { type: Date, required: true },
  },
  { _id: false },
);

const photoSchema = new Schema<PhotoShape>(
  {
    key: { type: String, required: true },
    contentType: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    bytes: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const revisionSchema = new Schema<RevisionShape>(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    changedFields: { type: [String], default: [] },
    before: { type: Schema.Types.Mixed, default: {} },
    after: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

const searchSchema = new Schema<SearchShape>(
  {
    studentName: { type: String, default: '' },
    guardianPhone: { type: String, default: '' },
  },
  { _id: false },
);

const applicationSchema = new Schema<ApplicationShape>(
  {
    student: { type: studentSchema, required: true },
    guardian: { type: guardianSchema, required: true },
    placement: { type: placementSchema, required: true },
    signature: { type: signatureSchema, required: true },
    healthInformation: { ...trimmed(1000), default: null },
    photo: { type: photoSchema, default: null },
    revisions: {
      type: [revisionSchema],
      default: [],
      validate: {
        validator: (value: RevisionShape[]): boolean => value.length <= MAX_REVISIONS,
        message: `At most ${MAX_REVISIONS} revisions are retained`,
      },
    },
    search: { type: searchSchema, required: true, default: () => ({ studentName: '', guardianPhone: '' }) },
    submittedAt: { type: Date, required: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  {
    collection: 'applications',
    // AGENTS.md §8: indexes are created by an explicit script, never on boot.
    autoIndex: false,
  },
);

/**
 * `pre('validate')` rather than `pre('save')` so the derived values exist before
 * validation runs, and so `validateSync()` populates them too — which is what
 * lets DB-07 be tested without a database.
 */
applicationSchema.pre('validate', function () {
  this.search = deriveSearch(this.student, this.guardian);
});

// §4.5 — every list query sorts on submittedAt, which is in both compounds, so
// Atlas never needs an in-memory sort.
applicationSchema.index({ deletedAt: 1, submittedAt: -1 });
applicationSchema.index({
  deletedAt: 1,
  'placement.section': 1,
  'placement.classApplyingFor': 1,
  'placement.academicSession': 1,
  submittedAt: -1,
});
applicationSchema.index({ 'search.studentName': 1 });
applicationSchema.index({ 'search.guardianPhone': 1 });

export const Application = model<ApplicationShape>('Application', applicationSchema);

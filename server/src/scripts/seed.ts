/**
 * Synthetic seed — fake records for development only.
 *
 *   npm run seed --workspace server
 *
 * Three safety properties, because a seed script that can reach real data is a
 * liability:
 *
 *  1. It refuses to run when `NODE_ENV=production` unless `--force` is passed.
 *  2. It deletes only rows whose student surname starts with `TEST-`, so it can
 *     never remove a genuine application.
 *  3. Every value is visibly a placeholder. **No school facts are invented** —
 *     the school's name, address and class lists are still outstanding
 *     (AGENTS.md: never invent school content). A realistic-looking fake school
 *     name is worse than an ugly placeholder, because someone will screenshot it.
 */

import { connectDatabase, disconnectDatabase } from '../db.js';
import { loadConfig } from '../config.js';
import { Application, type Section } from '../models/application.js';
import { SETTINGS_KEY, Settings } from '../models/settings.js';
import { createLogger } from '../logger.js';

const logger = createLogger('info');

const SEED_MARKER = 'TEST-';
const APPLICATION_COUNT = 20;

const PLACEHOLDER_PRIMARY = ['PLACEHOLDER-Primary-1', 'PLACEHOLDER-Primary-2'];
const PLACEHOLDER_SECONDARY = ['PLACEHOLDER-Secondary-1', 'PLACEHOLDER-Secondary-2'];
const PLACEHOLDER_SESSIONS = ['PLACEHOLDER-SESSION-A'];

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

async function seedSettings(): Promise<void> {
  const now = new Date();

  await Settings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    {
      $set: {
        'school.name': 'PLACEHOLDER — school name not yet supplied',
        'school.shortName': 'PLACEHOLDER',
        'school.address': 'PLACEHOLDER — school address not yet supplied',
        'school.phone': '0000000000',
        'school.email': null,
        'school.whatsapp': null,
        'school.mapUrl': null,
        social: [],
        'branding.logoKey': null,
        'placement.primaryClasses': PLACEHOLDER_PRIMARY,
        'placement.secondaryClasses': PLACEHOLDER_SECONDARY,
        'placement.academicSessions': PLACEHOLDER_SESSIONS,
        'placement.currentSession': PLACEHOLDER_SESSIONS[0],
        updatedAt: now,
        updatedBy: null,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  logger.info('seed_settings_written', { key: SETTINGS_KEY });
}

function buildApplication(index: number): Record<string, unknown> {
  const section: Section = index % 2 === 0 ? 'primary' : 'secondary';
  const classList = section === 'primary' ? PLACEHOLDER_PRIMARY : PLACEHOLDER_SECONDARY;

  const submittedAt = new Date();
  submittedAt.setDate(submittedAt.getDate() - index);

  return {
    student: {
      surname: `${SEED_MARKER}Applicant`,
      firstName: `Sample${pad(index + 1, 2)}`,
      middleName: null,
      dateOfBirth: new Date(2015, index % 12, (index % 27) + 1),
      gender: index % 2 === 0 ? 'female' : 'male',
      religion: null,
      ethnicity: null,
      stateOfOrigin: null,
      previousSchool: null,
      lastClassAttended: null,
    },
    guardian: {
      name: `${SEED_MARKER}Guardian ${pad(index + 1, 2)}`,
      homeAddress: 'PLACEHOLDER address',
      phone: `0000000${pad(index + 1, 4)}`,
      email: null,
      occupation: null,
      officeAddress: null,
    },
    placement: {
      section,
      classApplyingFor: classList[index % classList.length],
      academicSession: PLACEHOLDER_SESSIONS[0],
    },
    signature: {
      typedName: `${SEED_MARKER}Guardian ${pad(index + 1, 2)}`,
      signedAt: submittedAt,
    },
    healthInformation: null,
    photo: null,
    revisions: [],
    submittedAt,
    deletedAt: null,
    deletedBy: null,
  };
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.nodeEnv === 'production' && !process.argv.includes('--force')) {
    process.stderr.write(
      'Refusing to seed: NODE_ENV is production. Pass --force if you genuinely mean it.\n',
    );
    process.exit(1);
  }

  await connectDatabase(config.mongoUri, config.mongoDbName);

  await seedSettings();

  // Only ever removes rows this script created.
  const removed = await Application.deleteMany({ 'student.surname': { $regex: `^${SEED_MARKER}` } });
  logger.info('seed_cleared_previous', { removed: removed.deletedCount ?? 0 });

  let created = 0;
  for (let index = 0; index < APPLICATION_COUNT; index += 1) {
    // save() rather than insertMany() so the pre-validate hook definitely runs
    // and `search` is populated the same way it is in production.
    const document = new Application(buildApplication(index));
    await document.save();
    created += 1;
  }

  const withSearch = await Application.countDocuments({
    'student.surname': { $regex: `^${SEED_MARKER}` },
    'search.studentName': { $ne: '' },
  });

  logger.info('seed_complete', { created, withSearch });

  await disconnectDatabase();
}

main().catch((error: unknown) => {
  process.stderr.write(`Seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

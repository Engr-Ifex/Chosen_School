/**
 * Model behaviour that only a real MongoDB can prove — DB-01, DB-05, DB-08 and
 * the S02 definition of done.
 *
 * Opt-in, because it needs a `mongod` binary:
 *
 *     RUN_DB_TESTS=1 npm test --workspace server
 *
 * Unique indexes, TTL behaviour and query plans are properties of the server,
 * not of Mongoose. Testing them against a mock would prove the mock.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../db.js';
import { Admin } from './admin.js';
import { Application } from './application.js';
import { Session } from './session.js';
import { Settings } from './settings.js';

const run = process.env.RUN_DB_TESTS === '1';

/** Collects every stage name in an explain plan, at any depth. */
function collectStages(node: unknown, found: string[] = []): string[] {
  if (!node || typeof node !== 'object') return found;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'stage' && typeof value === 'string') found.push(value);
    collectStages(value, found);
  }
  return found;
}

describe.skipIf(!run)('models against a real MongoDB', () => {
  let mongo: MongoMemoryServer;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await connectDatabase(mongo.getUri(), 'chosen_school_test');

    // autoIndex is off by design, so indexes exist only when asked for.
    await Promise.all([
      Admin.syncIndexes(),
      Application.syncIndexes(),
      Session.syncIndexes(),
      Settings.syncIndexes(),
    ]);
  }, 240_000);

  afterAll(async () => {
    await disconnectDatabase();
    await mongo.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Admin.deleteMany({}),
      Application.deleteMany({}),
      Session.deleteMany({}),
      Settings.deleteMany({}),
    ]);
  });

  it('rejects a duplicate admin email (DB-01)', async () => {
    const admin = {
      email: 'admin@example.test',
      passwordHash: 'hash',
      passwordAlgo: 'argon2id',
      passwordParams: { memoryCost: 1, timeCost: 1, parallelism: 1 },
      passwordUpdatedAt: new Date(),
    };

    await Admin.create(admin);
    await expect(Admin.create(admin)).rejects.toMatchObject({ code: 11000 });
  });

  it('refuses a second settings document with key "site" (DB-05)', async () => {
    const settings = {
      key: 'site' as const,
      school: { name: 'Placeholder', address: 'Placeholder', phone: '0000000000' },
      updatedAt: new Date(),
    };

    await Settings.create(settings);
    await expect(Settings.create(settings)).rejects.toMatchObject({ code: 11000 });
  });

  it('persists 20 applications with search populated, readable by a raw query (S02 DoD)', async () => {
    const documents = Array.from({ length: 20 }, (_, index) => ({
      student: {
        surname: 'TEST-Applicant',
        firstName: `Sample${String(index + 1).padStart(2, '0')}`,
        dateOfBirth: new Date(2015, 0, 1),
        gender: index % 2 === 0 ? 'female' : 'male',
      },
      guardian: { name: 'TEST-Guardian', homeAddress: 'Placeholder', phone: `0000000${String(index + 1).padStart(4, '0')}` },
      placement: {
        section: index % 2 === 0 ? 'primary' : 'secondary',
        classApplyingFor: 'PLACEHOLDER-Primary-1',
        academicSession: 'PLACEHOLDER-SESSION-A',
      },
      signature: { typedName: 'TEST-Guardian', signedAt: new Date() },
      submittedAt: new Date(Date.now() - index * 1000),
    }));

    for (const document of documents) {
      await new Application(document).save();
    }

    const stored = await Application.collection.find({}).toArray();

    expect(stored).toHaveLength(20);
    for (const record of stored) {
      expect(record.search.studentName).toContain('test-applicant');
      expect(record.search.guardianPhone).toMatch(/^\d+$/);
    }
  });

  it('sorts the default list from an index, with no in-memory sort (DB-08)', async () => {
    // Enough documents that the planner has a real choice. With one document it
    // picks a collection scan because that genuinely is cheaper, which would
    // make this assertion meaningless either way.
    const records = Array.from({ length: 200 }, (_, index) => ({
      student: {
        surname: 'TEST-Applicant',
        firstName: `Sample${index}`,
        dateOfBirth: new Date(2015, 0, 1),
        gender: 'female',
      },
      guardian: { name: 'TEST-Guardian', homeAddress: 'Placeholder', phone: `000000${String(index).padStart(4, '0')}` },
      placement: {
        section: 'primary',
        classApplyingFor: 'PLACEHOLDER-Primary-1',
        academicSession: 'PLACEHOLDER-SESSION-A',
      },
      signature: { typedName: 'TEST-Guardian', signedAt: new Date() },
      search: { studentName: 'test-applicant sample', guardianPhone: `000000${String(index).padStart(4, '0')}` },
      submittedAt: new Date(Date.now() - index * 1000),
      deletedAt: null,
      revisions: [],
    }));

    await Application.collection.insertMany(records);

    const plan = (await Application.find({ deletedAt: null })
      .sort({ submittedAt: -1 })
      .explain('queryPlanner')) as unknown as {
      queryPlanner: { winningPlan: unknown };
    };

    // Only the winning plan matters. Rejected plans routinely contain a SORT
    // stage, and asserting across them would fail for the wrong reason.
    const stages = collectStages(plan.queryPlanner.winningPlan);

    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('SORT');
  });
});

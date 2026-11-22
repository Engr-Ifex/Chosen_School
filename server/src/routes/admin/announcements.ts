/**
 * Admin announcements, events and categories — API_SPEC §4.5 and §4.9.
 *
 * Mounted behind the session guard, admin rate limit and CSRF/origin check in
 * `app.ts`. Controllers parse, call a service, return the shaped record.
 */

import { Router, type Request } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../../errors.js';
import {
  adminListQuerySchema,
  announcementCreateSchema,
  announcementUpdateSchema,
  categoryInputSchema,
  categoryScopeQuerySchema,
  categoryUpdateSchema,
  toFieldErrors,
} from '../../schemas/announcement.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  publishAnnouncement,
  unpublishAnnouncement,
  updateAnnouncement,
} from '../../services/announcements.js';
import { createCategory, deleteCategory, listCategories, updateCategory } from '../../services/categories.js';

function parse<T>(schema: ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', message, toFieldErrors(parsed.error));
  return parsed.data;
}

const actor = (req: Request): string => req.auth!.adminId.toString();
const idOf = (req: Request): string => String(req.params.id);

export function adminAnnouncementsRouter(): Router {
  const router = Router();

  router.get('/announcements', async (req, res) => {
    const query = parse(adminListQuerySchema, req.query, 'Some filters need correcting.');
    res.status(200).json(await listAnnouncements(query));
  });

  router.post('/announcements', async (req, res) => {
    const input = parse(announcementCreateSchema, req.body, 'Some details need correcting.');
    res.status(201).json(await createAnnouncement(input));
  });

  router.get('/announcements/:id', async (req, res) => {
    res.status(200).json(await getAnnouncement(idOf(req)));
  });

  router.patch('/announcements/:id', async (req, res) => {
    const input = parse(announcementUpdateSchema, req.body, 'Some details need correcting.');
    res.status(200).json(await updateAnnouncement(idOf(req), input));
  });

  router.post('/announcements/:id/publish', async (req, res) => {
    res.status(200).json(await publishAnnouncement(idOf(req), actor(req)));
  });

  router.post('/announcements/:id/unpublish', async (req, res) => {
    res.status(200).json(await unpublishAnnouncement(idOf(req), actor(req)));
  });

  router.delete('/announcements/:id', async (req, res) => {
    await deleteAnnouncement(idOf(req), actor(req));
    res.status(204).end();
  });

  router.get('/categories', async (req, res) => {
    const { scope } = parse(categoryScopeQuerySchema, req.query, 'Choose a category scope.');
    res.status(200).json({ data: await listCategories(scope) });
  });

  router.post('/categories', async (req, res) => {
    const input = parse(categoryInputSchema, req.body, 'Some details need correcting.');
    res.status(201).json(await createCategory(input));
  });

  router.patch('/categories/:id', async (req, res) => {
    const input = parse(categoryUpdateSchema, req.body, 'Some details need correcting.');
    res.status(200).json(await updateCategory(idOf(req), input));
  });

  router.delete('/categories/:id', async (req, res) => {
    await deleteCategory(idOf(req));
    res.status(204).end();
  });

  return router;
}

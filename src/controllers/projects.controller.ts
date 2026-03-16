import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as projectsService from '../services/projects.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as string | undefined;

  const result = await projectsService.listProjects(userId, orgId, role, page, limit, status);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const getById = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const projectId = Number(req.params.id);

  const project = await projectsService.getProject(projectId, userId, orgId, role);

  res.json({ success: true, data: project });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;

  const project = await projectsService.createProject(orgId, req.body);

  res.status(201).json({ success: true, data: project });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const projectId = Number(req.params.id);

  const project = await projectsService.updateProject(projectId, orgId, req.body);

  res.json({ success: true, data: project });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const projectId = Number(req.params.id);

  await projectsService.deleteProject(projectId, orgId);

  res.json({ success: true, data: null });
});

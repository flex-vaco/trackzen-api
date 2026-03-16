import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES, PAGINATION } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import type { CreateProjectInput } from '../types/index.js';
import type { UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// LIST projects
// ---------------------------------------------------------------------------

export async function listProjects(
  userId: number,
  orgId: number,
  role: UserRole,
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
  status?: string,
) {
  const take = Math.min(limit, PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const baseWhere: Record<string, unknown> = { organisationId: orgId };
  if (status) baseWhere.status = status;

  // EMPLOYEE: only assigned projects
  if (role === 'EMPLOYEE') {
    baseWhere.assignedEmployees = { some: { employeeId: userId } };
  }

  const [data, total] = await Promise.all([
    prisma.project.findMany({
      where: baseWhere,
      include: {
        managers: { include: { manager: { select: { id: true, name: true, email: true } } } },
        assignedEmployees: {
          include: { employee: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.project.count({ where: baseWhere }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// GET single project
// ---------------------------------------------------------------------------

export async function getProject(
  projectId: number,
  userId: number,
  orgId: number,
  role: UserRole,
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId: orgId },
    include: {
      managers: { include: { manager: { select: { id: true, name: true, email: true } } } },
      assignedEmployees: {
        include: { employee: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (!project) throw AppError.notFound('Project not found');

  // EMPLOYEE must be assigned
  if (role === 'EMPLOYEE') {
    const isAssigned = project.assignedEmployees.some((pe) => pe.employeeId === userId);
    if (!isAssigned) {
      throw AppError.forbidden(
        'You are not assigned to this project',
        ERROR_CODES.EMPLOYEE_NOT_ASSIGNED,
      );
    }
  }

  return project;
}

// ---------------------------------------------------------------------------
// CREATE project
// ---------------------------------------------------------------------------

export async function createProject(orgId: number, input: CreateProjectInput) {
  const { managerIds, employeeIds, ...projectData } = input;

  // Check unique code within org
  const existing = await prisma.project.findUnique({
    where: { organisationId_code: { organisationId: orgId, code: projectData.code } },
  });
  if (existing) {
    throw AppError.conflict(`Project code "${projectData.code}" already exists in this organisation`);
  }

  const project = await prisma.project.create({
    data: {
      organisationId: orgId,
      ...projectData,
      budgetHours: projectData.budgetHours ?? 0,
      managers: managerIds?.length
        ? { create: managerIds.map((id) => ({ managerId: id })) }
        : undefined,
      assignedEmployees: employeeIds?.length
        ? { create: employeeIds.map((id) => ({ employeeId: id })) }
        : undefined,
    },
    include: {
      managers: { include: { manager: { select: { id: true, name: true, email: true } } } },
      assignedEmployees: {
        include: { employee: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  logger.info({ projectId: project.id, orgId }, 'Project created');
  return project;
}

// ---------------------------------------------------------------------------
// UPDATE project
// ---------------------------------------------------------------------------

export async function updateProject(
  projectId: number,
  orgId: number,
  input: Partial<CreateProjectInput> & { status?: string },
) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId: orgId },
  });
  if (!project) throw AppError.notFound('Project not found');

  const { managerIds, employeeIds, ...updateData } = input;

  // If code is changing, check uniqueness
  if (updateData.code && updateData.code !== project.code) {
    const dup = await prisma.project.findUnique({
      where: { organisationId_code: { organisationId: orgId, code: updateData.code } },
    });
    if (dup) {
      throw AppError.conflict(`Project code "${updateData.code}" already exists in this organisation`);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Reassign managers if provided
    if (managerIds !== undefined) {
      await tx.projectManager.deleteMany({ where: { projectId } });
      if (managerIds.length > 0) {
        await tx.projectManager.createMany({
          data: managerIds.map((managerId) => ({ projectId, managerId })),
        });
      }
    }

    // Reassign employees if provided
    if (employeeIds !== undefined) {
      await tx.projectEmployee.deleteMany({ where: { projectId } });
      if (employeeIds.length > 0) {
        await tx.projectEmployee.createMany({
          data: employeeIds.map((employeeId) => ({ projectId, employeeId })),
        });
      }
    }

    return tx.project.update({
      where: { id: projectId },
      data: updateData,
      include: {
        managers: { include: { manager: { select: { id: true, name: true, email: true } } } },
        assignedEmployees: {
          include: { employee: { select: { id: true, name: true, email: true } } },
        },
      },
    });
  });

  logger.info({ projectId, orgId }, 'Project updated');
  return updated;
}

// ---------------------------------------------------------------------------
// DELETE project
// ---------------------------------------------------------------------------

export async function deleteProject(projectId: number, orgId: number) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organisationId: orgId },
  });
  if (!project) throw AppError.notFound('Project not found');

  await prisma.project.delete({ where: { id: projectId } });
  logger.info({ projectId, orgId }, 'Project deleted');
}

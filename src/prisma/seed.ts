import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Clean existing data first (in foreign-key-safe order)
  await prisma.leaveApproval.deleteMany({});
  await prisma.leaveBalance.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.leaveType.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.timeEntry.deleteMany({});
  await prisma.timesheet.deleteMany({});
  await prisma.projectEmployee.deleteMany({});
  await prisma.projectManager.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.managerEmployee.deleteMany({});
  await prisma.holiday.deleteMany({});
  await prisma.orgSettings.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organisation.deleteMany({});

  console.log('Cleared existing data');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  await prisma.$transaction(async (tx) => {
    // Organisation
    const org = await tx.organisation.create({
      data: { name: 'Acme Corp' },
    });

    // OrgSettings with defaults
    await tx.orgSettings.create({
      data: {
        organisationId: org.id,
        carryForwardMaxDays: 5, // default for EL carry forward
      },
    });

    // Users with joining dates and employee types
    const admin = await tx.user.create({
      data: {
        organisationId: org.id,
        name: 'Admin User',
        email: 'admin@acme.com',
        passwordHash,
        role: 'ADMIN',
        employeeType: 'FULL_TIME',
        joiningDate: new Date('2025-01-10'),
      },
    });

    const manager = await tx.user.create({
      data: {
        organisationId: org.id,
        name: 'Manager User',
        email: 'manager@acme.com',
        passwordHash,
        role: 'MANAGER',
        employeeType: 'FULL_TIME',
        joiningDate: new Date('2025-03-05'),
      },
    });

    const employee = await tx.user.create({
      data: {
        organisationId: org.id,
        name: 'Employee User',
        email: 'employee@acme.com',
        passwordHash,
        role: 'EMPLOYEE',
        employeeType: 'FULL_TIME',
        joiningDate: new Date('2026-02-18'), // Joined after 15th → prorate from March
      },
    });

    // ManagerEmployee: manager manages employee
    await tx.managerEmployee.create({
      data: { managerId: manager.id, employeeId: employee.id },
    });

    // Projects
    const project1 = await tx.project.create({
      data: {
        organisationId: org.id,
        code: 'PRJ-2025-001',
        name: 'Website Redesign',
        client: 'Acme Client',
      },
    });

    const project2 = await tx.project.create({
      data: {
        organisationId: org.id,
        code: 'PRJ-2025-002',
        name: 'Mobile App',
        client: 'Beta Corp',
      },
    });

    const project3 = await tx.project.create({
      data: {
        organisationId: org.id,
        code: 'PRJ-2025-003',
        name: 'Internal Tools',
        client: 'Internal',
      },
    });

    // ProjectEmployee: employee assigned to all 3 projects
    for (const project of [project1, project2, project3]) {
      await tx.projectEmployee.create({
        data: { projectId: project.id, employeeId: employee.id },
      });
    }

    // ProjectManager: manager assigned to all 3 projects
    for (const project of [project1, project2, project3]) {
      await tx.projectManager.create({
        data: { projectId: project.id, managerId: manager.id },
      });
    }

    // ────────────────────────────────────────────
    // LEAVE TYPES (matching company policy)
    // ────────────────────────────────────────────

    // 1. Casual Leave (CL) — 7/year, BIANNUAL (3.5 Jan + 3.5 Jul)
    //    All employee types eligible
    //    No carry forward, no encashment
    const casualLeave = await tx.leaveType.create({
      data: {
        organisationId: org.id,
        name: 'Casual Leave',
        annualQuota: 7,
        accrualRate: 0,
        creditSchedule: 'BIANNUAL',
        carryForward: false,
        maxCarryForward: 0,
        maxEncashment: 0,
        requiresDoc: false,
        requiresDocAfterDays: 0,
        paid: true,
        eligibleTypes: 'ALL', // employees, contractuals, consultants, trainees
      },
    });

    // 2. Earned Leave (EL) — 15/year, MONTHLY (1.25/month)
    //    Only FULL_TIME employees
    //    Carry forward max 5, encash max 15
    const earnedLeave = await tx.leaveType.create({
      data: {
        organisationId: org.id,
        name: 'Earned Leave',
        annualQuota: 15,
        accrualRate: 1.25,
        creditSchedule: 'MONTHLY',
        carryForward: true,
        maxCarryForward: 5,
        maxEncashment: 15,
        requiresDoc: false,
        requiresDocAfterDays: 0,
        paid: true,
        eligibleTypes: 'FULL_TIME',
      },
    });

    // 3. Sick / Medical Leave (SL) — 7/year, BIANNUAL (3.5 Jan-Jun + 3.5 Jul-Dec)
    //    Requires medical docs for >2 consecutive days
    //    No carry forward
    const sickLeave = await tx.leaveType.create({
      data: {
        organisationId: org.id,
        name: 'Sick / Medical Leave',
        annualQuota: 7,
        accrualRate: 0,
        creditSchedule: 'BIANNUAL',
        carryForward: false,
        maxCarryForward: 0,
        maxEncashment: 0,
        requiresDoc: true,
        requiresDocAfterDays: 2, // require docs for >2 consecutive days
        paid: true,
        eligibleTypes: 'ALL',
      },
    });

    // ────────────────────────────────────────────
    // LEAVE BALANCES for 2026
    // ────────────────────────────────────────────

    const users = [admin, manager, employee];
    const leaveTypes = [casualLeave, earnedLeave, sickLeave];

    for (const user of users) {
      for (const lt of leaveTypes) {
        // Check eligibility
        const eligible = lt.eligibleTypes === 'ALL' ||
          lt.eligibleTypes.split(',').map((s: string) => s.trim()).includes(user.employeeType);
        if (!eligible) continue;

        let allocatedDays = 0;
        const joiningDate = user.joiningDate ?? new Date('2025-01-01');
        const joiningYear = joiningDate.getFullYear();
        const joiningMonth = joiningDate.getMonth();
        const joiningDay = joiningDate.getDate();
        const effectiveMonth = joiningDay > 15 ? joiningMonth + 1 : joiningMonth;

        if (lt.creditSchedule === 'BIANNUAL') {
          const halfCredit = lt.annualQuota / 2; // 3.5

          // H1 credit (Jan-Jun)
          let h1 = halfCredit;
          if (joiningYear === 2026) {
            if (effectiveMonth > 5) {
              h1 = 0; // joined after Jun
            } else if (effectiveMonth > 0) {
              h1 = Math.round((halfCredit / 6) * (6 - effectiveMonth) * 100) / 100;
            }
          }

          // For seed, only credit H1 (Jul hasn't happened yet for 2026 seed)
          allocatedDays = h1;
        } else if (lt.creditSchedule === 'MONTHLY') {
          // EL: 1.25/month, credit months elapsed so far (assume seed is for start of year)
          if (joiningYear < 2026) {
            allocatedDays = lt.accrualRate; // Jan credit only (rest will come via monthly cron)
          } else if (joiningYear === 2026) {
            if (effectiveMonth <= 0) {
              allocatedDays = lt.accrualRate; // Jan credit
            } else {
              allocatedDays = 0; // hasn't started yet
            }
          }
        } else {
          allocatedDays = lt.annualQuota;
        }

        if (allocatedDays <= 0) continue;

        await tx.leaveBalance.create({
          data: {
            userId: user.id,
            leaveTypeId: lt.id,
            year: 2026,
            allocatedDays,
          },
        });
      }
    }

    // Holidays
    await tx.holiday.create({
      data: {
        organisationId: org.id,
        name: 'Christmas',
        date: new Date('2026-12-25'),
        recurring: true,
      },
    });

    await tx.holiday.create({
      data: {
        organisationId: org.id,
        name: 'New Year',
        date: new Date('2026-01-01'),
        recurring: true,
      },
    });

    await tx.holiday.create({
      data: {
        organisationId: org.id,
        name: 'Republic Day',
        date: new Date('2026-01-26'),
        recurring: true,
      },
    });

    await tx.holiday.create({
      data: {
        organisationId: org.id,
        name: 'Independence Day',
        date: new Date('2026-08-15'),
        recurring: true,
      },
    });
  });

  console.log('Seed completed successfully');
  console.log('');
  console.log('Leave Types Created:');
  console.log('  1. Casual Leave     - 7/year, BIANNUAL (3.5 Jan + 3.5 Jul), All employees');
  console.log('  2. Earned Leave     - 15/year, MONTHLY (1.25/mo), Full-time only, CF max 5, Encash max 15');
  console.log('  3. Sick/Medical     - 7/year, BIANNUAL (3.5 Jan-Jun + 3.5 Jul-Dec), Docs >2 days');
  console.log('');
  console.log('Test Accounts:');
  console.log('  admin@acme.com     / Password123! (ADMIN, joined 2025-01-10)');
  console.log('  manager@acme.com   / Password123! (MANAGER, joined 2025-03-05)');
  console.log('  employee@acme.com  / Password123! (EMPLOYEE, joined 2026-02-18, prorated)');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

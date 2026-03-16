import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
import { JwtPayload } from '../types/index.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

interface OAuthProfile {
  id: string;
  email: string;
  displayName: string;
}

export async function upsertOAuthUser(profile: OAuthProfile, provider: 'google' | 'microsoft') {
  return prisma.$transaction(async (tx) => {
    // Try to find by provider + id
    let user = await tx.user.findFirst({
      where: { oauthProvider: provider, oauthId: profile.id },
    });

    if (!user) {
      // Try to find by email
      user = await tx.user.findUnique({ where: { email: profile.email } });

      if (user) {
        // Link provider to existing account
        if (user.oauthProvider && user.oauthProvider !== provider) {
          throw AppError.conflict(
            'Email is already linked to a different OAuth provider',
            ERROR_CODES.OAUTH_PROVIDER_CONFLICT
          );
        }

        user = await tx.user.update({
          where: { id: user.id },
          data: { oauthProvider: provider, oauthId: profile.id },
        });
      } else {
        // Create new user — determine org
        const emailDomain = profile.email.split('@')[1];

        // Check if an org with users from this domain exists
        const existingOrgUser = await tx.user.findFirst({
          where: { email: { endsWith: `@${emailDomain}` } },
          select: { organisationId: true },
        });

        let orgId: number;
        let role: 'ADMIN' | 'EMPLOYEE' = 'EMPLOYEE';

        if (existingOrgUser) {
          orgId = existingOrgUser.organisationId;
        } else {
          // First user from this domain — create org
          const org = await tx.organisation.create({
            data: { name: emailDomain },
          });
          await tx.orgSettings.create({
            data: { organisationId: org.id },
          });
          orgId = org.id;
          role = 'ADMIN';
        }

        user = await tx.user.create({
          data: {
            organisationId: orgId,
            name: profile.displayName,
            email: profile.email,
            role,
            oauthProvider: provider,
            oauthId: profile.id,
          },
        });

        // Initialize leave balances for new user
        const leaveTypes = await tx.leaveType.findMany({
          where: { organisationId: orgId, active: true },
        });
        const currentYear = new Date().getFullYear();
        if (leaveTypes.length > 0) {
          await tx.leaveBalance.createMany({
            data: leaveTypes.map((lt) => ({
              userId: user!.id,
              leaveTypeId: lt.id,
              year: currentYear,
              allocatedDays: lt.annualQuota,
            })),
            skipDuplicates: true,
          });
        }
      }
    }

    if (user.status !== 'active') {
      throw AppError.unauthorized('Account is inactive');
    }

    const payload: JwtPayload = {
      userId: user.id,
      orgId: user.organisationId,
      role: user.role,
    };

    const accessToken = jwt.sign(payload as object, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as string,
    } as jwt.SignOptions);
    const refreshToken = jwt.sign(payload as object, process.env.JWT_REFRESH_SECRET!, {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as string,
    } as jwt.SignOptions);

    const refreshHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await tx.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshHash },
    });

    logger.info({ userId: user.id, provider }, 'OAuth login successful');

    return { accessToken, refreshToken, user };
  });
}

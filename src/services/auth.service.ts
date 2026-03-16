import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
import { JwtPayload, RegisterInput, LoginInput } from '../types/index.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload as object, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? '15m') as string,
  } as jwt.SignOptions);
}

function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload as object, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ?? '7d') as string,
  } as jwt.SignOptions);
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict('Email already registered', ERROR_CODES.CONFLICT);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: { name: input.orgName },
    });

    await tx.orgSettings.create({
      data: { organisationId: org.id },
    });

    const user = await tx.user.create({
      data: {
        organisationId: org.id,
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'ADMIN',
      },
    });

    return { org, user };
  });

  const payload: JwtPayload = {
    userId: result.user.id,
    orgId: result.org.id,
    role: result.user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: result.user.id },
    data: { refreshToken: refreshHash },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      userId: result.user.id,
      orgId: result.org.id,
      role: result.user.role,
      name: result.user.name,
      email: result.user.email,
    },
  };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  if (!user || !user.passwordHash) {
    throw AppError.unauthorized('Invalid credentials');
  }

  if (user.status !== 'active') {
    throw AppError.unauthorized('Account is inactive');
  }

  const isMatch = await bcrypt.compare(input.password, user.passwordHash);
  if (!isMatch) {
    throw AppError.unauthorized('Invalid credentials');
  }

  const payload: JwtPayload = {
    userId: user.id,
    orgId: user.organisationId,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshHash },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      userId: user.id,
      orgId: user.organisationId,
      role: user.role,
      name: user.name,
      email: user.email,
    },
  };
}

export async function refreshTokens(oldRefreshToken: string) {
  let decoded: JwtPayload;
  try {
    decoded = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
  } catch {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user || !user.refreshToken) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const isMatch = await bcrypt.compare(oldRefreshToken, user.refreshToken);
  if (!isMatch) {
    // Possible token theft — wipe stored token
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: null },
    });
    logger.warn({ userId: user.id }, 'Refresh token mismatch — possible theft');
    throw AppError.unauthorized('Invalid refresh token');
  }

  const payload: JwtPayload = {
    userId: user.id,
    orgId: user.organisationId,
    role: user.role,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshHash },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      userId: user.id,
      orgId: user.organisationId,
      role: user.role,
      name: user.name,
      email: user.email,
    },
  };
}

export async function logout(userId: number) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });
}

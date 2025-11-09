import express from 'express';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get user's badges
router.get('/me', async (req: AuthRequest, res) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { userId: req.userId },
      include: {
        badge: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
            quiz: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        earnedAt: 'desc',
      },
    });

    res.json({ badges });
  } catch (error) {
    console.error('Error getting badges:', error);
    res.status(500).json({ error: 'Failed to get badges' });
  }
});

// Get all available badges
router.get('/available', async (req: AuthRequest, res) => {
  try {
    const allBadges = await prisma.badge.findMany({
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
        quiz: {
          select: {
            id: true,
            title: true,
          },
        },
        _count: {
          select: {
            userBadges: true,
          },
        },
      },
    });

    // Get user's earned badges
    const userBadges = await prisma.userBadge.findMany({
      where: { userId: req.userId },
      select: { badgeId: true },
    });

    const earnedBadgeIds = new Set(userBadges.map((ub) => ub.badgeId));

    const badgesWithStatus = allBadges.map((badge) => ({
      ...badge,
      earned: earnedBadgeIds.has(badge.id),
    }));

    res.json({ badges: badgesWithStatus });
  } catch (error) {
    console.error('Error getting available badges:', error);
    res.status(500).json({ error: 'Failed to get available badges' });
  }
});

export default router;


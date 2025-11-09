import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';

const router = express.Router();

const createGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

// All routes require authentication
router.use(authenticate);

// Create group (Teacher/Admin only)
router.post('/', requireRole(['TEACHER', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { name, description } = createGroupSchema.parse(req.body);

    // Generate unique code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const group = await prisma.group.create({
      data: {
        name,
        description,
        code,
        ownerId: req.userId!,
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({ group });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Get all groups for user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        groups: {
          include: {
            group: {
              include: {
                owner: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                _count: {
                  select: {
                    members: true,
                  },
                },
              },
            },
          },
        },
        createdGroups: {
          include: {
            _count: {
              select: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const memberGroups = user.groups.map((gm) => gm.group);
    const ownedGroups = user.createdGroups;

    res.json({ groups: [...memberGroups, ...ownedGroups] });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

// Join group by code
router.post('/join', async (req: AuthRequest, res) => {
  try {
    const { code } = z.object({ code: z.string() }).parse(req.body);

    const group = await prisma.group.findUnique({ where: { code } });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if already a member
    const existingMembership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId!,
          groupId: group.id,
        },
      },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    const membership = await prisma.groupMembership.create({
      data: {
        userId: req.userId!,
        groupId: group.id,
      },
      include: {
        group: true,
      },
    });

    res.status(201).json({ membership });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// Get group details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const group = await prisma.group.findUnique({
      where: { id: req.params.id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        courses: {
          include: {
            _count: {
              select: {
                enrollments: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is member or owner
    const isMember = group.ownerId === req.userId || group.members.some((m) => m.userId === req.userId);
    if (!isMember) {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    res.json({ group });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get group' });
  }
});

export default router;


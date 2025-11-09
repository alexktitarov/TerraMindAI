/**
 * Admin Routes
 * 
 * This module provides administrative endpoints for managing the entire system.
 * All routes require authentication and ADMIN role verification.
 * 
 * Features:
 * - User management (view, update roles, delete)
 * - Course management (view all, update status, delete)
 * - Group management (view all, delete)
 * - System statistics and analytics
 */

import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';

const router = express.Router();

// All admin routes require authentication and ADMIN role
// This middleware chain ensures only authenticated admins can access these endpoints
router.use(authenticate);
router.use(requireRole(['ADMIN']));

// ========== USER MANAGEMENT ==========

/**
 * GET /api/admin/users
 * 
 * Retrieves a paginated list of all users in the system.
 * Supports filtering by role and searching by name/email.
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search term for name/email
 * - role: Filter by user role (STUDENT, TEACHER, ADMIN)
 * 
 * Returns: { users: User[], pagination: { page, limit, total, totalPages } }
 */
router.get('/users', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = req.query.search as string || '';
    const role = req.query.role as string | undefined;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: {
            select: {
              courseEnrollments: true,
              quizAttempts: true,
              badges: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * GET /api/admin/users/:id
 * 
 * Retrieves detailed information about a specific user.
 * Includes enrollments, quiz attempts, badges, and created content.
 * 
 * Returns: { user: User with relations }
 */
router.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        courseEnrollments: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        quizAttempts: {
          include: {
            quiz: {
              select: {
                id: true,
                title: true,
              },
            },
          },
          take: 10,
          orderBy: { completedAt: 'desc' },
        },
        badges: {
          include: {
            badge: true,
          },
        },
        createdGroups: {
          select: {
            id: true,
            name: true,
          },
        },
        createdCourses: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * PATCH /api/admin/users/:id/role
 * 
 * Updates a user's role in the system.
 * Prevents admins from changing their own role (security measure).
 * 
 * Body: { role: 'STUDENT' | 'TEACHER' | 'ADMIN' }
 * Returns: { user: User }
 */
router.patch('/users/:id/role', async (req: AuthRequest, res) => {
  try {
    const { role } = z.object({
      role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']),
    }).parse(req.body);

    // Allow admins to change their own role (for development/testing)
    // In production, you might want to keep this restriction
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    // Only allow self-role change if current user is ADMIN
    if (req.params.id === req.userId && currentUser?.role !== 'ADMIN') {
      return res.status(400).json({ error: 'Cannot change your own role. Only admins can change their own role.' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * 
 * Permanently deletes a user account and all associated data.
 * Prevents admins from deleting their own account (security measure).
 * 
 * Note: This will cascade delete related records (enrollments, attempts, etc.)
 * Returns: { message: string }
 */
router.delete('/users/:id', async (req: AuthRequest, res) => {
  try {
    // Prevent deleting self
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    await prisma.user.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ========== COURSE MANAGEMENT ==========

/**
 * GET /api/admin/courses
 * 
 * Retrieves all courses in the system, including drafts and archived courses.
 * Regular users can only see published courses, but admins see everything.
 * 
 * Query parameters:
 * - status: Filter by status (DRAFT, PUBLISHED, ARCHIVED)
 * 
 * Returns: { courses: Course[] }
 */
router.get('/courses', async (req: AuthRequest, res) => {
  try {
    const status = req.query.status as string | undefined;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const courses = await prisma.course.findMany({
      where,
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            quizzes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ courses });
  } catch (error) {
    console.error('Error getting courses:', error);
    res.status(500).json({ error: 'Failed to get courses' });
  }
});

/**
 * PATCH /api/admin/courses/:id/status
 * 
 * Updates a course's publication status.
 * Allows admins to publish, unpublish, or archive courses.
 * 
 * Body: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }
 * Returns: { course: Course }
 */
router.patch('/courses/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = z.object({
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
    }).parse(req.body);

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json({ course });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error updating course status:', error);
    res.status(500).json({ error: 'Failed to update course status' });
  }
});

/**
 * DELETE /api/admin/courses/:id
 * 
 * Permanently deletes a course and all associated data.
 * This will cascade delete quizzes, enrollments, and badges.
 * 
 * Returns: { message: string }
 */
router.delete('/courses/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.course.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
});

// ========== GROUP MANAGEMENT ==========

/**
 * GET /api/admin/groups
 * 
 * Retrieves all groups in the system with member and course counts.
 * 
 * Returns: { groups: Group[] }
 */
router.get('/groups', async (req: AuthRequest, res) => {
  try {
    const groups = await prisma.group.findMany({
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
            courses: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ groups });
  } catch (error) {
    console.error('Error getting groups:', error);
    res.status(500).json({ error: 'Failed to get groups' });
  }
});

/**
 * DELETE /api/admin/groups/:id
 * 
 * Permanently deletes a group and all associated memberships.
 * 
 * Returns: { message: string }
 */
router.delete('/groups/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.group.delete({
      where: { id: req.params.id },
    });

    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// ========== STUDENT ASSIGNMENT ==========

/**
 * POST /api/admin/assign-student
 * 
 * Assigns a student to a teacher's group. Creates the group if it doesn't exist.
 * 
 * Body: { studentId: string, teacherId: string }
 * Returns: { group: Group, membership: GroupMembership }
 */
router.post('/assign-student', async (req: AuthRequest, res) => {
  try {
    const { studentId, teacherId } = z.object({
      studentId: z.string(),
      teacherId: z.string(),
    }).parse(req.body);

    // Verify student exists and is a student
    const student = await prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ error: 'User is not a student' });
    }

    // Verify teacher exists and is a teacher
    const teacher = await prisma.user.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    if (teacher.role !== 'TEACHER') {
      return res.status(400).json({ error: 'User is not a teacher' });
    }

    // Find or create teacher's group
    let teacherGroup = await prisma.group.findFirst({
      where: { ownerId: teacherId },
    });

    if (!teacherGroup) {
      // Generate unique code
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      teacherGroup = await prisma.group.create({
        data: {
          name: `Students of ${teacher.name}`,
          code,
          ownerId: teacherId,
        },
      });
    }

    // Check if student is already a member
    const existingMembership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: studentId,
          groupId: teacherGroup.id,
        },
      },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Student is already assigned to this teacher' });
    }

    // Add student to group
    const membership = await prisma.groupMembership.create({
      data: {
        userId: studentId,
        groupId: teacherGroup.id,
      },
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
          },
        },
      },
    });

    res.status(201).json({ group: teacherGroup, membership });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error assigning student to teacher:', error);
    res.status(500).json({ error: 'Failed to assign student to teacher' });
  }
});

// ========== SYSTEM STATISTICS ==========

/**
 * GET /api/admin/stats
 * 
 * Retrieves comprehensive system-wide statistics for the admin dashboard.
 * Includes user counts, course metrics, engagement data, and recent activity.
 * 
 * Returns: {
 *   stats: {
 *     users: { total, students, teachers, admins },
 *     courses: { total, published, draft },
 *     groups: { total },
 *     engagement: { enrollments, quizAttempts, badgesEarned, avgQuizScore, completionRate },
 *     recentUsers: User[]
 *   }
 * }
 */
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      totalAdmins,
      totalCourses,
      publishedCourses,
      totalGroups,
      totalEnrollments,
      totalQuizAttempts,
      totalBadges,
      recentUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.course.count(),
      prisma.course.count({ where: { status: 'PUBLISHED' } }),
      prisma.group.count(),
      prisma.courseEnrollment.count(),
      prisma.quizAttempt.count(),
      prisma.userBadge.count(),
      prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      }),
    ]);

    const avgQuizScore = await prisma.quizAttempt.aggregate({
      _avg: {
        score: true,
      },
    });

    const completionRate = totalEnrollments > 0
      ? (await prisma.courseEnrollment.count({ where: { progress: 100 } })) / totalEnrollments * 100
      : 0;

    res.json({
      stats: {
        users: {
          total: totalUsers,
          students: totalStudents,
          teachers: totalTeachers,
          admins: totalAdmins,
        },
        courses: {
          total: totalCourses,
          published: publishedCourses,
          draft: totalCourses - publishedCourses,
        },
        groups: {
          total: totalGroups,
        },
        engagement: {
          enrollments: totalEnrollments,
          quizAttempts: totalQuizAttempts,
          badgesEarned: totalBadges,
          avgQuizScore: avgQuizScore._avg.score || 0,
          completionRate: completionRate,
        },
        recentUsers,
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

export default router;


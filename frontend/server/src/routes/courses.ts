import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth.js';
import { generateCourseContent, generateQuiz } from '../services/llmService.js';

const router = express.Router();

const createCourseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  topic: z.string().min(1),
  gradeLevel: z.enum(['elementary school', 'middle school', 'high school']),
  duration: z.string().optional().default('30 minutes'),
  groupId: z.string().optional(),
});

// All routes require authentication
router.use(authenticate);

// Create course (Teacher/Admin only)
router.post('/', requireRole(['TEACHER', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { title, description, topic, gradeLevel, duration, groupId } = createCourseSchema.parse(req.body);

    // Generate course content using LLM
    const courseContent = await generateCourseContent(topic, gradeLevel, duration);

    // Create course
    const course = await prisma.course.create({
      data: {
        title: title || courseContent.title,
        description: description || courseContent.description,
        content: JSON.stringify(courseContent),
        status: 'PUBLISHED',
        gradeLevel,
        creatorId: req.userId!,
        groupId: groupId || null,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Generate quiz for the course (pass original topic for better matching)
    const quizContent = await generateQuiz(courseContent, 5, topic);

    // Create quiz
    const quiz = await prisma.quiz.create({
      data: {
        courseId: course.id,
        title: quizContent.title,
        questions: JSON.stringify(quizContent.questions),
         passingScore: 60, // Changed from 70 to 60
      },
    });

    // Create course completion badge
    const badge = await prisma.badge.create({
      data: {
        name: `${course.title} Completion`,
        description: `Complete the ${course.title} course`,
        type: 'COURSE_COMPLETION',
        courseId: course.id,
        icon: 'BookOpen',
      },
    });

    // Create quiz pass badge
    await prisma.badge.create({
      data: {
        name: `${course.title} Quiz Master`,
        description: `Pass the quiz for ${course.title}`,
        type: 'QUIZ_PASS',
        quizId: quiz.id,
        icon: 'Target',
      },
    });

    res.status(201).json({ course, quiz });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      });
    }
    console.error('Error creating course:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create course. Please check your OpenAI API key.';
    res.status(500).json({ error: errorMessage });
  }
});

// Get all courses (for user's groups or all if admin)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        groups: {
          include: {
            group: {
              include: {
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
            },
          },
        },
        courseEnrollments: {
          include: {
            course: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get courses from user's groups (filtered by grade level for students)
    let groupCourses = user.groups.flatMap((gm) => gm.group.courses);
    if (user.role === 'STUDENT' && user.gradeLevel) {
      groupCourses = groupCourses.filter((course) => course.gradeLevel === user.gradeLevel);
    }
    
    // Get courses from direct enrollments (for students who were enrolled directly by admin)
    // These should always be visible regardless of grade level
    // Exclude courses where the user is the creator (admins/teachers shouldn't see their own courses as enrolled)
    const enrolledCourses = user.courseEnrollments
      .map((enrollment) => ({
        ...enrollment.course,
        enrollments: [enrollment],
      }))
      .filter((course) => course.status === 'PUBLISHED' && course.creatorId !== user.id);
    
    // Get all courses if admin/teacher, or filtered by gradeLevel for students
    let allCourses: Awaited<ReturnType<typeof prisma.course.findMany<{
      include: {
        creator: { select: { id: true; name: true } };
        _count: { select: { enrollments: true } };
      };
    }>>> = [];
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      allCourses = await prisma.course.findMany({
        where: { status: 'PUBLISHED' },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      });
    } else if (user.role === 'STUDENT' && user.gradeLevel) {
      // Students only see courses matching their grade level (except ones they're enrolled in)
      allCourses = await prisma.course.findMany({
        where: { 
          status: 'PUBLISHED',
          gradeLevel: user.gradeLevel,
        },
        include: {
          creator: {
            select: {
              id: true,
              name: true,
            },
          },
          _count: {
            select: {
              enrollments: true,
            },
          },
        },
      });
    }

    // Combine and deduplicate - include enrolled courses, group courses, and available courses
    const courseMap = new Map();
    
    // First add directly enrolled courses (students should always see these, regardless of grade level)
    enrolledCourses.forEach((course) => {
      courseMap.set(course.id, course);
    });
    
    // Then add group courses
    groupCourses.forEach((course) => {
      if (!courseMap.has(course.id)) {
        courseMap.set(course.id, course);
      }
    });
    
    // Finally add available courses (for students to enroll in)
    allCourses.forEach((course) => {
      if (!courseMap.has(course.id)) {
        courseMap.set(course.id, course);
      }
    });

    const courses = Array.from(courseMap.values());
    
    // Add isCreator flag to all courses to help frontend identify teacher/curator status
    // For students, include enrollment info for all courses
    // For admins/teachers, include enrollment info but exclude courses they created
    courses.forEach((course) => {
      const isCreator = course.creatorId === user.id || course.creator?.id === user.id;
      // Add isCreator property to help frontend display teacher/curator status
      (course as any).isCreator = isCreator;
    });

    if (user.role === 'STUDENT') {
      courses.forEach((course) => {
        if (!course.enrollments) {
          const enrollment = user.courseEnrollments.find(e => e.courseId === course.id);
          if (enrollment) {
            course.enrollments = [enrollment];
          } else {
            course.enrollments = [];
          }
        }
      });
    } else if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      // For admins/teachers, only show enrollment info if they're not the creator
      courses.forEach((course) => {
        const isCreator = (course as any).isCreator;
        if (!course.enrollments && !isCreator) {
          const enrollment = user.courseEnrollments.find(e => e.courseId === course.id);
          if (enrollment) {
            course.enrollments = [enrollment];
          } else {
            course.enrollments = [];
          }
        } else if (isCreator) {
          // Explicitly set enrollments to empty array for courses created by the user
          course.enrollments = [];
        }
      });
    }

    res.json({ courses });
  } catch (error) {
    console.error('Error getting courses:', error);
    res.status(500).json({ error: 'Failed to get courses' });
  }
});

// Get course by ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    // Get user to check role
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        quizzes: true,
        enrollments: {
          where: { userId: req.userId },
        },
      },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if user has access to course content
    const isCreator = course.creatorId === user.id;
    const isTeacherOrAdmin = user.role === 'TEACHER' || user.role === 'ADMIN';
    const isEnrolled = course.enrollments && course.enrollments.length > 0;

    // For students: check grade level match and enrollment
    if (user.role === 'STUDENT') {
      // Check if grade level matches (unless already enrolled or is creator)
      if (!isCreator && !isEnrolled && course.gradeLevel && user.gradeLevel) {
        if (course.gradeLevel !== user.gradeLevel) {
          return res.status(403).json({ 
            error: 'Grade level mismatch',
            message: `This course is for ${course.gradeLevel} students. You are registered as ${user.gradeLevel}.`,
            requiresEnrollment: false,
          });
        }
      }
      
      // Students must be enrolled to see content (unless they're the creator)
      if (!isCreator && !isEnrolled) {
        // Return course info without content for enrollment preview
        return res.json({
          course: {
            ...course,
            content: null, // Hide content for unenrolled students
            requiresEnrollment: true,
          },
        });
      }
    }

    // Parse course content for authorized users
    const courseContent = JSON.parse(course.content);

    res.json({
      course: {
        ...course,
        content: courseContent,
      },
    });
  } catch (error) {
    console.error('Error getting course:', error);
    res.status(500).json({ error: 'Failed to get course' });
  }
});

// Enroll in course (self-enrollment)
router.post('/:id/enroll', async (req: AuthRequest, res) => {
  try {
    // Get user to check grade level
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check grade level match for students
    if (user.role === 'STUDENT' && course.gradeLevel && user.gradeLevel) {
      if (course.gradeLevel !== user.gradeLevel) {
        return res.status(403).json({ 
          error: 'Grade level mismatch',
          message: `This course is for ${course.gradeLevel} students. You are registered as ${user.gradeLevel}. Please contact your teacher if you believe this is an error.`,
        });
      }
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: req.userId!,
          courseId: course.id,
        },
      },
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Already enrolled in this course' });
    }

    const enrollment = await prisma.courseEnrollment.create({
      data: {
        userId: req.userId!,
        courseId: course.id,
        progress: 0,
      },
      include: {
        course: true,
      },
    });

    res.status(201).json({ enrollment });
  } catch (error) {
    console.error('Error enrolling in course:', error);
    res.status(500).json({ error: 'Failed to enroll in course' });
  }
});

// Enroll a student in a course (Admin/Teacher only)
router.post('/:id/enroll-student', requireRole(['TEACHER', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Verify the student exists
    const student = await prisma.user.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.role !== 'STUDENT') {
      return res.status(400).json({ error: 'User is not a student' });
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: studentId,
          courseId: course.id,
        },
      },
    });

    if (existingEnrollment) {
      return res.status(400).json({ error: 'Student is already enrolled in this course' });
    }

    const enrollment = await prisma.courseEnrollment.create({
      data: {
        userId: studentId,
        courseId: course.id,
        progress: 0,
      },
      include: {
        course: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.status(201).json({ enrollment });
  } catch (error) {
    console.error('Error enrolling student in course:', error);
    res.status(500).json({ error: 'Failed to enroll student in course' });
  }
});

// Get students for assignment (Teacher/Admin only)
router.get('/:id/students', requireRole(['TEACHER', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Get current user
    const currentUser = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        groups: {
          include: {
            group: {
              include: {
                members: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get enrolled students for this course
    const enrolledStudents = await prisma.courseEnrollment.findMany({
      where: { courseId: course.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gradeLevel: true,
          },
        },
      },
    });

    const enrolledStudentIds = new Set(enrolledStudents.map(e => e.userId));

    // If admin, get all students
    // If teacher, get students that match the course grade level (not just from groups)
    let availableStudents: any[] = [];
    
    if (currentUser.role === 'ADMIN') {
      const allStudents = await prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: {
          id: true,
          name: true,
          email: true,
          gradeLevel: true,
        },
        orderBy: { name: 'asc' },
      });
      availableStudents = allStudents;
    } else {
      // Teacher: get students that match the course's grade level
      // This allows teachers to assign any student with matching grade level to their course
      const whereClause: any = { role: 'STUDENT' };
      
      // If course has a grade level, only show students with matching grade level
      if (course.gradeLevel) {
        whereClause.gradeLevel = course.gradeLevel;
      }
      
      const matchingStudents = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
          gradeLevel: true,
        },
        orderBy: { name: 'asc' },
      });
      
      availableStudents = matchingStudents;
    }

    res.json({
      enrolled: enrolledStudents.map(e => e.user),
      available: availableStudents.filter(s => !enrolledStudentIds.has(s.id)),
    });
  } catch (error) {
    console.error('Error getting students for course:', error);
    res.status(500).json({ error: 'Failed to get students' });
  }
});

// Update course progress
router.patch('/:id/progress', async (req: AuthRequest, res) => {
  try {
    const { progress } = z.object({ progress: z.number().min(0).max(100) }).parse(req.body);

    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId: req.userId!,
          courseId: req.params.id,
        },
      },
    });

    if (!enrollment) {
      return res.status(404).json({ error: 'Not enrolled in this course' });
    }

    const updatedEnrollment = await prisma.courseEnrollment.update({
      where: { id: enrollment.id },
      data: { progress },
    });

    // If progress is 100%, mark as completed and award badge
    if (progress === 100 && !enrollment.completedAt) {
      await prisma.courseEnrollment.update({
        where: { id: enrollment.id },
        data: { completedAt: new Date() },
      });

      // Award course completion badge
      const badge = await prisma.badge.findFirst({
        where: {
          courseId: req.params.id,
          type: 'COURSE_COMPLETION',
        },
      });

      if (badge) {
        await prisma.userBadge.upsert({
          where: {
            userId_badgeId: {
              userId: req.userId!,
              badgeId: badge.id,
            },
          },
          create: {
            userId: req.userId!,
            badgeId: badge.id,
          },
          update: {},
        });
      }
    }

    res.json({ enrollment: updatedEnrollment });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error updating progress:', error);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// Update course content (Teacher/Admin only, or course creator)
router.put('/:id/content', requireRole(['TEACHER', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { content } = z.object({
      content: z.any(), // Course content object
    }).parse(req.body);

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if user is creator or admin
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (course.creatorId !== req.userId && user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Not authorized to edit this course' });
    }

    const updatedCourse = await prisma.course.update({
      where: { id: req.params.id },
      data: {
        content: JSON.stringify(content),
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({ course: updatedCourse });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error updating course content:', error);
    res.status(500).json({ error: 'Failed to update course content' });
  }
});

export default router;


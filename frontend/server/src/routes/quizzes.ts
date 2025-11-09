import express from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { generateFeedback, generateQuiz, CourseContent } from '../services/llmService.js';

const router = express.Router();

const submitQuizSchema = z.object({
  answers: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

// All routes require authentication
router.use(authenticate);

// Get quiz by course ID
router.get('/course/:courseId', async (req: AuthRequest, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { courseId: req.params.courseId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Parse questions
    const questions = JSON.parse(quiz.questions);

    // Remove correct answers for security
    const questionsWithoutAnswers = questions.map((q: any) => ({
      id: q.id || Math.random().toString(),
      question: q.question,
      type: q.type,
      options: q.options,
    }));

    res.json({
      quiz: {
        ...quiz,
        questions: questionsWithoutAnswers,
      },
    });
  } catch (error) {
    console.error('Error getting quiz:', error);
    res.status(500).json({ error: 'Failed to get quiz' });
  }
});

// Submit quiz attempt
router.post('/:id/submit', async (req: AuthRequest, res) => {
  try {
    const { answers } = submitQuizSchema.parse(req.body);

    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: {
        course: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Parse questions and calculate score
    const questions = JSON.parse(quiz.questions);
    let correct = 0;
    const incorrectAnswers: number[] = [];

    questions.forEach((q: any, index: number) => {
      const userAnswer = answers[index.toString()];
      const correctAnswer = q.correctAnswer;

      // Check if answer was provided
      if (userAnswer === undefined || userAnswer === null) {
        console.log(`Question ${index}: No answer provided`);
        incorrectAnswers.push(index);
        return;
      }

      // Handle different answer types (number, string, boolean)
      let isCorrect = false;
      
      // Debug logging
      console.log(`Question ${index}: userAnswer=${userAnswer} (${typeof userAnswer}), correctAnswer=${correctAnswer} (${typeof correctAnswer})`);
      
      // Normalize both answers for comparison
      // Handle boolean answers first (TRUE_FALSE questions)
      let normalizedUserAnswer: string | number;
      let normalizedCorrectAnswer: string | number;
      
      // Convert boolean to string for consistent comparison
      if (typeof userAnswer === 'boolean') {
        normalizedUserAnswer = userAnswer ? 'true' : 'false';
      } else {
        normalizedUserAnswer = userAnswer;
      }
      
      if (typeof correctAnswer === 'boolean') {
        normalizedCorrectAnswer = correctAnswer ? 'true' : 'false';
      } else {
        normalizedCorrectAnswer = correctAnswer;
      }
      
      // Check if both are boolean string representations (TRUE_FALSE questions)
      const userIsBooleanStr = typeof normalizedUserAnswer === 'string' && 
        (normalizedUserAnswer.toLowerCase().trim() === 'true' || normalizedUserAnswer.toLowerCase().trim() === 'false');
      const correctIsBooleanStr = typeof normalizedCorrectAnswer === 'string' && 
        (normalizedCorrectAnswer.toLowerCase().trim() === 'true' || normalizedCorrectAnswer.toLowerCase().trim() === 'false');
      
      if (userIsBooleanStr && correctIsBooleanStr) {
        // Both are boolean strings - compare as strings (TRUE_FALSE questions)
        // TypeScript knows these are strings because of the boolean string check
        const userStr = typeof normalizedUserAnswer === 'string' ? normalizedUserAnswer : String(normalizedUserAnswer);
        const correctStr = typeof normalizedCorrectAnswer === 'string' ? normalizedCorrectAnswer : String(normalizedCorrectAnswer);
        isCorrect = userStr.toLowerCase().trim() === correctStr.toLowerCase().trim();
      } else {
        // Try numeric comparison first (for MULTIPLE_CHOICE questions)
        const userNum = typeof normalizedUserAnswer === 'number' ? normalizedUserAnswer : Number(normalizedUserAnswer);
        const correctNum = typeof normalizedCorrectAnswer === 'number' ? normalizedCorrectAnswer : Number(normalizedCorrectAnswer);
        
        if (!isNaN(userNum) && !isNaN(correctNum)) {
          // Both can be converted to numbers - compare numerically
          isCorrect = userNum === correctNum;
        } else {
          // Fall back to string comparison (case-insensitive)
          isCorrect = String(normalizedUserAnswer).toLowerCase().trim() === String(normalizedCorrectAnswer).toLowerCase().trim();
        }
      }

      console.log(`Question ${index}: isCorrect=${isCorrect}`);
      
      if (isCorrect) {
        correct++;
      } else {
        incorrectAnswers.push(index);
      }
    });

    // Calculate score as percentage, ensuring it's a number
    const score = questions.length > 0 ? (correct / questions.length) * 100 : 0;
    const passed = score >= quiz.passingScore;
    
    // Debug logging - detailed breakdown
    console.log(`=== QUIZ SCORING DEBUG ===`);
    console.log(`Total questions: ${questions.length}`);
    console.log(`Correct answers: ${correct}`);
    console.log(`Incorrect answers: ${incorrectAnswers.length}`);
    console.log(`Score calculation: (${correct} / ${questions.length}) * 100 = ${score.toFixed(2)}%`);
    console.log(`Passing score required: ${quiz.passingScore}%`);
    console.log(`Passed: ${passed}`);
    console.log(`===========================`);

    // Get user info for feedback
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    // Generate feedback using LLM (with error handling)
    let feedback = '';
    try {
      feedback = await generateFeedback(
        score,
        quiz.title,
        user?.name || 'Student',
        incorrectAnswers.length
      );
    } catch (error) {
      console.error('Error generating feedback:', error);
      // Fallback feedback if LLM fails
      if (score >= quiz.passingScore) {
        feedback = `Great job! You passed the quiz with a score of ${score.toFixed(1)}%. Keep up the excellent work!`;
      } else {
        feedback = `You scored ${score.toFixed(1)}%. You need ${quiz.passingScore}% to pass. Review the course material and try again!`;
      }
    }

    // Create quiz attempt
    const attempt = await prisma.quizAttempt.create({
      data: {
        userId: req.userId!,
        quizId: quiz.id,
        answers: JSON.stringify(answers),
        score,
        feedback,
        passed,
      },
      include: {
        quiz: true,
      },
    });

    // Award badge if passed
    if (passed) {
      const badge = await prisma.badge.findFirst({
        where: {
          quizId: quiz.id,
          type: 'QUIZ_PASS',
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

      // Award perfect score badge if 100%
      if (score === 100) {
        const perfectBadge = await prisma.badge.findFirst({
          where: {
            quizId: quiz.id,
            type: 'QUIZ_PERFECT_SCORE',
          },
        });

        if (!perfectBadge) {
          const newBadge = await prisma.badge.create({
            data: {
              name: `${quiz.title} Perfect Score`,
              description: `Score 100% on the ${quiz.title} quiz`,
              type: 'QUIZ_PERFECT_SCORE',
              quizId: quiz.id,
              icon: 'Star',
            },
          });

          await prisma.userBadge.create({
            data: {
              userId: req.userId!,
              badgeId: newBadge.id,
            },
          });
        } else {
          await prisma.userBadge.upsert({
            where: {
              userId_badgeId: {
                userId: req.userId!,
                badgeId: perfectBadge.id,
              },
            },
            create: {
              userId: req.userId!,
              badgeId: perfectBadge.id,
            },
            update: {},
          });
        }
      }
    }

    // Update course progress if quiz is passed
    if (passed) {
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: {
          userId_courseId: {
            userId: req.userId!,
            courseId: quiz.courseId,
          },
        },
      });

      if (enrollment && enrollment.progress < 100) {
        await prisma.courseEnrollment.update({
          where: { id: enrollment.id },
          data: { progress: 100, completedAt: new Date() },
        });

        // Award course completion badge
        const courseBadge = await prisma.badge.findFirst({
          where: {
            courseId: quiz.courseId,
            type: 'COURSE_COMPLETION',
          },
        });

        if (courseBadge) {
          await prisma.userBadge.upsert({
            where: {
              userId_badgeId: {
                userId: req.userId!,
                badgeId: courseBadge.id,
              },
            },
            create: {
              userId: req.userId!,
              badgeId: courseBadge.id,
            },
            update: {},
          });
        }
      }
    }

    res.json({
      attempt: {
        ...attempt,
        correctAnswers: questions.map((q: any) => q.correctAnswer),
        questions: questions.map((q: any, index: number) => ({
          ...q,
          userAnswer: answers[index.toString()],
        })),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error',
        message: error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
        errors: error.errors
      });
    }
    console.error('Error submitting quiz:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to submit quiz';
    res.status(500).json({ 
      error: 'Failed to submit quiz',
      message: errorMessage
    });
  }
});

// Get user's quiz attempts
router.get('/attempts', async (req: AuthRequest, res) => {
  try {
    const attempts = await prisma.quizAttempt.findMany({
      where: { userId: req.userId },
      include: {
        quiz: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    res.json({ attempts });
  } catch (error) {
    console.error('Error getting quiz attempts:', error);
    res.status(500).json({ error: 'Failed to get quiz attempts' });
  }
});

// Get quiz attempts for a course (Teacher view)
router.get('/course/:courseId/attempts', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    // Check if user is teacher/admin or course creator
    const quiz = await prisma.quiz.findFirst({
      where: { courseId: req.params.courseId },
      include: {
        course: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    if (user?.role !== 'TEACHER' && user?.role !== 'ADMIN' && quiz.course.creatorId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: quiz.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        quiz: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    res.json({ attempts });
  } catch (error) {
    console.error('Error getting quiz attempts:', error);
    res.status(500).json({ error: 'Failed to get quiz attempts' });
  }
});

// Regenerate quiz questions
router.post('/:id/regenerate', async (req: AuthRequest, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: {
        course: true,
      },
    });

    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // Get course content to extract topic
    let courseContent: CourseContent;
    try {
      courseContent = JSON.parse(quiz.course.content);
    } catch (error) {
      console.error('Error parsing course content:', error);
      return res.status(500).json({ error: 'Failed to parse course content' });
    }

    // Extract topic from course title
    const topic = quiz.course.title.replace(/^Climate Education:\s*/i, '').trim();
    
    console.log(`[Quiz Regeneration] Regenerating questions for quiz ${quiz.id}, topic: "${topic}"`);

    // Generate new quiz questions using the same logic as course creation
    const quizContent = await generateQuiz(courseContent, 5, topic);

    // Update quiz with new questions
    const updatedQuiz = await prisma.quiz.update({
      where: { id: quiz.id },
      data: {
        questions: JSON.stringify(quizContent.questions),
        updatedAt: new Date(),
      },
    });

    // Parse questions and remove correct answers for security
    const questions = quizContent.questions.map((q: any) => ({
      id: q.id || Math.random().toString(),
      question: q.question,
      type: q.type,
      options: q.options,
    }));

    res.json({
      quiz: {
        ...updatedQuiz,
        questions: questions,
      },
    });
  } catch (error) {
    console.error('Error regenerating quiz:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to regenerate quiz';
    res.status(500).json({ 
      error: 'Failed to regenerate quiz',
      message: errorMessage
    });
  }
});

export default router;


import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Quiz Feedback API base URL - should be in .env
const QUIZ_FEEDBACK_API_URL = process.env.QUIZ_FEEDBACK_API_URL || process.env.QUESTION_API_URL || 'http://localhost:5001';

// Get personalized quiz feedback
router.post('/feedback', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      quiz,
      student_answers,
      score,
      total_questions,
      lesson_id,
      session_id,
    } = req.body;

    // Validate required fields
    if (!quiz || !quiz.questions || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
      return res.status(400).json({
        error: 'Quiz questions are required',
        message: 'Please provide quiz questions.',
      });
    }

    if (!student_answers || typeof student_answers !== 'object') {
      return res.status(400).json({
        error: 'Student answers are required',
        message: 'Please provide student answers.',
      });
    }

    if (typeof score !== 'number' || score < 0) {
      return res.status(400).json({
        error: 'Invalid score',
        message: 'Score must be a non-negative number.',
      });
    }

    if (typeof total_questions !== 'number' || total_questions <= 0) {
      return res.status(400).json({
        error: 'Invalid total questions',
        message: 'Total questions must be greater than 0.',
      });
    }

    console.log(`[Quiz Feedback] Request from user ${req.userId}: score ${score}/${total_questions}${lesson_id ? `, lesson: ${lesson_id}` : ''}`);

    // Prepare request body for Quiz Feedback API
    const feedbackRequest: any = {
      quiz: {
        questions: quiz.questions.map((q: any) => ({
          question: q.question || '',
          options: q.options || [],
          correct_answer: q.correct_answer || q.correctAnswer || '',
          context_reference: q.context_reference || q.explanation || q.context || '',
        })),
      },
      student_answers: student_answers,
      score: score,
      total_questions: total_questions,
    };

    if (lesson_id) {
      feedbackRequest.lesson_id = lesson_id;
    }

    if (session_id) {
      feedbackRequest.session_id = session_id;
    }

    console.log(`[Quiz Feedback] Request to ${QUIZ_FEEDBACK_API_URL}/quiz-feedback:`, JSON.stringify({
      ...feedbackRequest,
      quiz: { ...feedbackRequest.quiz, questions: feedbackRequest.quiz.questions.map((q: any) => ({ ...q, options: q.options?.length || 0 })) }
    }, null, 2));

    // Call Quiz Feedback API
    const feedbackResponse = await axios.post(
      `${QUIZ_FEEDBACK_API_URL}/quiz-feedback`,
      feedbackRequest,
      {
        timeout: 60000, // 1 minute timeout for feedback generation
      }
    );

    console.log(`[Quiz Feedback] Response status: ${feedbackResponse.data.status}`);

    // Return the response as-is
    res.json(feedbackResponse.data);
  } catch (error: any) {
    console.error('Quiz feedback error:', error);

    // Handle different error types
    if (error.response) {
      // Quiz Feedback API returned an error
      const status = error.response.status || 500;
      const errorData = error.response.data;

      let errorMessage = 'Failed to generate quiz feedback';
      try {
        if (typeof errorData === 'string') {
          const parsed = JSON.parse(errorData);
          errorMessage = parsed.message || parsed.error || errorMessage;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        } else if (errorData?.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If parsing fails, use default message
      }

      return res.status(status).json({
        error: 'Quiz feedback generation failed',
        message: errorMessage,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Quiz feedback service unavailable',
        message: 'The quiz feedback service is not available. Please check if the service is running.',
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Quiz feedback request timeout',
        message: 'The quiz feedback request timed out. Please try again.',
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating quiz feedback.',
      });
    }
  }
});

export default router;


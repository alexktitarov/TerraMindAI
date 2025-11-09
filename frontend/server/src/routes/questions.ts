import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Question Generation API base URL - should be in .env
const QUESTION_API_URL = process.env.QUESTION_API_URL || 'http://localhost:5001';

// Helper function to normalize lesson_id (same as in llmService.ts)
const normalizeLessonId = (lessonId: string, providedDatasetName?: string): { lesson_id: string; dataset_name: string } => {
  // If dataset_name is provided, use it and keep lesson_id as-is (or minimal normalization)
  if (providedDatasetName) {
    return {
      lesson_id: lessonId.toLowerCase().trim(),
      dataset_name: providedDatasetName
    };
  }

  // Normalize topic: lowercase, trim, and convert spaces to underscores
  let normalized = lessonId.toLowerCase().trim();
  
  // Remove "Climate Education: " prefix if present
  normalized = normalized.replace(/^climate education:\s*/i, '');
  
  // Convert spaces to underscores for lesson_id format
  // e.g., "Austria Climate" -> "climate_austria"
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // If topic contains "climate" or country name, format as "climate_country" or "climate_topic"
  let formattedLessonId: string;
  
  if (words.length > 1) {
    // Check if "climate" is in the topic
    const hasClimate = words.some(w => w.includes('climate'));
    const countryWords = words.filter(w => !w.includes('climate'));
    
    if (hasClimate && countryWords.length > 0) {
      // Format: "climate_country" (e.g., "climate_austria")
      formattedLessonId = `climate_${countryWords.join('_')}`;
    } else if (hasClimate) {
      // Just "climate" or "climate something"
      formattedLessonId = words.join('_');
    } else {
      // No "climate" keyword, format as "climate_topic" (e.g., "climate_austria" if topic is "Austria")
      formattedLessonId = `climate_${words.join('_')}`;
    }
  } else {
    // Single word - prepend "climate_" if not already present
    if (normalized.includes('climate')) {
      formattedLessonId = normalized;
    } else {
      formattedLessonId = `climate_${normalized}`;
    }
  }
  
  // Use "climate" dataset by default
  return {
    lesson_id: formattedLessonId,
    dataset_name: 'climate'
  };
};

// Generate questions for a lesson/topic
router.post('/generate', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      lesson_id: rawLessonId,
      person_id,
      num_questions = 5,
      dataset_name: providedDatasetName,
      question_type = 'comprehensive',
      difficulty = 'medium',
      use_rag = true,
      context_k = 5,
    } = req.body;

    if (!rawLessonId || !person_id) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'lesson_id and person_id are required.',
      });
    }

    // Normalize lesson_id for better dataset matching
    const { lesson_id, dataset_name } = normalizeLessonId(rawLessonId, providedDatasetName);

    console.log(`[Question Generation API] Original lesson_id: "${rawLessonId}" -> normalized: "${lesson_id}", dataset: "${dataset_name}"`);

    // Prepare request body for Question Generation API (always include dataset_name)
    const questionRequest: any = {
      lesson_id: lesson_id, // Use normalized lesson_id
      person_id: person_id, // Always include person_id
      dataset_name: dataset_name, // Always include dataset_name
      num_questions: Math.min(Math.max(1, num_questions), 20), // Clamp between 1-20
    };
    if (question_type) {
      questionRequest.question_type = question_type;
    }
    if (difficulty) {
      questionRequest.difficulty = difficulty;
    }
    if (use_rag !== undefined) {
      questionRequest.use_rag = use_rag;
    }
    if (context_k) {
      questionRequest.context_k = Math.min(Math.max(1, context_k), 10); // Clamp between 1-10
    }

    console.log(`[Question Generation API] Request to ${QUESTION_API_URL}/generate-questions:`, JSON.stringify(questionRequest, null, 2));

    // Call Question Generation API
    const questionResponse = await axios.post(
      `${QUESTION_API_URL}/generate-questions`,
      questionRequest,
      {
        timeout: 120000, // 2 minute timeout for question generation
      }
    );

    console.log(`[Question Generation API] Response status: ${questionResponse.data.status}, questions: ${questionResponse.data.questions?.length || 0}`);

    // Transform questions to match quiz format
    const transformedQuestions = questionResponse.data.questions.map((q: any, index: number) => {
      // Determine question type
      let type: string = 'MULTIPLE_CHOICE';
      if (q.type === 'true_false' || q.type === 'TRUE_FALSE') {
        type = 'TRUE_FALSE';
      } else if (q.options && q.options.length > 0) {
        type = 'MULTIPLE_CHOICE';
      }

      // Use options as-is (no truncation - let UI handle wrapping)
      let options: string[] = [];
      if (q.options && Array.isArray(q.options)) {
        options = q.options.map((opt: string) => String(opt));
      }

      // Handle correct answer - could be string or index
      let correctAnswer: string | number;
      if (type === 'TRUE_FALSE') {
        // For true/false, convert to boolean string
        const answer = q.correct_answer || q.correctAnswer;
        if (typeof answer === 'boolean') {
          correctAnswer = answer ? 'true' : 'false';
        } else if (typeof answer === 'string') {
          correctAnswer = answer.toLowerCase() === 'true' ? 'true' : 'false';
        } else {
          correctAnswer = answer ? 'true' : 'false';
        }
      } else {
        // For multiple choice, find the index of the correct answer
        const correctAnswerText = q.correct_answer || q.correctAnswer;
        if (q.options && Array.isArray(q.options)) {
          const answerIndex = q.options.findIndex((opt: string) => 
            opt.toLowerCase().trim() === String(correctAnswerText).toLowerCase().trim()
          );
          correctAnswer = answerIndex >= 0 ? answerIndex : 0;
        } else {
          correctAnswer = 0;
        }
      }

      return {
        id: `q${index + 1}`,
        question: q.question || '',
        type: type,
        options: options,
        correctAnswer: correctAnswer,
        explanation: q.context_reference || q.explanation || `The correct answer is based on the lesson content about ${lesson_id || rawLessonId}.`,
      };
    });

    res.json({
      lesson_id: questionResponse.data.lesson_id || lesson_id,
      person_id: questionResponse.data.person_id || person_id,
      questions: transformedQuestions,
      status: questionResponse.data.status || 'success',
      message: questionResponse.data.message || `Generated ${transformedQuestions.length} questions successfully`,
      context_used: questionResponse.data.context_used || false,
      context_snippets: questionResponse.data.context_snippets || [],
    });
  } catch (error: any) {
    console.error('Question generation error:', error);

    // Handle different error types
    if (error.response) {
      // Question API returned an error
      const status = error.response.status || 500;
      const errorData = error.response.data;

      let errorMessage = 'Failed to generate questions';
      try {
        if (typeof errorData === 'string') {
          const parsed = JSON.parse(errorData);
          errorMessage = parsed.message || errorMessage;
        } else if (errorData?.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // If parsing fails, use default message
      }

      return res.status(status).json({
        error: 'Question generation failed',
        message: errorMessage,
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Question generation service unavailable',
        message: 'The question generation service is not available. Please check if the question generation server is running.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Question generation timeout',
        message: 'The question generation request timed out. Please try again with fewer questions.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating questions.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    }
  }
});

export default router;


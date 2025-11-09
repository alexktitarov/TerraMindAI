import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Learning Material Generation API base URL - should be in .env
const LEARNING_MATERIAL_API_URL = process.env.LEARNING_MATERIAL_API_URL || process.env.QUESTION_API_URL || 'http://localhost:5001';

// Helper function to normalize lesson_id (same as in llmService.ts and questions.ts)
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

// Generate learning material
router.post('/generate', authenticate, async (req: AuthRequest, res) => {
  try {
    const {
      lesson_id: rawLessonId,
      person_id,
      material_type = 'comprehensive',
      difficulty = 'medium',
      length = 'medium',
      dataset_name: providedDatasetName,
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

    console.log(`[Learning Material Generation] Original lesson_id: "${rawLessonId}" -> normalized: "${lesson_id}", dataset: "${dataset_name}"`);

    // Prepare request body for Learning Material Generation API
    const materialRequest: any = {
      lesson_id: lesson_id,
      person_id: person_id,
      dataset_name: dataset_name,
      material_type: material_type,
      difficulty: difficulty,
      length: length,
      use_rag: use_rag,
      context_k: Math.min(Math.max(1, context_k), 10), // Clamp between 1-10
    };

    console.log(`[Learning Material Generation] Request to ${LEARNING_MATERIAL_API_URL}/generate-learning-material:`, JSON.stringify(materialRequest, null, 2));

    // Call Learning Material Generation API
    const materialResponse = await axios.post(
      `${LEARNING_MATERIAL_API_URL}/generate-learning-material`,
      materialRequest,
      {
        timeout: 180000, // 3 minute timeout for material generation
      }
    );

    console.log(`[Learning Material Generation] Response status: ${materialResponse.data.status}`);

    // Return the response as-is (API should handle formatting)
    res.json(materialResponse.data);
  } catch (error: any) {
    console.error('Learning material generation error:', error);

    // Handle different error types
    if (error.response) {
      // Learning Material API returned an error
      const status = error.response.status || 500;
      const errorData = error.response.data;

      let errorMessage = 'Failed to generate learning material';
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
        error: 'Learning material generation failed',
        message: errorMessage,
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Learning material generation service unavailable',
        message: 'The learning material generation service is not available. Please check if the service is running.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Learning material generation timeout',
        message: 'The learning material generation request timed out. Please try again.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating learning material.',
        lesson_id: req.body.lesson_id,
        person_id: req.body.person_id,
      });
    }
  }
});

export default router;


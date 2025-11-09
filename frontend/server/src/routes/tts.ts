import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// TTS API base URL - should be in .env
const TTS_API_URL = process.env.TTS_API_URL || 'http://localhost:5001';

// Convert text to speech
router.post('/tts', authenticate, async (req: AuthRequest, res) => {
  try {
    const { text, voice_id, gender, model_id, stability, similarity_boost } = req.body;

    if (!text) {
      return res.status(400).json({
        error: 'Text parameter is required',
        message: 'Please provide text to convert to speech.'
      });
    }

    // Prepare request body for TTS API
    const ttsRequest: any = {
      text,
    };

    if (voice_id) {
      ttsRequest.voice_id = voice_id;
    } else if (gender) {
      ttsRequest.gender = gender;
    }

    if (model_id) {
      ttsRequest.model_id = model_id;
    }
    if (stability !== undefined) {
      ttsRequest.stability = stability;
    }
    if (similarity_boost !== undefined) {
      ttsRequest.similarity_boost = similarity_boost;
    }

    // Call TTS API
    const ttsResponse = await axios.post(
      `${TTS_API_URL}/tts`,
      ttsRequest,
      {
        responseType: 'arraybuffer', // Get audio as binary data
        timeout: 60000, // 60 second timeout for audio generation
      }
    );

    // Set appropriate headers for audio response
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', ttsResponse.data.length);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Send audio data
    res.send(ttsResponse.data);
  } catch (error: any) {
    console.error('TTS error:', error);

    // Handle different error types
    if (error.response) {
      // TTS API returned an error
      const status = error.response.status || 500;
      const errorData = error.response.data;

      // Try to parse error message if it's JSON
      let errorMessage = 'Failed to generate speech';
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
        error: 'TTS generation failed',
        message: errorMessage,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'TTS service unavailable',
        message: 'The text-to-speech service is not available. Please check if the TTS server is running.',
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'TTS request timeout',
        message: 'The text-to-speech request timed out. Please try again.',
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while generating speech.',
      });
    }
  }
});

// List available voices
router.get('/tts/voices', authenticate, async (req: AuthRequest, res) => {
  try {
    // Call TTS API to get voices
    const voicesResponse = await axios.get(`${TTS_API_URL}/tts/voices`, {
      timeout: 10000, // 10 second timeout
    });

    res.json(voicesResponse.data);
  } catch (error: any) {
    console.error('TTS voices error:', error);

    if (error.response) {
      const status = error.response.status || 500;
      const errorData = error.response.data;

      let errorMessage = 'Failed to fetch voices';
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
        error: 'Failed to fetch voices',
        message: errorMessage,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'TTS service unavailable',
        message: 'The text-to-speech service is not available. Please check if the TTS server is running.',
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while fetching voices.',
      });
    }
  }
});

export default router;


import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Chat API base URL - should be in .env
const CHAT_API_URL = process.env.CHAT_API_URL || process.env.QUESTION_API_URL || 'http://localhost:5001';

// Chat endpoint - streams responses
router.post('/chat', authenticate, async (req: AuthRequest, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({
        error: 'Message is required',
        message: 'Please provide a message to send to the chatbot.',
      });
    }

    console.log(`[Chat] Received message from user ${req.userId}: "${message.substring(0, 50)}..."`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

    // Call Chat API with streaming
    const chatResponse = await axios.post(
      `${CHAT_API_URL}/chat`,
      { message: message.trim() },
      {
        responseType: 'stream',
        timeout: 120000, // 2 minute timeout
      }
    );

    // Forward the stream to the client
    chatResponse.data.on('data', (chunk: Buffer) => {
      res.write(chunk);
    });

    chatResponse.data.on('end', () => {
      res.end();
    });

    chatResponse.data.on('error', (error: Error) => {
      console.error('[Chat] Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Stream error occurred', done: true })}\n\n`);
      res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
      chatResponse.data.destroy();
      res.end();
    });
  } catch (error: any) {
    console.error('Chat error:', error);

    // Handle different error types
    if (error.response) {
      // Chat API returned an error
      const status = error.response.status || 500;
      const errorData = error.response.data;

      let errorMessage = 'Failed to get response from chatbot';
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
        error: 'Chat error',
        message: errorMessage,
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Chat service unavailable',
        message: 'The chatbot service is not available. Please check if the chat server is running.',
      });
    } else if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Chat request timeout',
        message: 'The chat request timed out. Please try again.',
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while processing your message.',
      });
    }
  }
});

// Clear conversation history
router.post('/chat/clear', authenticate, async (req: AuthRequest, res) => {
  try {
    // Call Chat API to clear conversation
    const clearResponse = await axios.post(
      `${CHAT_API_URL}/clear`,
      {},
      {
        timeout: 10000,
      }
    );

    res.json(clearResponse.data);
  } catch (error: any) {
    console.error('Clear conversation error:', error);

    if (error.response) {
      const status = error.response.status || 500;
      return res.status(status).json({
        error: 'Failed to clear conversation',
        message: error.response.data?.message || 'Failed to clear conversation history.',
      });
    } else if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Chat service unavailable',
        message: 'The chatbot service is not available.',
      });
    } else {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred while clearing conversation.',
      });
    }
  }
});

export default router;


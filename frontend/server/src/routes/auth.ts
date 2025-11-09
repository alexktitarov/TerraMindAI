import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']).optional().default('STUDENT'),
  gradeLevel: z.enum(['elementary school', 'middle school', 'high school']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, role, gradeLevel } = signupSchema.parse(req.body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Account already exists',
        message: 'An account with this email address already exists. Please log in instead or use a different email.'
      });
    }

    // Validate gradeLevel for students
    if (role === 'STUDENT' && !gradeLevel) {
      return res.status(400).json({ 
        error: 'Grade level required',
        message: 'Please select your grade level to continue.'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: role || 'STUDENT',
        gradeLevel: role === 'STUDENT' ? gradeLevel : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        gradeLevel: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({ user, token });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => {
        if (err.path[0] === 'email') {
          return 'Please enter a valid email address.';
        }
        if (err.path[0] === 'password') {
          return 'Password must be at least 8 characters long.';
        }
        if (err.path[0] === 'name') {
          return 'Please enter your name.';
        }
        return err.message;
      });
      return res.status(400).json({ 
        error: 'Validation error',
        message: errorMessages.join(' '),
        errors: error.errors
      });
    }
    console.error('Signup error:', error);
    res.status(500).json({ 
      error: 'Signup failed',
      message: 'An unexpected error occurred while creating your account. Please try again later.'
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ 
        error: 'Account not found',
        message: 'No account exists with this email address. Please check your email or sign up for a new account.'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ 
        error: 'Incorrect password',
        message: 'The password you entered is incorrect. Please try again or use "Forgot password" to reset it.'
      });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        gradeLevel: user.gradeLevel,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => {
        if (err.path[0] === 'email') {
          return 'Please enter a valid email address.';
        }
        if (err.path[0] === 'password') {
          return 'Password is required.';
        }
        return err.message;
      });
      return res.status(400).json({ 
        error: 'Validation error',
        message: errorMessages.join(' '),
        errors: error.errors
      });
    }
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      message: 'An unexpected error occurred. Please try again later.'
    });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        gradeLevel: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;


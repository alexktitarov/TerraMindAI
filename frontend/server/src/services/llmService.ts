// OpenAI API commented out - not using it for now
// import OpenAI from 'openai';
//
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

import axios from 'axios';

export interface CourseContent {
  title: string;
  description: string;
  lessons: Lesson[];
}

export interface Lesson {
  title: string;
  content: string;
  order: number;
}

export interface QuizQuestion {
  question: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE';
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
}

export interface QuizContent {
  title: string;
  questions: QuizQuestion[];
}

// Helper function to map duration to length parameter
const mapDurationToLength = (duration: string): 'short' | 'medium' | 'long' => {
  const durationLower = duration.toLowerCase();
  // Extract number from duration string (e.g., "15 minutes" -> 15)
  const match = duration.match(/\d+/);
  const minutes = match ? parseInt(match[0]) : 30;

  if (minutes <= 15 || durationLower.includes('15')) {
    return 'short';
  } else if (minutes <= 45 || durationLower.includes('30') || durationLower.includes('45')) {
    return 'medium';
  } else {
    return 'long';
  }
};

export const generateCourseContent = async (
  topic: string,
  gradeLevel: string = 'middle school',
  duration: string = '30 minutes'
): Promise<CourseContent> => {
  try {
    // Normalize topic for API
    const { lesson_id, dataset_name } = normalizeTopicForAPI(topic);
    
    // Map duration to length parameter
    const length = mapDurationToLength(duration);
    
    // Determine difficulty based on grade level
    let difficulty: 'easy' | 'medium' | 'hard' = 'medium';
    if (gradeLevel.includes('elementary')) {
      difficulty = 'easy';
    } else if (gradeLevel.includes('high')) {
      difficulty = 'hard';
    }

    console.log(`[Course Content Generation] Topic: "${topic}" -> lesson_id: "${lesson_id}", length: "${length}", difficulty: "${difficulty}"`);

    // Use Learning Material Generation API
    const LEARNING_MATERIAL_API_URL = process.env.LEARNING_MATERIAL_API_URL || process.env.QUESTION_API_URL || 'http://localhost:5001';
    
    const response = await axios.post(
      `${LEARNING_MATERIAL_API_URL}/generate-learning-material`,
      {
        lesson_id: lesson_id,
        person_id: 'course_creator',
        dataset_name: dataset_name,
        material_type: 'comprehensive',
        difficulty: difficulty,
        length: length,
        use_rag: true,
        context_k: 5,
      },
      {
        timeout: 180000, // 3 minute timeout
      }
    );

    const data = response.data;

    console.log(`[Course Content Generation] Response status: ${data.status}, material generated: ${!!data.learning_material}`);

    if (data.status !== 'success' || !data.learning_material) {
      throw new Error(data.message || 'Failed to generate learning material');
    }

    const material = data.learning_material;

    // Helper function to convert HTML to markdown/plain text
    const htmlToMarkdown = (html: string): string => {
      let text = html;
      
      // Convert headings
      text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
      text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
      text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
      
      // Convert paragraphs
      text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      
      // Convert line breaks
      text = text.replace(/<br\s*\/?>/gi, '\n');
      
      // Convert lists
      text = text.replace(/<ul[^>]*>/gi, '\n');
      text = text.replace(/<\/ul>/gi, '\n');
      text = text.replace(/<ol[^>]*>/gi, '\n');
      text = text.replace(/<\/ol>/gi, '\n');
      text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      
      // Convert bold and italic
      text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
      text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
      
      // Remove all remaining HTML tags
      text = text.replace(/<[^>]+>/g, '');
      
      // Decode HTML entities
      text = text.replace(/&nbsp;/g, ' ');
      text = text.replace(/&amp;/g, '&');
      text = text.replace(/&lt;/g, '<');
      text = text.replace(/&gt;/g, '>');
      text = text.replace(/&quot;/g, '"');
      text = text.replace(/&#39;/g, "'");
      
      // Clean up extra whitespace
      text = text.replace(/\n{3,}/g, '\n\n');
      text = text.trim();
      
      return text;
    };

    // Parse learning material content into lessons
    // First, try to find content wrapped in <page> tags
    const pageMatches = material.content.match(/<page>([\s\S]*?)<\/page>/gi) || [];
    
    let pages: Array<{ title: string; content: string; order: number }> = [];
    
    if (pageMatches.length > 0) {
      // Content is wrapped in <page> tags, split by pages
      pages = pageMatches.map((page: string, index: number) => {
        // Extract content between <page> tags
        let content = page.replace(/<\/?page>/gi, '').trim();
        
        // Convert HTML to markdown if HTML tags are present
        if (content.includes('<') && content.includes('>')) {
          content = htmlToMarkdown(content);
        }
        
        // Extract title from first h1 if available, otherwise use default
        let pageTitle = material.title || `Introduction to ${topic}`;
        const h1Match = page.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) {
          pageTitle = h1Match[1].replace(/<[^>]+>/g, '').trim() || pageTitle;
        } else if (index > 0) {
          pageTitle = `${material.title || topic} - Part ${index + 1}`;
        }
        
        return {
          title: pageTitle,
          content: content,
          order: index + 1,
        };
      });
    } else {
      // No <page> tags found, try to split by <h1> tags or use entire content
      let content = material.content || material.introduction || '';
      
      // Check if content has multiple h1 tags (potential sections)
      const h1Matches = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
      
      if (h1Matches.length > 1) {
        // Split content by h1 tags
        const sections = content.split(/(?=<h1[^>]*>)/i);
        
        pages = sections
          .filter((section: string) => section.trim().length > 0)
          .map((section: string, index: number) => {
            let sectionContent = section.trim();
            
            // Extract title from h1
            let sectionTitle = material.title || `Introduction to ${topic}`;
            const h1Match = sectionContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
            if (h1Match) {
              sectionTitle = h1Match[1].replace(/<[^>]+>/g, '').trim();
            } else if (index > 0) {
              sectionTitle = `${material.title || topic} - Part ${index + 1}`;
            }
            
            // Convert HTML to markdown
            if (sectionContent.includes('<') && sectionContent.includes('>')) {
              sectionContent = htmlToMarkdown(sectionContent);
            }
            
            return {
              title: sectionTitle,
              content: sectionContent,
              order: index + 1,
            };
          });
      } else {
        // Single section or no h1 tags, create one lesson
        // Convert HTML to markdown if HTML tags are present
        if (content.includes('<') && content.includes('>')) {
          content = htmlToMarkdown(content);
        }
        
        // Extract title from h1 if available
        let lessonTitle = material.title || `Introduction to ${topic}`;
        const h1Match = material.content?.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (h1Match) {
          lessonTitle = h1Match[1].replace(/<[^>]+>/g, '').trim() || lessonTitle;
        }
        
        pages.push({
          title: lessonTitle,
          content: content,
          order: 1,
        });
      }
    }

    // Add introduction and conclusion if available (convert HTML if needed)
    if (material.introduction && pages.length > 0) {
      let intro = material.introduction;
      if (intro.includes('<') && intro.includes('>')) {
        intro = htmlToMarkdown(intro);
      }
      pages[0].content = intro + '\n\n' + pages[0].content;
    }

    if (material.conclusion && pages.length > 0) {
      let conclusion = material.conclusion;
      if (conclusion.includes('<') && conclusion.includes('>')) {
        conclusion = htmlToMarkdown(conclusion);
      }
      pages[pages.length - 1].content = pages[pages.length - 1].content + '\n\n' + conclusion;
    }

    // Add key points as a separate section if available
    if (material.key_points && material.key_points.length > 0) {
      const keyPointsContent = '\n\n## Key Points\n\n' + material.key_points.map((point: string, idx: number) => `${idx + 1}. ${point}`).join('\n');
      if (pages.length > 0) {
        pages[pages.length - 1].content += keyPointsContent;
      }
    }

    return {
      title: material.title || `Climate Education: ${topic}`,
      description: material.introduction || `Learn about ${topic} and its impact on climate change. This course is designed for ${gradeLevel} students and takes approximately ${duration} to complete.`,
      lessons: pages,
    };
  } catch (error) {
    console.error('Error generating course content with learning material API:', error);
    console.log('Falling back to default course content');
    
    // Fallback to default content if API fails
  // Using fallback content (OpenAI disabled for now)
  return {
    title: `Climate Education: ${topic}`,
    description: `Learn about ${topic} and its impact on climate change. This course is designed for ${gradeLevel} students and takes approximately ${duration} to complete.`,
    lessons: [
      {
        title: `Introduction to ${topic}`,
        content: `Welcome to this course on ${topic}! Climate change is one of the most pressing issues of our time, and understanding ${topic} is crucial for becoming an informed citizen and environmental steward.

In this lesson, we'll explore:
- What ${topic} is and why it matters
- How ${topic} relates to climate change
- The impact of ${topic} on our environment
- What we can do to address challenges related to ${topic}

${topic} plays a significant role in our climate system. Understanding this topic helps us make informed decisions about our environment and our future.`,
        order: 1,
      },
      {
        title: `Understanding the Science of ${topic}`,
        content: `In this lesson, we'll dive deeper into the science behind ${topic}.

Key concepts:
- The basic principles of ${topic}
- How ${topic} interacts with other climate factors
- Scientific evidence and data related to ${topic}
- Current research and findings

Scientists have been studying ${topic} for many years, and their research helps us understand how our climate is changing and what we can do about it.`,
        order: 2,
      },
      {
        title: `Real-World Applications and Solutions`,
        content: `Now that we understand ${topic}, let's explore how this knowledge applies to the real world.

Topics covered:
- Real-world examples of ${topic} in action
- How communities are addressing ${topic}
- Individual actions we can take
- Global initiatives and policies

Everyone can play a role in addressing climate change. By understanding ${topic}, we can make better choices and contribute to positive change.`,
        order: 3,
      },
    ],
    };
  }
};

// Helper function to normalize topic for question generation API
const normalizeTopicForAPI = (topic: string): { lesson_id: string; dataset_name: string } => {
  // Normalize topic: lowercase, trim, and convert spaces to underscores
  let normalized = topic.toLowerCase().trim();
  
  // Remove "Climate Education: " prefix if present
  normalized = normalized.replace(/^climate education:\s*/i, '');
  
  // Convert spaces to underscores for lesson_id format
  // e.g., "Austria Climate" -> "climate_austria" or "austria_climate"
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // If topic contains "climate" or country name, format as "climate_country" or "climate_topic"
  let lessonId: string;
  
  if (words.length > 1) {
    // Check if "climate" is in the topic
    const hasClimate = words.some(w => w.includes('climate'));
    const countryWords = words.filter(w => !w.includes('climate'));
    
    if (hasClimate && countryWords.length > 0) {
      // Format: "climate_country" (e.g., "climate_austria")
      lessonId = `climate_${countryWords.join('_')}`;
    } else if (hasClimate) {
      // Just "climate" or "climate something"
      lessonId = words.join('_');
    } else {
      // No "climate" keyword, format as "climate_topic" (e.g., "climate_austria" if topic is "Austria")
      lessonId = `climate_${words.join('_')}`;
    }
  } else {
    // Single word - prepend "climate_" if not already present
    if (normalized.includes('climate')) {
      lessonId = normalized;
    } else {
      lessonId = `climate_${normalized}`;
    }
  }
  
  // Use "climate" dataset (which maps to climate_headlines dataset)
  return {
    lesson_id: lessonId,
    dataset_name: 'climate'
  };
};

export const generateQuiz = async (
  courseContent: CourseContent,
  numQuestions: number = 5,
  originalTopic?: string // Pass the original topic from course creation
): Promise<QuizContent> => {
  try {
    // Use original topic if provided, otherwise extract from title
    const topicToUse = originalTopic || courseContent.title.replace(/^Climate Education:\s*/i, '').trim();
    
    // Normalize topic for API
    const { lesson_id, dataset_name } = normalizeTopicForAPI(topicToUse);
    
    console.log(`[Quiz Generation] Original topic: "${topicToUse}" -> lesson_id: "${lesson_id}", dataset: "${dataset_name}"`);
    
    // Use question generation API
    const QUESTION_API_URL = process.env.QUESTION_API_URL || 'http://localhost:5001';
    
    // Build request body (always include dataset_name)
    const requestBody: any = {
      lesson_id: lesson_id,
      person_id: 'course_creator',
      dataset_name: dataset_name, // Always include dataset_name
      num_questions: Math.min(Math.max(1, numQuestions), 20),
      question_type: 'comprehensive',
      difficulty: 'medium',
      use_rag: true,
      context_k: 5,
    };
    
    console.log(`[Quiz Generation] Request to ${QUESTION_API_URL}/generate-questions:`, JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      `${QUESTION_API_URL}/generate-questions`,
      requestBody,
      {
        timeout: 120000, // 2 minute timeout
      }
    );

    const data = response.data;

    console.log(`[Quiz Generation] Response status: ${data.status}, questions: ${data.questions?.length || 0}`);

    if (data.status !== 'success' || !data.questions || data.questions.length === 0) {
      console.warn(`[Quiz Generation] No questions generated: ${data.message || 'Unknown error'}`);
      throw new Error(data.message || 'Failed to generate questions');
    }

    // Transform questions to match quiz format
    const transformedQuestions: QuizQuestion[] = data.questions.map((q: any, index: number) => {
      // Determine question type
      let type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' = 'MULTIPLE_CHOICE';
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

      // Handle correct answer
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
        question: q.question || '',
        type: type,
        options: options,
        correctAnswer: correctAnswer,
        explanation: q.context_reference || q.explanation || `The correct answer is based on the course content about ${lesson_id}.`,
      };
    });

    return {
      title: `Quiz: ${courseContent.title}`,
      questions: transformedQuestions,
    };
  } catch (error) {
    console.error('Error generating quiz with question API:', error);
    console.log('Falling back to default quiz');
    
    // Fallback to default quiz if API fails
  return {
    title: `Quiz: ${courseContent.title}`,
    questions: [
      {
        question: `What is the main topic of this course?`,
        type: 'MULTIPLE_CHOICE' as const,
        options: ['Climate change', 'Weather patterns', 'Ocean currents', 'Solar energy'],
        correctAnswer: 0,
        explanation: `This course focuses on climate change and its various aspects, specifically ${courseContent.title.replace('Climate Education: ', '')}.`,
      },
      {
        question: `Understanding climate change is important for making informed decisions.`,
        type: 'TRUE_FALSE' as const,
        correctAnswer: 'true',
        explanation: 'True. Understanding climate change helps us make informed decisions about our environment and future.',
      },
      {
        question: `How many lessons are typically in this course?`,
        type: 'MULTIPLE_CHOICE' as const,
        options: ['1 lesson', '2 lessons', '3 lessons', '5 lessons'],
        correctAnswer: 2,
        explanation: `This course contains ${courseContent.lessons.length} lessons that progressively build understanding.`,
      },
      {
        question: `Climate change only affects certain parts of the world.`,
        type: 'TRUE_FALSE' as const,
        correctAnswer: 'false',
        explanation: 'False. Climate change affects the entire planet, though impacts may vary by region.',
      },
      {
        question: `What can individuals do to address climate change?`,
        type: 'MULTIPLE_CHOICE' as const,
        options: ['Nothing, it\'s too late', 'Make sustainable choices', 'Ignore the problem', 'Wait for others to act'],
        correctAnswer: 1,
        explanation: 'Everyone can make sustainable choices to help address climate change. Individual actions, when combined, can make a significant difference.',
      },
    ],
  };
  }
};

export const generateFeedback = async (
  quizScore: number,
  quizTitle: string,
  studentName: string,
  incorrectAnswers: number
): Promise<string> => {
  // OpenAI API calls commented out - using fallback feedback for now
  // try {
  //   const prompt = `Generate personalized, encouraging feedback for a student named ${studentName} who completed the quiz "${quizTitle}".
  //
  // Quiz Score: ${quizScore}%
  // Incorrect Answers: ${incorrectAnswers}
  //
  // Requirements:
  // - Be encouraging and supportive
  // - Acknowledge what they did well
  // - Provide constructive guidance if they scored below 80%
  // - Celebrate their achievement if they scored well
  // - Keep it concise (2-3 sentences)
  // - Make it personalized and warm
  //
  // Return only the feedback text, no JSON format.`;
  //
  //   const completion = await openai.chat.completions.create({
  //     model: 'gpt-4o-mini',
  //     messages: [
  //       {
  //         role: 'system',
  //         content: 'You are a supportive and encouraging teacher providing feedback to students.',
  //       },
  //       {
  //         role: 'user',
  //         content: prompt,
  //       },
  //     ],
  //     temperature: 0.8,
  //   });
  //
  //   const feedback = completion.choices[0]?.message?.content || 'Great job completing the quiz! Keep up the good work.';
  //   return feedback;
  // } catch (error) {
  //   console.error('Error generating feedback:', error);
  //   return `Great job completing the quiz! You scored ${quizScore}%. Keep learning and exploring!`;
  // }
  
  // Using fallback feedback (OpenAI disabled for now)
  if (quizScore >= 80) {
    return `Excellent work, ${studentName}! You scored ${quizScore}% on "${quizTitle}". You've demonstrated a strong understanding of the material. Keep up the great work and continue exploring climate science!`;
  } else if (quizScore >= 70) {
    return `Good job, ${studentName}! You scored ${quizScore}% on "${quizTitle}". You're on the right track! Review the material and try again to improve your score. Remember, learning is a journey!`;
  } else {
    return `Thanks for completing the quiz, ${studentName}! You scored ${quizScore}%. Don't worry - every attempt is a learning opportunity. Review the course material and try again. You've got this!`;
  }
};


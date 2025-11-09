const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        // Handle different error formats - prioritize message field for user-friendly errors
        let errorMessage = 'Unknown error';
        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData?.message) {
          // Backend now provides user-friendly messages
          errorMessage = errorData.message;
        } else if (errorData?.error) {
          if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (Array.isArray(errorData.error)) {
            errorMessage = errorData.error.map((e: any) => e.message || JSON.stringify(e)).join(', ');
          } else {
            errorMessage = JSON.stringify(errorData.error);
          }
        } else {
          errorMessage = `HTTP error! status: ${response.status}`;
        }
        // Preserve error structure for frontend error handling
        const error: any = new Error(errorMessage);
        error.error = errorData?.error;
        error.message = errorData?.message || errorMessage;
        error.status = response.status;
        throw error;
      }

      return response.json();
    } catch (error: any) {
      // Handle network errors (backend not available)
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Unable to connect to server. Please make sure the backend is running.');
      }
      throw error;
    }
  }

  // Auth
  async signup(data: { email: string; password: string; name: string; role?: string; gradeLevel?: string }) {
    const result = await this.request<{ user: any; token: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(result.token);
    return result;
  }

  async login(data: { email: string; password: string }) {
    const result = await this.request<{ user: any; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(result.token);
    return result;
  }

  async getCurrentUser() {
    return this.request<{ user: any }>('/auth/me');
  }

  // Groups
  async createGroup(data: { name: string; description?: string }) {
    return this.request<{ group: any }>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGroups() {
    return this.request<{ groups: any[] }>('/groups');
  }

  async joinGroup(code: string) {
    return this.request<{ membership: any }>('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async getGroup(id: string) {
    return this.request<{ group: any }>(`/groups/${id}`);
  }

  // Courses
  async createCourse(data: {
    title?: string;
    description?: string;
    topic: string;
    gradeLevel?: string;
    duration?: string;
    groupId?: string;
  }) {
    return this.request<{ course: any; quiz: any }>('/courses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getCourses() {
    return this.request<{ courses: any[] }>('/courses');
  }

  async getCourse(id: string) {
    return this.request<{ course: any }>(`/courses/${id}`);
  }

  async enrollInCourse(id: string) {
    return this.request<{ enrollment: any }>(`/courses/${id}/enroll`, {
      method: 'POST',
    });
  }

  async enrollStudentInCourse(courseId: string, studentId: string) {
    return this.request<{ enrollment: any }>(`/courses/${courseId}/enroll-student`, {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    });
  }

  async getCourseStudents(courseId: string) {
    return this.request<{ enrolled: any[]; available: any[] }>(`/courses/${courseId}/students`);
  }

  async updateCourseProgress(id: string, progress: number) {
    return this.request<{ enrollment: any }>(`/courses/${id}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ progress }),
    });
  }

  async updateCourseContent(id: string, content: any) {
    return this.request<{ course: any }>(`/courses/${id}/content`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  // Quizzes
  async getQuizByCourse(courseId: string) {
    return this.request<{ quiz: any }>(`/quizzes/course/${courseId}`);
  }

  async submitQuiz(quizId: string, answers: Record<string, string | number | boolean>) {
    return this.request<{ attempt: any }>(`/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  async regenerateQuiz(quizId: string) {
    return this.request<{ quiz: any }>(`/quizzes/${quizId}/regenerate`, {
      method: 'POST',
    });
  }

  async getQuizAttempts() {
    return this.request<{ attempts: any[] }>('/quizzes/attempts');
  }

  async getCourseQuizAttempts(courseId: string) {
    return this.request<{ attempts: any[] }>(`/quizzes/course/${courseId}/attempts`);
  }

  // Badges
  async getMyBadges() {
    return this.request<{ badges: any[] }>('/badges/me');
  }

  async getAvailableBadges() {
    return this.request<{ badges: any[] }>('/badges/available');
  }

  // Users
  async getUserProfile() {
    return this.request<{ user: any }>('/users/profile');
  }

  // Admin
  async getAdminUsers(page?: number, limit?: number, search?: string, role?: string) {
    const params = new URLSearchParams();
    if (page) params.append('page', page.toString());
    if (limit) params.append('limit', limit.toString());
    if (search) params.append('search', search);
    if (role) params.append('role', role);
    return this.request<{ users: any[]; pagination: any }>(`/admin/users?${params.toString()}`);
  }

  async getAdminUser(id: string) {
    return this.request<{ user: any }>(`/admin/users/${id}`);
  }

  async updateUserRole(id: string, role: 'STUDENT' | 'TEACHER' | 'ADMIN') {
    return this.request<{ user: any }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async deleteUser(id: string) {
    return this.request<{ message: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminCourses(status?: string) {
    const params = status ? `?status=${status}` : '';
    return this.request<{ courses: any[] }>(`/admin/courses${params}`);
  }

  async updateCourseStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') {
    return this.request<{ course: any }>(`/admin/courses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async deleteCourse(id: string) {
    return this.request<{ message: string }>(`/admin/courses/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminGroups() {
    return this.request<{ groups: any[] }>('/admin/groups');
  }

  async deleteGroup(id: string) {
    return this.request<{ message: string }>(`/admin/groups/${id}`, {
      method: 'DELETE',
    });
  }

  async getAdminStats() {
    return this.request<{ stats: any }>('/admin/stats');
  }

  async assignStudentToTeacher(studentId: string, teacherId: string) {
    return this.request<{ group: any; membership: any }>('/admin/assign-student', {
      method: 'POST',
      body: JSON.stringify({ studentId, teacherId }),
    });
  }

  // TTS (Text-to-Speech)
  async textToSpeech(data: {
    text: string;
    voice_id?: string;
    gender?: 'male' | 'female';
    model_id?: string;
    stability?: number;
    similarity_boost?: number;
  }): Promise<Blob> {
    const url = `${this.baseUrl}/tts`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      let errorMessage = 'Failed to generate speech';
      if (errorData?.message) {
        errorMessage = errorData.message;
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      }
      throw new Error(errorMessage);
    }

    return response.blob();
  }

  async getTTSVoices() {
    return this.request<{
      status: string;
      voices: Array<{
        voice_id: string;
        name: string;
        category: string;
        description?: string;
        preview_url?: string;
        gender?: string;
      }>;
      voices_by_gender?: {
        male: any[];
        female: any[];
        other: any[];
      };
      summary?: {
        total: number;
        male: number;
        female: number;
        other: number;
      };
    }>('/tts/voices');
  }

  // Question Generation
  async generateQuestions(data: {
    lesson_id: string;
    person_id: string;
    num_questions?: number;
    dataset_name?: string;
    question_type?: string;
    difficulty?: string;
    use_rag?: boolean;
    context_k?: number;
  }) {
    return this.request<{
      lesson_id: string;
      person_id: string;
      questions: Array<{
        id?: string;
        question: string;
        type: string;
        options: string[];
        correctAnswer: string | number;
        explanation: string;
      }>;
      status: string;
      message: string;
      context_used: boolean;
      context_snippets?: string[];
    }>('/questions/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Learning Material Generation
  async generateLearningMaterial(data: {
    lesson_id: string;
    person_id: string;
    material_type?: 'summary' | 'detailed' | 'comprehensive';
    difficulty?: 'easy' | 'medium' | 'hard';
    length?: 'short' | 'medium' | 'long';
    dataset_name?: string;
    use_rag?: boolean;
    context_k?: number;
  }) {
    return this.request<{
      lesson_id: string;
      person_id: string;
      learning_material: {
        title: string;
        introduction: string;
        content: string;
        key_points: string[];
        conclusion: string;
        sources?: string[];
      };
      status: string;
      context_used: boolean;
      parameters_used: Record<string, any>;
      statistics?: Record<string, any>;
    }>('/learning-material/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Chat - Streaming response
  async chatStream(
    message: string,
    onChunk: (chunk: string) => void,
    onVisualization: (type: 'chart' | 'map' | null) => void,
    onComplete: (fullResponse: string) => void,
    onError: (error: string) => void
  ): Promise<void> {
    const url = `${this.baseUrl}/chat`;
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || 'Failed to get response from chatbot');
      }

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let visualizationType: 'chart' | 'map' | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6); // Remove 'data: ' prefix
            try {
              const data = JSON.parse(dataStr);

              // Handle visualization event
              if (data.type === 'viz') {
                visualizationType = data.visualization || null;
                onVisualization(visualizationType);
              }
              // Handle content chunks
              else if (data.content !== undefined) {
                if (data.done) {
                  // Final event
                  onComplete(data.full_response || fullResponse);
                } else {
                  // Content chunk
                  fullResponse += data.content;
                  onChunk(data.content);
                }
              }
              // Handle error
              else if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseError) {
              // Skip invalid JSON lines
              console.warn('Failed to parse SSE data:', dataStr);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Chat stream error:', error);
      onError(error.message || 'Failed to get response from chatbot');
    }
  }

  // Clear conversation history
  async clearChat() {
    return this.request<{ message: string }>('/chat/clear', {
      method: 'POST',
    });
  }

  // Get personalized quiz feedback
  async getQuizFeedback(data: {
    quiz: {
      questions: Array<{
        question: string;
        options: string[];
        correct_answer: string;
        context_reference?: string;
      }>;
    };
    student_answers: Record<string, string>;
    score: number;
    total_questions: number;
    lesson_id?: string;
    session_id?: string;
  }) {
    return this.request<{
      status: string;
      session_id?: string;
      feedback: string;
      summary: {
        score: number;
        total_questions: number;
        percentage: number;
        correct_count: number;
        wrong_count: number;
      };
      wrong_answers_count: number;
      wrong_answers: Array<{
        question_index: number;
        question: string;
        student_answer: string;
        correct_answer: string;
        options: string[];
        context_reference?: string;
      }>;
    }>('/quiz/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Visualization API methods
  async getAvailableCountries(): Promise<{ success: boolean; countries: string[] }> {
    return this.request<{ success: boolean; countries: string[] }>(
      '/visualization/countries'
    );
  }

  // Get combined temperature data (both absolute and change datasets)
  async getCombinedCountryTemperature(
    country: string
  ): Promise<{
    success: boolean;
    country: string;
    absolute_temperature?: {
      available: boolean;
      data: Array<{ year: number; temperature: number; change_from_start: number }>;
      statistics: {
        min_year: number;
        max_year: number;
        min_temp: number;
        max_temp: number;
        avg_temp: number;
        trend_per_century: number;
        total_change: number;
        data_points: number;
      };
    };
    temperature_change?: {
      available: boolean;
      data: Array<{ year: number; temperature_change: number }>;
      statistics: {
        min_year: number;
        max_year: number;
        min_change: number;
        max_change: number;
        avg_change: number;
        trend_per_century: number;
        total_change: number;
        data_points: number;
      };
    };
  }> {
    return this.request<{
      success: boolean;
      country: string;
      absolute_temperature?: {
        available: boolean;
        data: Array<{ year: number; temperature: number; change_from_start: number }>;
        statistics: {
          min_year: number;
          max_year: number;
          min_temp: number;
          max_temp: number;
          avg_temp: number;
          trend_per_century: number;
          total_change: number;
          data_points: number;
        };
      };
      temperature_change?: {
        available: boolean;
        data: Array<{ year: number; temperature_change: number }>;
        statistics: {
          min_year: number;
          max_year: number;
          min_change: number;
          max_change: number;
          avg_change: number;
          trend_per_century: number;
          total_change: number;
          data_points: number;
        };
      };
    }>(`/visualization/combined-country-temperature?country=${encodeURIComponent(country)}`);
  }

  // Legacy method - kept for backward compatibility
  async getCountryTemperature(
    country: string,
    startYear?: number,
    endYear?: number
  ): Promise<{
    success: boolean;
    country: string;
    data: Array<{ year: number; temperature: number; change_from_start: number }>;
    statistics: {
      min_year: number;
      max_year: number;
      min_temp: number;
      max_temp: number;
      avg_temp: number;
      trend_per_century: number;
      total_change: number;
      data_points: number;
    };
  }> {
    const params = new URLSearchParams({ country });
    if (startYear) params.append('start_year', startYear.toString());
    if (endYear) params.append('end_year', endYear.toString());
    
    return this.request<{
      success: boolean;
      country: string;
      data: Array<{ year: number; temperature: number; change_from_start: number }>;
      statistics: {
        min_year: number;
        max_year: number;
        min_temp: number;
        max_temp: number;
        avg_temp: number;
        trend_per_century: number;
        total_change: number;
        data_points: number;
      };
    }>(`/visualization/country-temperature?${params.toString()}`);
  }
}

export const api = new ApiClient(API_BASE_URL);


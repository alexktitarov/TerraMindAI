import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, CheckCircle, BookOpen, Edit, Save, X, Volume2, Users, UserPlus } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QuizComponent from "@/components/Quiz";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CourseDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState<any>(null);
  const [showTTSDialog, setShowTTSDialog] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<'male' | 'female'>('female');
  const [ttsVolume, setTtsVolume] = useState([75]); // Volume as percentage (0-100)
  const [isReadingAloud, setIsReadingAloud] = useState(false); // Track if TTS is active
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false); // Track if TTS is being generated
  const audioRef = useRef<HTMLAudioElement | null>(null); // Reference to audio element
  const audioUrlRef = useRef<string | null>(null); // Reference to audio blob URL
  const [showAssignStudents, setShowAssignStudents] = useState(false);

  const { data: courseData, isLoading, error: courseError } = useQuery({
    queryKey: ['course', id],
    queryFn: async () => {
      const data = await api.getCourse(id!);
      return data;
    },
    enabled: !!id,
  });

  const course = courseData?.course;
  const requiresEnrollment = course?.requiresEnrollment || !course?.content;
  
  // Handle course content - could be a string (needs parsing) or already an object
  let courseContent: any = { lessons: [] };
  if (course?.content) {
    try {
      if (typeof course.content === 'string') {
        courseContent = JSON.parse(course.content);
      } else if (typeof course.content === 'object') {
        courseContent = course.content;
      }
    } catch (error) {
      console.error('Error parsing course content:', error);
      courseContent = { lessons: [] };
    }
  }
  
  // Initialize edited content when entering edit mode
  useEffect(() => {
    if (isEditMode && !editedContent && courseContent && courseContent.lessons) {
      setEditedContent(JSON.parse(JSON.stringify(courseContent)));
    }
  }, [isEditMode, courseContent]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      // Stop audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      // Clean up blob URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
    };
  }, []);

  const displayContent = isEditMode && editedContent ? editedContent : courseContent;
  const lessons = displayContent.lessons || [];
  const currentLesson = lessons[currentLessonIndex];

  // Function to generate and play TTS audio
  const startSpeech = useCallback(async () => {
    if (!currentLesson || !currentLesson.content) {
      toast({
        title: "Error",
        description: "No lesson content found.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGeneratingTTS(true);
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Clean up previous blob URL
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      // Generate TTS audio using API
      const audioBlob = await api.textToSpeech({
        text: currentLesson.content,
        gender: ttsVoice,
        stability: 0.5,
        similarity_boost: 0.75,
      });

      // Create blob URL for audio
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      // Create and configure audio element
      const audio = new Audio(audioUrl);
      audio.volume = ttsVolume[0] / 100; // Convert percentage to 0-1 range
      
      // Set up event handlers
      audio.onended = () => {
        setIsReadingAloud(false);
        setIsGeneratingTTS(false);
        // Clean up
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
      };

      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        setIsReadingAloud(false);
        setIsGeneratingTTS(false);
        toast({
          title: "Audio Playback Error",
          description: "An error occurred while playing audio. Please try again.",
          variant: "destructive",
        });
        // Clean up
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        audioRef.current = null;
      };

      audio.onplay = () => {
        setIsReadingAloud(true);
        setIsGeneratingTTS(false);
      };

      // Store reference and play
      audioRef.current = audio;
      await audio.play();

    } catch (error: any) {
      console.error('TTS generation error:', error);
      setIsGeneratingTTS(false);
      setIsReadingAloud(false);
      
      let errorMessage = "Failed to generate speech. Please try again.";
      if (error?.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Text-to-Speech Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [currentLesson, ttsVoice, ttsVolume, toast]);

  // Stop speech
  const stopSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsReadingAloud(false);
    setIsGeneratingTTS(false);
    
    // Clean up blob URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  // Update audio volume when volume changes
  useEffect(() => {
    if (audioRef.current && isReadingAloud) {
      audioRef.current.volume = ttsVolume[0] / 100;
    }
  }, [ttsVolume, isReadingAloud]);

  // Stop audio when lesson changes
  useEffect(() => {
    stopSpeech();
  }, [currentLessonIndex, stopSpeech]);
  
  // Check if user is teacher/admin
  const isTeacherOrAdmin = user?.role === 'TEACHER' || user?.role === 'ADMIN';
  const isCreator = course?.creatorId === user?.id;

  const { data: enrollmentData } = useQuery({
    queryKey: ['enrollment', id],
    queryFn: async () => {
      try {
        const courses = await api.getCourses();
        const course = courses.courses.find((c: any) => c.id === id);
        return course?.enrollments?.[0] || null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  const enrollment = enrollmentData;
  const progress = enrollment?.progress || 0;

  const handleNextLesson = async () => {
    if (currentLessonIndex < lessons.length - 1) {
      setCurrentLessonIndex(currentLessonIndex + 1);
      // Update progress
      const newProgress = ((currentLessonIndex + 1) / lessons.length) * 100;
      try {
        await api.updateCourseProgress(id!, Math.min(newProgress, 100));
      } catch (error) {
        console.error('Failed to update progress:', error);
      }
    } else {
      // All lessons completed, mark course as 100% and show quiz
      try {
        await api.updateCourseProgress(id!, 100);
        toast({
          title: "Lessons Complete!",
          description: "Great job! Now let's test your knowledge with a quiz.",
        });
        // Small delay to show the toast, then show quiz
        setTimeout(() => {
          setShowQuiz(true);
        }, 1000);
      } catch (error) {
        console.error('Failed to update progress:', error);
        // Still show quiz even if progress update fails
        setShowQuiz(true);
      }
    }
  };

  const handlePreviousLesson = () => {
    if (currentLessonIndex > 0) {
      setCurrentLessonIndex(currentLessonIndex - 1);
    }
  };

  const handleQuizComplete = async () => {
    try {
      // Ensure course is marked as completed
      await api.updateCourseProgress(id!, 100);
      setQuizCompleted(true);
      setShowQuiz(false);
    } catch (error) {
      console.error('Failed to update progress:', error);
      // Still show completion screen even if progress update fails
      setQuizCompleted(true);
      setShowQuiz(false);
    }
  };

  const updateContentMutation = useMutation({
    mutationFn: async (content: any) => {
      return await api.updateCourseContent(id!, content);
    },
    onSuccess: () => {
      toast({
        title: "Course updated",
        description: "Course content has been successfully updated.",
      });
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      setIsEditMode(false);
      setEditedContent(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update course content",
        variant: "destructive",
      });
    },
  });

  const handleSaveContent = () => {
    if (editedContent) {
      updateContentMutation.mutate(editedContent);
    }
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditedContent(null);
  };

  const handleLessonChange = (index: number, field: string, value: string) => {
    if (editedContent) {
      const updated = JSON.parse(JSON.stringify(editedContent));
      if (updated.lessons[index]) {
        updated.lessons[index][field] = value;
        setEditedContent(updated);
      }
    }
  };

  const handleAddLesson = () => {
    if (editedContent) {
      const updated = JSON.parse(JSON.stringify(editedContent));
      updated.lessons.push({
        title: "New Lesson",
        content: "Lesson content here...",
      });
      setEditedContent(updated);
      setCurrentLessonIndex(updated.lessons.length - 1);
    }
  };

  const handleDeleteLesson = (index: number) => {
    if (editedContent && editedContent.lessons.length > 1) {
      const updated = JSON.parse(JSON.stringify(editedContent));
      updated.lessons.splice(index, 1);
      setEditedContent(updated);
      if (currentLessonIndex >= updated.lessons.length) {
        setCurrentLessonIndex(Math.max(0, updated.lessons.length - 1));
      }
    }
  };

  // Get students for assignment
  const { data: studentsData, refetch: refetchStudents } = useQuery({
    queryKey: ['courseStudents', id],
    queryFn: async () => {
      if (!id) return { enrolled: [], available: [] };
      return await api.getCourseStudents(id);
    },
    enabled: !!id && (isCreator || user?.role === 'ADMIN'),
  });

  const enrolledStudents = studentsData?.enrolled || [];
  const availableStudents = studentsData?.available || [];

  // Enroll student mutation
  const enrollStudentMutation = useMutation({
    mutationFn: async (studentId: string) => {
      return await api.enrollStudentInCourse(id!, studentId);
    },
    onSuccess: () => {
      toast({
        title: "Student enrolled",
        description: "Student has been successfully enrolled in this course.",
      });
      refetchStudents();
      queryClient.invalidateQueries({ queryKey: ['course', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Enrollment failed",
        description: error?.message || error?.error || "Failed to enroll student.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">Loading course...</div>
        </div>
      </div>
    );
  }

  // Check for grade level mismatch error
  if (courseError) {
    const errorData = courseError as any;
    const isGradeLevelMismatch = errorData?.error === 'Grade level mismatch' || 
                                  errorData?.message?.toLowerCase().includes('grade level');
    
    if (isGradeLevelMismatch) {
      return (
        <div className="min-h-screen bg-background">
          <Navigation />
          <div className="container mx-auto px-6 py-16">
            <div className="mb-6">
              <Button variant="ghost" onClick={() => navigate('/learn')}>
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Courses
              </Button>
            </div>
            
            <Card className="max-w-2xl mx-auto border-0">
              <CardHeader className="text-center">
                <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-10 h-10 text-destructive" />
                </div>
                <CardTitle className="text-2xl mb-2">Grade Level Mismatch</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-6">
                <div className="p-6 bg-destructive/10 rounded-lg border border-destructive/20">
                  <p className="body-large font-semibold mb-2 text-destructive">Access Restricted</p>
                  <p className="body-small text-text-secondary">
                    {errorData?.message || "This course is not available for your grade level."}
                  </p>
                </div>
                <Button onClick={() => navigate('/learn')} className="w-full">
                  Back to Courses
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">
            <p>Course not found</p>
            <Button onClick={() => navigate('/learn')}>Back to Courses</Button>
          </div>
        </div>
      </div>
    );
  }

  if (showQuiz && !quizCompleted) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="mb-6">
            <Button variant="ghost" onClick={() => setShowQuiz(false)}>
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Course
            </Button>
          </div>
          <QuizComponent courseId={course.id} onComplete={handleQuizComplete} />
        </div>
      </div>
    );
  }

  if (quizCompleted) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <Card className="max-w-2xl mx-auto border-0">
            <CardHeader className="text-center">
              <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
              <CardTitle className="text-2xl">Course Completed!</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="body-large text-text-secondary">
                Congratulations! You've completed "{course.title}"
              </p>
              <div className="flex gap-4 justify-center">
                <Button onClick={() => navigate('/learn')}>
                  Back to Courses
                </Button>
                <Button variant="outline" onClick={() => navigate('/progress')}>
                  View Progress
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show enrollment prompt for students who are not enrolled
  const isStudent = user?.role === 'STUDENT';
  const needsEnrollment = isStudent && requiresEnrollment && !enrollment;

  const handleEnroll = async () => {
    try {
      await api.enrollInCourse(id!);
      toast({
        title: "Enrolled!",
        description: "You've successfully enrolled in this course.",
      });
      // Refetch course data to get content
      queryClient.invalidateQueries({ queryKey: ['course', id] });
      queryClient.invalidateQueries({ queryKey: ['enrollment', id] });
    } catch (error: any) {
      const errorMessage = error?.message || error?.error || "Failed to enroll in course";
      toast({
        title: error?.error === 'Grade level mismatch' ? "Grade Level Mismatch" : "Enrollment failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  if (needsEnrollment) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="mb-6">
            <Button variant="ghost" onClick={() => navigate('/learn')}>
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Courses
            </Button>
          </div>
          
          <Card className="max-w-2xl mx-auto border-0">
            <CardHeader className="text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <BookOpen className="w-10 h-10 text-primary" />
              </div>
              <CardTitle className="text-2xl mb-2">{course.title}</CardTitle>
              <p className="body-large text-text-secondary">{course.description}</p>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <div className="p-6 bg-muted rounded-lg">
                <p className="body-large font-semibold mb-2">Enrollment Required</p>
                <p className="body-small text-text-secondary">
                  You need to enroll in this course to access the content and start learning.
                </p>
              </div>
              <Button size="lg" onClick={handleEnroll} className="w-full">
                Enroll in Course
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/learn')}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Courses
          </Button>
          {isTeacherOrAdmin && (isCreator || user?.role === 'ADMIN') && (
            <div className="flex gap-2">
              {!isEditMode ? (
                <>
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAssignStudents(true)}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Manage Students
                  </Button>
                  <Button onClick={() => {
                    setIsEditMode(true);
                    if (courseContent && courseContent.lessons) {
                      setEditedContent(JSON.parse(JSON.stringify(courseContent)));
                    }
                  }}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit Course
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={handleCancelEdit}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={handleSaveContent} disabled={updateContentMutation.isPending}>
                    <Save className="w-4 h-4 mr-2" />
                    {updateContentMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
          <p className="body-large text-text-secondary">{course.description || displayContent.description}</p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="caption text-text-secondary">
              {isEditMode ? "EDITING MODE" : "COURSE PROGRESS"}
            </span>
            <span className="font-semibold text-foreground">
              Lesson {currentLessonIndex + 1} of {lessons.length}
            </span>
          </div>
          {!isEditMode && (
            <ProgressBar value={((currentLessonIndex + 1) / lessons.length) * 100} className="h-3" />
          )}
          {isEditMode && (
            <div className="flex gap-2 flex-wrap mt-2">
              {lessons.map((lesson: any, index: number) => (
                <Button
                  key={index}
                  variant={currentLessonIndex === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentLessonIndex(index)}
                >
                  Lesson {index + 1}
                </Button>
              ))}
            </div>
          )}
        </div>

        {currentLesson && (
          <Card className="border-0 mb-6">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-primary" />
                  {isEditMode ? (
                    <Input
                      value={currentLesson?.title || ''}
                      onChange={(e) => handleLessonChange(currentLessonIndex, 'title', e.target.value)}
                      className="text-xl font-bold w-full"
                    />
                  ) : (
                    <CardTitle>{currentLesson?.title || ''}</CardTitle>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {!isEditMode && (
                    <>
                      {isReadingAloud && (
                        <div className="flex items-center gap-2">
                          <Volume2 className="w-4 h-4 text-muted-foreground" />
                          <Slider
                            value={ttsVolume}
                            onValueChange={(newVolume) => {
                              setTtsVolume(newVolume);
                              // Volume change will trigger useEffect to restart speech
                            }}
                            max={100}
                            min={0}
                            step={1}
                            className="w-24"
                          />
                          <span className="text-xs text-muted-foreground font-semibold min-w-[3ch]">
                            {ttsVolume[0]}%
                          </span>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (isReadingAloud) {
                            // Stop reading
                            stopSpeech();
                            toast({
                              title: "Text-to-Speech",
                              description: "Reading stopped.",
                            });
                          } else {
                            // Open dialog to start reading
                            setShowTTSDialog(true);
                          }
                        }}
                        disabled={isGeneratingTTS}
                        className="flex items-center gap-2"
                      >
                        <Volume2 className="w-4 h-4" />
                        {isGeneratingTTS ? "Generating..." : isReadingAloud ? "Stop Reading" : "Read Aloud"}
                      </Button>
                      <Dialog open={showTTSDialog} onOpenChange={setShowTTSDialog}>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Text-to-Speech Settings</DialogTitle>
                            <DialogDescription>
                              Choose your preferred voice for reading the lesson aloud.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="voice-select">Voice Type</Label>
                              <Select
                                value={ttsVoice}
                                onValueChange={(value: 'male' | 'female') => setTtsVoice(value)}
                              >
                                <SelectTrigger id="voice-select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="female">Female Voice</SelectItem>
                                  <SelectItem value="male">Male Voice</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="outline"
                              onClick={() => setShowTTSDialog(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={async () => {
                                if (!currentLesson) {
                                  toast({
                                    title: "Error",
                                    description: "No lesson content found.",
                                    variant: "destructive",
                                  });
                                  return;
                                }

                                setShowTTSDialog(false);
                                toast({
                                  title: "Text-to-Speech",
                                  description: `Generating audio with ${ttsVoice} voice. Please wait...`,
                                });
                                
                                await startSpeech();
                              }}
                              disabled={isGeneratingTTS}
                            >
                              {isGeneratingTTS ? "Generating..." : "Start Reading"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                  {/* Assign Students Dialog */}
                  {isCreator && (
                    <Dialog open={showAssignStudents} onOpenChange={setShowAssignStudents}>
                      <DialogContent className="sm:max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle>Manage Students</DialogTitle>
                          <DialogDescription>
                            Assign students to this course. Teachers can assign students from their groups, and admins can assign any student.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6 py-4">
                          {/* Enrolled Students */}
                          <div>
                            <h3 className="font-semibold mb-3">Enrolled Students ({enrolledStudents.length})</h3>
                            {enrolledStudents.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
                            ) : (
                              <div className="space-y-2 max-h-40 overflow-y-auto">
                                {enrolledStudents.map((student: any) => (
                                  <div key={student.id} className="flex items-center justify-between p-2 border rounded">
                                    <div>
                                      <p className="font-medium">{student.name}</p>
                                      <p className="text-sm text-muted-foreground">{student.email}</p>
                                      {student.gradeLevel && (
                                        <p className="text-xs text-muted-foreground capitalize">{student.gradeLevel}</p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Available Students */}
                          <div>
                            <h3 className="font-semibold mb-3">Available Students ({availableStudents.length})</h3>
                            {availableStudents.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                {user?.role === 'TEACHER' 
                                  ? "No students available. Students need to be in your groups first."
                                  : "No students available."}
                              </p>
                            ) : (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {availableStudents.map((student: any) => (
                                  <div key={student.id} className="flex items-center justify-between p-2 border rounded">
                                    <div>
                                      <p className="font-medium">{student.name}</p>
                                      <p className="text-sm text-muted-foreground">{student.email}</p>
                                      {student.gradeLevel && (
                                        <p className="text-xs text-muted-foreground capitalize">{student.gradeLevel}</p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => enrollStudentMutation.mutate(student.id)}
                                      disabled={enrollStudentMutation.isPending}
                                    >
                                      <UserPlus className="w-4 h-4 mr-2" />
                                      Assign
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button variant="outline" onClick={() => setShowAssignStudents(false)}>
                            Close
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                  {isEditMode && lessons.length > 1 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteLesson(currentLessonIndex)}
                    >
                      Delete Lesson
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isEditMode ? (
                <div className="space-y-4 mb-6">
                  <div>
                    <Label htmlFor="lesson-content">Lesson Content</Label>
                    <Textarea
                      id="lesson-content"
                      value={currentLesson?.content || ''}
                      onChange={(e) => handleLessonChange(currentLessonIndex, 'content', e.target.value)}
                      className="min-h-[300px] mt-2"
                    />
                  </div>
                </div>
              ) : (
                <div className="prose max-w-none mb-6">
                  <div className="whitespace-pre-wrap body-large text-foreground">
                    {currentLesson.content}
                  </div>
                </div>
              )}

              <div className="flex gap-4 justify-between pt-6 border-t">
                {isEditMode ? (
                  <>
                    <Button 
                      variant="secondary" 
                      onClick={handlePreviousLesson}
                      disabled={currentLessonIndex === 0}
                    >
                      <ArrowLeft className="w-5 h-5 mr-2" />
                      Previous Lesson
                    </Button>
                    <div className="flex gap-2">
                      <Button onClick={handleAddLesson}>
                        <BookOpen className="w-5 h-5 mr-2" />
                        Add New Lesson
                      </Button>
                      {currentLessonIndex < lessons.length - 1 && (
                        <Button onClick={handleNextLesson}>
                          Next Lesson
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </Button>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="secondary" 
                      onClick={handlePreviousLesson}
                      disabled={currentLessonIndex === 0}
                    >
                      <ArrowLeft className="w-5 h-5 mr-2" />
                      Previous
                    </Button>
                    <Button onClick={handleNextLesson}>
                      {currentLessonIndex < lessons.length - 1 ? (
                        <>
                          Next Lesson
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      ) : (
                        <>
                          Complete Course & Take Quiz
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CourseDetail;


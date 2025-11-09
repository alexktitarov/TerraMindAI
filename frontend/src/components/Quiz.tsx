import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle, XCircle, ArrowRight, BookOpen, MessageSquare, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface QuizProps {
  courseId: string;
  onComplete: () => void;
}

const QuizComponent = ({ courseId, onComplete }: QuizProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, string | number | boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState<any>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const { data: quizData, isLoading } = useQuery({
    queryKey: ['quiz', courseId],
    queryFn: async () => {
      const data = await api.getQuizByCourse(courseId);
      return data;
    },
  });

  const quiz = quizData?.quiz;
  // Handle questions - could be a string (needs parsing) or already an object/array
  let questions: any[] = [];
  if (quiz) {
    try {
      if (typeof quiz.questions === 'string') {
        questions = JSON.parse(quiz.questions);
      } else if (Array.isArray(quiz.questions)) {
        questions = quiz.questions;
      }
    } catch (error) {
      console.error('Error parsing quiz questions:', error);
      questions = [];
    }
  }

  const handleAnswer = (questionIndex: number, answer: string | number | boolean) => {
    if (submitted) return;
    setAnswers({
      ...answers,
      [questionIndex]: answer,
    });
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length !== questions.length) {
      toast({
        title: "Please answer all questions",
        description: "You need to answer all questions before submitting.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Convert numeric keys to string keys and handle boolean values for backend compatibility
      const answersForSubmission: Record<string, string | number | boolean> = {};
      Object.keys(answers).forEach((key) => {
        const value = answers[Number(key)];
        // Convert boolean to string for TRUE_FALSE questions if needed
        if (typeof value === 'boolean') {
          answersForSubmission[key.toString()] = value;
        } else {
          answersForSubmission[key.toString()] = value;
        }
      });
      
      const result = await api.submitQuiz(quiz.id, answersForSubmission);
      
      // Ensure attempt data is properly formatted
      const attemptData = {
        ...result.attempt,
        score: typeof result.attempt.score === 'number' ? result.attempt.score : parseFloat(result.attempt.score) || 0,
        passed: result.attempt.passed === true || result.attempt.passed === 'true',
        feedback: result.attempt.feedback || '',
      };
      
      setAttempt(attemptData);
      setSubmitted(true);
      
      toast({
        title: attemptData.passed ? "Quiz Passed!" : "Quiz Completed",
        description: `You scored ${attemptData.score.toFixed(1)}%`,
      });

      // Only allow completion if passed (60% or higher)
      if (!attemptData.passed) {
        toast({
          title: "Quiz Not Passed",
          description: `You need 60% or higher to complete the course. Please review the material and try again.`,
          variant: "destructive",
        });
      } else {
        // Auto-complete after 3 seconds if passed
        setTimeout(() => {
          onComplete();
        }, 3000);
      }
    } catch (error: any) {
      console.error('Quiz submission error:', error);
      toast({
        title: "Submission failed",
        description: error.message || "Failed to submit quiz",
        variant: "destructive",
      });
    }
  };

  const handleGetFeedback = async () => {
    if (!quiz || !attempt || !questions.length) return;

    setLoadingFeedback(true);
    setFeedback(null); // Clear previous feedback

    try {
      // Use attempt.questions if available (includes correct answers), otherwise use original questions
      const questionsWithAnswers = attempt.questions && Array.isArray(attempt.questions) 
        ? attempt.questions 
        : questions;

      // Calculate score from attempt
      const score = Math.round((attempt.score / 100) * questions.length);
      const correctCount = score;

      // Transform quiz questions to feedback API format
      const feedbackQuestions = questionsWithAnswers.map((q: any) => {
        // For MULTIPLE_CHOICE, get the correct answer text from options
        let correctAnswerText = '';
        const correctAnswer = q.correctAnswer !== undefined ? q.correctAnswer : q.correct_answer;
        
        if (q.type === 'MULTIPLE_CHOICE' && q.options) {
          const correctIndex = typeof correctAnswer === 'number' ? correctAnswer : Number(correctAnswer);
          if (!isNaN(correctIndex) && q.options[correctIndex]) {
            correctAnswerText = q.options[correctIndex];
          } else {
            correctAnswerText = String(correctAnswer);
          }
        } else if (q.type === 'TRUE_FALSE') {
          // For TRUE_FALSE, convert to string
          if (correctAnswer === true || correctAnswer === 'true' || correctAnswer === 1) {
            correctAnswerText = 'True';
          } else {
            correctAnswerText = 'False';
          }
        } else {
          correctAnswerText = String(correctAnswer);
        }

        return {
          question: q.question || '',
          options: q.options || [],
          correct_answer: correctAnswerText,
          context_reference: q.explanation || q.context_reference || q.context || '',
        };
      });

      // Transform student answers to feedback API format (string keys, answer text)
      const studentAnswersDict: Record<string, string> = {};
      questionsWithAnswers.forEach((q: any, index: number) => {
        // Use userAnswer from attempt if available, otherwise use answers state
        const userAnswer = q.userAnswer !== undefined ? q.userAnswer : answers[index];
        let answerText = '';
        
        if (q.type === 'MULTIPLE_CHOICE' && q.options) {
          // Get the answer text from options
          const answerIndex = typeof userAnswer === 'number' ? userAnswer : Number(userAnswer);
          if (!isNaN(answerIndex) && q.options[answerIndex]) {
            answerText = q.options[answerIndex];
          } else {
            answerText = String(userAnswer);
          }
        } else if (q.type === 'TRUE_FALSE') {
          // Convert boolean to text
          if (userAnswer === true || userAnswer === 'true' || userAnswer === 1) {
            answerText = 'True';
          } else {
            answerText = 'False';
          }
        } else {
          answerText = String(userAnswer);
        }
        
        studentAnswersDict[index.toString()] = answerText;
      });

      // Get lesson_id from course if available
      const lessonId = quiz.course?.title 
        ? quiz.course.title.replace(/^Climate Education:\s*/i, '').trim().toLowerCase().replace(/\s+/g, '_')
        : undefined;

      const feedbackData = await api.getQuizFeedback({
        quiz: {
          questions: feedbackQuestions,
        },
        student_answers: studentAnswersDict,
        score: correctCount,
        total_questions: questions.length,
        lesson_id: lessonId,
      });

      setFeedback(feedbackData);
    } catch (error: any) {
      console.error('Error getting feedback:', error);
      toast({
        title: "Failed to get feedback",
        description: error.message || "Failed to generate personalized feedback",
        variant: "destructive",
      });
      setFeedbackDialogOpen(false);
    } finally {
      setLoadingFeedback(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="max-w-3xl mx-auto border-0">
        <CardContent className="pt-12 pb-12 text-center">
          <p>Loading quiz...</p>
        </CardContent>
      </Card>
    );
  }

  if (!quiz) {
    return (
      <Card className="max-w-3xl mx-auto border-0">
        <CardContent className="pt-12 pb-12 text-center">
          <p>Quiz not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4">
      <Card className="border-0 mb-6 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="text-center">
          <div className="mb-4">
            <BookOpen className="w-12 h-12 text-primary mx-auto" />
          </div>
          <CardTitle className="text-3xl mb-2 break-words">{quiz.title}</CardTitle>
          {quiz.description && (
            <p className="text-text-secondary body-large break-words">{quiz.description}</p>
          )}
          <div className="mt-4">
            <Badge variant="outline" className="text-sm">
              {questions.length} {questions.length === 1 ? 'Question' : 'Questions'}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-6 mb-6">
        {questions.map((question: any, index: number) => {
          const userAnswer = answers[index];
          
          // Use attempt.questions if available (has correct answers), otherwise use original question
          // After submission, attempt.questions contains the full question data with correctAnswer
          const questionWithAnswer = submitted && attempt?.questions && Array.isArray(attempt.questions) && attempt.questions[index]
            ? attempt.questions[index]
            : question;
          
          const correctAnswer = questionWithAnswer.correctAnswer;
          
          // Determine if the user's answer is correct
          // Normalize both answers for comparison
          let normalizedUserAnswer: string | number | boolean = userAnswer;
          let normalizedCorrectAnswer: string | number | boolean = correctAnswer;
          
          // Convert boolean to string for comparison
          if (typeof userAnswer === 'boolean') {
            normalizedUserAnswer = userAnswer ? 'true' : 'false';
          }
          if (typeof correctAnswer === 'boolean') {
            normalizedCorrectAnswer = correctAnswer ? 'true' : 'false';
          }
          
          // Check if answer is correct
          let isCorrect = false;
          if (submitted && userAnswer !== undefined && correctAnswer !== undefined) {
            // Handle TRUE_FALSE questions
            if (question.type === 'TRUE_FALSE') {
              // For TRUE_FALSE, compare as boolean strings
              const userStr = String(normalizedUserAnswer).toLowerCase().trim();
              const correctStr = String(normalizedCorrectAnswer).toLowerCase().trim();
              isCorrect = userStr === correctStr;
            } else if (question.type === 'MULTIPLE_CHOICE') {
              // For MULTIPLE_CHOICE, compare as numbers (indices)
              const userNum = typeof normalizedUserAnswer === 'number' ? normalizedUserAnswer : Number(normalizedUserAnswer);
              const correctNum = typeof normalizedCorrectAnswer === 'number' ? normalizedCorrectAnswer : Number(normalizedCorrectAnswer);
              
              if (!isNaN(userNum) && !isNaN(correctNum)) {
                isCorrect = userNum === correctNum;
              } else {
                // Fallback to string comparison
                isCorrect = String(normalizedUserAnswer).toLowerCase().trim() === String(normalizedCorrectAnswer).toLowerCase().trim();
              }
            } else {
              // Generic comparison
              if (typeof normalizedUserAnswer === 'string' && typeof normalizedCorrectAnswer === 'string') {
                isCorrect = normalizedUserAnswer.toLowerCase().trim() === normalizedCorrectAnswer.toLowerCase().trim();
              } else {
                const userNum = typeof normalizedUserAnswer === 'number' ? normalizedUserAnswer : Number(normalizedUserAnswer);
                const correctNum = typeof normalizedCorrectAnswer === 'number' ? normalizedCorrectAnswer : Number(normalizedCorrectAnswer);
                
                if (!isNaN(userNum) && !isNaN(correctNum)) {
                  isCorrect = userNum === correctNum;
                } else {
                  isCorrect = String(normalizedUserAnswer) === String(normalizedCorrectAnswer);
                }
              }
            }
          }
          
          const isIncorrect = submitted && userAnswer !== undefined && !isCorrect;

          return (
            <Card key={index} className="border-0">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-lg flex-1 break-words">
                    Question {index + 1} of {questions.length}
                  </CardTitle>
                  {submitted && (
                    <Badge 
                      className={`flex-shrink-0 ${isCorrect ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
                    >
                      {isCorrect ? (
                        <CheckCircle className="w-4 h-4 mr-1" />
                      ) : (
                        <XCircle className="w-4 h-4 mr-1" />
                      )}
                      {isCorrect ? "Correct" : "Incorrect"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="font-semibold mb-4 text-base break-words leading-relaxed">{question.question}</p>
                
                <div className="space-y-3">
                  {question.type === 'MULTIPLE_CHOICE' && question.options?.map((option: string, optIndex: number) => {
                    const optionKey = optIndex;
                    const isSelected = userAnswer === optionKey;
                    const correctAnswerNum = typeof correctAnswer === 'number' ? correctAnswer : Number(correctAnswer);
                    const isCorrectOption = submitted && !isNaN(correctAnswerNum) && optIndex === correctAnswerNum;
                    const isIncorrectSelected = submitted && isSelected && !isCorrectOption;

                    return (
                      <button
                        key={optIndex}
                        className={`w-full flex justify-start items-start h-auto min-h-[60px] py-4 px-6 rounded-full transition-colors text-left border-2 ${
                          submitted && isCorrectOption
                            ? "bg-green-600 text-white hover:bg-green-700 border-green-700"
                            : submitted && isIncorrectSelected
                            ? "bg-red-600 text-white hover:bg-red-700 border-red-700"
                            : isSelected && !submitted
                            ? "bg-primary text-white hover:bg-primary/90 border-primary"
                            : submitted && !isSelected && !isCorrectOption
                            ? "border-gray-300 bg-card hover:bg-muted"
                            : "border-border bg-card hover:bg-muted text-foreground"
                        } ${submitted ? "cursor-default" : "cursor-pointer"}`}
                        style={{ 
                          whiteSpace: 'normal',
                          wordWrap: 'break-word',
                          overflowWrap: 'break-word',
                          height: 'auto',
                          lineHeight: '1.5',
                          alignItems: 'flex-start'
                        } as React.CSSProperties}
                        onClick={() => !submitted && handleAnswer(index, optionKey)}
                        disabled={submitted}
                      >
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 text-sm font-bold flex-shrink-0 ${
                          submitted && isCorrectOption
                            ? "bg-white/30"
                            : submitted && isIncorrectSelected
                            ? "bg-white/30"
                            : isSelected && !submitted
                            ? "bg-white/20"
                            : "bg-gray-200 dark:bg-gray-700"
                        }`} style={{ marginTop: '2px' }}>
                          {String.fromCharCode(65 + optIndex)}
                        </span>
                        <span className="flex-1 text-sm leading-relaxed pr-2 text-left" style={{ 
                          wordBreak: 'break-word', 
                          overflowWrap: 'break-word',
                          whiteSpace: 'normal',
                          display: 'block',
                          overflow: 'visible',
                          textOverflow: 'clip'
                        }}>{option}</span>
                        {submitted && isCorrectOption && (
                          <CheckCircle className="w-5 h-5 ml-3 flex-shrink-0" style={{ marginTop: '2px' }} />
                        )}
                        {submitted && isIncorrectSelected && (
                          <XCircle className="w-5 h-5 ml-3 flex-shrink-0" style={{ marginTop: '2px' }} />
                        )}
                      </button>
                    );
                  })}

                  {question.type === 'TRUE_FALSE' && (
                    <div className="space-y-3">
                      <Button
                        variant={userAnswer === true ? "default" : "outline"}
                        className={`w-full justify-start h-auto min-h-[60px] py-4 px-6 pr-8 transition-colors text-left ${
                          submitted && isCorrect && userAnswer === true
                            ? "bg-green-600 text-white hover:bg-green-700 border-2 border-green-700"
                            : submitted && !isCorrect && userAnswer === true
                            ? "bg-red-600 text-white hover:bg-red-700 border-2 border-red-700"
                            : submitted && !isCorrect && userAnswer !== true && (correctAnswer === 'true' || correctAnswer === 1 || (typeof correctAnswer === 'boolean' && correctAnswer === true))
                            ? "bg-green-600 text-white hover:bg-green-700 border-2 border-green-700"
                            : userAnswer === true && !submitted
                            ? "bg-primary text-white hover:bg-primary/90"
                            : ""
                        }`}
                        onClick={() => handleAnswer(index, true)}
                        disabled={submitted}
                      >
                        <span className="flex-1 text-base font-medium pr-4">True</span>
                        {submitted && isCorrect && userAnswer === true && (
                          <CheckCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                        {submitted && !isCorrect && userAnswer === true && (
                          <XCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                        {submitted && !isCorrect && userAnswer !== true && (correctAnswer === 'true' || correctAnswer === 1 || (typeof correctAnswer === 'boolean' && correctAnswer === true)) && (
                          <CheckCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                      </Button>
                      <Button
                        variant={userAnswer === false ? "default" : "outline"}
                        className={`w-full justify-start h-auto min-h-[60px] py-4 px-6 pr-8 transition-colors text-left ${
                          submitted && isCorrect && userAnswer === false
                            ? "bg-green-600 text-white hover:bg-green-700 border-2 border-green-700"
                            : submitted && !isCorrect && userAnswer === false
                            ? "bg-red-600 text-white hover:bg-red-700 border-2 border-red-700"
                            : submitted && !isCorrect && userAnswer !== false && (correctAnswer === 'false' || correctAnswer === 0 || (typeof correctAnswer === 'boolean' && correctAnswer === false))
                            ? "bg-green-600 text-white hover:bg-green-700 border-2 border-green-700"
                            : userAnswer === false && !submitted
                            ? "bg-primary text-white hover:bg-primary/90"
                            : ""
                        }`}
                        onClick={() => handleAnswer(index, false)}
                        disabled={submitted}
                      >
                        <span className="flex-1 text-base font-medium pr-4">False</span>
                        {submitted && isCorrect && userAnswer === false && (
                          <CheckCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                        {submitted && !isCorrect && userAnswer === false && (
                          <XCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                        {submitted && !isCorrect && userAnswer !== false && (correctAnswer === 'false' || correctAnswer === 0 || (typeof correctAnswer === 'boolean' && correctAnswer === false)) && (
                          <CheckCircle className="w-5 h-5 ml-2 flex-shrink-0" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {submitted && question.explanation && (
                  <div className="mt-4 p-4 bg-muted rounded-lg">
                    <p className="text-sm font-semibold mb-2">Explanation:</p>
                    <p className="text-sm text-text-secondary break-words leading-relaxed">{question.explanation}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {attempt && (
        <Card className="border-0 mb-6 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="text-4xl font-extrabold text-primary">
                {typeof attempt.score === 'number' ? attempt.score.toFixed(1) : parseFloat(attempt.score || 0).toFixed(1)}%
              </div>
              <div className="text-xl font-semibold">
                {attempt.passed ? "Quiz Passed! 🎉" : "Quiz Not Passed"}
              </div>
              {attempt.feedback && (
                <div className="p-4 bg-card rounded-lg">
                  <p className="text-text-secondary">{attempt.feedback}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!submitted && (
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSubmit} disabled={Object.keys(answers).length !== questions.length}>
            Submit Quiz
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      )}

      {submitted && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-end gap-4 flex-wrap">
            <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="lg"
                  onClick={() => {
                    setFeedbackDialogOpen(true);
                    handleGetFeedback();
                  }}
                  disabled={loadingFeedback}
                  className="w-full sm:w-auto"
                >
                  {loadingFeedback ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating Feedback...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      Get Personal Feedback
                    </>
                  )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Personalized Quiz Feedback</DialogTitle>
                  <DialogDescription>
                    Detailed feedback on your quiz performance
                  </DialogDescription>
                </DialogHeader>
                {loadingFeedback && !feedback && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <p className="ml-2">Generating personalized feedback...</p>
                  </div>
                )}
                {feedback && !loadingFeedback && (
                  <div className="space-y-6">
                    {feedback.summary && (
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Score</p>
                            <p className="text-2xl font-bold">{feedback.summary.score}/{feedback.summary.total_questions}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Percentage</p>
                            <p className="text-2xl font-bold">{feedback.summary.percentage.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Correct</p>
                            <p className="text-lg font-semibold text-green-600">{feedback.summary.correct_count}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Incorrect</p>
                            <p className="text-lg font-semibold text-red-600">{feedback.summary.wrong_count}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {feedback.feedback && (
                      <div className="space-y-2">
                        <h3 className="font-semibold">Feedback</h3>
                        <div className="p-4 bg-card border rounded-lg">
                          <p className="whitespace-pre-wrap text-sm">{feedback.feedback}</p>
                        </div>
                      </div>
                    )}
                    {feedback.wrong_answers && feedback.wrong_answers.length > 0 && (
                      <div className="space-y-4">
                        <h3 className="font-semibold">Incorrect Answers</h3>
                        {feedback.wrong_answers.map((wrong: any, index: number) => (
                          <div key={index} className="p-4 border rounded-lg space-y-2">
                            <p className="font-medium">{wrong.question}</p>
                            <div className="space-y-1 text-sm">
                              <p>
                                <span className="font-semibold text-red-600">Your answer:</span> {wrong.student_answer}
                              </p>
                              <p>
                                <span className="font-semibold text-green-600">Correct answer:</span> {wrong.correct_answer}
                              </p>
                              {wrong.context_reference && (
                                <p className="mt-2 text-muted-foreground italic">
                                  {wrong.context_reference}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>
            {!attempt?.passed && (
              <>
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    if (!quiz) return;
                    
                    setRegenerating(true);
                    try {
                      // Regenerate quiz questions
                      await api.regenerateQuiz(quiz.id);
                      
                      // Invalidate and refetch quiz data
                      await queryClient.invalidateQueries({ queryKey: ['quiz', courseId] });
                      
                      // Reset quiz state
                      setSubmitted(false);
                      setAnswers({});
                      setAttempt(null);
                      setFeedback(null);
                      setFeedbackDialogOpen(false);
                      
                      toast({
                        title: "Quiz Regenerated",
                        description: "New questions have been generated for this quiz.",
                      });
                    } catch (error: any) {
                      console.error('Error regenerating quiz:', error);
                      toast({
                        title: "Failed to regenerate quiz",
                        description: error.message || "Failed to generate new questions",
                        variant: "destructive",
                      });
                    } finally {
                      setRegenerating(false);
                    }
                  }}
                  disabled={regenerating}
                >
                  {regenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    "Try Again"
                  )}
                </Button>
              <Button 
                variant="secondary" 
                size="lg" 
                  className="w-full sm:w-auto"
                onClick={() => {
                  // Go back to course but don't complete it
                  window.history.back();
                }}
              >
                Review Course Material
              </Button>
            </>
          )}
          {attempt?.passed && (
              <Button size="lg" className="w-full sm:w-auto" onClick={onComplete}>
              Continue to Course Completion
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuizComponent;


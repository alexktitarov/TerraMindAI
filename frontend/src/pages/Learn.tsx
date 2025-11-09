import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { BookOpen, CheckCircle, Lock, Play, ArrowRight, Plus, GraduationCap } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const Learn = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: coursesData, isLoading, refetch } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const data = await api.getCourses();
      return data;
    },
  });

  const courses = coursesData?.courses || [];

  const handleEnroll = async (courseId: string) => {
    try {
      await api.enrollInCourse(courseId);
      toast({
        title: "Enrolled!",
        description: "You've successfully enrolled in this course.",
      });
      refetch();
    } catch (error: any) {
      toast({
        title: "Enrollment failed",
        description: error.message || "Failed to enroll in course",
        variant: "destructive",
      });
    }
  };

  const getCourseStatus = (course: any) => {
    // If user is the creator/teacher, show as teacher/curator (not enrolled)
    if (course.isCreator) return "teacher";
    const enrollment = course.enrollments?.[0];
    if (!enrollment) return "not-enrolled";
    if (enrollment.progress === 100) return "completed";
    if (enrollment.progress > 0) return "in-progress";
    return "enrolled";
  };

  const getCourseProgress = (course: any) => {
    const enrollment = course.enrollments?.[0];
    return enrollment?.progress || 0;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">Loading courses...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-12 flex justify-between items-center">
          <div>
            <div className="overline text-primary mb-3">LEARNING PATH</div>
            <h2 className="mb-3">Master Climate Science</h2>
            <p className="body-large text-text-secondary max-w-2xl">
              Progress through interactive lessons and quizzes designed to build your understanding step by step
            </p>
          </div>
          {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
            <Button onClick={() => navigate('/courses/create')}>
              <Plus className="w-5 h-5 mr-2" />
              Create Course
            </Button>
          )}
        </div>

        {courses.length === 0 ? (
          <Card className="border-0">
            <CardContent className="pt-12 pb-12 text-center">
              <p className="body-large text-text-secondary mb-4">
                No courses available yet.
              </p>
              {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
                <Button onClick={() => navigate('/courses/create')}>
                  Create Your First Course
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            {courses.map((course) => {
              const status = getCourseStatus(course);
              const progress = getCourseProgress(course);
              const courseContent = typeof course.content === 'string' 
                ? JSON.parse(course.content) 
                : course.content;
              const lessonsCount = courseContent?.lessons?.length || 0;

              return (
                <Card 
                  key={course.id}
                  className="transition-standard cursor-pointer border-2 hover:scale-[1.02] hover:border-border hover:shadow-md"
                  onClick={() => navigate(`/courses/${course.id}`)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {status === "completed" && (
                            <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                              <CheckCircle className="w-5 h-5 text-success" />
                            </div>
                          )}
                          {status === "not-enrolled" && (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Lock className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          {status === "in-progress" && (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <Play className="w-5 h-5 text-primary" />
                            </div>
                          )}
                          {status === "teacher" && (
                            <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
                              <GraduationCap className="w-5 h-5 text-secondary" />
                            </div>
                          )}
                          <CardTitle className="text-xl">{course.title}</CardTitle>
                        </div>
                        <CardDescription className="body-small">
                          {course.description || courseContent?.description}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2 ml-4">
                        {status === "teacher" && (
                          <Badge variant="secondary" className="font-semibold">
                            Teacher/Curator
                          </Badge>
                        )}
                        <Badge 
                          variant={status === "completed" ? "default" : "outline"}
                        >
                          {lessonsCount} lessons
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-4">
                    {status !== "not-enrolled" && status !== "teacher" && (
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="caption text-text-secondary">PROGRESS</span>
                          <span className="font-semibold text-foreground">{progress}%</span>
                        </div>
                        <ProgressBar value={progress} className="h-2" />
                      </div>
                    )}
                    
                    <Button 
                      className="w-full" 
                      variant={status === "not-enrolled" || status === "teacher" ? "outline" : "default"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (status === "not-enrolled") {
                          handleEnroll(course.id);
                        } else {
                          navigate(`/courses/${course.id}`);
                        }
                      }}
                    >
                      {status === "completed" && (
                        <>
                          Review Course
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                      {status === "in-progress" && (
                        <>
                          Continue Learning
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                      {status === "enrolled" && (
                        <>
                          Start Learning
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                      {status === "teacher" && (
                        <>
                          Manage Course
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                      {status === "not-enrolled" && "Enroll in Course"}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Learn;

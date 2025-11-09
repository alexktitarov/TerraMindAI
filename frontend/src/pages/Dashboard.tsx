import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Users, TrendingUp, Clock, Award, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Redirect if not teacher/admin
  if (user?.role !== 'TEACHER' && user?.role !== 'ADMIN') {
    navigate('/learn');
    return null;
  }

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const data = await api.getCourses();
      return data;
    },
  });

  const courses = coursesData?.courses || [];

  // Get quiz attempts for all courses
  const { data: allAttempts } = useQuery({
    queryKey: ['allQuizAttempts'],
    queryFn: async () => {
      const attempts = await Promise.all(
        courses.map(async (course: any) => {
          try {
            const data = await api.getCourseQuizAttempts(course.id);
            return data.attempts || [];
          } catch {
            return [];
          }
        })
      );
      return attempts.flat();
    },
    enabled: courses.length > 0,
  });

  const attempts = allAttempts || [];

  // Calculate stats
  const totalStudents = new Set(attempts.map((a: any) => a.userId)).size;
  const avgCompletion = courses.length > 0
    ? courses.reduce((sum: number, c: any) => {
        const enrollments = c.enrollments || [];
        const completed = enrollments.filter((e: any) => e.progress === 100).length;
        return sum + (completed / Math.max(enrollments.length, 1)) * 100;
      }, 0) / courses.length
    : 0;
  const avgScore = attempts.length > 0
    ? attempts.reduce((sum: number, a: any) => sum + a.score, 0) / attempts.length
    : 0;
  const totalBadges = attempts.filter((a: any) => a.passed).length;

  // Get student list
  const studentsMap = new Map();
  attempts.forEach((attempt: any) => {
    if (!studentsMap.has(attempt.userId)) {
      studentsMap.set(attempt.userId, {
        id: attempt.userId,
        name: attempt.user?.name || 'Unknown',
        email: attempt.user?.email || '',
        attempts: [],
        courses: new Set(),
      });
    }
    const student = studentsMap.get(attempt.userId);
    student.attempts.push(attempt);
    student.courses.add(attempt.quiz?.courseId);
  });

  const students = Array.from(studentsMap.values()).map((student: any) => {
    const avgScore = student.attempts.length > 0
      ? student.attempts.reduce((sum: number, a: any) => sum + a.score, 0) / student.attempts.length
      : 0;
    const completedCourses = student.courses.size;
    const totalProgress = courses.length > 0 ? (completedCourses / courses.length) * 100 : 0;
    const lastAttempt = student.attempts.sort((a: any, b: any) => 
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    )[0];
    const lastActive = lastAttempt 
      ? new Date(lastAttempt.completedAt).toLocaleDateString()
      : 'Never';

    return {
      ...student,
      avgScore,
      completedCourses,
      totalProgress,
      lastActive,
      status: lastAttempt ? 'active' : 'inactive',
    };
  });

  const classStats = [
    { label: "Total Students", value: totalStudents.toString(), icon: Users, color: "primary" },
    { label: "Avg. Completion", value: `${avgCompletion.toFixed(0)}%`, icon: TrendingUp, color: "secondary" },
    { label: "Avg. Quiz Score", value: `${avgScore.toFixed(0)}%`, icon: Clock, color: "accent" },
    { label: "Quizzes Passed", value: totalBadges.toString(), icon: Award, color: "success" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-12 flex justify-between items-center">
          <div>
            <div className="overline text-primary mb-3">TEACHER PORTAL</div>
            <h2 className="mb-3">Class Dashboard</h2>
            <p className="body-large text-text-secondary max-w-2xl">
              Monitor student progress, engagement, and performance across all learning modules
            </p>
          </div>
          <Button onClick={() => navigate('/courses/create')}>
            <Plus className="w-5 h-5 mr-2" />
            Create Course
          </Button>
        </div>

        {/* Class Stats */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {classStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="border-0">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-${stat.color}/10 to-${stat.color}/5 flex items-center justify-center`}>
                      <Icon className={`w-6 h-6 text-${stat.color}`} />
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-extrabold">{stat.value}</div>
                    </div>
                  </div>
                  <div className="body-small text-text-secondary">{stat.label}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Class Progress Overview */}
        <Card className="mb-12 border-0">
          <CardHeader>
            <CardTitle>Class Progress by Course</CardTitle>
            <CardDescription className="body-small">Average completion rates across all students</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {courses.length === 0 ? (
              <p className="text-center text-text-secondary py-8">
                No courses yet. Create your first course to get started!
              </p>
            ) : (
              courses.map((course: any) => {
                const enrollments = course.enrollments || [];
                const completed = enrollments.filter((e: any) => e.progress === 100).length;
                const avgProgress = enrollments.length > 0
                  ? enrollments.reduce((sum: number, e: any) => sum + e.progress, 0) / enrollments.length
                  : 0;

                return (
                  <div key={course.id}>
                    <div className="flex justify-between mb-3">
                      <span className="font-semibold">{course.title}</span>
                      <span className="font-bold text-primary">{avgProgress.toFixed(0)}%</span>
                    </div>
                    <ProgressBar value={avgProgress} className="h-3" />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Student Table */}
        <Card className="border-0">
          <CardHeader>
            <CardTitle>Student Performance</CardTitle>
            <CardDescription className="body-small">Individual progress tracking</CardDescription>
          </CardHeader>
          <CardContent>
            {students.length === 0 ? (
              <p className="text-center text-text-secondary py-8">
                No student data yet. Students will appear here once they enroll in courses.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Student Name</TableHead>
                    <TableHead className="font-semibold">Courses</TableHead>
                    <TableHead className="font-semibold">Progress</TableHead>
                    <TableHead className="font-semibold">Quiz Avg</TableHead>
                    <TableHead className="font-semibold">Last Active</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student: any) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="body-small">{student.completedCourses} / {courses.length}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProgressBar value={student.totalProgress} className="h-2 w-28" />
                          <span className="body-small text-muted-foreground font-semibold min-w-[3ch]">
                            {student.totalProgress.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={student.avgScore >= 90 ? "default" : "secondary"}
                          className="font-semibold"
                        >
                          {student.avgScore.toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="body-small text-muted-foreground">
                        {student.lastActive}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={student.status === "active" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {student.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Award, BookOpen, TrendingUp, Zap, Star, Trophy, Target, Flame } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Milestones } from "@/components/Milestones";

const iconMap: Record<string, any> = {
  Star,
  TrendingUp,
  Target,
  Flame,
  Zap,
  Trophy,
  BookOpen,
  Award,
};

const Progress = () => {
  const { data: badgesData } = useQuery({
    queryKey: ['badges'],
    queryFn: async () => {
      const data = await api.getAvailableBadges();
      return data;
    },
  });

  const { data: coursesData } = useQuery({
    queryKey: ['courses'],
    queryFn: async () => {
      const data = await api.getCourses();
      return data;
    },
  });

  const { data: attemptsData } = useQuery({
    queryKey: ['quizAttempts'],
    queryFn: async () => {
      const data = await api.getQuizAttempts();
      return data;
    },
  });

  const badges = badgesData?.badges || [];
  const courses = coursesData?.courses || [];
  const attempts = attemptsData?.attempts || [];

  // Calculate stats
  const completedCourses = courses.filter((c: any) => {
    const enrollment = c.enrollments?.[0];
    return enrollment?.progress === 100;
  }).length;

  const totalCourses = courses.length;
  const passedQuizzes = attempts.filter((a: any) => a.passed).length;
  const totalQuizzes = attempts.length;
  const averageScore = attempts.length > 0
    ? attempts.reduce((sum: number, a: any) => sum + a.score, 0) / attempts.length
    : 0;

  const earnedBadges = badges.filter((b: any) => b.earned);
  const totalBadges = badges.length;

  const overallProgress = totalCourses > 0
    ? (completedCourses / totalCourses) * 100
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="overline text-primary mb-3">YOUR JOURNEY</div>
          <h2 className="mb-3">Learning Progress</h2>
          <p className="body-large text-text-secondary max-w-2xl">
            Track your achievements and see how far you've come in mastering climate science
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid md:grid-cols-4 gap-6 mb-12">
          <Card className="border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="secondary" className="h-7 px-3 text-sm font-bold">
                  {completedCourses}/{totalCourses}
                </Badge>
              </div>
              <h3 className="text-base font-semibold mb-3">Courses Completed</h3>
              <ProgressBar value={totalCourses > 0 ? (completedCourses / totalCourses) * 100 : 0} className="h-2 mb-2" />
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="secondary" className="h-7 px-3 text-sm font-bold">
                  {passedQuizzes}
                </Badge>
              </div>
              <h3 className="text-base font-semibold mb-3">Quizzes Passed</h3>
              <ProgressBar value={totalQuizzes > 0 ? (passedQuizzes / totalQuizzes) * 100 : 0} className="h-2 mb-2" />
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="secondary" className="h-7 px-3 text-sm font-bold">
                  {averageScore.toFixed(0)}%
                </Badge>
              </div>
              <h3 className="text-base font-semibold mb-3">Average Score</h3>
              <ProgressBar value={averageScore} className="h-2 mb-2" />
            </CardContent>
          </Card>

          <Card className="border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <Award className="w-6 h-6 text-primary" />
                </div>
                <Badge variant="secondary" className="h-7 px-3 text-sm font-bold">
                  {earnedBadges.length}
                </Badge>
              </div>
              <h3 className="text-base font-semibold mb-3">Badges Earned</h3>
              <ProgressBar value={totalBadges > 0 ? (earnedBadges.length / totalBadges) * 100 : 0} className="h-2 mb-2" />
            </CardContent>
          </Card>
        </div>

        {/* Milestones */}
        <div className="mb-12">
          <Milestones badges={badges} courses={courses} attempts={attempts} />
        </div>

        {/* Overall Progress */}
        <Card className="mb-12 border-0">
          <CardHeader>
            <CardTitle>Overall Learning Progress</CardTitle>
            <CardDescription className="body-small">Your journey to becoming a climate expert</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div>
              <div className="flex justify-between mb-3">
                <span className="font-semibold">Course Completion</span>
                <span className="text-xl font-bold text-primary">{overallProgress.toFixed(0)}%</span>
              </div>
              <ProgressBar value={overallProgress} className="h-4" />
            </div>
            
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-6 bg-gradient-to-br from-primary/5 to-transparent rounded-2xl">
                <div className="text-5xl font-extrabold text-primary mb-2">{completedCourses}</div>
                <div className="body-small text-text-secondary">Courses Completed</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-secondary/5 to-transparent rounded-2xl">
                <div className="text-5xl font-extrabold text-secondary mb-2">{passedQuizzes}</div>
                <div className="body-small text-text-secondary">Quizzes Passed</div>
              </div>
              <div className="text-center p-6 bg-gradient-to-br from-accent/5 to-transparent rounded-2xl">
                <div className="text-5xl font-extrabold text-accent mb-2">{averageScore.toFixed(0)}%</div>
                <div className="body-small text-text-secondary">Average Quiz Score</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Badges */}
        <Card className="border-0">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <Award className="w-7 h-7 text-primary" />
              <CardTitle>Badges & Achievements</CardTitle>
            </div>
            <CardDescription className="body-small">
              Collect badges as you progress through your learning journey
            </CardDescription>
          </CardHeader>
          <CardContent>
            {badges.length === 0 ? (
              <p className="text-center text-text-secondary py-8">
                No badges available yet. Complete courses and quizzes to earn badges!
              </p>
            ) : (
              <div className="grid md:grid-cols-3 gap-6">
                {badges.map((badge: any) => {
                  const Icon = iconMap[badge.icon || 'Award'] || Award;
                  return (
                    <div
                      key={badge.id}
                      className={`p-8 rounded-2xl border-2 transition-all ${
                        badge.earned
                          ? "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent"
                          : "border-border bg-muted/20 opacity-60"
                      }`}
                    >
                      <div className="flex flex-col items-center text-center">
                        <div
                          className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${
                            badge.earned
                              ? "bg-gradient-to-br from-primary to-secondary"
                              : "bg-muted"
                          }`}
                        >
                          <Icon className={`w-10 h-10 ${badge.earned ? "text-white" : "text-muted-foreground"}`} />
                        </div>
                        <h4 className="font-bold text-base mb-2">{badge.name}</h4>
                        <p className="body-small text-text-secondary">{badge.description}</p>
                        {badge.earned && (
                          <Badge className="mt-4 bg-success text-white" variant="default">Earned</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Progress;

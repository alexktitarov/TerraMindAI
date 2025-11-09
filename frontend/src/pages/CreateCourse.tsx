import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const CreateCourse = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    topic: "",
    title: "",
    description: "",
    gradeLevel: "middle school",
    duration: "30 minutes",
  });

  // Redirect if not teacher/admin
  if (user?.role !== 'TEACHER' && user?.role !== 'ADMIN') {
    navigate('/learn');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.topic) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for the course.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await api.createCourse({
        topic: formData.topic,
        title: formData.title || undefined,
        description: formData.description || undefined,
        gradeLevel: formData.gradeLevel,
        duration: formData.duration,
      });
      
      toast({
        title: "Course created!",
        description: "Your course has been created successfully.",
      });
      
      navigate(`/courses/${result.course.id}`);
    } catch (error: any) {
      toast({
        title: "Failed to create course",
        description: error.message || "An error occurred while creating the course.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16 max-w-2xl">
        <div className="mb-6">
          <Button variant="ghost" onClick={() => navigate('/learn')}>
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Courses
          </Button>
        </div>

        <Card className="border-0">
          <CardHeader>
            <CardTitle>Create New Course</CardTitle>
            <CardDescription>
              Generate an interactive climate education course using AI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="topic">
                  Course Topic <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="topic"
                  placeholder="e.g., Greenhouse Effect, Carbon Cycle, Ocean Currents"
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Enter the main topic you want to teach about climate change
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Course Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Leave blank to auto-generate"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the course"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gradeLevel">
                    Grade Level <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.gradeLevel}
                    onValueChange={(value) => setFormData({ ...formData, gradeLevel: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="elementary school">Elementary School</SelectItem>
                      <SelectItem value="middle school">Middle School</SelectItem>
                      <SelectItem value="high school">High School</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Select
                    value={formData.duration}
                    onValueChange={(value) => setFormData({ ...formData, duration: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15 minutes">15 minutes</SelectItem>
                      <SelectItem value="30 minutes">30 minutes</SelectItem>
                      <SelectItem value="45 minutes">45 minutes</SelectItem>
                      <SelectItem value="1 hour">1 hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-4 justify-end pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/learn')}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Course
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateCourse;


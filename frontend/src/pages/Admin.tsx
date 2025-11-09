import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  BookOpen, 
  UsersRound, 
  TrendingUp, 
  Shield,
  Trash2,
  Edit,
  Search,
  Plus,
  UserPlus,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  // ALL HOOKS MUST BE CALLED FIRST - before any conditional returns
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("");
  const [userPage, setUserPage] = useState(1);
  const [deleteDialog, setDeleteDialog] = useState<{ type: string; id: string; name: string } | null>(null);
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>("");
  const [showCreateCourse, setShowCreateCourse] = useState(false);
  const [showAssignStudent, setShowAssignStudent] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<string>("");
  const [selectedTeacher, setSelectedTeacher] = useState<string>("");
  const [showEnrollStudent, setShowEnrollStudent] = useState(false);
  const [selectedCourseForEnrollment, setSelectedCourseForEnrollment] = useState<string>("");
  const [selectedStudentForEnrollment, setSelectedStudentForEnrollment] = useState<string>("");
  
  const [courseFormData, setCourseFormData] = useState({
    topic: "",
    title: "",
    description: "",
    gradeLevel: "middle school",
    duration: "30 minutes",
  });

  // Data fetching with error handling - MUST be called before conditional returns
  const { data: statsData, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['adminStats'],
    queryFn: async () => {
      try {
        return await api.getAdminStats();
      } catch (error: any) {
        console.error('Stats error:', error);
        return { stats: {} };
      }
    },
    retry: false,
  });

  const { data: usersData, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['adminUsers', userPage, userSearch, userRoleFilter],
    queryFn: async () => {
      try {
        return await api.getAdminUsers(userPage, 20, userSearch || undefined, userRoleFilter || undefined);
      } catch (error: any) {
        console.error('Users error:', error);
        return { users: [], pagination: { page: 1, totalPages: 1, total: 0 } };
      }
    },
    retry: false,
  });

  const { data: coursesData, isLoading: coursesLoading, error: coursesError } = useQuery({
    queryKey: ['adminCourses', courseStatusFilter],
    queryFn: async () => {
      try {
        return await api.getAdminCourses(courseStatusFilter || undefined);
      } catch (error: any) {
        console.error('Courses error:', error);
        return { courses: [] };
      }
    },
    retry: false,
  });

  const { data: groupsData, isLoading: groupsLoading, error: groupsError } = useQuery({
    queryKey: ['adminGroups'],
    queryFn: async () => {
      try {
        return await api.getAdminGroups();
      } catch (error: any) {
        console.error('Groups error:', error);
        return { groups: [] };
      }
    },
    retry: false,
  });

  // Get all teachers and students for assignment
  const { data: allUsersData } = useQuery({
    queryKey: ['allUsersForAssignment'],
    queryFn: async () => {
      try {
        const teachers = await api.getAdminUsers(1, 100, undefined, 'TEACHER');
        const students = await api.getAdminUsers(1, 100, undefined, 'STUDENT');
        return {
          teachers: teachers.users || [],
          students: students.users || [],
        };
      } catch (error) {
        console.error('Error fetching users for assignment:', error);
        return { teachers: [], students: [] };
      }
    },
  });

  // Show loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">
            <h2>Loading Admin Page...</h2>
            <p className="text-muted-foreground mt-2">Please wait...</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if user is admin - show helpful message
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">
            <h2 className="mb-4">Not Logged In</h2>
            <p className="text-muted-foreground">Please log in to access the admin page.</p>
            <Button onClick={() => navigate('/auth')} className="mt-4">
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container mx-auto px-6 py-16">
          <div className="text-center">
            <h2 className="mb-4">Access Denied</h2>
            <p className="text-muted-foreground">You need ADMIN role to access this page.</p>
            <p className="text-sm text-muted-foreground mt-2">Current role: {user.role}</p>
            <p className="text-sm text-muted-foreground">User: {user.name} ({user.email})</p>
            <Button onClick={() => navigate('/learn')} className="mt-4">
              Go to Learn
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Now we know user is admin, safe to use stats
  const stats = statsData?.stats || {};

  // Mutations
  const updateUserRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'STUDENT' | 'TEACHER' | 'ADMIN' }) =>
      api.updateUserRole(id, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: ['allUsersForAssignment'] });
      toast({ title: "Role updated successfully" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: string) => api.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setDeleteDialog(null);
      toast({ title: "User deleted successfully" });
    },
  });

  const updateCourseStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }) =>
      api.updateCourseStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast({ title: "Course status updated" });
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (id: string) => api.deleteCourse(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setDeleteDialog(null);
      toast({ title: "Course deleted successfully" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => api.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminGroups'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setDeleteDialog(null);
      toast({ title: "Group deleted successfully" });
    },
  });

  const createCourseMutation = useMutation({
    mutationFn: (data: any) => api.createCourse(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setShowCreateCourse(false);
      setCourseFormData({
        topic: "",
        title: "",
        description: "",
        gradeLevel: "middle school",
        duration: "30 minutes",
      });
      toast({ title: "Course created successfully!" });
    },
    onError: (error: any) => {
      console.error('Course creation error:', error);
      const errorMessage = error?.message || error?.error || 'Failed to create course.';
      toast({ 
        title: "Failed to create course", 
        description: errorMessage,
        variant: "destructive" 
      });
    },
  });

  const assignStudentMutation = useMutation({
    mutationFn: async ({ studentId, teacherId }: { studentId: string; teacherId: string }) => {
      return await api.assignStudentToTeacher(studentId, teacherId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminGroups'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setShowAssignStudent(false);
      setSelectedStudent("");
      setSelectedTeacher("");
      toast({ title: "Student assigned to teacher successfully!" });
    },
    onError: (error: any) => {
      console.error('Assignment error:', error);
      const errorMessage = error?.message || error?.error || 'Failed to assign student to teacher.';
      toast({ 
        title: "Failed to assign student", 
        description: errorMessage,
        variant: "destructive" 
      });
    },
  });

  const enrollStudentMutation = useMutation({
    mutationFn: ({ courseId, studentId }: { courseId: string; studentId: string }) =>
      api.enrollStudentInCourse(courseId, studentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminCourses'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      setShowEnrollStudent(false);
      setSelectedCourseForEnrollment("");
      setSelectedStudentForEnrollment("");
      toast({ title: "Student enrolled in course successfully!" });
    },
    onError: (error: any) => {
      console.error('Enrollment error:', error);
      const errorMessage = error?.message || error?.error || 'Failed to enroll student in course.';
      toast({ 
        title: "Failed to enroll student", 
        description: errorMessage,
        variant: "destructive" 
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: 'STUDENT' | 'TEACHER' | 'ADMIN') => {
    updateUserRoleMutation.mutate({ id: userId, role: newRole });
  };

  const handleStatusChange = (courseId: string, newStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => {
    updateCourseStatusMutation.mutate({ id: courseId, status: newStatus });
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseFormData.topic) {
      toast({
        title: "Topic required",
        description: "Please enter a topic for the course.",
        variant: "destructive",
      });
      return;
    }
    createCourseMutation.mutate(courseFormData);
  };

  const handleAssignStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !selectedTeacher) {
      toast({
        title: "Selection required",
        description: "Please select both a student and a teacher.",
        variant: "destructive",
      });
      return;
    }
    assignStudentMutation.mutate({ studentId: selectedStudent, teacherId: selectedTeacher });
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseForEnrollment || !selectedStudentForEnrollment) {
      toast({
        title: "Selection required",
        description: "Please select both a course and a student.",
        variant: "destructive",
      });
      return;
    }
    enrollStudentMutation.mutate({ 
      courseId: selectedCourseForEnrollment, 
      studentId: selectedStudentForEnrollment 
    });
  };

  const statCards = [
    { 
      label: "Total Users", 
      value: stats.users?.total || 0, 
      icon: Users, 
      colorClass: "from-primary/10 to-primary/5 text-primary",
      sublabel: `${stats.users?.students || 0} students, ${stats.users?.teachers || 0} teachers`
    },
    { 
      label: "Total Courses", 
      value: stats.courses?.total || 0, 
      icon: BookOpen, 
      colorClass: "from-secondary/10 to-secondary/5 text-secondary",
      sublabel: `${stats.courses?.published || 0} published`
    },
    { 
      label: "Total Groups", 
      value: stats.groups?.total || 0, 
      icon: UsersRound, 
      colorClass: "from-accent/10 to-accent/5 text-accent"
    },
    { 
      label: "Enrollments", 
      value: stats.engagement?.enrollments || 0, 
      icon: TrendingUp, 
      colorClass: "from-green-500/10 to-green-500/5 text-green-600",
      sublabel: `${((stats.engagement?.completionRate || 0)).toFixed(0)}% completion`
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="flex items-center justify-between">
            <div>
              <div className="overline text-primary mb-3">ADMIN PORTAL</div>
              <h2 className="mb-3">System Administration</h2>
              <p className="body-large text-text-secondary max-w-2xl">
                Manage users, courses, groups, and monitor system-wide statistics
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog open={showCreateCourse} onOpenChange={setShowCreateCourse}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Course
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Course</DialogTitle>
                    <DialogDescription>
                      Generate an interactive climate education course
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateCourse} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="topic">
                        Course Topic <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="topic"
                        placeholder="e.g., Greenhouse Effect, Carbon Cycle"
                        value={courseFormData.topic}
                        onChange={(e) => setCourseFormData({ ...courseFormData, topic: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="title">Course Title (Optional)</Label>
                      <Input
                        id="title"
                        placeholder="Leave blank to auto-generate"
                        value={courseFormData.title}
                        onChange={(e) => setCourseFormData({ ...courseFormData, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description (Optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Brief description of the course"
                        value={courseFormData.description}
                        onChange={(e) => setCourseFormData({ ...courseFormData, description: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gradeLevel">
                          Grade Level <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={courseFormData.gradeLevel}
                          onValueChange={(value) => setCourseFormData({ ...courseFormData, gradeLevel: value })}
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
                          value={courseFormData.duration}
                          onValueChange={(value) => setCourseFormData({ ...courseFormData, duration: value })}
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
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setShowCreateCourse(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createCourseMutation.isPending}>
                        {createCourseMutation.isPending ? "Creating..." : "Create Course"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={showAssignStudent} onOpenChange={setShowAssignStudent}>
                <DialogTrigger asChild>
                  <Button variant="secondary">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign Student
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Student to Teacher</DialogTitle>
                    <DialogDescription>
                      Assign a student to a teacher's group
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAssignStudent} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="student">Select Student</Label>
                      <Select value={selectedStudent} onValueChange={setSelectedStudent}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a student" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsersData?.students.map((student: any) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name} ({student.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="teacher">Select Teacher</Label>
                      <Select value={selectedTeacher} onValueChange={setSelectedTeacher}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          {allUsersData?.teachers.map((teacher: any) => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name} ({teacher.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setShowAssignStudent(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={assignStudentMutation.isPending}>
                        {assignStudentMutation.isPending ? "Assigning..." : "Assign"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {statsError && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-destructive">Error loading statistics: {statsError instanceof Error ? statsError.message : 'Unknown error'}</p>
          </div>
        )}

        <div className="grid md:grid-cols-4 gap-6 mb-12">
          {statsLoading ? (
            <div className="col-span-4 text-center py-8 text-muted-foreground">Loading statistics...</div>
          ) : (
            statCards.map((stat) => {
              const Icon = stat.icon;
              const [bgFrom, bgTo, textColor] = stat.colorClass.split(' ');
              return (
                <Card key={stat.label} className="border-0">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${bgFrom} ${bgTo} flex items-center justify-center`}>
                        <Icon className={`w-6 h-6 ${textColor}`} />
                      </div>
                      <div className="text-right">
                        <div className="text-4xl font-extrabold">{stat.value}</div>
                      </div>
                    </div>
                    <div className="body-small text-text-secondary">{stat.label}</div>
                    {stat.sublabel && (
                      <div className="body-small text-muted-foreground mt-1">{stat.sublabel}</div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card className="border-0">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage user accounts and roles</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search users..."
                        value={userSearch}
                        onChange={(e) => {
                          setUserSearch(e.target.value);
                          setUserPage(1);
                        }}
                        className="pl-10 w-64"
                      />
                    </div>
                    <Select value={userRoleFilter || "all"} onValueChange={(value) => setUserRoleFilter(value === "all" ? "" : value)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="All roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All roles</SelectItem>
                        <SelectItem value="STUDENT">Student</SelectItem>
                        <SelectItem value="TEACHER">Teacher</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading users...</div>
                ) : usersError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading users: {usersError instanceof Error ? usersError.message : 'Unknown error'}
                  </div>
                ) : usersData?.users && usersData.users.length > 0 ? (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Enrollments</TableHead>
                          <TableHead>Quiz Attempts</TableHead>
                          <TableHead>Badges</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersData.users.map((u: any) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.name}</TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'} className="capitalize">
                                      {u.role.toLowerCase()}
                                    </Badge>
                                    <Edit className="w-3 h-3 ml-2" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem 
                                    onClick={() => handleRoleChange(u.id, 'STUDENT')}
                                    disabled={u.role === 'STUDENT'}
                                  >
                                    Student
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleRoleChange(u.id, 'TEACHER')}
                                    disabled={u.role === 'TEACHER'}
                                  >
                                    Teacher
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleRoleChange(u.id, 'ADMIN')}
                                    disabled={u.role === 'ADMIN'}
                                  >
                                    Admin
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                            <TableCell>{u._count?.courseEnrollments || 0}</TableCell>
                            <TableCell>{u._count?.quizAttempts || 0}</TableCell>
                            <TableCell>{u._count?.badges || 0}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteDialog({ type: 'user', id: u.id, name: u.name })}
                                disabled={u.id === user?.id}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {usersData.pagination && usersData.pagination.totalPages > 1 && (
                      <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-muted-foreground">
                          Page {usersData.pagination.page} of {usersData.pagination.totalPages}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUserPage(p => Math.max(1, p - 1))}
                            disabled={userPage === 1}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setUserPage(p => p + 1)}
                            disabled={userPage >= usersData.pagination.totalPages}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-center text-text-secondary py-8">No users found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="courses" className="space-y-4">
            <Card className="border-0">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Course Management</CardTitle>
                    <CardDescription>Manage all courses in the system</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={showEnrollStudent} onOpenChange={setShowEnrollStudent}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <UserPlus className="w-4 h-4 mr-2" />
                          Enroll Student
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Enroll Student in Course</DialogTitle>
                          <DialogDescription>
                            Select a course and student to enroll them
                          </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleEnrollStudent} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="course-enroll">Select Course</Label>
                            <Select value={selectedCourseForEnrollment} onValueChange={setSelectedCourseForEnrollment}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a course" />
                              </SelectTrigger>
                              <SelectContent>
                                {coursesData?.courses?.filter((c: any) => c.status === 'PUBLISHED').map((course: any) => (
                                  <SelectItem key={course.id} value={course.id}>
                                    {course.title}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="student-enroll">Select Student</Label>
                            <Select value={selectedStudentForEnrollment} onValueChange={setSelectedStudentForEnrollment}>
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a student" />
                              </SelectTrigger>
                              <SelectContent>
                                {allUsersData?.students.map((student: any) => (
                                  <SelectItem key={student.id} value={student.id}>
                                    {student.name} ({student.email})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setShowEnrollStudent(false)}>
                              Cancel
                            </Button>
                            <Button type="submit" disabled={enrollStudentMutation.isPending}>
                              {enrollStudentMutation.isPending ? "Enrolling..." : "Enroll"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                    <Select value={courseStatusFilter || "all"} onValueChange={(value) => setCourseStatusFilter(value === "all" ? "" : value)}>
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="PUBLISHED">Published</SelectItem>
                        <SelectItem value="ARCHIVED">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {coursesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading courses...</div>
                ) : coursesError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading courses: {coursesError instanceof Error ? coursesError.message : 'Unknown error'}
                  </div>
                ) : coursesData?.courses && coursesData.courses.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Creator</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enrollments</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coursesData.courses.map((course: any) => (
                        <TableRow key={course.id}>
                          <TableCell className="font-medium">{course.title}</TableCell>
                          <TableCell>{course.creator?.name || 'Unknown'}</TableCell>
                          <TableCell>{course.group?.name || '-'}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Badge 
                                    variant={
                                      course.status === 'PUBLISHED' ? 'default' : 
                                      course.status === 'DRAFT' ? 'secondary' : 'outline'
                                    }
                                    className="capitalize"
                                  >
                                    {course.status.toLowerCase()}
                                  </Badge>
                                  <Edit className="w-3 h-3 ml-2" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                <DropdownMenuItem 
                                  onClick={() => handleStatusChange(course.id, 'DRAFT')}
                                  disabled={course.status === 'DRAFT'}
                                >
                                  Draft
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleStatusChange(course.id, 'PUBLISHED')}
                                  disabled={course.status === 'PUBLISHED'}
                                >
                                  Published
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => handleStatusChange(course.id, 'ARCHIVED')}
                                  disabled={course.status === 'ARCHIVED'}
                                >
                                  Archived
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                          <TableCell>{course._count?.enrollments || 0}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteDialog({ type: 'course', id: course.id, name: course.title })}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-text-secondary py-8">No courses found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="groups" className="space-y-4">
            <Card className="border-0">
              <CardHeader>
                <CardTitle>Group Management</CardTitle>
                <CardDescription>Manage all groups in the system</CardDescription>
              </CardHeader>
              <CardContent>
                {groupsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading groups...</div>
                ) : groupsError ? (
                  <div className="text-center py-8 text-destructive">
                    Error loading groups: {groupsError instanceof Error ? groupsError.message : 'Unknown error'}
                  </div>
                ) : groupsData?.groups && groupsData.groups.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Members</TableHead>
                        <TableHead>Courses</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupsData.groups.map((group: any) => (
                        <TableRow key={group.id}>
                          <TableCell className="font-medium">{group.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{group.code}</Badge>
                          </TableCell>
                          <TableCell>{group.owner?.name || 'Unknown'}</TableCell>
                          <TableCell>{group._count?.members || 0}</TableCell>
                          <TableCell>{group._count?.courses || 0}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteDialog({ type: 'group', id: group.id, name: group.name })}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-text-secondary py-8">No groups found</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteDialog?.type} "{deleteDialog?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteDialog) return;
                if (deleteDialog.type === 'user') {
                  deleteUserMutation.mutate(deleteDialog.id);
                } else if (deleteDialog.type === 'course') {
                  deleteCourseMutation.mutate(deleteDialog.id);
                } else if (deleteDialog.type === 'group') {
                  deleteGroupMutation.mutate(deleteDialog.id);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Admin;

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupRole, setSignupRole] = useState("STUDENT");
  const [signupGradeLevel, setSignupGradeLevel] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [signupError, setSignupError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null); // Clear previous errors
    
    // Client-side validation
    if (!loginEmail.trim()) {
      const errorMsg = "Please enter your email address.";
      setLoginError(errorMsg);
      toast({
        title: "Email required",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (!loginEmail.includes('@') || !loginEmail.includes('.')) {
      const errorMsg = "Please enter a valid email address (e.g., yourname@example.com).";
      setLoginError(errorMsg);
      toast({
        title: "Invalid email format",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (!loginPassword) {
      const errorMsg = "Please enter your password.";
      setLoginError(errorMsg);
      toast({
        title: "Password required",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      setLoginError(null);
      toast({
        title: "Welcome back!",
        description: "You have successfully logged in.",
      });
      navigate("/learn");
    } catch (error: any) {
      console.error('Login error:', error);
      
      // Handle different error types with user-friendly messages
      let errorTitle = "Login failed";
      let errorDescription = "Unable to log in. Please try again.";

      if (error?.message) {
        const errorMsg = error.message.toLowerCase();
        // Check for specific error messages from backend
        if (errorMsg.includes('account not found') || errorMsg.includes('no account exists')) {
          errorTitle = "Account not found";
          errorDescription = "No account exists with this email address. Please check your email or sign up for a new account.";
        } else if (errorMsg.includes('incorrect password') || errorMsg.includes('password you entered')) {
          errorTitle = "Incorrect password";
          errorDescription = "The password you entered is incorrect. Please try again.";
        } else if (errorMsg.includes('valid email') || errorMsg.includes('validation error')) {
          errorTitle = "Invalid email";
          errorDescription = "Please enter a valid email address.";
        } else if (errorMsg.includes('unable to connect') || errorMsg.includes('fetch')) {
          errorTitle = "Connection error";
          errorDescription = "Unable to connect to the server. Please make sure the backend is running.";
        } else {
          // Use the error message from backend if available
          errorDescription = error.message;
        }
      }

      setLoginError(errorDescription);
      console.log('Showing toast:', errorTitle, errorDescription);
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null); // Clear previous errors
    
    // Client-side validation
    if (!signupEmail.trim()) {
      const errorMsg = "Please enter your email address.";
      setSignupError(errorMsg);
      toast({
        title: "Email required",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (!signupEmail.includes('@') || !signupEmail.includes('.')) {
      const errorMsg = "Please enter a valid email address (e.g., yourname@example.com).";
      setSignupError(errorMsg);
      toast({
        title: "Invalid email format",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (!signupPassword) {
      const errorMsg = "Please enter your password.";
      setSignupError(errorMsg);
      toast({
        title: "Password required",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }
    
    if (signupPassword !== signupConfirmPassword) {
      const errorMsg = "Please make sure your passwords match.";
      setSignupError(errorMsg);
      toast({
        title: "Passwords don't match",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (signupPassword.length < 8) {
      const errorMsg = "Password must be at least 8 characters.";
      setSignupError(errorMsg);
      toast({
        title: "Password too short",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    if (signupRole === "STUDENT" && !signupGradeLevel) {
      const errorMsg = "Please select your grade level.";
      setSignupError(errorMsg);
      toast({
        title: "Grade level required",
        description: errorMsg,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await signup(signupEmail, signupPassword, signupName, signupRole, signupGradeLevel || undefined);
      setSignupError(null);
      toast({
        title: "Account created!",
        description: "Welcome to TerraMindAI!",
      });
      navigate(signupRole === "STUDENT" ? "/learn" : "/dashboard");
    } catch (error: any) {
      console.error('Signup error:', error);
      
      // Handle different error types with user-friendly messages
      let errorTitle = "Signup failed";
      let errorDescription = "Unable to create account. Please try again.";

      if (error?.message) {
        const errorMsg = error.message.toLowerCase();
        // Check for specific error messages from backend
        if (errorMsg.includes('account already exists') || errorMsg.includes('already exists')) {
          errorTitle = "Account already exists";
          errorDescription = "An account with this email address already exists. Please log in instead or use a different email.";
        } else if (errorMsg.includes('grade level required') || errorMsg.includes('select your grade level')) {
          errorTitle = "Grade level required";
          errorDescription = "Please select your grade level to continue.";
        } else if (errorMsg.includes('valid email') || errorMsg.includes('validation error')) {
          errorTitle = "Invalid email";
          errorDescription = "Please enter a valid email address.";
        } else if (errorMsg.includes('password must be') || errorMsg.includes('at least 8 characters')) {
          errorTitle = "Password too short";
          errorDescription = "Password must be at least 8 characters long.";
        } else if (errorMsg.includes('unable to connect') || errorMsg.includes('fetch')) {
          errorTitle = "Connection error";
          errorDescription = "Unable to connect to the server. Please make sure the backend is running.";
        } else {
          // Use the error message from backend if available
          errorDescription = error.message;
        }
      }

      setSignupError(errorDescription);
      toast({
        title: errorTitle,
        description: errorDescription,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-6">
      {/* Background decorative elements */}
      <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl animate-pulse" />
      <div className="absolute bottom-20 left-20 w-80 h-80 rounded-full bg-secondary/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      
      <div className="w-full max-w-md relative z-10 animate-scale-in">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <img 
              src="/logo.png" 
              alt="TerraMindAI Logo" 
              className="w-12 h-12 object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.src.endsWith('/logo.svg')) {
                  target.src = '/logo.svg';
                } else {
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent && !parent.querySelector('.logo-fallback-auth')) {
                    const fallback = document.createElement('div');
                    fallback.className = 'logo-fallback-auth w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg';
                    fallback.innerHTML = '<svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>';
                    parent.insertBefore(fallback, target);
                  }
                }
              }}
            />
            <h1 className="text-3xl font-extrabold">TerraMindAI</h1>
          </div>
          <p className="body-large text-text-secondary">
            Start your climate learning journey today
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-center text-2xl">Welcome</CardTitle>
            <CardDescription className="text-center body-small">
              Choose an option to continue
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-12 bg-muted/50 p-1 mb-6">
                <TabsTrigger 
                  value="login" 
                  className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm transition-standard"
                >
                  Log In
                </TabsTrigger>
                <TabsTrigger 
                  value="signup" 
                  className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm transition-standard"
                >
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* Login Form */}
              <TabsContent value="login" className="space-y-4 animate-fade-in">
                <form onSubmit={handleLogin} className="space-y-4" noValidate>
                  {loginError && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {loginError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm font-semibold">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm font-semibold">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••••"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Button 
                      type="button" 
                      variant="link" 
                      className="text-sm text-primary p-0 h-auto"
                    >
                      Forgot password?
                    </Button>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 text-base group"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      "Logging in..."
                    ) : (
                      <>
                        Log In
                        <ArrowRight className="w-5 h-5 transition-standard group-hover:translate-x-1" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-4 text-muted-foreground caption">
                      Or continue with
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-12 transition-standard hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-12 transition-standard hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    GitHub
                  </Button>
                </div>
              </TabsContent>

              {/* Sign Up Form */}
              <TabsContent value="signup" className="space-y-4 animate-fade-in">
                <form onSubmit={handleSignup} className="space-y-4" noValidate>
                  {signupError && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                      {signupError}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sm font-semibold">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Doe"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm font-semibold">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-role" className="text-sm font-semibold">
                      Role
                    </Label>
                    <Select value={signupRole} onValueChange={(value) => {
                      setSignupRole(value);
                      if (value !== "STUDENT") {
                        setSignupGradeLevel("");
                      }
                    }}>
                      <SelectTrigger className="h-14 rounded-xl border-2">
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STUDENT">Student</SelectItem>
                        <SelectItem value="TEACHER">Teacher</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {signupRole === "STUDENT" && (
                    <div className="space-y-2">
                      <Label htmlFor="signup-grade-level" className="text-sm font-semibold">
                        Grade Level <span className="text-destructive">*</span>
                      </Label>
                      <Select value={signupGradeLevel} onValueChange={setSignupGradeLevel}>
                        <SelectTrigger className="h-14 rounded-xl border-2">
                          <SelectValue placeholder="Select your grade level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="elementary school">Elementary School</SelectItem>
                          <SelectItem value="middle school">Middle School</SelectItem>
                          <SelectItem value="high school">High School</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm font-semibold">
                      Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="••••••••"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                      />
                    </div>
                    <p className="caption text-muted-foreground">
                      Must be at least 8 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm" className="text-sm font-semibold">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        id="signup-confirm"
                        type="password"
                        placeholder="••••••••"
                        className="h-14 pl-12 rounded-xl border-2 transition-standard focus:scale-[1.01]"
                        required
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      id="terms"
                      className="mt-1 w-4 h-4 rounded border-2 border-input text-primary focus:ring-2 focus:ring-primary"
                      required
                    />
                    <label htmlFor="terms" className="body-small text-text-secondary leading-tight">
                      I agree to the{" "}
                      <Button 
                        type="button" 
                        variant="link" 
                        className="h-auto p-0 text-sm"
                      >
                        Terms of Service
                      </Button>{" "}
                      and{" "}
                      <Button 
                        type="button" 
                        variant="link" 
                        className="h-auto p-0 text-sm"
                      >
                        Privacy Policy
                      </Button>
                    </label>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-14 text-base group"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      "Creating account..."
                    ) : (
                      <>
                        Create Account
                        <ArrowRight className="w-5 h-5 transition-standard group-hover:translate-x-1" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-4 text-muted-foreground caption">
                      Or sign up with
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-12 transition-standard hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Google
                  </Button>
                  <Button 
                    type="button" 
                    variant="outline" 
                    className="h-12 transition-standard hover:scale-105"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                    </svg>
                    GitHub
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center mt-6 body-small text-text-secondary">
          Protected by industry-standard encryption
        </p>
      </div>
    </div>
  );
};

export default Auth;

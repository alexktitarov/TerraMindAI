import { NavLink } from "@/components/NavLink";
import { Home, TrendingUp, BookOpen, Award, LayoutDashboard, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";

const Logo = () => {
  const [imgError, setImgError] = useState(false);
  const [svgError, setSvgError] = useState(false);

  if (imgError && svgError) {
    // Fallback to text logo if both image formats fail
    return (
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
        <span className="text-white text-sm font-bold">TM</span>
      </div>
    );
  }

  return (
    <img 
      src={!imgError ? "/logo.png" : "/logo.svg"} 
      alt="TerraMindAI Logo" 
      className="w-9 h-9 object-contain"
      onError={() => {
        if (!imgError) {
          setImgError(true);
        } else {
          setSvgError(true);
        }
      }}
    />
  );
};

export const Navigation = () => {
  const { isAuthenticated, user, logout } = useAuth();


  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-12">
            <NavLink to="/" className="flex items-center gap-2.5 font-bold text-xl text-foreground">
              <Logo />
              <span>TerraMindAI</span>
            </NavLink>
            
            {isAuthenticated && (
              <div className="hidden md:flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="h-11">
                  <NavLink to="/" activeClassName="bg-primary/10 text-primary font-semibold">
                    <Home className="w-5 h-5" />
                    Home
                  </NavLink>
                </Button>
                <Button variant="ghost" size="sm" asChild className="h-11">
                  <NavLink to="/learn" activeClassName="bg-primary/10 text-primary font-semibold">
                    <BookOpen className="w-5 h-5" />
                    Learn
                  </NavLink>
                </Button>
                <Button variant="ghost" size="sm" asChild className="h-11">
                  <NavLink to="/data" activeClassName="bg-primary/10 text-primary font-semibold">
                    <TrendingUp className="w-5 h-5" />
                    Data
                  </NavLink>
                </Button>
                <Button variant="ghost" size="sm" asChild className="h-11">
                  <NavLink to="/progress" activeClassName="bg-primary/10 text-primary font-semibold">
                    <Award className="w-5 h-5" />
                    Progress
                  </NavLink>
                </Button>
                {(user?.role === 'TEACHER' || user?.role === 'ADMIN') && (
                  <Button variant="ghost" size="sm" asChild className="h-11">
                    <NavLink to="/dashboard" activeClassName="bg-primary/10 text-primary font-semibold">
                      <LayoutDashboard className="w-5 h-5" />
                      Dashboard
                    </NavLink>
                  </Button>
                )}
                {user?.role === 'ADMIN' && (
                  <Button variant="ghost" size="sm" asChild className="h-11">
                    <NavLink to="/admin" activeClassName="bg-primary/10 text-primary font-semibold">
                      <Shield className="w-5 h-5" />
                      Admin
                    </NavLink>
                  </Button>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-11">
                    <Avatar className="w-8 h-8 mr-2">
                      <AvatarFallback>
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline">{user?.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span>{user?.name}</span>
                      <span className="text-xs text-muted-foreground">{user?.email}</span>
                      <span className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase()}</span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button size="sm" asChild>
                <NavLink to="/auth">Get Started</NavLink>
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

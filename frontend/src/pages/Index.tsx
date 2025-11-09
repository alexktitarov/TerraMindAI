import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import { Zap, Target, Trophy, ArrowRight, ArrowUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import heroImage from "@/assets/hero-earth.jpg";

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative min-h-[600px] flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-background to-muted/30">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        
        {/* Decorative eco gradient chips - Green shades */}
        <div className="absolute top-20 right-20 w-32 h-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-32 left-32 w-40 h-40 rounded-full bg-sage/10 blur-3xl" />
        <div className="absolute top-40 left-20 w-24 h-24 rounded-full bg-accent/10 blur-3xl" />
        
        <div className="container mx-auto px-6 py-24 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="overline text-primary mb-4 animate-fade-in">QUALITY EDUCATION FOR ALL</div>
            <h1 className="mb-6 animate-slide-up">
              Learn Climate Science Through Interactive AI
            </h1>
            <p className="body-large text-text-secondary mb-8 max-w-2xl mx-auto">
              Explore real environmental data, engage with adaptive lessons, and earn rewards as you master climate change concepts. Join thousands of students making a difference.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button 
                size="lg" 
                onClick={() => {
                  if (isAuthenticated) {
                    navigate("/learn");
                  } else {
                    navigate("/auth");
                  }
                }}
              >
                Start Learning
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="lg" variant="secondary" onClick={() => navigate("/data")}>
                View Data
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-card">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <div className="overline text-primary mb-3">HOW IT WORKS</div>
            <h2 className="mb-4">Three Steps to Climate Mastery</h2>
            <p className="body-large text-text-secondary max-w-2xl mx-auto">
              Our platform combines AI tutoring, real data, and gamification to make learning climate science engaging and effective.
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <Card className="border-0 transition-standard hover:scale-105 hover:shadow-lg animate-scale-in">
              <CardContent className="pt-8 pb-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center mb-6">
                  <Zap className="w-7 h-7 text-white" />
                </div>
                <h3 className="mb-3">Interactive Lessons</h3>
                <p className="text-text-secondary body-small">
                  Learn through engaging conversations and visual content adapted to your learning pace and style.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 transition-standard hover:scale-105 hover:shadow-lg animate-scale-in" style={{ animationDelay: "0.1s" }}>
              <CardContent className="pt-8 pb-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sage to-sage/70 flex items-center justify-center mb-6">
                  <Target className="w-7 h-7 text-white" />
                </div>
                <h3 className="mb-3">Real Data Visualizations</h3>
                <p className="text-text-secondary body-small">
                  Explore actual climate data with interactive maps, temperature trends, and regional climate analysis from around the world.
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 transition-standard hover:scale-105 hover:shadow-lg animate-scale-in" style={{ animationDelay: "0.2s" }}>
              <CardContent className="pt-8 pb-8 px-6">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sage to-sage/70 flex items-center justify-center mb-6">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <h3 className="mb-3">Gamified Progress</h3>
                <p className="text-text-secondary body-small">
                  Earn badges and track your learning journey as you complete challenges and master topics.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="text-center">
              <div className="text-5xl font-extrabold text-primary mb-2">∞</div>
              <div className="body-small text-text-secondary">Interactive Lessons</div>
            </div>
            <div className="text-center">
              <div className="text-5xl font-extrabold text-secondary mb-2">24/7</div>
              <div className="body-small text-text-secondary">AI Tutor Access</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-primary/5 via-secondary/5 to-accent/5">
        <div className="container mx-auto px-6 text-center">
          <h2 className="mb-6 max-w-3xl mx-auto">Ready to Make a Difference?</h2>
          <div className="body-large text-text-secondary mb-10 max-w-2xl mx-auto space-y-4">
            <p>
              Join us and learn more about climate change, explore real environmental data, and become part of the solution.
            </p>
            <p>
              Start your learning journey today.
            </p>
          </div>
          <div className="flex justify-center">
            <Button size="lg" onClick={scrollToTop}>
              Back to Top
              <ArrowUp className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;

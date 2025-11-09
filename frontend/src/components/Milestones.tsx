import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Target, CheckCircle2, Lock, MapPin
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MilestonesProps {
  badges: any[];
  courses: any[];
  attempts: any[];
}

export const Milestones = ({ badges, courses, attempts }: MilestonesProps) => {
  const [unlockedMilestones, setUnlockedMilestones] = useState<Set<string>>(new Set());
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get all passed quizzes
  const passedQuizzes = attempts.filter((a: any) => a.passed);
  const totalPassed = passedQuizzes.length;

  // Create nodes - one for each passed quiz, plus many future nodes for scrolling
  const futureNodesCount = Math.max(20, totalPassed + 15); // Always show at least 20 future nodes, or passed + 15
  const maxNodes = totalPassed + futureNodesCount;
  
  const quizNodes = passedQuizzes.map((quiz: any, index: number) => ({
    id: `quiz-${quiz.id || index}`,
    quizId: quiz.quizId,
    score: quiz.score,
    passed: true,
    index,
    unlocked: true,
  }));

  // Add future/locked nodes
  const futureNodes = Array.from({ length: futureNodesCount }, (_, i) => ({
    id: `future-${i}`,
    quizId: null,
    score: null,
    passed: false,
    index: totalPassed + i,
    unlocked: false,
  }));

  const allNodes = [...quizNodes, ...futureNodes];

  // Detect newly unlocked nodes
  useEffect(() => {
    quizNodes.forEach((node) => {
      if (node.unlocked && !unlockedMilestones.has(node.id)) {
        setUnlockedMilestones((prev) => new Set(prev).add(node.id));
        setAnimatingIds((prev) => new Set(prev).add(node.id));
        
        // Remove animation after it completes
        setTimeout(() => {
          setAnimatingIds((prev) => {
            const next = new Set(prev);
            next.delete(node.id);
            return next;
          });
        }, 2000);
      }
    });
  }, [quizNodes, unlockedMilestones]);

  // Calculate road width based on number of nodes
  const nodeSpacing = 100; // Space between nodes (increased for better visibility)
  const padding = 50; // Small padding on sides for first/last node visibility
  const roadWidth = allNodes.length * nodeSpacing + (padding * 2);

  // Scroll to start when component mounts to ensure first node is fully visible
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
    }
  }, []);

  // Calculate positions for curvy road using sine wave
  // Account for padding: first node should be at padding position, not 0
  const getNodePosition = (index: number, total: number) => {
    const progress = total > 1 ? index / (total - 1) : 0;
    // Calculate x position accounting for padding on left
    // The road content area is roadWidth - (padding * 2)
    const contentWidth = roadWidth - (padding * 2);
    const x = padding + (progress * contentWidth); // Start at padding, then distribute across content width
    const xPercent = (x / roadWidth) * 100; // Convert to percentage for positioning
    const y = 50 + Math.sin(progress * Math.PI * 4) * 15; // Curvy path
    return { x: xPercent, y, xPx: x }; // Return both percentage and pixel for SVG
  };

  // Generate SVG path for curvy road
  const generatePath = () => {
    if (allNodes.length === 0) return '';
    if (allNodes.length === 1) {
      const pos = getNodePosition(0, 1);
      return `M ${pos.xPx} ${(pos.y / 100) * 200}`;
    }
    
    const points = allNodes.map((_, i) => {
      const pos = getNodePosition(i, allNodes.length);
      // Use pixel position for SVG coordinates
      const svgX = pos.xPx;
      const svgY = (pos.y / 100) * 200;
      return `${i === 0 ? 'M' : 'L'} ${svgX} ${svgY}`;
    });
    return points.join(' ');
  };

  return (
    <Card className="border-0">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <MapPin className="w-7 h-7 text-primary" />
          <CardTitle>Milestone Road</CardTitle>
        </div>
        <CardDescription className="body-small">
          Progress through milestones one by one on your learning journey
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div 
            ref={scrollContainerRef}
            className="relative w-full overflow-x-auto overflow-y-hidden pb-4 milestones-scroll"
            style={{ 
              scrollbarWidth: 'thin',
              scrollbarColor: 'hsl(var(--primary)) hsl(var(--muted))',
              WebkitOverflowScrolling: 'touch',
              scrollBehavior: 'smooth'
            }}
          >
            <div className="relative" style={{ width: `${roadWidth}px`, minHeight: '256px' }}>
              {/* SVG for curvy road path */}
              <svg 
                className="absolute inset-0" 
                viewBox={`0 0 ${roadWidth} 200`}
                preserveAspectRatio="none"
                style={{ width: `${roadWidth}px`, height: '200px' }}
              >
                <defs>
                  <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop 
                      offset="0%" 
                      stopColor="hsl(var(--primary))" 
                    />
                    <stop 
                      offset={`${allNodes.length > 0 ? Math.min((totalPassed / allNodes.length) * 100, 100) : 0}%`} 
                      stopColor="hsl(var(--primary))" 
                    />
                    <stop 
                      offset={`${allNodes.length > 0 ? Math.min((totalPassed / allNodes.length) * 100, 100) : 0}%`} 
                      stopColor="hsl(var(--border))" 
                    />
                    <stop 
                      offset="100%" 
                      stopColor="hsl(var(--border))" 
                    />
                  </linearGradient>
                </defs>
                {/* Curvy path */}
                {allNodes.length > 0 && (
                  <path
                    d={generatePath()}
                    fill="none"
                    stroke="url(#pathGradient)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all duration-500"
                  />
                )}
              </svg>

              {/* Nodes positioned along the curvy path */}
              <div className="relative" style={{ width: `${roadWidth}px`, height: '200px' }}>
                {allNodes.map((node, index) => {
                  const position = getNodePosition(index, allNodes.length);
                  const isUnlocked = node.unlocked;
                  const isAnimating = animatingIds.has(node.id);
                  const isNext = index === totalPassed;

                  return (
                    <Tooltip key={node.id}>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 cursor-pointer"
                          style={{
                            left: `${position.x}%`,
                            top: `${position.y}%`,
                          }}
                        >
                          <div
                            className={`relative w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all duration-500 ${
                              isUnlocked
                                ? 'border-primary bg-gradient-to-br from-primary to-secondary shadow-lg'
                                : isNext
                                ? 'border-primary/50 bg-primary/10'
                                : 'border-border bg-muted/30 opacity-50'
                            } ${
                              isAnimating ? 'animate-unlock scale-125 shadow-2xl z-10' : ''
                            }`}
                          >
                            {/* Unlock animation overlay */}
                            {isAnimating && (
                              <>
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/40 to-success/40 animate-ping" />
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 to-success/20 animate-pulse" />
                              </>
                            )}

                            {/* Icon - Target for passed quizzes */}
                            {isUnlocked ? (
                              <Target
                                className={`w-6 h-6 transition-colors duration-500 ${
                                  isUnlocked ? 'text-white' : 'text-muted-foreground'
                                }`}
                              />
                            ) : (
                              <Lock className="w-5 h-5 text-muted-foreground" />
                            )}

                            {/* Checkmark for unlocked */}
                            {isUnlocked && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-success flex items-center justify-center shadow-md">
                                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                              </div>
                            )}

                            {/* Next position indicator */}
                            {isNext && (
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background shadow-lg animate-pulse" />
                            )}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-1">
                          {isUnlocked ? (
                            <>
                              <div className="font-bold text-sm">Quiz Passed</div>
                              {node.score !== null && (
                                <div className="text-xs text-muted-foreground">
                                  Score: {typeof node.score === 'number' ? node.score.toFixed(0) : node.score}%
                                </div>
                              )}
                              <div className="text-xs text-success font-semibold">✓ Completed</div>
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-sm">Next Quiz</div>
                              <div className="text-xs text-muted-foreground">
                                Pass a quiz to unlock this node
                              </div>
                            </>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </div>
        </TooltipProvider>

        {/* Progress Info */}
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Target className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-base mb-1">Quiz Progress</h4>
              <p className="text-sm text-text-secondary">
                {totalPassed} quiz{totalPassed !== 1 ? 'es' : ''} passed
              </p>
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-text-secondary">Road Progress</span>
                  <span className="font-semibold">
                    {allNodes.length > 0 ? Math.round((totalPassed / allNodes.length) * 100) : 0}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${allNodes.length > 0 ? (totalPassed / allNodes.length) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-primary/5 to-transparent border border-primary/20">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-extrabold text-primary mb-1">{totalPassed}</div>
              <div className="text-xs text-text-secondary">Quizzes Passed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-primary mb-1">{allNodes.length}</div>
              <div className="text-xs text-text-secondary">Total Nodes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-extrabold text-primary mb-1">
                {allNodes.length > 0 ? Math.round((totalPassed / allNodes.length) * 100) : 0}%
              </div>
              <div className="text-xs text-text-secondary">Road Complete</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};


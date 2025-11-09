import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar } from "recharts";
import { TemperatureMap } from "@/components/TemperatureMap";
import ErrorBoundary from "@/components/ErrorBoundary";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Sample countries to aggregate for global trends (representing different regions)
const SAMPLE_COUNTRIES = [
  'United States', 'United Kingdom', 'Germany', 'France', 'Japan', 
  'Australia', 'Brazil', 'India', 'China', 'Russia',
  'Canada', 'Italy', 'Spain', 'Mexico', 'South Africa'
];

interface TemperatureTrend {
  year: number;
  avgTemp: number;
  avgChange: number;
  countryCount: number;
}

interface RegionalTrend {
  region: string;
  avgChange: number;
  countries: number;
}

const getRegion = (country: string): string => {
  const regions: Record<string, string> = {
    'United States': 'North America',
    'Canada': 'North America',
    'Mexico': 'North America',
    'United Kingdom': 'Europe',
    'Germany': 'Europe',
    'France': 'Europe',
    'Italy': 'Europe',
    'Spain': 'Europe',
    'Russia': 'Europe',
    'Japan': 'Asia',
    'China': 'Asia',
    'India': 'Asia',
    'Australia': 'Oceania',
    'Brazil': 'South America',
    'South Africa': 'Africa',
  };
  return regions[country] || 'Other';
};

const DataViz = () => {
  const { toast } = useToast();
  const [temperatureTrends, setTemperatureTrends] = useState<TemperatureTrend[]>([]);
  const [regionalTrends, setRegionalTrends] = useState<RegionalTrend[]>([]);
  const [temperatureChangeData, setTemperatureChangeData] = useState<Array<{ year: number; change: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    totalChange: number;
    avgChange: number;
    warmingRate: number;
    countriesAnalyzed: number;
  } | null>(null);

  // Load aggregated temperature data
  useEffect(() => {
    loadTemperatureTrends();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemperatureTrends = async () => {
    setLoading(true);
    try {
      // Load data from multiple countries to create aggregated trends
      const countriesData = await Promise.allSettled(
        SAMPLE_COUNTRIES.map(country => api.getCombinedCountryTemperature(country))
      );

      // Process absolute temperature data (1743-2013)
      const tempByYear = new Map<number, { temps: number[]; changes: number[] }>();
      let countriesWithData = 0;

      countriesData.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          const data = result.value;
          
          // Process absolute temperature data
          if (data.absolute_temperature?.available && data.absolute_temperature.data) {
            countriesWithData++;
            data.absolute_temperature.data.forEach((point: { year: number; temperature: number }) => {
              if (!tempByYear.has(point.year)) {
                tempByYear.set(point.year, { temps: [], changes: [] });
              }
              tempByYear.get(point.year)!.temps.push(point.temperature);
            });
          }

          // Process temperature change data (1961-2019)
          if (data.temperature_change?.available && data.temperature_change.data) {
            data.temperature_change.data.forEach((point: { year: number; temperature_change: number }) => {
              if (!tempByYear.has(point.year)) {
                tempByYear.set(point.year, { temps: [], changes: [] });
              }
              tempByYear.get(point.year)!.changes.push(point.temperature_change);
            });
          }
        }
      });

      // Calculate aggregated trends
      const trends: TemperatureTrend[] = [];
      const changeTrends: Array<{ year: number; change: number }> = [];
      let totalChangeSum = 0;
      let changeCount = 0;

      // Process absolute temperature trends (aggregate by year)
      Array.from(tempByYear.entries())
        .sort(([a], [b]) => a - b)
        .forEach(([year, data]) => {
          if (data.temps.length > 0) {
            const avgTemp = data.temps.reduce((sum, t) => sum + t, 0) / data.temps.length;
            trends.push({
              year,
              avgTemp,
              avgChange: data.changes.length > 0 
                ? data.changes.reduce((sum, c) => sum + c, 0) / data.changes.length 
                : 0,
              countryCount: Math.max(data.temps.length, data.changes.length)
            });
          }
          
          if (data.changes.length > 0) {
            const avgChange = data.changes.reduce((sum, c) => sum + c, 0) / data.changes.length;
            changeTrends.push({ year, change: avgChange });
            totalChangeSum += avgChange;
            changeCount++;
          }
        });

      setTemperatureTrends(trends);
      setTemperatureChangeData(changeTrends.sort((a, b) => a.year - b.year));

      // Calculate statistics
      if (changeTrends.length > 0) {
        const avgChange = totalChangeSum / changeCount;
        const firstChange = changeTrends[0].change;
        const lastChange = changeTrends[changeTrends.length - 1].change;
        const totalChange = lastChange - firstChange;
        const yearsSpan = changeTrends[changeTrends.length - 1].year - changeTrends[0].year;
        const warmingRate = yearsSpan > 0 ? (totalChange / yearsSpan) * 10 : 0; // per decade

        setStats({
          totalChange,
          avgChange,
          warmingRate,
          countriesAnalyzed: countriesWithData
        });
      }

      // Calculate regional trends (group countries by region)
      const regionalMap = new Map<string, { changes: number[]; countries: Set<string> }>();
      
      countriesData.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          const country = SAMPLE_COUNTRIES[index];
          const data = result.value;
          
          if (data.temperature_change?.statistics?.avg_change !== undefined) {
            const region = getRegion(country);
            if (!regionalMap.has(region)) {
              regionalMap.set(region, { changes: [], countries: new Set() });
            }
            regionalMap.get(region)!.changes.push(data.temperature_change.statistics.avg_change);
            regionalMap.get(region)!.countries.add(country);
          }
        }
      });

      const regional: RegionalTrend[] = Array.from(regionalMap.entries()).map(([region, data]) => ({
        region,
        avgChange: data.changes.reduce((sum, c) => sum + c, 0) / data.changes.length,
        countries: data.countries.size
      })).sort((a, b) => b.avgChange - a.avgChange);

      setRegionalTrends(regional);

    } catch (error) {
      console.error('Error loading temperature trends:', error);
      toast({
        title: 'Error',
        description: 'Failed to load temperature trends data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Format temperature trends for chart (use last 50 years if available, or all data)
  const chartData = temperatureTrends
    .filter(t => t.year >= 1960) // Focus on recent data
    .slice(-30) // Last 30 data points
    .map(t => ({
      year: t.year.toString(),
      temperature: Number(t.avgTemp.toFixed(2)),
      change: Number(t.avgChange.toFixed(2))
    }));

  // Calculate baseline (first year's temperature)
  const baseline = chartData.length > 0 ? chartData[0].temperature : 0;
  const chartDataWithBaseline = chartData.map(d => ({
    ...d,
    baseline: baseline
  }));

  // Temperature change data for CO₂ tab (renamed to Temperature Change Impact)
  const changeChartData = temperatureChangeData
    .filter(d => d.year >= 1961 && d.year <= 2019)
    .map(d => ({
      year: d.year.toString(),
      change: Number(d.change.toFixed(2))
    }));
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-6 py-16">
        <div className="mb-12">
          <div className="overline text-primary mb-3">REAL-TIME DATA</div>
          <h2 className="mb-3">Climate Data Visualizations</h2>
          <p className="body-large text-text-secondary max-w-2xl">
            Explore real-world environmental data through interactive charts and insights
          </p>
        </div>

        <Tabs defaultValue="map" className="space-y-8">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 h-12 bg-muted/50 p-1">
            <TabsTrigger value="map" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Interactive Map</TabsTrigger>
            <TabsTrigger value="temperature" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Temperature</TabsTrigger>
            <TabsTrigger value="co2" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Temperature Change</TabsTrigger>
            <TabsTrigger value="rainfall" className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm">Regional Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="space-y-6">
            <ErrorBoundary>
              <TemperatureMap />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="temperature" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Aggregated Temperature Trends</CardTitle>
                <CardDescription className="body-small">
                  Average temperature trends from our climate dataset (based on real data)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading temperature data...</span>
                  </div>
                ) : chartDataWithBaseline.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={chartDataWithBaseline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="year" 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        width={80}
                        label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          padding: "12px"
                        }}
                        formatter={(value: any) => [`${value}°C`, 'Temperature']}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke="hsl(var(--destructive))" 
                        strokeWidth={3}
                        name="Average Temperature (°C)"
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                      {baseline > 0 && (
                        <Line 
                          type="monotone" 
                          dataKey="baseline" 
                          stroke="hsl(var(--muted-foreground))" 
                          strokeDasharray="5 5"
                          strokeWidth={2}
                          name={`Baseline (${chartDataWithBaseline[0]?.year})`}
                          dot={false}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    No temperature data available. Please try again later.
                  </div>
                )}
              </CardContent>
            </Card>

            {stats && (
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-0 bg-gradient-to-br from-destructive/10 to-transparent transition-standard hover:scale-105">
                  <CardContent className="pt-6">
                    <div className="caption text-destructive mb-2">AVERAGE CHANGE</div>
                    <div className="text-4xl font-extrabold text-destructive mb-1">
                      {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">Average temperature change</p>
                  </CardContent>
                </Card>
                <Card className="border-0 bg-gradient-to-br from-primary/10 to-transparent transition-standard hover:scale-105">
                  <CardContent className="pt-6">
                    <div className="caption text-primary mb-2">WARMING RATE</div>
                    <div className="text-4xl font-extrabold text-primary mb-1">
                      +{stats.warmingRate.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">Per decade</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="co2" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Temperature Change Impact (1961-2019)</CardTitle>
                <CardDescription className="body-small">
                  Global temperature change trends from our climate dataset - showing the impact of climate change over time
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading temperature change data...</span>
                  </div>
                ) : changeChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={changeChartData}>
                      <defs>
                        <linearGradient id="colorChange" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="year" 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        width={100}
                        label={{ value: 'Temperature Change (°C)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          padding: "12px"
                        }}
                        formatter={(value: any) => [`${value > 0 ? '+' : ''}${value}°C`, 'Change']}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="change" 
                        stroke="hsl(var(--destructive))" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorChange)"
                        name="Temperature Change (°C)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    No temperature change data available. Please try again later.
                  </div>
                )}
              </CardContent>
            </Card>

            {stats && (
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="border-0 bg-gradient-to-br from-destructive/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-destructive mb-2">TOTAL CHANGE</div>
                    <div className="text-4xl font-extrabold text-destructive mb-1">
                      {stats.totalChange > 0 ? '+' : ''}{stats.totalChange.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">Overall temperature change</p>
                  </CardContent>
                </Card>
                <Card className="border-0 bg-gradient-to-br from-primary/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-primary mb-2">AVERAGE CHANGE</div>
                    <div className="text-4xl font-extrabold text-primary mb-1">
                      {stats.avgChange > 0 ? '+' : ''}{stats.avgChange.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">Average across countries</p>
                  </CardContent>
                </Card>
                <Card className="border-0 bg-gradient-to-br from-accent/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-accent mb-2">WARMING RATE</div>
                    <div className="text-4xl font-extrabold text-accent mb-1">
                      +{stats.warmingRate.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">Per decade</p>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          <TabsContent value="rainfall" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Regional Climate Trends</CardTitle>
                <CardDescription className="body-small">
                  Average temperature change by region based on countries in our dataset
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading regional data...</span>
                  </div>
                ) : regionalTrends.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={regionalTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="region" 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        stroke="hsl(var(--text-secondary))" 
                        style={{ fontSize: '12px' }}
                        width={100}
                        label={{ value: 'Temperature Change (°C)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "hsl(var(--card))", 
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "12px",
                          padding: "12px"
                        }}
                        formatter={(value: any) => [`${value > 0 ? '+' : ''}${value.toFixed(2)}°C`, 'Change']}
                        labelFormatter={(label) => `Region: ${label}`}
                      />
                      <Legend />
                      <Bar 
                        dataKey="avgChange" 
                        name="Average Change (°C)"
                        radius={[8, 8, 0, 0]}
                        fill="hsl(var(--primary))"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    No regional data available. Please try again later.
                  </div>
                )}
              </CardContent>
            </Card>

            {regionalTrends.length > 0 && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regionalTrends.map((region, index) => (
                  <Card key={region.region} className="border-0 bg-gradient-to-br from-primary/10 to-transparent">
                    <CardContent className="pt-6">
                      <div className="caption text-primary mb-2">{region.region.toUpperCase()}</div>
                      <div className="text-4xl font-extrabold text-primary mb-1">
                        {region.avgChange > 0 ? '+' : ''}{region.avgChange.toFixed(2)}°C
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default DataViz;

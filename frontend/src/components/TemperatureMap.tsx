import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJsonObject, FeatureCollection, Feature } from 'geojson';

// Fix for default marker icons in Leaflet with Vite/Webpack
// Delete the default icon paths that are not working
delete (L.Icon.Default.prototype as any)._getIconUrl;

// Set up the default icon using CDN or public assets
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface CombinedCountryTemperatureData {
  success: boolean;
  country: string;
  absolute_temperature?: {
    available: boolean;
    data: Array<{ year: number; temperature: number; change_from_start: number }>;
    statistics: {
      min_year: number;
      max_year: number;
      min_temp: number;
      max_temp: number;
      avg_temp: number;
      trend_per_century: number;
      total_change: number;
      data_points: number;
    };
  };
  temperature_change?: {
    available: boolean;
    data: Array<{ year: number; temperature_change: number }>;
    statistics: {
      min_year: number;
      max_year: number;
      min_change: number;
      max_change: number;
      avg_change: number;
      trend_per_century: number;
      total_change: number;
      data_points: number;
    };
  };
}

// Component to set map bounds and prevent infinite scrolling
function MapBoundsSetter() {
  const map = useMap();

  useEffect(() => {
    // Set map bounds to prevent infinite horizontal scrolling
    const bounds = L.latLngBounds([-85, -180], [85, 180]);
    
    // Set bounds - this prevents the map from scrolling beyond these limits
    map.setMaxBounds(bounds);
    map.setMinZoom(2);
    map.setMaxZoom(10);
    
    // Ensure map doesn't wrap - this is the key to preventing infinite scrolling
    map.options.worldCopyJump = false;
    
    // Additional safeguard: check bounds on moveend
    const enforceBounds = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      
      // Constrain latitude
      const lat = Math.max(-85, Math.min(85, center.lat));
      
      // Constrain longitude to prevent wrapping
      let lng = center.lng;
      if (lng > 180) lng = 180;
      if (lng < -180) lng = -180;
      
      // If center changed, update it
      if (lat !== center.lat || lng !== center.lng) {
        map.setView([lat, lng], zoom, { animate: false });
      }
    };
    
    map.on('moveend', enforceBounds);
    
    // Also check on dragend as a safeguard
    map.on('dragend', enforceBounds);
    
    return () => {
      map.off('moveend', enforceBounds);
      map.off('dragend', enforceBounds);
    };
  }, [map]);

  return null;
}

// Component to update map center when country changes
function MapUpdater({ 
  country, 
  onCountryClick 
}: { 
  country: string;
  onCountryClick?: (countryName: string) => void;
}) {
  const map = useMap();
  const [countryCoordinates, setCountryCoordinates] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout;

    // Use Nominatim (OpenStreetMap's geocoding service) to get country coordinates
    // Note: Nominatim has rate limiting, so we add a small delay
    const fetchCountryCoordinates = async () => {
      try {
        // Add a small delay to respect rate limits (1 request per second recommended)
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!isMounted) return;
        
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(country)}&limit=1&addressdetails=1`,
          {
            headers: {
              'User-Agent': 'TerraMindAI Climate Visualization', // Required by Nominatim
              'Accept-Language': 'en'
            }
          }
        );
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (!isMounted) return;
        
        if (data && data.length > 0) {
          const { lat, lon } = data[0];
          const coordinates = { lat: parseFloat(lat), lng: parseFloat(lon) };
          setCountryCoordinates(coordinates);
          map.setView([coordinates.lat, coordinates.lng], 5, {
            animate: true,
            duration: 1.0
          });
        } else {
          console.warn(`No coordinates found for country: ${country}`);
          // Fallback to a default world view
          if (isMounted) {
            map.setView([20, 0], 2);
          }
        }
      } catch (error) {
        console.error('Error fetching country coordinates:', error);
        // Fallback to a default world view on error
        if (isMounted) {
          map.setView([20, 0], 2);
        }
      }
    };

    if (country) {
      timeoutId = setTimeout(() => {
        fetchCountryCoordinates();
      }, 100);
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [country, map]);

  return countryCoordinates ? (
    <Marker position={[countryCoordinates.lat, countryCoordinates.lng]}>
      <Popup>
        <div className="text-center">
          <strong>{country}</strong>
          <br />
          <span className="text-sm text-gray-600">Temperature data available</span>
        </div>
      </Popup>
    </Marker>
  ) : null;
}

// Helper function to get color based on temperature
// Returns a color from blue (cold) to red (hot)
function getTemperatureColor(temp: number | undefined): string {
  if (temp === undefined || isNaN(temp)) {
    return '#e5e7eb'; // Gray for no data
  }
  
  // Temperature range: -20°C to 40°C (typical range for countries)
  // We'll use a color scale from blue (cold) to red (hot)
  const minTemp = -20;
  const maxTemp = 40;
  const normalizedTemp = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
  
  // Color interpolation: blue -> cyan -> green -> yellow -> orange -> red
  let r, g, b;
  
  if (normalizedTemp < 0.2) {
    // Blue to Cyan (cold)
    const t = normalizedTemp / 0.2;
    r = Math.floor(0 + t * 0);
    g = Math.floor(100 + t * 255);
    b = Math.floor(200 + t * 55);
  } else if (normalizedTemp < 0.4) {
    // Cyan to Green (cool)
    const t = (normalizedTemp - 0.2) / 0.2;
    r = Math.floor(0 + t * 0);
    g = 255;
    b = Math.floor(255 + t * (-255));
  } else if (normalizedTemp < 0.6) {
    // Green to Yellow (moderate)
    const t = (normalizedTemp - 0.4) / 0.2;
    r = Math.floor(0 + t * 255);
    g = 255;
    b = 0;
  } else if (normalizedTemp < 0.8) {
    // Yellow to Orange (warm)
    const t = (normalizedTemp - 0.6) / 0.2;
    r = 255;
    g = Math.floor(255 + t * (-100));
    b = 0;
  } else {
    // Orange to Red (hot)
    const t = (normalizedTemp - 0.8) / 0.2;
    r = 255;
    g = Math.floor(155 + t * (-155));
    b = 0;
  }
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Helper function to get color based on temperature change
// Returns a color from blue (cooling) to red (warming)
// Temperature change is typically in range -2°C to +3°C
function getTemperatureChangeColor(change: number | undefined): string {
  if (change === undefined || isNaN(change)) {
    return '#e5e7eb'; // Gray for no data
  }
  
  // Temperature change range: -2°C to +3°C
  // Negative change = cooling (blue), positive change = warming (red)
  const minChange = -2;
  const maxChange = 3;
  const normalizedChange = Math.max(0, Math.min(1, (change - minChange) / (maxChange - minChange)));
  
  // Color interpolation: blue (cooling) -> white (neutral) -> red (warming)
  let r, g, b;
  
  if (normalizedChange < 0.5) {
    // Blue to White (cooling to neutral)
    const t = normalizedChange / 0.5;
    r = Math.floor(50 + t * 205);
    g = Math.floor(100 + t * 155);
    b = Math.floor(200 + t * 55);
  } else {
    // White to Red (neutral to warming)
    const t = (normalizedChange - 0.5) / 0.5;
    r = Math.floor(255 + t * 0);
    g = Math.floor(255 + t * (-155));
    b = Math.floor(255 + t * (-200));
  }
  
  return `rgb(${r}, ${g}, ${b})`;
}

// Component to handle country GeoJSON layer with click events
function CountriesLayer({ 
  countries, 
  selectedCountry, 
  onCountryClick,
  temperatureCache
}: { 
  countries: string[]; // This should be filteredCountries
  selectedCountry: string;
  onCountryClick: (countryName: string) => void;
  temperatureCache: Map<string, { avgTemp?: number; avgChange?: number; hasAbsolute: boolean; hasChange: boolean }>;
}) {
  const map = useMap();
  const [geoJsonData, setGeoJsonData] = useState<FeatureCollection | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  
  // Create a Set for fast lookup (normalize country names)
  const countriesSet = useMemo(() => new Set(countries.map(c => c.toLowerCase().trim())), [countries]);

  // Load GeoJSON data for countries
  useEffect(() => {
    let isMounted = true;
    
    const loadGeoJson = async () => {
      try {
        // Using a lightweight world countries GeoJSON from a CDN
        // This is a simplified version - in production, you might want to host your own
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson', {
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to load GeoJSON: ${response.status}`);
        }
        
        const data = await response.json() as FeatureCollection;
        
        if (!isMounted) return;
        
        if (data && data.features && Array.isArray(data.features)) {
          setGeoJsonData(data);
        } else {
          console.error('Invalid GeoJSON data format');
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn('GeoJSON loading timeout');
        } else {
          console.error('Error loading GeoJSON:', error);
        }
        
        // Fallback: Try alternative source
        if (isMounted) {
          try {
            const controller2 = new AbortController();
            const timeoutId2 = setTimeout(() => controller2.abort(), 10000);
            
            const response = await fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json', {
              signal: controller2.signal
            });
            
            clearTimeout(timeoutId2);
            if (response.ok) {
              const data = await response.json() as FeatureCollection;
              if (isMounted && data && data.features) {
                setGeoJsonData(data);
                return;
              }
            }
          } catch (e) {
            console.error('All GeoJSON sources failed:', e);
            // Don't set error state - just don't render the layer
          }
        }
      }
    };

    loadGeoJson();
    
    return () => {
      isMounted = false;
    };
  }, []);

  // Helper function to find matching country name - memoized with useCallback
  const findMatchingCountry = useCallback((geoJsonName: string): string | null => {
    const geoJsonNameLower = geoJsonName.toLowerCase().trim();
    
    // Check if it's in the excluded list
    if (EXCLUDED_COUNTRIES.some(excluded => geoJsonNameLower.includes(excluded.toLowerCase()))) {
      return null;
    }
    
    // Check name mappings first
    const mappedName = COUNTRY_NAME_MAPPINGS[geoJsonName] || COUNTRY_NAME_MAPPINGS[geoJsonName.split('(')[0].trim()];
    if (mappedName && countries.includes(mappedName)) {
      return mappedName;
    }
    
    // Try exact match first
    for (const country of countries) {
      if (country.toLowerCase().trim() === geoJsonNameLower) {
        return country;
      }
    }
    
    // Try matching with common variations
    const variations: string[] = [];
    if (geoJsonNameLower.includes('united states') || geoJsonNameLower === 'usa' || geoJsonNameLower === 'us') {
      variations.push('united states');
    }
    if (geoJsonNameLower.includes('united kingdom') || geoJsonNameLower === 'uk' || 
        geoJsonNameLower.includes('great britain') || geoJsonNameLower === 'britain' ||
        geoJsonNameLower === 'england' || geoJsonNameLower === 'scotland' || geoJsonNameLower === 'wales') {
      variations.push('united kingdom');
    }
    if (geoJsonNameLower.includes('russia')) {
      variations.push('russia');
    }
    if (geoJsonNameLower.includes('czech')) {
      variations.push('czechia', 'czech republic');
    }
    if (geoJsonNameLower.includes('burma')) {
      variations.push('myanmar');
    }
    if (geoJsonNameLower.includes('ivory coast')) {
      variations.push('côte d\'ivoire');
    }
    if (geoJsonNameLower.includes('swaziland')) {
      variations.push('eswatini');
    }
    if (geoJsonNameLower.includes('macedonia') && !geoJsonNameLower.includes('north')) {
      variations.push('north macedonia');
    }
    if (geoJsonNameLower.includes('bahamas')) {
      variations.push('bahamas');
    }
    if (geoJsonNameLower.includes('gambia')) {
      variations.push('gambia');
    }
    
    for (const variation of variations) {
      for (const country of countries) {
        if (country.toLowerCase().trim() === variation) {
          return country;
        }
      }
    }
    
    // Try partial matches (more lenient)
    for (const country of countries) {
      const countryLower = country.toLowerCase().trim();
      // Remove common words for better matching
      const cleanGeoJson = geoJsonNameLower.replace(/\b(the|republic of|kingdom of|state of)\b/g, '').trim();
      const cleanCountry = countryLower.replace(/\b(the|republic of|kingdom of|state of)\b/g, '').trim();
      
      if (cleanCountry === cleanGeoJson || 
          cleanCountry.includes(cleanGeoJson) || 
          cleanGeoJson.includes(cleanCountry) ||
          countryLower.includes(geoJsonNameLower) || 
          geoJsonNameLower.includes(countryLower)) {
        return country;
      }
    }
    
    return null;
  }, [countries]);

  // Style function for countries - memoized with useCallback
  const getCountryStyle = useCallback((feature: Feature) => {
    const geoJsonName = feature.properties?.name || feature.properties?.NAME || feature.properties?.NAME_LONG || feature.properties?.ADMIN || '';
    const matchingCountry = findMatchingCountry(geoJsonName);
    const hasData = matchingCountry !== null;
    const isSelected = matchingCountry && selectedCountry.toLowerCase() === matchingCountry.toLowerCase();
    
    // Get temperature data from cache
    const tempData = matchingCountry ? temperatureCache.get(matchingCountry.toLowerCase()) : null;
    const avgTemp = tempData?.avgTemp;
    const avgChange = tempData?.avgChange;
    
    // Get color based on temperature if available, otherwise use default colors
    // Priority: absolute temperature > temperature change > default green > gray
    let fillColor: string;
    let borderColor: string;
    
    if (isSelected) {
      // Selected country - use a distinct color (dark green/teal) with border
      fillColor = '#15803D';
      borderColor = '#0f766e';
    } else if (hasData && avgTemp !== undefined) {
      // Has absolute temperature data - use temperature-based color
      fillColor = getTemperatureColor(avgTemp);
      borderColor = getTemperatureColor(avgTemp);
    } else if (hasData && avgChange !== undefined) {
      // Has temperature change data - use change-based color
      // Convert change to a color: negative (cooling) = blue, positive (warming) = red
      fillColor = getTemperatureChangeColor(avgChange);
      borderColor = getTemperatureChangeColor(avgChange);
    } else if (hasData) {
      // Has data but no temperature yet (still loading) - use neutral green
      fillColor = '#22c55e';
      borderColor = '#16a34a';
    } else {
      // No data - gray out countries without data (more visible gray)
      fillColor = '#9ca3af'; // Medium gray - more visible
      borderColor = '#6b7280'; // Darker gray border for better visibility
    }

    return {
      fillColor,
      weight: isSelected ? 3 : hasData ? 2 : 1,
      opacity: 1,
      color: borderColor,
      fillOpacity: isSelected ? 0.8 : hasData ? (avgTemp !== undefined ? 0.6 : 0.5) : 0.5, // More visible gray for no data
      cursor: hasData ? 'pointer' : 'default',
    };
  }, [findMatchingCountry, selectedCountry, temperatureCache]);

  // Handle country click - memoized with useCallback
  const onEachCountry = useCallback((feature: Feature, layer: L.Layer) => {
    const geoJsonName = feature.properties?.name || feature.properties?.NAME || feature.properties?.NAME_LONG || feature.properties?.ADMIN || '';
    const matchingCountry = findMatchingCountry(geoJsonName);
    const hasData = matchingCountry !== null;

    if (hasData && matchingCountry) {
      layer.on({
        click: () => {
          onCountryClick(matchingCountry);
        },
        mouseover: (e) => {
          const layer = e.target;
          // Only show popup on hover, don't change color
          if (!layer.isPopupOpen()) {
            layer.openPopup();
          }
        },
        mouseout: (e) => {
          const layer = e.target;
          // Only close popup if country is not selected
          if (selectedCountry.toLowerCase() !== matchingCountry!.toLowerCase()) {
            layer.closePopup();
          }
        },
      });

      // Get temperature data from cache - show both Absolute Temperature and Temperature Change if available
      const tempData = temperatureCache.get(matchingCountry.toLowerCase());
      let tempInfo = '';
      
      if (tempData) {
        const parts: string[] = [];
        
        // Add Absolute Temperature if available
        if (tempData.hasAbsolute && tempData.avgTemp !== undefined) {
          parts.push(
            `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ddd;">
              <span style="font-size: 11px; color: #888;">Absolute Temperature: </span>
              <strong style="font-size: 13px; color: #dc2626;">${tempData.avgTemp.toFixed(1)}°C</strong>
            </div>`
          );
        }
        
        // Add Temperature Change if available
        if (tempData.hasChange && tempData.avgChange !== undefined) {
          parts.push(
            `<div style="margin-top: 4px; padding-top: 4px; ${parts.length > 0 ? '' : 'border-top: 1px solid #ddd;'}">
              <span style="font-size: 11px; color: #888;">Temperature Change: </span>
              <strong style="font-size: 13px; color: #0891b2;">${tempData.avgChange > 0 ? '+' : ''}${tempData.avgChange.toFixed(1)}°C</strong>
            </div>`
          );
        }
        
        tempInfo = parts.join('');
      }

      // Add popup with matching country name and temperature data (both datasets if available)
      layer.bindPopup(
        `<div style="text-align: center; padding: 8px; min-width: 140px;">
          <strong style="font-size: 14px;">${matchingCountry}</strong>
          ${tempInfo}
          <div style="margin-top: 6px;">
            <span style="font-size: 11px; color: #666;">Click to view details</span>
          </div>
        </div>`, 
        {
          className: 'country-popup'
        }
      );
    } else {
      // Countries without data - no hover effects, just show popup if needed
      // (No popup for countries without data, so no hover handlers needed)
    }
  }, [findMatchingCountry, getCountryStyle, selectedCountry, onCountryClick, temperatureCache]);
  
  // Update styles and popups when selectedCountry or temperatureCache changes
  useEffect(() => {
    if (layerRef.current && geoJsonData) {
      layerRef.current.eachLayer((layer: any) => {
        if (layer.feature) {
          layer.setStyle(getCountryStyle(layer.feature));
          
          // Update popup if country has data and cache is available
          const geoJsonName = layer.feature.properties?.name || layer.feature.properties?.NAME || layer.feature.properties?.NAME_LONG || layer.feature.properties?.ADMIN || '';
          const matchingCountry = findMatchingCountry(geoJsonName);
          
          if (matchingCountry) {
            const tempData = temperatureCache.get(matchingCountry.toLowerCase());
            let tempInfo = '';
            
            if (tempData) {
              const parts: string[] = [];
              
              // Add Absolute Temperature if available
              if (tempData.hasAbsolute && tempData.avgTemp !== undefined) {
                parts.push(
                  `<div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid #ddd;">
                    <span style="font-size: 11px; color: #888;">Absolute Temperature: </span>
                    <strong style="font-size: 13px; color: #dc2626;">${tempData.avgTemp.toFixed(1)}°C</strong>
                  </div>`
                );
              }
              
              // Add Temperature Change if available
              if (tempData.hasChange && tempData.avgChange !== undefined) {
                parts.push(
                  `<div style="margin-top: 4px; padding-top: 4px; ${parts.length > 0 ? '' : 'border-top: 1px solid #ddd;'}">
                    <span style="font-size: 11px; color: #888;">Temperature Change: </span>
                    <strong style="font-size: 13px; color: #0891b2;">${tempData.avgChange > 0 ? '+' : ''}${tempData.avgChange.toFixed(1)}°C</strong>
                  </div>`
                );
              }
              
              tempInfo = parts.join('');
            }
            
            layer.setPopupContent(
              `<div style="text-align: center; padding: 8px; min-width: 140px;">
                <strong style="font-size: 14px;">${matchingCountry}</strong>
                ${tempInfo}
                <div style="margin-top: 6px;">
                  <span style="font-size: 11px; color: #666;">Click to view details</span>
                </div>
              </div>`
            );
          }
        }
      });
    }
  }, [selectedCountry, getCountryStyle, geoJsonData, temperatureCache, findMatchingCountry]);

  if (!geoJsonData) {
    return null;
  }

  return (
    <GeoJSON
      data={geoJsonData}
      style={getCountryStyle}
      onEachFeature={onEachCountry}
      ref={layerRef}
    />
  );
}

// Countries that no longer exist or should be excluded
const EXCLUDED_COUNTRIES = [
  'USSR',
  'Soviet Union',
  'Yugoslavia',
  'Czechoslovakia',
  'East Germany',
  'West Germany',
  'South Yemen',
  'North Yemen',
];

// Country name mappings for better matching (GeoJSON name -> API name)
const COUNTRY_NAME_MAPPINGS: Record<string, string> = {
  'United States of America': 'United States',
  'United States': 'United States',
  'USA': 'United States',
  'US': 'United States',
  'United Kingdom': 'United Kingdom',
  'UK': 'United Kingdom',
  'Great Britain': 'United Kingdom',
  'Britain': 'United Kingdom',
  'Russian Federation': 'Russia',
  'Russian Federation (Asian part)': 'Russia',
  'Russian Federation (European part)': 'Russia',
  'Czech Republic': 'Czechia',
  'Czechia': 'Czechia',
  'Republic of the Congo': 'Congo',
  'Democratic Republic of the Congo': 'Congo',
  'Burma': 'Myanmar',
  'Myanmar': 'Myanmar',
  'Ivory Coast': 'Côte d\'Ivoire',
  'Côte d\'Ivoire': 'Côte d\'Ivoire',
  'Swaziland': 'Eswatini',
  'Eswatini': 'Eswatini',
  'Macedonia': 'North Macedonia',
  'North Macedonia': 'North Macedonia',
  'The Bahamas': 'Bahamas',
  'Bahamas': 'Bahamas',
  'The Gambia': 'Gambia',
  'Gambia': 'Gambia',
};

export const TemperatureMap = () => {
  const { toast } = useToast();
  const [countries, setCountries] = useState<string[]>([]);
  const [filteredCountries, setFilteredCountries] = useState<string[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [temperatureData, setTemperatureData] = useState<CombinedCountryTemperatureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [activeDataset, setActiveDataset] = useState<'absolute' | 'change'>('absolute');
  const [mapReady, setMapReady] = useState(false);
  // Cache for country temperature data (for map popups)
  const [temperatureCache, setTemperatureCache] = useState<Map<string, { avgTemp?: number; avgChange?: number; hasAbsolute: boolean; hasChange: boolean }>>(new Map());
  const [loadingTemperatures, setLoadingTemperatures] = useState(false);

  // Load available countries on mount
  useEffect(() => {
    loadCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load temperature data when country is selected
  useEffect(() => {
    if (selectedCountry) {
      loadCountryTemperature(selectedCountry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCountry]);

  const loadCountries = async () => {
    try {
      setLoadingCountries(true);
      const response = await api.getAvailableCountries();
      if (response.success) {
        // Filter out excluded countries
        const filtered = response.countries.filter(country => 
          !EXCLUDED_COUNTRIES.some(excluded => 
            country.toLowerCase().includes(excluded.toLowerCase()) ||
            excluded.toLowerCase().includes(country.toLowerCase())
          )
        );
        setCountries(response.countries);
        setFilteredCountries(filtered);
        // Don't preselect any country - show overview of all continents
        // Pre-load temperature data for map popups (load in batches to avoid overwhelming the API)
        loadTemperatureCache(filtered);
      }
    } catch (error: any) {
      console.error('Error loading countries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load available countries',
        variant: 'destructive',
      });
    } finally {
      setLoadingCountries(false);
    }
  };

  // Load temperature cache for countries (for map popups)
  const loadTemperatureCache = async (countriesList: string[]) => {
    if (loadingTemperatures || countriesList.length === 0) return;
    
    try {
      setLoadingTemperatures(true);
      const cache = new Map<string, { avgTemp?: number; avgChange?: number; hasAbsolute: boolean; hasChange: boolean }>();
      
      // Load temperature data for ALL countries to ensure map is fully colored on page load
      // Load in batches of 5 to avoid overwhelming the API
      const batchSize = 5;
      const maxCountries = countriesList.length; // Load ALL countries
      
      for (let i = 0; i < maxCountries; i += batchSize) {
        const batch = countriesList.slice(i, i + batchSize);
        const promises = batch.map(async (country) => {
          try {
            const data = await api.getCombinedCountryTemperature(country);
            if (data.success) {
              const hasAbsolute = data.absolute_temperature?.available && 
                                  data.absolute_temperature?.data && 
                                  data.absolute_temperature.data.length > 0;
              const hasChange = data.temperature_change?.available && 
                                data.temperature_change?.data && 
                                data.temperature_change.data.length > 0;
              
              const avgTemp = hasAbsolute && data.absolute_temperature?.statistics?.avg_temp 
                ? data.absolute_temperature.statistics.avg_temp 
                : undefined;
              const avgChange = hasChange && data.temperature_change?.statistics?.avg_change 
                ? data.temperature_change.statistics.avg_change 
                : undefined;
              
              if (hasAbsolute || hasChange) {
                cache.set(country.toLowerCase(), {
                  avgTemp,
                  avgChange,
                  hasAbsolute,
                  hasChange,
                });
              }
            }
          } catch (error) {
            // Silently fail for individual countries to avoid spam
            console.debug(`Failed to load temperature for ${country}:`, error);
          }
        });
        
        await Promise.all(promises);
        
        // Update cache after each batch (incremental updates)
        setTemperatureCache(prevCache => {
          const newCache = new Map(prevCache);
          cache.forEach((value, key) => {
            newCache.set(key, value);
          });
          return newCache;
        });
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < maxCountries) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } catch (error) {
      console.error('Error loading temperature cache:', error);
    } finally {
      setLoadingTemperatures(false);
    }
  };

  const loadCountryTemperature = async (country: string) => {
    if (!country) return;

    try {
      setLoading(true);
      console.log('[TemperatureMap] Loading temperature data for:', country);
      const data = await api.getCombinedCountryTemperature(country);
      console.log('[TemperatureMap] Temperature data response:', data);
      
      if (data.success) {
        // Check if we have actual data (not just the structure)
        const hasAbsoluteData = data.absolute_temperature?.available && 
                                data.absolute_temperature?.data && 
                                Array.isArray(data.absolute_temperature.data) && 
                                data.absolute_temperature.data.length > 0;
        const hasChangeData = data.temperature_change?.available && 
                              data.temperature_change?.data && 
                              Array.isArray(data.temperature_change.data) && 
                              data.temperature_change.data.length > 0;
        
        console.log('[TemperatureMap] Data availability:', {
          hasAbsoluteData,
          hasChangeData,
          absoluteDataLength: data.absolute_temperature?.data?.length || 0,
          changeDataLength: data.temperature_change?.data?.length || 0,
        });
        
        // Only set temperature data if we have at least one dataset with actual data
        if (hasAbsoluteData || hasChangeData) {
          setTemperatureData(data);
          
          // Update temperature cache for this country (always update to ensure we have latest data)
          const avgTemp = hasAbsoluteData && data.absolute_temperature?.statistics?.avg_temp 
            ? data.absolute_temperature.statistics.avg_temp 
            : undefined;
          const avgChange = hasChangeData && data.temperature_change?.statistics?.avg_change 
            ? data.temperature_change.statistics.avg_change 
            : undefined;
          
          // Update cache with new data
          setTemperatureCache(prevCache => {
            const newCache = new Map(prevCache);
            const existing = newCache.get(country.toLowerCase());
            newCache.set(country.toLowerCase(), {
              avgTemp: avgTemp !== undefined ? avgTemp : existing?.avgTemp,
              avgChange: avgChange !== undefined ? avgChange : existing?.avgChange,
              hasAbsolute: hasAbsoluteData || existing?.hasAbsolute || false,
              hasChange: hasChangeData || existing?.hasChange || false,
            });
            return newCache;
          });
          
          // Determine which dataset to show by default
          if (hasAbsoluteData && hasChangeData) {
            // Both available - default to absolute, user can toggle
            setActiveDataset('absolute');
          } else if (hasAbsoluteData) {
            // Only absolute available
            setActiveDataset('absolute');
          } else if (hasChangeData) {
            // Only change available
            setActiveDataset('change');
          }
        } else {
          // No data available - clear temperature data
          console.warn('[TemperatureMap] No temperature data available for', country);
          setTemperatureData(null);
          toast({
            title: 'No Data Available',
            description: `No temperature data found for ${country}. Please try another country.`,
            variant: 'destructive',
          });
        }
      } else {
        console.error('[TemperatureMap] API returned unsuccessful response');
        setTemperatureData(null);
        toast({
          title: 'Error',
          description: data.error || `Failed to load temperature data for ${country}`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('[TemperatureMap] Error loading temperature data:', error);
      console.error('[TemperatureMap] Error details:', error.response?.data);
      setTemperatureData(null);
      const errorMessage = error.response?.data?.message || error.message || `Failed to load temperature data for ${country}`;
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCountrySelect = (country: string) => {
    setSelectedCountry(country);
    // Temperature data will be loaded by useEffect when selectedCountry changes
  };

  if (loadingCountries) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center p-6 min-h-[500px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading countries...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Country Selector with Autocomplete */}
      <Card>
        <CardHeader>
          <CardTitle>Select Country</CardTitle>
          <CardDescription>
            Type to search or click on a country on the map.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Combobox
            options={filteredCountries.map(country => ({ value: country, label: country }))}
            value={selectedCountry}
            onValueChange={handleCountrySelect}
            placeholder="Type to search countries..."
            searchPlaceholder="Search countries..."
            emptyText="No countries found."
            disabled={loadingCountries}
            className="w-full md:w-[400px]"
          />
          <p className="text-sm text-muted-foreground mt-2">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded mr-1"></span>
            Countries are colored by temperature (blue = cold, red = hot).
          </p>
        </CardContent>
      </Card>

      {/* Interactive Map */}
      <Card>
        <CardHeader>
          <CardTitle>Interactive Global Temperature Map</CardTitle>
          <CardDescription>
            {filteredCountries.length > 0 ? (
              <>Select a country from the dropdown or click on the map to view its temperature data. Gray color indicates countries with no available data.</>
            ) : (
              <>Loading countries...</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative" style={{ position: 'relative', zIndex: 0 }}>
          <div 
            className="leaflet-container-wrapper" 
            style={{ 
              height: '500px', 
              width: '100%', 
              borderRadius: '8px', 
              overflow: 'hidden',
              position: 'relative',
              zIndex: 0,
              isolation: 'isolate'
            }}
          >
            <MapContainer
              center={[20, 0]}
              zoom={2}
              minZoom={2}
              maxZoom={10}
              className="h-full w-full"
              style={{ height: '100%', width: '100%', position: 'relative' }}
              whenReady={() => setMapReady(true)}
              maxBounds={[[-85, -180], [85, 180]]}
              maxBoundsViscosity={1.0}
              worldCopyJump={false}
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                noWrap={true}
              />
              <MapBoundsSetter />
              {mapReady && filteredCountries.length > 0 && (
                <CountriesLayer 
                  countries={filteredCountries}
                  selectedCountry={selectedCountry}
                  onCountryClick={handleCountrySelect}
                  temperatureCache={temperatureCache}
                />
              )}
            </MapContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureColor(0) }}></span>
              Absolute: Cold (0°C)
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureColor(10) }}></span>
              Absolute: Moderate (10°C)
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureColor(20) }}></span>
              Absolute: Warm (20°C)
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureColor(30) }}></span>
              Absolute: Hot (30°C)
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureChangeColor(-1.5) }}></span>
              Change: Cooling
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 rounded mr-1 border" style={{ backgroundColor: getTemperatureChangeColor(2) }}></span>
              Change: Warming
            </div>
            <div className="flex items-center">
              <span className="inline-block w-4 h-4 bg-primary rounded mr-1 border-2 border-teal-700"></span>
              Currently selected
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Countries without data are shown in gray on the map.
          </p>
        </CardContent>
      </Card>

      {/* Temperature Charts */}
      {temperatureData && (
        <>
          {/* Both datasets are always shown - no toggle needed */}

          {/* Absolute Temperature Chart - Always show if available */}
          {temperatureData.absolute_temperature?.available && temperatureData.absolute_temperature.data && temperatureData.absolute_temperature.data.length > 0 && temperatureData.absolute_temperature.statistics && (
            <Card>
              <CardHeader>
                <CardTitle>Absolute Temperature: {temperatureData.country}</CardTitle>
                <CardDescription>
                  Data from {temperatureData.absolute_temperature.statistics.min_year} to {temperatureData.absolute_temperature.statistics.max_year}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading temperature data...</span>
                  </div>
                ) : temperatureData.absolute_temperature.data && temperatureData.absolute_temperature.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={temperatureData.absolute_temperature.data}>
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
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          padding: '12px'
                        }}
                        formatter={(value: any) => [`${value}°C`, 'Temperature']}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="temperature" 
                        stroke="hsl(var(--destructive))" 
                        strokeWidth={3}
                        name="Temperature (°C)"
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    No temperature data available for this country
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Temperature Change Chart - Always show if available */}
          {temperatureData.temperature_change?.available && temperatureData.temperature_change.data && temperatureData.temperature_change.data.length > 0 && temperatureData.temperature_change.statistics && (
            <Card>
              <CardHeader>
                <CardTitle>Temperature Change: {temperatureData.country}</CardTitle>
                <CardDescription>
                  Data from {temperatureData.temperature_change.statistics.min_year} to {temperatureData.temperature_change.statistics.max_year}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span>Loading temperature change data...</span>
                  </div>
                ) : temperatureData.temperature_change.data && temperatureData.temperature_change.data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={temperatureData.temperature_change.data}>
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
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '12px',
                          padding: '12px'
                        }}
                        formatter={(value: any) => [`${value > 0 ? '+' : ''}${value}°C`, 'Change']}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="temperature_change" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={3}
                        name="Temperature Change (°C)"
                        dot={false}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center py-8 text-muted-foreground">
                    No temperature change data available for this country
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Show message if no data is available */}
          {temperatureData && 
           !temperatureData.absolute_temperature?.available && 
           !temperatureData.temperature_change?.available && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-muted-foreground">
                  No temperature data available for {temperatureData.country}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Statistics Panel - Absolute Temperature - Always show if available and has data */}
          {temperatureData.absolute_temperature?.available && temperatureData.absolute_temperature.data && temperatureData.absolute_temperature.data.length > 0 && temperatureData.absolute_temperature.statistics && (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="border-0 bg-gradient-to-br from-primary/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-primary mb-2">AVERAGE TEMPERATURE</div>
                    <div className="text-4xl font-extrabold text-primary mb-1">
                      {temperatureData.absolute_temperature.statistics.avg_temp.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">
                      {temperatureData.absolute_temperature.statistics.data_points} data points
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-gradient-to-br from-destructive/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-destructive mb-2">TEMPERATURE CHANGE</div>
                    <div className="text-4xl font-extrabold text-destructive mb-1">
                      {temperatureData.absolute_temperature.statistics.total_change > 0 ? '+' : ''}
                      {temperatureData.absolute_temperature.statistics.total_change.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">
                      Since {temperatureData.absolute_temperature.statistics.min_year}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-gradient-to-br from-accent/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-accent mb-2">TREND</div>
                    <div className="text-4xl font-extrabold text-accent mb-1">
                      {temperatureData.absolute_temperature.statistics.trend_per_century > 0 ? '+' : ''}
                      {temperatureData.absolute_temperature.statistics.trend_per_century.toFixed(3)}°C
                    </div>
                    <p className="body-small text-text-secondary">Per 100 data points</p>
                  </CardContent>
                </Card>
              </div>

              {/* Absolute Temperature Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Absolute Temperature Statistics</CardTitle>
                  <CardDescription>
                    {temperatureData.absolute_temperature.statistics.min_year} - {temperatureData.absolute_temperature.statistics.max_year}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold mb-3">Temperature Range</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Minimum:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.absolute_temperature.statistics.min_temp.toFixed(2)}°C
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Maximum:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.absolute_temperature.statistics.max_temp.toFixed(2)}°C
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Range:</span>
                          <span className="text-lg font-semibold">
                            {(temperatureData.absolute_temperature.statistics.max_temp - temperatureData.absolute_temperature.statistics.min_temp).toFixed(2)}°C
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-3">Data Information</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Data Points:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.absolute_temperature.statistics.data_points}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Period:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.absolute_temperature.statistics.max_year - temperatureData.absolute_temperature.statistics.min_year + 1} data points
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* Statistics Panel - Temperature Change - Always show if available and has data */}
          {temperatureData.temperature_change?.available && temperatureData.temperature_change.data && temperatureData.temperature_change.data.length > 0 && temperatureData.temperature_change.statistics && (
            <>
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="border-0 bg-gradient-to-br from-primary/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-primary mb-2">AVERAGE CHANGE</div>
                    <div className="text-4xl font-extrabold text-primary mb-1">
                      {temperatureData.temperature_change.statistics.avg_change > 0 ? '+' : ''}
                      {temperatureData.temperature_change.statistics.avg_change.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">
                      {temperatureData.temperature_change.statistics.data_points} data points
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-gradient-to-br from-destructive/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-destructive mb-2">TOTAL CHANGE</div>
                    <div className="text-4xl font-extrabold text-destructive mb-1">
                      {temperatureData.temperature_change.statistics.total_change > 0 ? '+' : ''}
                      {temperatureData.temperature_change.statistics.total_change.toFixed(2)}°C
                    </div>
                    <p className="body-small text-text-secondary">
                      Since {temperatureData.temperature_change.statistics.min_year}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 bg-gradient-to-br from-accent/10 to-transparent">
                  <CardContent className="pt-6">
                    <div className="caption text-accent mb-2">TREND</div>
                    <div className="text-4xl font-extrabold text-accent mb-1">
                      {temperatureData.temperature_change.statistics.trend_per_century > 0 ? '+' : ''}
                      {temperatureData.temperature_change.statistics.trend_per_century.toFixed(3)}°C
                    </div>
                    <p className="body-small text-text-secondary">Per 100 data points</p>
                  </CardContent>
                </Card>
              </div>

              {/* Temperature Change Details */}
              <Card>
                <CardHeader>
                  <CardTitle>Temperature Change Statistics</CardTitle>
                  <CardDescription>
                    {temperatureData.temperature_change.statistics.min_year} - {temperatureData.temperature_change.statistics.max_year}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-semibold mb-3">Change Range</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Minimum:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.temperature_change.statistics.min_change > 0 ? '+' : ''}
                            {temperatureData.temperature_change.statistics.min_change.toFixed(2)}°C
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Maximum:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.temperature_change.statistics.max_change > 0 ? '+' : ''}
                            {temperatureData.temperature_change.statistics.max_change.toFixed(2)}°C
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Range:</span>
                          <span className="text-lg font-semibold">
                            {(temperatureData.temperature_change.statistics.max_change - temperatureData.temperature_change.statistics.min_change).toFixed(2)}°C
                          </span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold mb-3">Data Information</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Data Points:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.temperature_change.statistics.data_points}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-text-secondary">Period:</span>
                          <span className="text-lg font-semibold">
                            {temperatureData.temperature_change.statistics.max_year - temperatureData.temperature_change.statistics.min_year + 1} data points
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

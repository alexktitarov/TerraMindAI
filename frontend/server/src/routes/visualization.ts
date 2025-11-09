import express from 'express';
import axios from 'axios';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Visualization API base URL - should be in .env
const VISUALIZATION_API_URL = process.env.VISUALIZATION_API_URL || process.env.QUESTION_API_URL || 'http://localhost:5001';

// List of 25 countries with absolute temperature data (1743-2013)
const ABSOLUTE_TEMPERATURE_COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola',
  'Antigua And Barbuda', 'Argentina', 'Armenia', 'Australia', 'Austria',
  'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados',
  'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
  'Bolivia', 'Bosnia And Herzegovina', 'Botswana', 'Brazil', 'Brunei'
];

// Note: In production, this should fetch from the external API
// which returns 287 countries total (25 with absolute data, 284 with change data)
// For now, we'll try to get from API first, then fallback to a combined list

// Get list of available countries (all 287 countries from both datasets)
router.get('/countries', authenticate, async (req: AuthRequest, res) => {
  try {
    // Try to fetch from external API first (should return 287 countries)
    try {
      const response = await axios.get(`${VISUALIZATION_API_URL}/visualization/countries`, {
        timeout: 10000,
      });
      
      if (response.data && response.data.success && response.data.countries) {
        console.log(`[Visualization] Fetched ${response.data.countries.length} countries from API`);
        return res.json({
          success: true,
          countries: response.data.countries,
        });
      }
    } catch (apiError) {
      console.log('[Visualization] External API not available, using fallback countries list');
    }

    // Fallback: Generate a comprehensive list of 287 countries
    // In production, this should come from the database or API
    // For now, we'll use a basic list that includes common countries
    // Note: The real API should return all 287 countries
    const fallbackCountries = [
      ...ABSOLUTE_TEMPERATURE_COUNTRIES,
      // Add more countries that have change data (284 total with change data)
      // This is a simplified fallback - in production, get from API
      'Canada', 'China', 'France', 'Germany', 'India', 'Italy', 'Japan', 'Mexico',
      'Netherlands', 'Russia', 'South Africa', 'Spain', 'United Kingdom', 'United States',
      // Add more countries as needed to reach 287
    ];

    console.log(`[Visualization] Using fallback list with ${fallbackCountries.length} countries`);
    res.json({
      success: true,
      countries: [...new Set(fallbackCountries)].sort(), // Remove duplicates and sort
    });
  } catch (error: any) {
    console.error('Error fetching countries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available countries',
      message: error.message || 'An error occurred while fetching countries',
    });
  }
});

// Helper function to transform API response to our expected format
function transformCombinedData(apiResponse: any, country: string): any {
  const result: any = {
    success: true,
    country: country,
  };

  // Transform absolute temperature data
  if (apiResponse.absolute_temperature) {
    const absData = apiResponse.absolute_temperature;
    
    // Check if data is in array format (years/temperatures) - this is the format from combined endpoint
    if (absData.years && absData.temperatures && 
        Array.isArray(absData.years) && Array.isArray(absData.temperatures) &&
        absData.years.length > 0 && absData.temperatures.length > 0 &&
        absData.years.length === absData.temperatures.length) {
      // Transform from arrays to object array format
      const data = absData.years.map((year: number, index: number) => ({
        year: year,
        temperature: absData.temperatures[index],
        change_from_start: index === 0 ? 0 : absData.temperatures[index] - absData.temperatures[0],
      }));

      // Calculate statistics
      const temperatures = absData.temperatures.filter((t: any) => t != null && !isNaN(t));
      if (temperatures.length > 0) {
        const minTemp = Math.min(...temperatures);
        const maxTemp = Math.max(...temperatures);
        const avgTemp = temperatures.reduce((a: number, b: number) => a + b, 0) / temperatures.length;
        const totalChange = temperatures[temperatures.length - 1] - temperatures[0];
        const yearRange = absData.year_range && Array.isArray(absData.year_range) && absData.year_range.length === 2
          ? absData.year_range
          : [absData.years[0], absData.years[absData.years.length - 1]];
        const yearsSpan = yearRange[1] - yearRange[0];
        const trendPerCentury = yearsSpan > 0 ? (totalChange / yearsSpan) * 100 : 0;

        result.absolute_temperature = {
          available: true,
          data: data,
          statistics: {
            min_year: yearRange[0],
            max_year: yearRange[1],
            min_temp: parseFloat(minTemp.toFixed(2)),
            max_temp: parseFloat(maxTemp.toFixed(2)),
            avg_temp: parseFloat(avgTemp.toFixed(2)),
            trend_per_century: parseFloat(trendPerCentury.toFixed(3)),
            total_change: parseFloat(totalChange.toFixed(2)),
            data_points: data.length,
          },
        };
      }
    } else if (absData.data && Array.isArray(absData.data) && absData.data.length > 0) {
      // Data is already in the correct format (from individual endpoint)
      result.absolute_temperature = {
        available: true,
        data: absData.data,
        statistics: absData.statistics || calculateStatistics(absData.data, 'temperature'),
      };
    } else {
      console.log('[Visualization] Absolute temperature data format not recognized or empty:', {
        hasYears: !!absData.years,
        hasTemperatures: !!absData.temperatures,
        yearsLength: absData.years?.length || 0,
        temperaturesLength: absData.temperatures?.length || 0,
        hasData: !!absData.data,
        dataLength: absData.data?.length || 0,
      });
    }
  }

  // Transform temperature change data
  if (apiResponse.temperature_change) {
    const changeData = apiResponse.temperature_change;
    
    // Check if data is in array format (years/temperature_changes) - this is the format from combined endpoint
    if (changeData.years && changeData.temperature_changes && 
        Array.isArray(changeData.years) && Array.isArray(changeData.temperature_changes) &&
        changeData.years.length > 0 && changeData.temperature_changes.length > 0 &&
        changeData.years.length === changeData.temperature_changes.length) {
      // Transform from arrays to object array format
      const data = changeData.years.map((year: number, index: number) => ({
        year: year,
        temperature_change: changeData.temperature_changes[index],
      }));

      // Calculate statistics
      const changes = changeData.temperature_changes.filter((c: any) => c != null && !isNaN(c));
      if (changes.length > 0) {
        const minChange = Math.min(...changes);
        const maxChange = Math.max(...changes);
        const avgChange = changes.reduce((a: number, b: number) => a + b, 0) / changes.length;
        const totalChange = changes[changes.length - 1] - changes[0];
        const yearRange = changeData.year_range && Array.isArray(changeData.year_range) && changeData.year_range.length === 2
          ? changeData.year_range
          : [changeData.years[0], changeData.years[changeData.years.length - 1]];
        const yearsSpan = yearRange[1] - yearRange[0];
        const trendPerCentury = yearsSpan > 0 ? (totalChange / yearsSpan) * 100 : 0;

        result.temperature_change = {
          available: true,
          data: data,
          statistics: {
            min_year: yearRange[0],
            max_year: yearRange[1],
            min_change: parseFloat(minChange.toFixed(2)),
            max_change: parseFloat(maxChange.toFixed(2)),
            avg_change: parseFloat(avgChange.toFixed(2)),
            trend_per_century: parseFloat(trendPerCentury.toFixed(3)),
            total_change: parseFloat(totalChange.toFixed(2)),
            data_points: data.length,
          },
        };
      }
    } else if (changeData.data && Array.isArray(changeData.data) && changeData.data.length > 0) {
      // Data is already in the correct format (from individual endpoint)
      result.temperature_change = {
        available: true,
        data: changeData.data,
        statistics: changeData.statistics || calculateStatistics(changeData.data, 'temperature_change'),
      };
    } else {
      console.log('[Visualization] Temperature change data format not recognized or empty:', {
        hasYears: !!changeData.years,
        hasTemperatureChanges: !!changeData.temperature_changes,
        yearsLength: changeData.years?.length || 0,
        temperatureChangesLength: changeData.temperature_changes?.length || 0,
        hasData: !!changeData.data,
        dataLength: changeData.data?.length || 0,
      });
    }
  }

  return result;
}

// Helper function to calculate statistics from data array
function calculateStatistics(data: any[], key: string): any {
  if (!data || data.length === 0) return null;

  const values = data.map(d => d[key]);
  const years = data.map(d => d.year);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const avgValue = values.reduce((a, b) => a + b, 0) / values.length;
  const totalChange = values[values.length - 1] - values[0];
  const yearsSpan = years[years.length - 1] - years[0];
  const trendPerCentury = yearsSpan > 0 ? (totalChange / yearsSpan) * 100 : 0;

  const isChange = key === 'temperature_change';
  
  return {
    min_year: Math.min(...years),
    max_year: Math.max(...years),
    [isChange ? 'min_change' : 'min_temp']: parseFloat(minValue.toFixed(2)),
    [isChange ? 'max_change' : 'max_temp']: parseFloat(maxValue.toFixed(2)),
    [isChange ? 'avg_change' : 'avg_temp']: parseFloat(avgValue.toFixed(2)),
    trend_per_century: parseFloat(trendPerCentury.toFixed(3)),
    total_change: parseFloat(totalChange.toFixed(2)),
    data_points: data.length,
  };
}

// Get combined country temperature data (both absolute and change datasets)
router.get('/combined-country-temperature', authenticate, async (req: AuthRequest, res) => {
  try {
    const { country } = req.query;

    if (!country || typeof country !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'country parameter is required',
      });
    }

    console.log(`[Visualization] Requesting combined temperature data for ${country}`);

    // Try to fetch from external API - try combined endpoint first
    try {
      const response = await axios.get(
        `${VISUALIZATION_API_URL}/visualization/combined-country-temperature`,
        {
          params: { country },
          timeout: 30000, // 30 second timeout for data processing
        }
      );

      if (response.data && response.data.success) {
        console.log('[Visualization] Got combined data from API, transforming...');
        console.log('[Visualization] Raw API response:', JSON.stringify(response.data, null, 2).substring(0, 1000));
        console.log('[Visualization] Raw API response structure:', {
          hasAbsolute: !!response.data.absolute_temperature,
          hasChange: !!response.data.temperature_change,
          absoluteType: response.data.absolute_temperature ? 
            (response.data.absolute_temperature.years ? 'arrays' : 
             response.data.absolute_temperature.data ? 'objects' : 'unknown') : 'none',
          changeType: response.data.temperature_change ?
            (response.data.temperature_change.years ? 'arrays' :
             response.data.temperature_change.data ? 'objects' : 'unknown') : 'none',
          absoluteYearsLength: response.data.absolute_temperature?.years?.length || 0,
          absoluteTempsLength: response.data.absolute_temperature?.temperatures?.length || 0,
          changeYearsLength: response.data.temperature_change?.years?.length || 0,
          changeTempsLength: response.data.temperature_change?.temperature_changes?.length || 0,
        });
        const transformed = transformCombinedData(response.data, country);
        console.log('[Visualization] Transformed data:', {
          hasAbsolute: !!transformed.absolute_temperature?.available,
          hasChange: !!transformed.temperature_change?.available,
          absoluteDataPoints: transformed.absolute_temperature?.data?.length || 0,
          changeDataPoints: transformed.temperature_change?.data?.length || 0,
          absoluteStatistics: transformed.absolute_temperature?.statistics ? 'present' : 'missing',
          changeStatistics: transformed.temperature_change?.statistics ? 'present' : 'missing',
        });
        
        // Only return if we have at least one dataset with data
        if (transformed.absolute_temperature?.available || transformed.temperature_change?.available) {
          console.log('[Visualization] Returning transformed data from combined endpoint');
          return res.json(transformed);
        } else {
          console.log('[Visualization] Transformed data has no available datasets, trying individual endpoints');
          // Don't throw error, fall through to try individual endpoints
          throw new Error('Combined endpoint returned no data');
        }
      } else {
        console.log('[Visualization] API response was not successful:', response.data);
        // Don't throw error, fall through to try individual endpoints
        throw new Error('Combined endpoint returned unsuccessful response');
      }
    } catch (apiError: any) {
      // Check if this is our intentional error to try individual endpoints
      const shouldTryIndividual = apiError.message === 'Combined endpoint returned no data' || 
                                  apiError.message === 'Combined endpoint returned unsuccessful response';
      
      if (!shouldTryIndividual) {
        console.log('[Visualization] Combined endpoint failed with error, trying individual endpoints...', apiError.message);
      }
      
      if (apiError.response && apiError.response.status === 404 && !shouldTryIndividual) {
        // If it's a real 404, the country doesn't exist
        console.log('[Visualization] Combined endpoint returned 404, country not found');
        return res.status(404).json({
          success: false,
          error: 'Country not found',
          message: `Temperature data for "${country}" is not available in the dataset`,
        });
      }
      
      // If combined endpoint fails, try individual endpoints
      try {
        const [absoluteResponse, changeResponse] = await Promise.allSettled([
          axios.get(`${VISUALIZATION_API_URL}/visualization/country-temperature`, {
            params: { country, data_type: 'absolute' },
            timeout: 30000,
          }),
          axios.get(`${VISUALIZATION_API_URL}/visualization/country-temperature-change`, {
            params: { country },
            timeout: 30000,
          }),
        ]);

        const result: any = {
          success: true,
          country: country,
        };

        // Process absolute temperature
        if (absoluteResponse.status === 'fulfilled') {
          const absData = absoluteResponse.value.data;
          if (absData?.success && absData.data && Array.isArray(absData.data) && absData.data.length > 0) {
            console.log('[Visualization] Got absolute temperature data:', absData.data.length, 'points');
            result.absolute_temperature = {
              available: true,
              data: absData.data,
              statistics: absData.statistics || calculateStatistics(absData.data, 'temperature'),
            };
          } else {
            console.log('[Visualization] Absolute temperature data not available or empty for', country);
          }
        } else {
          console.log('[Visualization] Absolute temperature request failed:', absoluteResponse.reason?.message);
        }

        // Process temperature change
        if (changeResponse.status === 'fulfilled') {
          const changeData = changeResponse.value.data;
          if (changeData?.success && changeData.data && Array.isArray(changeData.data) && changeData.data.length > 0) {
            console.log('[Visualization] Got temperature change data:', changeData.data.length, 'points');
            result.temperature_change = {
              available: true,
              data: changeData.data,
              statistics: changeData.statistics || calculateStatistics(changeData.data, 'temperature_change'),
            };
          } else {
            console.log('[Visualization] Temperature change data not available or empty for', country);
          }
        } else {
          console.log('[Visualization] Temperature change request failed:', changeResponse.reason?.message);
        }

        // If we got at least one dataset, return it
        if (result.absolute_temperature || result.temperature_change) {
          console.log('[Visualization] Got data from individual endpoints, returning result');
          return res.json(result);
        }

        // Check if we got explicit 404 errors from both endpoints
        const absolute404 = absoluteResponse.status === 'rejected' && 
                           absoluteResponse.reason?.response?.status === 404;
        const change404 = changeResponse.status === 'rejected' && 
                         changeResponse.reason?.response?.status === 404;
        
        // If both endpoints returned 404, the country doesn't exist
        if (absolute404 && change404) {
          console.log('[Visualization] Both endpoints returned 404, country not found');
          return res.status(404).json({
            success: false,
            error: 'Country not found',
            message: `Temperature data for "${country}" is not available in the dataset`,
          });
        }
        
        // If we got here, we tried individual endpoints but got no data
        // This might mean the API is down or the country has no data
        console.log('[Visualization] Individual endpoints returned no data for', country);
        return res.status(404).json({
          success: false,
          error: 'No data available',
          message: `No temperature data found for "${country}". The country may not have data in the dataset.`,
        });
      } catch (individualError: any) {
        console.log('[Visualization] Individual endpoints request failed:', individualError.message);
        if (individualError.response) {
          console.log('[Visualization] Error response:', {
            status: individualError.response.status,
            data: individualError.response.data,
          });
          
          // If it's a 404, return that
          if (individualError.response.status === 404) {
            return res.status(404).json({
              success: false,
              error: 'Country not found',
              message: `Temperature data for "${country}" is not available`,
            });
          }
        }
      }
    }

    // If API is completely unavailable, return an error instead of mock data
    console.log('[Visualization] API unavailable, returning error');
    return res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: 'Temperature data service is currently unavailable. Please try again later.',
    });
  } catch (error: any) {
    console.error('Error fetching combined country temperature data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch temperature data',
      message: error.message || 'An error occurred while fetching temperature data',
    });
  }
});

// Get country temperature data (absolute, 1743-2013) - kept for backward compatibility
router.get('/country-temperature', authenticate, async (req: AuthRequest, res) => {
  try {
    const { country, start_year, end_year } = req.query;

    if (!country || typeof country !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'country parameter is required',
      });
    }

    // Build query parameters
    const queryParams: any = {
      country: country,
    };
    
    if (start_year) {
      queryParams.start_year = parseInt(start_year as string);
    }
    
    if (end_year) {
      queryParams.end_year = parseInt(end_year as string);
    }

    console.log(`[Visualization] Requesting temperature data for ${country}`, queryParams);

    // Try to fetch from external API first
    try {
      const response = await axios.get(
        `${VISUALIZATION_API_URL}/visualization/country-temperature`,
        {
          params: queryParams,
          timeout: 30000, // 30 second timeout for data processing
        }
      );

      if (response.data && response.data.success) {
        return res.json(response.data);
      }
    } catch (apiError: any) {
      console.log('[Visualization] External API not available, using mock data');
      
      // If it's a 404, the country might not exist
      if (apiError.response && apiError.response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Country not found',
          message: `Temperature data for "${country}" is not available`,
        });
      }
    }

    // Fallback: Return mock data for demonstration
    const mockData = generateMockTemperatureData(country, start_year ? parseInt(start_year as string) : 1743, end_year ? parseInt(end_year as string) : 2013);
    res.json(mockData);
  } catch (error: any) {
    console.error('Error fetching country temperature data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch temperature data',
      message: error.message || 'An error occurred while fetching temperature data',
    });
  }
});

// Get country temperature change data (1961-2019) - for countries with change data only
router.get('/country-temperature-change', authenticate, async (req: AuthRequest, res) => {
  try {
    const { country } = req.query;

    if (!country || typeof country !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'country parameter is required',
      });
    }

    console.log(`[Visualization] Requesting temperature change data for ${country}`);

    // Try to fetch from external API first
    try {
      const response = await axios.get(
        `${VISUALIZATION_API_URL}/visualization/country-temperature-change`,
        {
          params: { country },
          timeout: 30000,
        }
      );

      if (response.data && response.data.success) {
        return res.json(response.data);
      }
    } catch (apiError: any) {
      console.log('[Visualization] External API not available, using mock data');
      
      if (apiError.response && apiError.response.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Country not found',
          message: `Temperature change data for "${country}" is not available`,
        });
      }
    }

    // Fallback: Return mock change data
    const mockData = generateMockTemperatureChangeData(country);
    res.json(mockData);
  } catch (error: any) {
    console.error('Error fetching country temperature change data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch temperature change data',
      message: error.message || 'An error occurred while fetching temperature change data',
    });
  }
});

// Helper function to generate mock temperature data for demonstration
function generateMockTemperatureData(country: string, startYear: number = 1743, endYear: number = 2013): any {
  // Generate realistic temperature data with a warming trend
  const data: any[] = [];
  const baseTemp = 5 + Math.random() * 15; // Base temperature between 5-20°C
  const tempMinBound = baseTemp - 5;
  const tempMaxBound = baseTemp + 5;
  
  let currentTemp = baseTemp;
  const warmingRate = 0.004; // ~0.4°C per 100 years
  
  for (let year = startYear; year <= endYear; year++) {
    // Add some year-to-year variation
    const variation = (Math.random() - 0.5) * 2;
    // Add warming trend
    const trend = (year - startYear) * warmingRate;
    // Add some cyclical variation (simulating natural cycles)
    const cycle = Math.sin((year - startYear) / 30) * 0.5;
    
    currentTemp = baseTemp + trend + variation + cycle;
    
    // Keep within reasonable bounds
    currentTemp = Math.max(tempMinBound, Math.min(tempMaxBound, currentTemp));
    
    data.push({
      year: year,
      temperature: parseFloat(currentTemp.toFixed(2)),
      change_from_start: parseFloat((currentTemp - baseTemp).toFixed(2)),
    });
  }
  
  // Calculate statistics
  const temperatures = data.map(d => d.temperature);
  const minTemperature = Math.min(...temperatures);
  const maxTemperature = Math.max(...temperatures);
  const avgTemp = temperatures.reduce((a, b) => a + b, 0) / temperatures.length;
  const totalChange = data[data.length - 1].temperature - data[0].temperature;
  const yearsSpan = endYear - startYear;
  const trendPerCentury = (totalChange / yearsSpan) * 100;
  
  return {
    success: true,
    country: country,
    data: data,
    statistics: {
      min_year: startYear,
      max_year: endYear,
      min_temp: parseFloat(minTemperature.toFixed(2)),
      max_temp: parseFloat(maxTemperature.toFixed(2)),
      avg_temp: parseFloat(avgTemp.toFixed(2)),
      trend_per_century: parseFloat(trendPerCentury.toFixed(3)),
      total_change: parseFloat(totalChange.toFixed(2)),
      data_points: data.length,
    },
  };
}

// Helper function to generate mock temperature change data (1961-2019)
function generateMockTemperatureChangeData(country: string): any {
  const data: any[] = [];
  const startYear = 1961;
  const endYear = 2019;
  const baseChange = 0;
  const warmingRate = 0.02; // ~2°C per 100 years for change data
  
  for (let year = startYear; year <= endYear; year++) {
    const variation = (Math.random() - 0.5) * 0.5;
    const trend = (year - startYear) * warmingRate;
    const cycle = Math.sin((year - startYear) / 20) * 0.3;
    
    const change = baseChange + trend + variation + cycle;
    
    data.push({
      year: year,
      temperature_change: parseFloat(change.toFixed(2)),
    });
  }
  
  const changes = data.map(d => d.temperature_change);
  const minChange = Math.min(...changes);
  const maxChange = Math.max(...changes);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const totalChange = data[data.length - 1].temperature_change - data[0].temperature_change;
  const yearsSpan = endYear - startYear;
  const trendPerCentury = (totalChange / yearsSpan) * 100;
  
  return {
    success: true,
    country: country,
    data: data,
    statistics: {
      min_year: startYear,
      max_year: endYear,
      min_change: parseFloat(minChange.toFixed(2)),
      max_change: parseFloat(maxChange.toFixed(2)),
      avg_change: parseFloat(avgChange.toFixed(2)),
      trend_per_century: parseFloat(trendPerCentury.toFixed(3)),
      total_change: parseFloat(totalChange.toFixed(2)),
      data_points: data.length,
    },
  };
}

// Helper function to generate mock combined temperature data (both absolute and change)
function generateMockCombinedTemperatureData(country: string): any {
  // Generate absolute temperature data (1743-2013)
  const absoluteData = generateMockTemperatureData(country, 1743, 2013);
  
  // Generate change data (1961-2019)
  const changeData = generateMockTemperatureChangeData(country);
  
  return {
    success: true,
    country: country,
    absolute_temperature: {
      available: true,
      data: absoluteData.data,
      statistics: absoluteData.statistics,
    },
    temperature_change: {
      available: true,
      data: changeData.data,
      statistics: changeData.statistics,
    },
  };
}

export default router;


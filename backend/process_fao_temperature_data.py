"""
Process FAO Temperature Change Data and integrate with existing dataset
"""

import pandas as pd
import os
import json

def process_fao_temperature_data():
    """Process FAO temperature change data from wide to long format"""
    
    dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
    fao_file = os.path.join(dataset_dir, 'Environment_Temperature_change_E_All_Data_NOFLAG.csv')
    
    print("=" * 80)
    print("PROCESSING FAO TEMPERATURE CHANGE DATA")
    print("=" * 80)
    
    # Read FAO data
    print(f"\nReading FAO data from {fao_file}...")
    df_fao = pd.read_csv(fao_file, encoding='latin-1')
    
    # Filter for temperature change data (not standard deviation)
    df_fao = df_fao[df_fao['Element'] == 'Temperature change']
    
    # Filter for yearly data (Meteorological year)
    df_fao = df_fao[df_fao['Months'] == 'Meteorological year']
    
    print(f"  Total rows: {len(df_fao):,}")
    print(f"  Unique countries: {df_fao['Area'].nunique()}")
    
    # Get year columns
    year_cols = [col for col in df_fao.columns if col.startswith('Y') and col[1:].isdigit()]
    years = sorted([int(col[1:]) for col in year_cols])
    
    print(f"  Year range: {min(years)} - {max(years)} ({len(years)} years)")
    
    # Transform from wide to long format
    print("\nTransforming data from wide to long format...")
    
    # Melt the dataframe
    id_vars = ['Area Code', 'Area', 'Months Code', 'Months', 'Element Code', 'Element', 'Unit']
    value_vars = year_cols
    
    df_long = pd.melt(
        df_fao,
        id_vars=id_vars,
        value_vars=value_vars,
        var_name='YearCol',
        value_name='TemperatureChange'
    )
    
    # Extract year from column name (Y1961 -> 1961)
    df_long['Year'] = df_long['YearCol'].str[1:].astype(int)
    
    # Remove rows with missing temperature change values
    df_long = df_long.dropna(subset=['TemperatureChange'])
    
    # Select relevant columns
    df_long = df_long[['Area', 'Year', 'TemperatureChange', 'Unit']].copy()
    
    # Rename columns to match our format
    df_long = df_long.rename(columns={
        'Area': 'Country',
        'TemperatureChange': 'TemperatureChange'
    })
    
    # Sort by country and year
    df_long = df_long.sort_values(['Country', 'Year'])
    
    print(f"  Processed rows: {len(df_long):,}")
    print(f"  Countries: {df_long['Country'].nunique()}")
    print(f"  Year range: {df_long['Year'].min()} - {df_long['Year'].max()}")
    
    # Check for US data
    us_data = df_long[df_long['Country'].str.contains('United States', case=False, na=False)]
    if len(us_data) > 0:
        print(f"\n   US data found: {len(us_data)} records")
        print(f"  US countries: {us_data['Country'].unique().tolist()}")
    
    # Check for European countries
    european_keywords = ['Germany', 'France', 'United Kingdom', 'Italy', 'Spain', 'Poland', 
                         'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Sweden', 'Norway']
    european_found = []
    for keyword in european_keywords:
        euro_data = df_long[df_long['Country'].str.contains(keyword, case=False, na=False)]
        if len(euro_data) > 0:
            european_found.append(keyword)
    print(f"  European countries: {len(european_found)} found")
    
    # Save processed data
    output_file = os.path.join(dataset_dir, 'FAO_TemperatureChange_Processed.csv')
    df_long.to_csv(output_file, index=False)
    print(f"\n Processed data saved to: {output_file}")
    
    # Create country mapping file (to match with current dataset country names)
    print("\nCreating country mapping...")
    countries = sorted(df_long['Country'].unique().tolist())
    mapping_file = os.path.join(dataset_dir, 'FAO_Country_Mapping.json')
    
    # Create mapping dictionary
    country_mapping = {
        'United States of America': 'United States',  # Map to common name
        'United States Virgin Islands': 'US Virgin Islands',
    }
    
    # Save mapping
    with open(mapping_file, 'w') as f:
        json.dump({
            'countries': countries,
            'mapping': country_mapping,
            'total_countries': len(countries)
        }, f, indent=2)
    
    print(f" Country mapping saved to: {mapping_file}")
    
    # Summary statistics
    print("\n" + "=" * 80)
    print("SUMMARY STATISTICS")
    print("=" * 80)
    print(f"Total countries: {df_long['Country'].nunique()}")
    print(f"Total records: {len(df_long):,}")
    print(f"Year range: {df_long['Year'].min()} - {df_long['Year'].max()}")
    print(f"Temperature change range: {df_long['TemperatureChange'].min():.2f}°C to {df_long['TemperatureChange'].max():.2f}°C")
    
    # Sample data
    print("\nSample data (first 10 rows):")
    print(df_long.head(10))
    
    return df_long

if __name__ == "__main__":
    df_processed = process_fao_temperature_data()
    print("\n Processing complete!")


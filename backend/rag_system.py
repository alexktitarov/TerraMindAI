"""
RAG (Retrieval-Augmented Generation) System using FAISS
Vectorizes dataset and retrieves relevant context for question generation
"""

import os
import json
import pickle
from typing import List, Dict, Optional, Tuple
import numpy as np

try:
    import faiss
    FAISS_AVAILABLE = True
except ImportError:
    FAISS_AVAILABLE = False
    print("Warning: FAISS not available. Install with: pip install faiss-cpu or faiss-gpu")

try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False
    print("Warning: sentence-transformers not available. Install with: pip install sentence-transformers")

# OpenAI support removed - using only local sentence-transformers


class RAGSystem:
    """RAG System using FAISS for vector storage and retrieval"""
    
    def __init__(
        self,
        embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2",
        dimension: int = 384
    ):
        """
        Initialize RAG System with local embeddings only
        
        Args:
            embedding_model: Name of the sentence-transformers model to use
            dimension: Dimension of embeddings (will be auto-detected from model)
        """
        self.embedding_model_name = embedding_model
        self.dimension = dimension
        self.index = None
        self.documents = []  # Store original documents
        self.metadata = []  # Store metadata for each document (lesson_id, person_id, etc.)
        self.embedder = None
        
        # Initialize embedding model (local only)
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            raise RuntimeError("sentence-transformers not available. Install with: pip install sentence-transformers")
        
        print(f"🔄 Loading embedding model: {embedding_model}...")
        self.embedder = SentenceTransformer(embedding_model)
        self.dimension = self.embedder.get_sentence_embedding_dimension()
        print(f"✅ Initialized RAG with {embedding_model} (dimension: {self.dimension})")
        
        # Initialize FAISS index
        if not FAISS_AVAILABLE:
            raise RuntimeError("FAISS not available. Install with: pip install faiss-cpu")
        
        self.index = faiss.IndexFlatL2(self.dimension)
        print(f"✅ Initialized FAISS index (dimension: {self.dimension})")
    
    def _embed_text(self, text: str) -> np.ndarray:
        """Generate embedding for a text using local sentence-transformers model"""
        embedding = self.embedder.encode(text, convert_to_numpy=True).astype(np.float32)
        return embedding
    
    def add_documents(
        self,
        documents: List[str],
        metadata: Optional[List[Dict]] = None
    ):
        """
        Add documents to the vector store
        
        Args:
            documents: List of document texts
            metadata: Optional list of metadata dictionaries for each document
        """
        if metadata is None:
            metadata = [{}] * len(documents)
        
        if len(documents) != len(metadata):
            raise ValueError("Documents and metadata must have the same length")
        
        print(f"📚 Adding {len(documents)} documents to vector store...")
        
        # Generate embeddings
        embeddings = []
        for i, doc in enumerate(documents):
            if i % 100 == 0:
                print(f"  Processing document {i+1}/{len(documents)}...")
            embedding = self._embed_text(doc)
            embeddings.append(embedding)
        
        # Convert to numpy array
        embeddings_array = np.array(embeddings).astype('float32')
        
        # Add to FAISS index
        self.index.add(embeddings_array)
        
        # Store documents and metadata
        self.documents.extend(documents)
        self.metadata.extend(metadata)
        
        print(f"✅ Added {len(documents)} documents. Total documents: {len(self.documents)}")
    
    def load_from_dataset(
        self,
        dataset_path: str,
        text_column: str = "text",
        lesson_id_column: Optional[str] = None,
        person_id_column: Optional[str] = None,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        dataset_name: Optional[str] = None
    ):
        """
        Load and vectorize data from a dataset file
        
        Args:
            dataset_path: Path to dataset file (JSON, JSONL, or CSV)
            text_column: Name of column containing text to vectorize
            lesson_id_column: Optional column name for lesson_id
            person_id_column: Optional column name for person_id
            chunk_size: Size of text chunks (characters)
            chunk_overlap: Overlap between chunks (characters)
        """
        print(f"📖 Loading dataset from {dataset_path}...")
        
        # Load dataset
        if dataset_path.endswith('.json'):
            with open(dataset_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list):
                dataset = data
            else:
                dataset = [data]
        elif dataset_path.endswith('.jsonl'):
            dataset = []
            with open(dataset_path, 'r', encoding='utf-8') as f:
                for line in f:
                    dataset.append(json.loads(line))
        elif dataset_path.endswith('.csv'):
            import pandas as pd
            # Read CSV - handle index column if first column is unnamed
            df = pd.read_csv(dataset_path)
            # Remove unnamed index columns
            df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
            
            # For CSV files with Country column, process as climate data
            if 'Country' in df.columns:
                # Remove rows with missing temperature data
                if 'AverageTemperature' in df.columns:
                    df = df[df['AverageTemperature'].notna()]
                # Group by country and create aggregated records
                dataset = self._process_climate_csv(df)
            else:
                # For other CSV files (like headlines), create records directly
                # Sample data if too large (keep first 1000 rows for processing)
                if len(df) > 1000:
                    print(f"⚠️ Dataset has {len(df)} rows, sampling first 1000 for processing")
                    df = df.head(1000)
                dataset = df.to_dict('records')
        else:
            raise ValueError(f"Unsupported file format: {dataset_path}")
        
        print(f"✅ Loaded {len(dataset)} records from dataset")
        
        # Process and chunk documents
        documents = []
        metadata_list = []
        
        for record in dataset:
            # Get text - for CSV files, create descriptive text if text_column doesn't exist
            if dataset_path.endswith('.csv'):
                # If text_column exists in record and has a value, use it
                if text_column in record:
                    text_value = record.get(text_column)
                    # Check if value is not None and not NaN
                    if text_value is not None and str(text_value) != 'nan' and str(text_value).strip():
                        text = str(text_value).strip()
                    else:
                        # If text_column is empty/NaN, create descriptive text from the data
                        text = self._create_text_from_csv_record(record, text_column)
                else:
                    # text_column doesn't exist, create descriptive text
                    text = self._create_text_from_csv_record(record, text_column)
            else:
                text = record.get(text_column, "")
            
            if not text or text.strip() == "" or text == "nan":
                continue
            
            # Chunk the text if it's too long
            chunks = self._chunk_text(text, chunk_size, chunk_overlap)
            
            for chunk in chunks:
                documents.append(chunk)
                
                # Create metadata
                meta = {}
                # Store dataset_name in metadata (required for multi-dataset support)
                if dataset_name:
                    meta['dataset_name'] = dataset_name
                else:
                    meta['dataset_name'] = 'default'  # Default dataset name
                
                if lesson_id_column and lesson_id_column in record:
                    lesson_value = str(record[lesson_id_column])
                    # Clean the lesson_id
                    lesson_clean = lesson_value.lower().replace(' ', '_').replace(',', '').replace("'", '')
                    # Use dataset_name as prefix if available
                    if dataset_name and dataset_name != 'default':
                        meta['lesson_id'] = f"{dataset_name}_{lesson_clean}"
                    else:
                        meta['lesson_id'] = lesson_clean
                    # Also store original value
                    meta[lesson_id_column] = lesson_value
                elif 'Country' in record:
                    # Fallback: use Country as lesson_id
                    country = str(record['Country'])
                    country_clean = country.lower().replace(' ', '_').replace(',', '').replace("'", '')
                    if dataset_name and dataset_name != 'default':
                        meta['lesson_id'] = f"{dataset_name}_{country_clean}"
                    else:
                        meta['lesson_id'] = f"climate_{country_clean}"
                    meta['country'] = country
                elif 'dt' in record:
                    # For global temperature data, use date-based lesson_id
                    meta['lesson_id'] = f"global_temp_{record.get('dt', 'unknown')}"
                elif 'Headline' in record:
                    # For headlines dataset, create lesson_id from headline
                    headline = str(record.get('Headline', ''))
                    # Extract key words from headline for lesson_id
                    words = headline.lower().split()[:3]  # First 3 words
                    headline_clean = '_'.join(words).replace(',', '').replace("'", '').replace('"', '').replace('-', '_')[:50]
                    if dataset_name and dataset_name != 'default':
                        meta['lesson_id'] = f"{dataset_name}_{headline_clean}"
                    else:
                        meta['lesson_id'] = f"headline_{headline_clean}"
                
                if person_id_column and person_id_column in record:
                    meta['person_id'] = record[person_id_column]
                else:
                    meta['person_id'] = "student_1"  # Default
                
                # Copy all other fields as metadata
                for key, value in record.items():
                    if key != text_column:
                        meta[key] = value
                
                metadata_list.append(meta)
        
        # Add to vector store
        self.add_documents(documents, metadata_list)
    
    def _process_climate_csv(self, df) -> List[dict]:
        """Process climate CSV by grouping and aggregating data"""
        import pandas as pd
        from datetime import datetime
        
        records = []
        countries = df['Country'].unique()[:50]  # Limit to first 50 countries
        
        for country in countries:
            country_data = df[df['Country'] == country].copy()
            
            if len(country_data) == 0:
                continue
            
            # Sort by date
            if 'dt' in country_data.columns:
                country_data['dt'] = pd.to_datetime(country_data['dt'], errors='coerce')
                country_data = country_data.sort_values('dt')
                country_data = country_data[country_data['dt'].notna()]
            
            if len(country_data) == 0:
                continue
            
            # Create multiple text descriptions
            avg_temp = country_data['AverageTemperature'].mean()
            min_temp = country_data['AverageTemperature'].min()
            max_temp = country_data['AverageTemperature'].max()
            
            date_min = country_data['dt'].min()
            date_max = country_data['dt'].max()
            years_span = (date_max - date_min).days / 365.25
            
            # 1. Overall summary
            text1 = f"Climate and temperature data for {country}: The average temperature is {avg_temp:.2f}°C, with a range from {min_temp:.2f}°C to {max_temp:.2f}°C. Historical data spans from {date_min.strftime('%Y-%m-%d')} to {date_max.strftime('%Y-%m-%d')}, covering approximately {years_span:.1f} years."
            records.append({
                'Country': country,
                'AverageTemperature': avg_temp,
                'text': text1,
                'data_type': 'temperature'
            })
            
            # 2. Trend analysis (if enough data)
            if len(country_data) > 20:
                split_point = len(country_data) // 3
                early_period = country_data.head(split_point)
                late_period = country_data.tail(split_point)
                
                early_avg = early_period['AverageTemperature'].mean()
                late_avg = late_period['AverageTemperature'].mean()
                temp_change = late_avg - early_avg
                
                if abs(temp_change) < 0.5:
                    trend_text = f"Temperature trend analysis for {country}: Temperatures have remained relatively stable, with an average change of {temp_change:.2f}°C between the early period (average {early_avg:.2f}°C) and late period (average {late_avg:.2f}°C)."
                else:
                    direction = "increased" if temp_change > 0 else "decreased"
                    trend_text = f"Temperature trend analysis for {country}: Temperatures have {direction} by {abs(temp_change):.2f}°C over the recorded period, from an early average of {early_avg:.2f}°C to a later average of {late_avg:.2f}°C. This change occurred between {early_period['dt'].min().strftime('%Y')} and {late_period['dt'].max().strftime('%Y')}."
                
                records.append({
                    'Country': country,
                    'AverageTemperature': late_avg,
                    'text': trend_text,
                    'data_type': 'trend'
                })
            
            # 3. Recent data
            if len(country_data) > 0:
                recent_cutoff = country_data['dt'].max() - pd.Timedelta(days=365*10)
                recent_data = country_data[country_data['dt'] >= recent_cutoff]
                
                if len(recent_data) > 0:
                    recent_avg = recent_data['AverageTemperature'].mean()
                    recent_text = f"Recent temperature data for {country} (last 10 years): The average temperature was {recent_avg:.2f}°C."
                    if recent_avg > avg_temp:
                        recent_text += f" This is {recent_avg - avg_temp:.2f}°C warmer than the historical average of {avg_temp:.2f}°C."
                    elif recent_avg < avg_temp:
                        recent_text += f" This is {avg_temp - recent_avg:.2f}°C cooler than the historical average of {avg_temp:.2f}°C."
                    
                    records.append({
                        'Country': country,
                        'AverageTemperature': recent_avg,
                        'text': recent_text,
                        'data_type': 'recent'
                    })
        
        return records
    
    def _create_text_from_csv_record(self, record: dict, text_column: str) -> str:
        """Create descriptive text from CSV record for climate data"""
        # If record already has 'text' field (from _process_climate_csv), use it
        if 'text' in record:
            return record.get('text', '')
        
        # Handle climate headlines dataset
        if 'Headline' in record or 'Content' in record:
            headline = record.get('Headline', '')
            content = record.get('Content', '')
            sentiment = record.get('Sentiment', '')
            justification = record.get('Justification', '')
            
            text_parts = []
            # Prioritize Content, but include headline for context
            if headline:
                text_parts.append(f"Climate news headline: {headline}")
            if content:
                # Content is the main text - use it as primary
                text_parts.append(content)
            elif headline:
                # If no content, use headline
                text_parts.append(headline)
            
            # Add sentiment and justification as additional context
            if sentiment:
                text_parts.append(f"Sentiment analysis: {sentiment}")
            if justification:
                text_parts.append(f"Context: {justification}")
            
            return " ".join(text_parts) if text_parts else ""
        
        # Otherwise, try to create text from available fields
        text_parts = []
        
        # Try common climate data fields
        if 'Country' in record:
            text_parts.append(f"Climate data for {record['Country']}:")
        
        if 'AverageTemperature' in record:
            temp = record.get('AverageTemperature')
            if temp is not None and str(temp) != 'nan':
                text_parts.append(f"Average temperature: {temp:.2f}°C.")
        
        if 'dt' in record and record.get('dt'):
            text_parts.append(f"Date: {record['dt']}.")
        
        if 'AverageTemperatureUncertainty' in record:
            uncertainty = record.get('AverageTemperatureUncertainty')
            if uncertainty is not None and str(uncertainty) != 'nan':
                text_parts.append(f"Temperature uncertainty: {uncertainty:.2f}°C.")
        
        # For GlobalTemperatures.csv (no Country column)
        if 'LandAverageTemperature' in record:
            temp = record.get('LandAverageTemperature')
            if temp is not None and str(temp) != 'nan':
                text_parts.append(f"Global land average temperature: {temp:.2f}°C.")
        
        if 'LandAndOceanAverageTemperature' in record:
            temp = record.get('LandAndOceanAverageTemperature')
            if temp is not None and str(temp) != 'nan':
                text_parts.append(f"Global land and ocean average temperature: {temp:.2f}°C.")
        
        # If we have the text_column specified, try to use it
        if text_column and text_column in record:
            text_value = record.get(text_column)
            if text_value:
                return str(text_value)
        
        # Return constructed text or empty string
        return " ".join(text_parts) if text_parts else ""
    
    def _chunk_text(self, text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        """Split text into chunks"""
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            
            # Try to break at sentence boundary
            if end < len(text):
                # Find last sentence ending
                last_period = chunk.rfind('.')
                last_newline = chunk.rfind('\n')
                break_point = max(last_period, last_newline)
                
                if break_point > chunk_size * 0.5:  # Only break if we're at least halfway
                    chunk = chunk[:break_point + 1]
                    end = start + break_point + 1
            
            chunks.append(chunk.strip())
            start = end - chunk_overlap
        
        return chunks
    
    def retrieve(
        self,
        query: str,
        k: int = 5,
        lesson_id: Optional[str] = None,
        person_id: Optional[str] = None,
        filter_metadata: Optional[Dict] = None,
        dataset_name: Optional[str] = None
    ) -> List[Tuple[str, Dict, float]]:
        """
        Retrieve relevant documents for a query
        
        Args:
            query: Query text
            k: Number of documents to retrieve
            lesson_id: Optional filter by lesson_id
            person_id: Optional filter by person_id
            filter_metadata: Optional additional metadata filters
            dataset_name: Optional filter by dataset_name
        
        Returns:
            List of tuples: (document_text, metadata, distance_score)
        """
        if len(self.documents) == 0:
            return []
        
        # Generate query embedding
        query_embedding = self._embed_text(query)
        query_embedding = query_embedding.reshape(1, -1)
        
        # Search in FAISS - search more results if we have filters (to account for filtering)
        search_k = k * 3 if (dataset_name or lesson_id or person_id) else k
        search_k = min(search_k, len(self.documents))
        distances, indices = self.index.search(query_embedding, search_k)
        
        # Retrieve documents and filter by metadata if needed
        results = []
        for i, idx in enumerate(indices[0]):
            doc = self.documents[idx]
            meta = self.metadata[idx]
            distance = float(distances[0][i])
            
            # Apply filters
            if dataset_name and meta.get('dataset_name') != dataset_name:
                continue
            if lesson_id and meta.get('lesson_id') != lesson_id:
                continue
            if person_id and meta.get('person_id') != person_id:
                continue
            if filter_metadata:
                if not all(meta.get(k) == v for k, v in filter_metadata.items()):
                    continue
            
            results.append((doc, meta, distance))
            
            # Stop when we have enough results
            if len(results) >= k:
                break
        
        return results
    
    def get_context_for_lesson(
        self,
        lesson_id: str,
        person_id: Optional[str] = None,
        query: Optional[str] = None,
        k: int = 5,
        dataset_name: Optional[str] = None
    ) -> str:
        """
        Get relevant context for a lesson (and optionally person)
        
        Args:
            lesson_id: Lesson ID
            person_id: Optional person ID
            query: Optional query to search for relevant context
            k: Number of documents to retrieve
            dataset_name: Optional filter by dataset_name
        
        Returns:
            Combined context string
        """
        if query:
            search_query = query
        else:
            search_query = f"lesson {lesson_id}"
            if person_id:
                search_query += f" person {person_id}"
        
        results = self.retrieve(
            query=search_query,
            k=k,
            lesson_id=lesson_id,
            person_id=person_id,
            dataset_name=dataset_name
        )
        
        if not results:
            return ""
        
        # Combine retrieved documents
        context_parts = []
        for doc, meta, distance in results:
            context_parts.append(doc)
        
        return "\n\n".join(context_parts)
    
    def save_index(self, index_path: str):
        """Save FAISS index and documents to disk"""
        print(f"💾 Saving RAG system to {index_path}...")
        
        # Save FAISS index
        faiss.write_index(self.index, f"{index_path}.index")
        
        # Save documents and metadata
        with open(f"{index_path}.data", 'wb') as f:
            pickle.dump({
                'documents': self.documents,
                'metadata': self.metadata,
                'dimension': self.dimension,
                'embedding_model': self.embedding_model_name
            }, f)
        
        print(f"✅ Saved RAG system to {index_path}")
    
    def load_index(self, index_path: str):
        """Load FAISS index and documents from disk"""
        print(f"📂 Loading RAG system from {index_path}...")
        
        # Load FAISS index
        self.index = faiss.read_index(f"{index_path}.index")
        
        # Load documents and metadata
        with open(f"{index_path}.data", 'rb') as f:
            data = pickle.load(f)
            self.documents = data['documents']
            self.metadata = data['metadata']
            self.dimension = data['dimension']
            self.embedding_model_name = data.get('embedding_model', 'sentence-transformers/all-MiniLM-L6-v2')
            
            # Reinitialize embedder with the saved model
            if not SENTENCE_TRANSFORMERS_AVAILABLE:
                raise RuntimeError("sentence-transformers not available. Install with: pip install sentence-transformers")
            self.embedder = SentenceTransformer(self.embedding_model_name)
        
        print(f"✅ Loaded RAG system: {len(self.documents)} documents, dimension: {self.dimension}")


# Global RAG system instance
_rag_system = None

def get_rag_system(
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
) -> RAGSystem:
    """Get or create global RAG system instance (local embeddings only)"""
    global _rag_system
    if _rag_system is None:
        _rag_system = RAGSystem(embedding_model=embedding_model)
    return _rag_system


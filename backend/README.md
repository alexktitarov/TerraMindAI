# TerraMindAI Backend

TerraMindAI is an AI-powered educational platform for climate change education. This backend provides a RAG-enabled chatbot, quiz generation, learning material creation, text-to-speech capabilities, and temperature data visualization APIs.

## Features

- **RAG-Powered Chatbot**: Climate change AI tutor (Terra) that uses Retrieval-Augmented Generation to provide accurate, data-backed answers
- **Quiz Generation**: Generate multiple-choice questions with RAG context from climate datasets
- **Learning Material Generation**: Create structured educational content with multi-page support
- **Text-to-Speech (TTS)**: Convert text to speech using Eleven Labs API with male/female voice selection
- **Temperature Visualization**: Multiple datasets with  temperature data for countries with trend analysis
- **Streaming Responses**: Real-time streaming for chat and content generation

## Tech Stack

- **Backend**: Flask (Python)
- **AI/LLM**: Groq API (Llama 3.3 70B)
- **RAG System**: FAISS vector store + Sentence Transformers
- **Data Processing**: Pandas, NumPy, SciPy
- **TTS**: Eleven Labs API
- **Embeddings**: sentence-transformers/all-MiniLM-L6-v2

## Installation

1. **Clone the repository**:
```bash
git clone <repository-url>
cd AIvolutionHAIckaton
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Set up environment variables**:
Create a `.env` file in the project root:
```env
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

Get your API keys:
- **Groq API Key**: Sign up at [console.groq.com](https://console.groq.com)
- **Eleven Labs API Key**: Sign up at [elevenlabs.io](https://elevenlabs.io)

4. **Process FAO temperature data** (optional):
If you want to use FAO temperature change data:
```bash
python process_fao_temperature_data.py
```

## Running the Application

### Development Mode

```bash
python app.py
```

The server will start on `http://localhost:5000` (or `5001` if port 5000 is in use).

### Production Mode

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

## API Endpoints

### Chat & Conversation

#### `GET /`
Serves the web chat interface.

#### `POST /chat`
Streaming chat endpoint with RAG context.

**Request**:
```json
{
  "message": "What is climate change?"
}
```

**Response**: Server-Sent Events (SSE) stream

#### `POST /clear`
Clear conversation history.

### RAG System

#### `GET /rag-status`
Get RAG system status and loaded datasets.

**Response**:
```json
{
  "status": "available",
  "rag_available": true,
  "documents_count": 2110,
  "dimension": 384,
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "datasets": ["temperature_by_country", "temperature_by_city", "global_temperatures", "climate_headlines"],
  "dataset_counts": {
    "temperature_by_country": 75,
    "temperature_by_city": 35,
    "global_temperatures": 1000,
    "climate_headlines": 1000
  }
}
```

### Quiz Generation

#### `POST /generate-questions`
Generate quiz questions with RAG context.

**Request**:
```json
{
  "lesson_id": "temperature",
  "person_id": "student_1",
  "num_questions": 5,
  "difficulty": "medium",
  "question_type": "comprehensive",
  "use_rag": true,
  "context_k": 5,
  "dataset_name": "temperature_by_country"
}
```

**Parameters**:
- `lesson_id` (required): Lesson identifier (can be empty string to search all datasets)
- `person_id` (required): Person/student identifier
- `num_questions` (optional): Number of questions to generate (default: 5)
- `difficulty` (optional): Difficulty level - "easy", "medium", "hard" (default: "medium")
- `question_type` (optional): Type of questions (default: "comprehensive")
- `use_rag` (optional): Whether to use RAG context (default: true)
- `context_k` (optional): Number of context chunks to retrieve (default: 5)
- `dataset_name` (optional): Filter by specific dataset

**Response**:
```json
{
  "status": "success",
  "lesson_id": "temperature",
  "person_id": "student_1",
  "questions": [
    {
      "question": "What is the average temperature increase in Asia?",
      "type": "comprehensive",
      "difficulty": "medium",
      "options": ["0.49°C", "0.99°C", "1.49°C"],
      "correct_answer": "0.99°C",
      "context_reference": "According to the context: Temperature trend analysis for Asia..."
    }
  ],
  "context_used": true,
  "parameters_used": {...},
  "statistics": {...}
}
```

#### `POST /quiz-feedback`
Get personalized feedback on quiz results.

**Request**:
```json
{
  "quiz": {
    "questions": [
      {
        "question": "What is climate change?",
        "options": ["Option A", "Option B", "Option C"],
        "correct_answer": "Option A",
        "context_reference": "Climate change refers to..."
      }
    ]
  },
  "student_answers": {
    "0": "Option B",
    "1": "Option A"
  },
  "score": 7,
  "total_questions": 10,
  "lesson_id": "temperature"
}
```

**Response**:
```json
{
  "status": "success",
  "feedback": "Great job on your quiz!...",
  "summary": {
    "score": 7,
    "total_questions": 10,
    "percentage": 70.0,
    "correct_count": 7,
    "wrong_count": 3
  },
  "wrong_answers": [...]
}
```

### Learning Material Generation

#### `POST /generate-learning-material`
Generate structured learning material with RAG context.

**Request**:
```json
{
  "lesson_id": "climate_change_basics",
  "person_id": "student_1",
  "topic": "Introduction to Climate Change",
  "age_group": "high_school",
  "use_rag": true,
  "context_k": 5
}
```

**Response**:
```json
{
  "status": "success",
  "learning_material": {
    "content": "Full content text...",
    "pages": [
      {
        "page_number": 1,
        "content": "<page>Page 1 content...</page>"
      },
      {
        "page_number": 2,
        "content": "<page>Page 2 content...</page>"
      },
      {
        "page_number": 3,
        "content": "<page>Page 3 content...</page>"
      }
    ]
  },
  "context_used": true
}
```

### Text-to-Speech (TTS)

#### `POST /tts`
Convert text to speech.

**Request**:
```json
{
  "text": "Hello, this is a test.",
  "voice_id": "optional-voice-id",
  "gender": "female",
}
```

**Parameters**:
- `text` (required): Text to convert to speech
- `voice_id` (optional): Specific voice ID (overrides gender)
- `gender` (optional): "male" or "female" (default: "female")
- `model_id` (optional): TTS model (default: "eleven_flash_v2_5")

**Response**: Audio file (MP3) as binary data

#### `GET /tts/voices`
List available voices.

**Response**:
```json
{
  "status": "success",
  "voices": [...],
  "voices_by_gender": {
    "male": [...],
    "female": [...],
    "other": [...]
  }
}
```

### Temperature Visualization

#### `GET /visualization/countries`
Get list of available countries with temperature data.

**Query Parameters**:
- `search` (optional): Filter countries by name
- `limit` (optional): Maximum number of countries to return
- `include_sources` (optional): Include data source information

**Response**:
```json
{
  "success": true,
  "countries": ["Afghanistan", "Albania", ...],
  "count": 282,
  "total_count": 282
}
```

#### `GET /visualization/country-temperature`
Get temperature data for a specific country.

**Query Parameters**:
- `country` (required): Country name
- `start_year` (optional): Start year for filtering
- `end_year` (optional): End year for filtering
- `data_type` (optional): "absolute" or "change" (default: "absolute")
- `include_metadata` (optional): Include data source metadata

**Response**:
```json
{
  "success": true,
  "country": "United States",
  "data": [
    {
      "year": 2000,
      "temperature": 8.52,
      "change_from_start": 0.0,
      "min_temp": 5.2,
      "max_temp": 12.1,
      "data_points": 12
    }
  ],
  "statistics": {
    "min_year": 1750,
    "max_year": 2013,
    "min_temp": 5.2,
    "max_temp": 12.5,
    "avg_temp": 8.8,
    "trend_per_century": 0.65,
    "total_change": 1.2,
    "data_points": 264
  }
}
```

#### `GET /visualization/country-temperature-change`
Get temperature change data for a country (FAO data).

**Query Parameters**:
- `country` (required): Country name
- `start_year` (optional): Start year
- `end_year` (optional): End year

#### `GET /visualization/combined-country-temperature`
Get combined absolute and change temperature data.

**Query Parameters**:
- `country` (required): Country name
- `start_year` (optional): Start year
- `end_year` (optional): End year

## Datasets

The RAG system loads the following climate datasets:

1. **GlobalLandTemperaturesByCountry.csv**: Country-level temperature data
2. **GlobalLandTemperaturesByCity.csv**: City-level temperature data
3. **GlobalTemperatures.csv**: Global temperature averages
4. **climate_headlines_sentiment.csv**: Climate news headlines with sentiment
5. **FAO_TemperatureChange_Processed.csv**: FAO temperature change data (requires processing)

All datasets are located in the `dataset/` directory.

## Project Structure

```
AIvolutionHAIckaton/
├── app.py                          # Main Flask application
├── rag_system.py                   # RAG system implementation
├── process_fao_temperature_data.py # FAO data processing script
├── requirements.txt                # Python dependencies
├── .env                            # Environment variables (create this)
├── Procfile                        # Production deployment config
├── templates/
│   └── index.html                  # Web chat interface
└── dataset/                        # Climate datasets
    ├── GlobalLandTemperaturesByCountry.csv
    ├── GlobalLandTemperaturesByCity.csv
    ├── GlobalTemperatures.csv
    ├── climate_headlines_sentiment.csv
    ├── Environment_Temperature_change_E_All_Data_NOFLAG.csv
    ├── FAO_TemperatureChange_Processed.csv
    └── ...
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Required
GROQ_API_KEY=your_groq_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# Optional
HOST=0.0.0.0
PORT=5000
FLASK_DEBUG=False
```

## Deployment

### Heroku

1. Create a `Procfile`:
```
web: gunicorn -w 4 -b 0.0.0.0:$PORT app:app
```

2. Set environment variables in Heroku dashboard

3. Deploy:
```bash
git push heroku main
```

## CORS Configuration

CORS is enabled for all routes to allow frontend integration. In production, configure allowed origins in `app.py`:

```python
CORS(app, resources={
    r"/*": {
        "origins": ["https://your-frontend-domain.com"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})
```

## License

This project is provided as-is for educational purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

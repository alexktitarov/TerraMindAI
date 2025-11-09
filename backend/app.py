from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
import re
import os
import json
import time
import random
import io
from groq import Groq
from dotenv import load_dotenv
import pandas as pd
import numpy as np
from scipy import stats
from functools import lru_cache

# Import Eleven Labs for TTS
try:
    from elevenlabs.client import ElevenLabs
    ELEVENLABS_AVAILABLE = True
    
    # Default voice IDs by gender (based on Eleven Labs premade voices)
    DEFAULT_MALE_VOICE_ID = "2EiwWnXFnvU5JabPnv8n"  # Clyde
    DEFAULT_FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"  # Sarah (common female voice)
    
except ImportError:
    print("[WARNING] Eleven Labs not available. Install with: pip install elevenlabs")
    ELEVENLABS_AVAILABLE = False
    DEFAULT_MALE_VOICE_ID = None
    DEFAULT_FEMALE_VOICE_ID = None

# Import RAG system
try:
    from rag_system import get_rag_system, RAGSystem
    RAG_AVAILABLE = True
except ImportError as e:
    print(f"[WARNING] RAG system not available: {e}")
    RAG_AVAILABLE = False
    RAGSystem = None

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Enable CORS for all routes and allow all origins (for development)
# In production, specify allowed origins
CORS(app, resources={
    r"/visualization/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    },
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

class EcoChatbot:
    """Terra - AI Tutor for Climate Change"""
    
    def __init__(self):
        self.name = "Terra"
        self.api_key = os.getenv('GROQ_API_KEY')
        # Groq models: llama-3.3-70b-versatile, llama-3.1-70b-versatile, mixtral-8x7b-32768, gemma-7b-it.
        self.model = "llama-3.3-70b-versatile" 
        self.conversation_history  = []  # Store conversation context
        
        # Initialize RAG system
        self.rag_system = None
        if RAG_AVAILABLE:
            try:
                print("[INFO] Initializing RAG system...")
                self.rag_system = get_rag_system(
                    embedding_model="sentence-transformers/all-MiniLM-L6-v2"
                )
                print("[INFO] RAG system initialized successfully")
                # Load climate datasets
                self._load_climate_datasets()
            except Exception as e:
                print(f"[WARNING] Failed to initialize RAG system: {e}")
                self.rag_system = None
        else:
            print("[WARNING] RAG system not available")
         
        if self.api_key:
            try:
                self.client = Groq(api_key=self.api_key)
                print(f"[DEBUG] Groq client initialized successfully")
                print(f"[DEBUG] Using model: {self.model}")
            except Exception as e:
                print(f"[ERROR] Failed to initialize Groq client: {e}")
                self.client = None
        else:
            print("[WARNING] GROQ_API_KEY not found in environment variables")
            self.client = None
        
        # System prompt to guide Eco's personality and behavior
        self.system_prompt_base = """You are Eco, a friendly, helpful, and knowledgeable AI tutor for climate change and environmental science. 

Your personality:
- Encouraging and patient
- Scientific but accessible
- Clear and simple explanations suitable for high school students
- Concise responses (2-3 sentences by default, unless the user asks for more detail)

Your purpose:
- Answer questions about climate change, environmental science, and sustainability
- Provide educational, accurate information based on the provided context
- Keep responses focused on climate-related topics
- Use the provided context from climate datasets to give accurate, data-driven answers

Remember to be friendly, encouraging, and make complex topics easy to understand."""
        
        self.system_prompt = self.system_prompt_base
        
        self.domain_keywords = [
            'climate', 'environment', 'global warming', 'greenhouse', 'carbon',
            'emissions', 'sustainability', 'renewable', 'fossil fuel', 'temperature',
            'sea level', 'ice', 'glacier', 'drought', 'flood', 'precipitation',
            'rainfall', 'ecosystem', 'biodiversity', 'pollution', 'ozone',
            'atmosphere', 'weather', 'extreme weather', 'hurricane', 'typhoon',
            'co2', 'methane', 'nitrogen', 'acid rain', 'deforestation',
            'renewable energy', 'solar', 'wind', 'hydroelectric', 'geothermal'
        ]
        
    def is_on_topic(self, user_input):
        """Check if the user's question is related to climate change"""
        user_lower = user_input.lower()
        
        # Check for explicit off-topic indicators
        off_topic_patterns = [
            r'\b(movie|film|cinema|actor|actress)\b',
            r'\b(politics|political|election|president|government|party)\b',
            r'\b(personal|advice|relationship|dating|love)\b',
            r'\b(cooking|recipe|food recipe)\b',
            r'\b(sports|football|basketball|soccer|game)\b',
            r'\b(entertainment|celebrity|gossip)\b'
        ]
        
        for pattern in off_topic_patterns:
            if re.search(pattern, user_lower):
                return False
        
        # Check if input contains climate-related keywords
        for keyword in self.domain_keywords:
            if keyword in user_lower:
                return True
        
        # If no keywords found, consider it potentially off-topic
        # But be lenient - check if it's a general question that might be related
        question_words = ['what', 'why', 'how', 'when', 'where', 'who', 'explain', 'tell me']
        if any(word in user_lower for word in question_words):
            # Might be a general question - check context
            return False  # Default to off-topic if no climate keywords
        
        return False
    
    def detect_visualization(self, user_input):
        """Detect which visualization should be triggered based on user input"""
        user_lower = user_input.lower()
        
        if re.search(r'\b(temperature|warming|heat|hot|cool|cold|thermal)\b', user_lower):
            return 'temperature_trends'
        elif re.search(r'\b(co2|carbon|co₂|emission|greenhouse gas)\b', user_lower):
            return 'co2_levels'
        elif re.search(r'\b(rainfall|precipitation|rain|drizzle|storm|monsoon)\b', user_lower):
            return 'rainfall_data'
        
        return None
    
    def _load_climate_datasets(self):
        """Load climate datasets into RAG system"""
        if not self.rag_system:
            print("[WARNING] RAG system not available, skipping dataset loading")
            return
        
        dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
        if not os.path.exists(dataset_dir):
            print(f"[WARNING] Dataset directory not found: {dataset_dir}")
            return
        
        # List of datasets to load with their configurations
        datasets = [
            {
                'file': 'GlobalLandTemperaturesByCountry.csv',
                'name': 'temperature_by_country',
                'text_column': 'text'
            },
            {
                'file': 'GlobalLandTemperaturesByCity.csv',
                'name': 'temperature_by_city',
                'text_column': 'text'
            },
            {
                'file': 'GlobalTemperatures.csv',
                'name': 'global_temperatures',
                'text_column': 'text'
            },
            {
                'file': 'climate_headlines_sentiment.csv',
                'name': 'climate_headlines',
                'text_column': 'Content',  # Use Content column for text
                'lesson_id_column': None,
                'person_id_column': None
            }
        ]
        
        for dataset_config in datasets:
            file_path = os.path.join(dataset_dir, dataset_config['file'])
            if os.path.exists(file_path):
                try:
                    print(f"[INFO] Loading dataset: {dataset_config['name']} from {dataset_config['file']}...")
                    self.rag_system.load_from_dataset(
                        dataset_path=file_path,
                        text_column=dataset_config.get('text_column', 'text'),
                        lesson_id_column=dataset_config.get('lesson_id_column', None),
                        person_id_column=dataset_config.get('person_id_column', None),
                        dataset_name=dataset_config['name']
                    )
                    print(f"[INFO] Successfully loaded {dataset_config['name']}")
                except Exception as e:
                    print(f"[WARNING] Failed to load {dataset_config['file']}: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print(f"[WARNING] Dataset file not found: {file_path}")
    
    def _get_rag_context(self, user_input, k=3):
        """Retrieve relevant context from RAG system for user query"""
        if not self.rag_system:
            return ""
        
        try:
            # Retrieve relevant documents
            results = self.rag_system.retrieve(
                query=user_input,
                k=k,
                dataset_name=None  # Search across all datasets
            )
            
            if not results:
                return ""
            
            # Combine retrieved documents into context
            context_parts = []
            for doc, meta, distance in results:
                context_parts.append(doc)
            
            context = "\n\n".join(context_parts)
            print(f"[DEBUG] Retrieved {len(results)} context documents for query")
            return context
            
        except Exception as e:
            print(f"[WARNING] Error retrieving RAG context: {e}")
            return ""
    
    def _call_groq_api_stream(self, user_input):
        """Call Groq API to generate streaming response with RAG context"""
        if not self.api_key:
            yield f"data: {json.dumps({'error': 'GROQ_API_KEY not found in environment variables'})}\n\n"
            return
        
        if not self.client:
            yield f"data: {json.dumps({'error': 'Groq client not initialized'})}\n\n"
            return
        
        try:
            # Get RAG context for the user query
            rag_context = self._get_rag_context(user_input, k=3)
            
            # Build system prompt with context
            system_prompt = self.system_prompt_base
            if rag_context:
                system_prompt += f"\n\nRELEVANT CONTEXT FROM CLIMATE DATASETS:\n{rag_context}\n\nUse this context to provide accurate, data-driven answers. If the context doesn't directly answer the question, you can still provide general information but mention that specific data may vary."
            
            # Build messages array with system prompt and conversation history
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add conversation history (last 10 exchanges for context)
            for msg in self.conversation_history[-10:]:
                messages.append(msg)
            
            # Add current user message
            messages.append({"role": "user", "content": user_input})
            
            # Debug: Print request details
            print(f"[DEBUG] Model: {self.model}")
            print(f"[DEBUG] User input: {user_input[:50]}...")
            print(f"[DEBUG] RAG context retrieved: {len(rag_context) > 0}")
            print(f"[DEBUG] Conversation history length: {len(self.conversation_history)}")
            print(f"[DEBUG] Total messages: {len(messages)}")
            
            # Call Groq API with streaming
            print(f"[DEBUG] Calling Groq API with streaming...")
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=400,  # Slightly increased to accommodate context-based responses
                temperature=0.8,  # Slightly higher for more variation
                stream=True  # Enable streaming
            )
            
            full_response = ""
            
            # Stream the response with delay for smoother appearance
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    # Send each chunk to the client
                    yield f"data: {json.dumps({'content': content, 'done': False})}\n\n"
                    # Add a small delay to slow down streaming (adjust as needed)
                    time.sleep(0.03)  # 30ms delay per chunk - makes it appear more gradually
            
            # Send completion signal
            full_response = full_response.strip()
            
            if full_response:
                # Update conversation history
                self.conversation_history.append({"role": "user", "content": user_input})
                self.conversation_history.append({"role": "assistant", "content": full_response})
                
                print(f"[DEBUG] Generated response: {full_response[:100]}...")
                yield f"data: {json.dumps({'content': '', 'done': True, 'full_response': full_response})}\n\n"
            else:
                yield f"data: {json.dumps({'error': 'Empty response received', 'done': True})}\n\n"
                
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            print(f"[ERROR] {error_msg}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': error_msg, 'done': True})}\n\n"
    
    def _call_groq_api(self, user_input):
        """Call Groq API to generate response (non-streaming, for backward compatibility) with RAG context"""
        if not self.api_key:
            return "Error: GROQ_API_KEY not found in environment variables. Please check your .env file."
        
        if not self.client:
            return "Error: Groq client not initialized. Please check your API key."
        
        try:
            # Get RAG context for the user query
            rag_context = self._get_rag_context(user_input, k=3)
            
            # Build system prompt with context
            system_prompt = self.system_prompt_base
            if rag_context:
                system_prompt += f"\n\nRELEVANT CONTEXT FROM CLIMATE DATASETS:\n{rag_context}\n\nUse this context to provide accurate, data-driven answers. If the context doesn't directly answer the question, you can still provide general information but mention that specific data may vary."
            
            # Build messages array with system prompt and conversation history
            messages = [{"role": "system", "content": system_prompt}]
            
            # Add conversation history (last 10 exchanges for context)
            for msg in self.conversation_history[-10:]:
                messages.append(msg)
            
            # Add current user message
            messages.append({"role": "user", "content": user_input})
            
            # Call Groq API
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=400,  # Slightly increased to accommodate context-based responses
                temperature=0.8
            )
            
            assistant_message = response.choices[0].message.content.strip()
            
            if assistant_message:
                self.conversation_history.append({"role": "user", "content": user_input})
                self.conversation_history.append({"role": "assistant", "content": assistant_message})
            
            return assistant_message
            
        except AttributeError as e:
            error_msg = f"AttributeError: {str(e)}"
            print(f"[ERROR] {error_msg}")
            print(f"[ERROR] This might indicate the Hathora SDK method doesn't exist or endpoint isn't configured")
            import traceback
            traceback.print_exc()
            return f"I'm sorry, there was an issue with the API configuration. Error: {error_msg}. Please check your .env file and ensure HATHORA_ENDPOINT is set correctly."
        except TypeError as e:
            error_msg = f"TypeError: {str(e)}"
            print(f"[ERROR] {error_msg}")
            print(f"[ERROR] This might indicate incorrect parameters passed to the API")
            import traceback
            traceback.print_exc()
            return f"I'm sorry, there was an issue with the API call format. Error: {error_msg}"
        except Exception as e:
            error_type = type(e).__name__
            
            # Try to extract more details from the error object
            error_details = []
            error_details.append(f"Error type: {error_type}")
            error_details.append(f"Error message: {str(e)}")
            
            # Check for common error attributes
            if hasattr(e, 'message'):
                error_details.append(f"Error.message: {e.message}")
            if hasattr(e, 'args') and e.args:
                error_details.append(f"Error.args: {e.args}")
            if hasattr(e, 'status_code'):
                error_details.append(f"Status code: {e.status_code}")
            if hasattr(e, 'response'):
                error_details.append(f"Response: {e.response}")
            if hasattr(e, 'body'):
                error_details.append(f"Body: {e.body}")
            if hasattr(e, 'headers'):
                error_details.append(f"Headers: {e.headers}")
            
            # Print all error details
            print(f"[ERROR] {error_type}: {str(e)}")
            for detail in error_details:
                print(f"[ERROR] {detail}")
            
            # Print full traceback
            import traceback
            traceback.print_exc()
            
            # Build user-friendly error message
            if error_type == "APIError" or "groq" in error_type.lower() or "api" in error_type.lower():
                status_code = None
                if hasattr(e, 'status_code'):
                    status_code = e.status_code
                elif hasattr(e, 'response') and hasattr(e.response, 'status_code'):
                    status_code = e.response.status_code
                
                user_msg = "I'm sorry, there was an API error."
                
                if status_code == 404:
                    user_msg += "\n\n❌ Error 404: Endpoint not found.\n"
                    user_msg += "Please check your Groq API configuration.\n"
                elif status_code == 401:
                    user_msg += "\n\n❌ Error 401: Unauthorized.\n"
                    user_msg += "This means your API key is invalid or expired.\n\n"
                    user_msg += "Please check:\n"
                    user_msg += "1. Your GROQ_API_KEY in .env file\n"
                    user_msg += "2. Get a new API key from https://console.groq.com\n"
                elif status_code == 403:
                    user_msg += "\n\n❌ Error 403: Forbidden.\n"
                    user_msg += "This means you don't have permission to access the API.\n\n"
                    user_msg += "Please check:\n"
                    user_msg += "1. Your API key has the correct permissions\n"
                    user_msg += "2. Your Groq account is active\n"
                else:
                    user_msg += "\n\nPossible causes:\n"
                    user_msg += "- Invalid API key\n"
                    user_msg += "- Network connectivity issues\n"
                    user_msg += "- Server-side error from Groq\n"
                    user_msg += f"\nTechnical details: {str(e) if str(e) else 'No error message available'}"
                    if status_code:
                        user_msg += f"\nStatus code: {status_code}"
            else:
                user_msg = f"I'm sorry, I encountered an error ({error_type}) while processing your question."
                if str(e):
                    user_msg += f" Details: {str(e)}"
                else:
                    user_msg += " Please check the server logs for more information."
            
            return user_msg
    
    def generate_response(self, user_input):
        """Generate a response to the user's question"""
        user_lower = user_input.lower()
        
        
        # Detect visualization trigger
        viz_type = self.detect_visualization(user_input)
        
        # Generate response using Groq API
        response = self._call_groq_api(user_input)
        
        return {
            'response': response,
            'visualization': viz_type
        }
    
    def clear_history(self):
        """Clear conversation history (useful for starting fresh sessions)"""
        self.conversation_history = []

# Initialize chatbot
eco = EcoChatbot()

@app.route('/')
def index():
    """API root endpoint"""
    return jsonify({
        'service': 'TerraMindAI Backend API',
        'version': '1.0.0',
        'status': 'running',
        'endpoints': {
            'chat': '/chat (POST)',
            'rag_status': '/rag-status (GET)',
            'generate_questions': '/generate-questions (POST, GET)',
            'quiz_feedback': '/quiz-feedback (POST)',
            'generate_learning_material': '/generate-learning-material (POST, GET)',
            'tts': '/tts (POST, GET)',
            'tts_voices': '/tts/voices (GET)',
            'visualization_countries': '/visualization/countries (GET)',
            'visualization_country_temperature': '/visualization/country-temperature (GET)',
            'visualization_country_temperature_change': '/visualization/country-temperature-change (GET)',
            'visualization_combined': '/visualization/combined-country-temperature (GET)'
        },
        'documentation': 'See README.md for API documentation'
    })

@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat messages (streaming)"""
    data = request.json
    user_message = data.get('message', '').strip()
    
    if not user_message:
        return jsonify({
            'response': "Please ask me a question about climate change!",
            'visualization': None
        }), 400
    
    # Detect visualization trigger
    viz_type = eco.detect_visualization(user_message)
    
    # Create streaming response
    def generate():
        # Send visualization info first
        yield f"data: {json.dumps({'type': 'viz', 'visualization': viz_type})}\n\n"
        
        # Stream the AI response
        for chunk in eco._call_groq_api_stream(user_message):
            yield chunk
    
    response = Response(stream_with_context(generate()), mimetype='text/event-stream')
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    return response

@app.route('/clear', methods=['POST'])
def clear_history():
    """Clear conversation history"""
    eco.clear_history()
    return jsonify({'status': 'success', 'message': 'Conversation history cleared'})

@app.route('/rag-status', methods=['GET'])
def rag_status():
    """Get RAG system status"""
    if not eco.rag_system:
        return jsonify({
            'status': 'not_available',
            'message': 'RAG system is not available',
            'rag_available': False
        })
    
    # Get unique dataset names
    dataset_names = set()
    for meta in eco.rag_system.metadata:
        if 'dataset_name' in meta:
            dataset_names.add(meta['dataset_name'])
    
    # Count documents per dataset
    dataset_counts = {}
    for meta in eco.rag_system.metadata:
        ds_name = meta.get('dataset_name', 'default')
        dataset_counts[ds_name] = dataset_counts.get(ds_name, 0) + 1
    
    return jsonify({
        'status': 'available',
        'rag_available': True,
        'documents_count': len(eco.rag_system.documents),
        'dimension': eco.rag_system.dimension,
        'embedding_model': eco.rag_system.embedding_model_name,
        'embedding_type': 'local (sentence-transformers)',
        'datasets': list(dataset_names),
        'dataset_counts': dataset_counts
    })

@app.route('/generate-questions', methods=['POST', 'GET'])
def generate_questions():
    """
    Generate questions with RAG context
    
    POST request body (JSON):
    {
        "lesson_id": "string (required)",
        "person_id": "string (required)",
        "dataset_name": "string (optional)",
        "num_questions": 5 (optional, default: 5),
        "question_type": "comprehensive" (optional, default: "comprehensive"),
        "difficulty": "medium" (optional, default: "medium"),
        "use_rag": true (optional, default: true),
        "context_k": 5 (optional, default: 5)
    }
    
    GET request query parameters:
    - lesson_id (required)
    - person_id (required)
    - dataset_name (optional)
    - num_questions (optional, default: 5)
    - question_type (optional, default: "comprehensive")
    - difficulty (optional, default: "medium")
    - use_rag (optional, default: true)
    - context_k (optional, default: 5)
    """
    try:
        # Get parameters from request
        if request.method == 'POST':
            data = request.json or {}
            lesson_id = data.get('lesson_id', '')
            person_id = data.get('person_id', '')
            dataset_name = data.get('dataset_name')
            num_questions = data.get('num_questions', 5)
            question_type = data.get('question_type', 'comprehensive')
            difficulty = data.get('difficulty', 'medium')
            use_rag = data.get('use_rag', True)
            context_k = data.get('context_k', 5)
        else:  # GET
            lesson_id = request.args.get('lesson_id', '')
            person_id = request.args.get('person_id', '')
            dataset_name = request.args.get('dataset_name')
            num_questions = int(request.args.get('num_questions', 5))
            question_type = request.args.get('question_type', 'comprehensive')
            difficulty = request.args.get('difficulty', 'medium')
            use_rag = request.args.get('use_rag', 'true').lower() == 'true'
            context_k = int(request.args.get('context_k', 5))
        
        # Validate required parameters
        # Note: lesson_id can be empty string "" to search all datasets
        if person_id is None or person_id == '':
            return jsonify({
                'status': 'error',
                'message': 'person_id is required (can be any string like "student_1")'
            }), 400
        
        # lesson_id can be empty string - it will search all datasets
        if lesson_id is None:
            lesson_id = ""
        
        # Log received parameters
        print("\n" + "="*80)
        print("[QUIZ GENERATION] Received Request:")
        print("="*80)
        print(f"  Method: {request.method}")
        print(f"  lesson_id: '{lesson_id}'")
        print(f"  person_id: '{person_id}'")
        print(f"  num_questions: {num_questions}")
        print(f"  difficulty: {difficulty}")
        print(f"  question_type: {question_type}")
        print(f"  use_rag: {use_rag}")
        print(f"  context_k: {context_k}")
        print(f"  dataset_name: {dataset_name}")
        print("="*80 + "\n")
        
        # Check if Groq client is available
        if not eco.client:
            return jsonify({
                'status': 'error',
                'message': 'Groq client not available. Please check your GROQ_API_KEY in .env file.'
            }), 500
        
        # Retrieve relevant context using RAG
        context = ""
        context_snippets = []
        context_metadata = []
        if use_rag and eco.rag_system:
            try:
                print(f"[QUIZ GENERATION] Retrieving RAG context...")
                print(f"  Query: lesson_id='{lesson_id}', dataset_name={dataset_name}, k={context_k}")
                
                # Get context for this lesson and person, filtered by dataset_name
                context = eco.rag_system.get_context_for_lesson(
                    lesson_id=lesson_id,
                    person_id=person_id,
                    query=f"Generate questions about {lesson_id} for {person_id}",
                    k=context_k,
                    dataset_name=dataset_name
                )
                
                # If no context with filters, try without person_id filter
                if not context:
                    print(f"  No context with person_id filter, trying without person_id...")
                    context = eco.rag_system.get_context_for_lesson(
                        lesson_id=lesson_id,
                        person_id=None,
                        query=f"Generate questions about {lesson_id}",
                        k=context_k,
                        dataset_name=dataset_name
                    )
                
                # If still no context, try without any filters (fallback)
                if not context:
                    print(f"  No context with lesson_id filter, trying general search...")
                    query_text = lesson_id if lesson_id else "climate change temperature"
                    results = eco.rag_system.retrieve(
                        query=query_text,
                        k=context_k,
                        dataset_name=dataset_name
                    )
                    if results:
                        context = "\n\n".join([doc for doc, _, _ in results])
                        context_metadata = [meta for _, meta, _ in results]
                
                if context:
                    print(f"  ✅ Retrieved context: {len(context)} characters")
                    # Get snippets for response - store full context for reference
                    query_text = lesson_id if lesson_id else "climate change"
                    results = eco.rag_system.retrieve(
                        query=query_text,
                        k=min(context_k, 5),  # Get more for better context reference
                        lesson_id=lesson_id if lesson_id else None,
                        person_id=None,
                        dataset_name=dataset_name
                    )
                    if not results:
                        results = eco.rag_system.retrieve(
                            query=query_text,
                            k=min(context_k, 5),
                            dataset_name=dataset_name
                        )
                    # Store full documents for context reference, not just snippets
                    context_snippets = [doc for doc, meta, _ in results] if results else []
                    context_metadata = [meta for _, meta, _ in results] if results else context_metadata
                    print(f"  ✅ Retrieved {len(context_snippets)} context snippets")
                else:
                    print(f"  ⚠️  No context found - will generate questions without specific context")
            except Exception as e:
                print(f"  ❌ Warning: Error retrieving RAG context: {e}")
                import traceback
                traceback.print_exc()
                context = ""
        
        # Build the prompt
        print(f"\n[QUIZ GENERATION] Building prompt...")
        print(f"  Context available: {bool(context)}")
        print(f"  Context length: {len(context)} characters" if context else "  No context")
        
        if context:
            # Create context reference mapping for better extraction
            context_parts_list = context.split("\n\n")
            print(f"  Context parts: {len(context_parts_list)}")
            
            prompt = f"""Generate {num_questions} {difficulty} level questions for lesson ID: {lesson_id} and person ID: {person_id}.

Question Type: {question_type}

RELEVANT CONTEXT FROM LESSON MATERIAL:
{context}

IMPORTANT INSTRUCTIONS:
1. For EACH question, generate exactly 1 question
2. For EACH question, generate exactly 3 answer options
3. One of the 3 options must be the correct answer
4. The other 2 options should be plausible but incorrect answers (distractors)
5. Include a context_reference that quotes or summarizes the specific part of the context used

Format the response as a JSON object with a "questions" key containing an array of question objects.
Each question object MUST have:
- "question": A single, clear question text
- "type": The question type ({question_type})
- "difficulty": The difficulty level ({difficulty})
- "options": An array of exactly 3 answer options (one correct, two incorrect distractors)
- "correct_answer": The correct answer (must be one of the 3 options - use the exact text from options)
- "context_reference": REQUIRED - A specific quote or summary (2-3 sentences) from the context that the question is based on. This MUST reference specific details, numbers, dates, or facts from the context above. DO NOT leave this empty. Quote directly from the context when possible.

Example format:
{{
  "questions": [
    {{
      "question": "What is the average temperature increase in Asia over the recorded period?",
      "type": "{question_type}",
      "difficulty": "{difficulty}",
      "options": ["0.49°C", "0.99°C", "1.49°C"],
      "correct_answer": "0.99°C",
      "context_reference": "According to the context: 'Temperature trend analysis for Asia: Temperatures have increased by 0.99°C over the recorded period, from an early average of X°C to a later average of Y°C. This change occurred between YEAR1 and YEAR2.'"
    }}
  ]
}}

Return only valid JSON, no additional text or markdown formatting."""
        else:
            # Fallback to basic prompt if no context
            prompt = f"""Generate {num_questions} {difficulty} level questions for lesson ID: {lesson_id} and person ID: {person_id}.

Question Type: {question_type}

Please generate questions that:
1. Are relevant to the lesson content
2. Are appropriate for the difficulty level: {difficulty}
3. Test understanding and comprehension
4. Are clear and well-formulated

Format the response as a JSON object with a "questions" key containing an array of question objects.
Each question object MUST have:
- "question": A single, clear question text
- "type": The question type ({question_type})
- "difficulty": The difficulty level ({difficulty})
- "options": An array of exactly 3 answer options (one correct, two incorrect distractors)
- "correct_answer": The correct answer (must be one of the 3 options)
- "context_reference": A brief explanation of the context used (optional if no context available)

Return only valid JSON, no additional text or markdown formatting."""
        
        # Call Groq API
        print(f"\n[QUIZ GENERATION] Calling Groq API...")
        print(f"  Model: {eco.model}")
        print(f"  Temperature: 0.7")
        print(f"  Max tokens: 2000")
        print(f"  Prompt length: {len(prompt)} characters")
        
        try:
            import time
            start_time = time.time()
            
            completion = eco.client.chat.completions.create(
                model=eco.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert educational content generator. Generate high-quality questions for educational purposes. Always return valid JSON format with a 'questions' key containing an array of question objects."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=2000,  # Adjusted for 1 question with 3 options
                response_format={"type": "json_object"}  # Always use JSON object format
            )
            
            elapsed_time = time.time() - start_time
            response_text = completion.choices[0].message.content
            print(f"  ✅ API response received in {elapsed_time:.2f}s")
            print(f"  Response length: {len(response_text)} characters")
        except Exception as groq_error:
            error_msg = str(groq_error)
            return jsonify({
                'status': 'error',
                'message': f'Groq API error: {error_msg}',
                'lesson_id': lesson_id,
                'person_id': person_id
            }), 503
        
        # Parse the response
        try:
            cleaned_response = response_text.strip()
            cleaned_response = re.sub(r'```json\s*', '', cleaned_response)
            cleaned_response = re.sub(r'```\s*', '', cleaned_response)
            cleaned_response = cleaned_response.strip()
            
            data = json.loads(cleaned_response)
            
            if isinstance(data, dict):
                if "questions" in data:
                    questions = data["questions"]
                else:
                    questions = [data]
            elif isinstance(data, list):
                questions = data
            else:
                questions = []
                
            # Validate and format questions
            print(f"\n[QUIZ GENERATION] Processing {len(questions)} questions...")
            formatted_questions = []
            for i, q in enumerate(questions, 1):
                if isinstance(q, dict) and "question" in q:
                    question_text = q.get("question", "")
                    options = q.get("options", [])
                    correct_answer = q.get("correct_answer", q.get("answer", ""))
                    
                    # Ensure we have exactly 3 options
                    if len(options) > 3:
                        # If we have more than 3, take first 3
                        options = options[:3]
                    elif len(options) < 3:
                        # If we have less than 3, pad with distractors
                        while len(options) < 3:
                            if correct_answer and correct_answer not in options:
                                # Add correct answer if not present
                                options.append(correct_answer)
                            else:
                                # Create a distractor
                                if correct_answer:
                                    # Try to create a numeric variation if possible
                                    try:
                                        # If correct answer is numeric, create variations
                                        if '°C' in str(correct_answer) or any(char.isdigit() for char in str(correct_answer)):
                                            # Extract number from correct answer
                                            numbers = re.findall(r'[\d.]+', str(correct_answer))
                                            if numbers:
                                                base_num = float(numbers[0])
                                                # Create distractor
                                                multiplier = random.choice([0.5, 1.5, 2.0, 0.75])
                                                distractor = str(round(base_num * multiplier, 2)) + ('°C' if '°C' in str(correct_answer) else '')
                                                if distractor not in options and distractor != correct_answer:
                                                    options.append(distractor)
                                                else:
                                                    options.append(f"Option {len(options) + 1}")
                                            else:
                                                options.append(f"Option {len(options) + 1}")
                                        else:
                                            options.append(f"Option {len(options) + 1}")
                                    except:
                                        options.append(f"Option {len(options) + 1}")
                                else:
                                    options.append(f"Option {len(options) + 1}")
                    
                    # Ensure correct_answer is one of the options
                    if correct_answer:
                        # Normalize for comparison (handle string matching)
                        options_normalized = [str(opt).strip() for opt in options]
                        correct_normalized = str(correct_answer).strip()
                        
                        if correct_normalized not in options_normalized:
                            # Correct answer not in options - replace first option that's not the correct answer
                            # But first, try to find a close match
                            found_match = False
                            for i, opt in enumerate(options_normalized):
                                if correct_normalized.lower() in opt.lower() or opt.lower() in correct_normalized.lower():
                                    options[i] = correct_answer
                                    found_match = True
                                    break
                            
                            if not found_match:
                                # No close match, replace the last option
                                options[-1] = correct_answer
                    elif not correct_answer and len(options) == 3:
                        # No correct answer specified, use first option as default
                        correct_answer = options[0]
                    
                    # Get context reference - if empty, extract from context snippets
                    context_ref = q.get("context_reference", "").strip()
                    if not context_ref:
                        # Extract from context snippets - use the most relevant one
                        if context_snippets:
                            # Use the first context snippet, but make it more meaningful
                            snippet = context_snippets[0]
                            # Try to extract a meaningful excerpt (first 2-3 sentences)
                            sentences = snippet.split('. ')
                            if len(sentences) >= 2:
                                context_ref = ". ".join(sentences[:3]) + "."
                            else:
                                context_ref = snippet[:200] + "..." if len(snippet) > 200 else snippet
                            context_ref = f"Based on the context: {context_ref}"
                        else:
                            context_ref = "Based on the provided climate data and context."
                    
                    formatted_question = {
                        "question": question_text,
                        "type": q.get("type", question_type),
                        "difficulty": q.get("difficulty", difficulty),
                        "options": options[:3],  # Ensure exactly 3 options
                        "correct_answer": correct_answer,
                        "context_reference": context_ref
                    }
                    formatted_questions.append(formatted_question)
                    
                    # Print formatted question details
                    print(f"\n  Question {i}:")
                    print(f"    Text: {formatted_question['question']}")
                    print(f"    Options: {formatted_question['options']}")
                    print(f"    Correct Answer: {formatted_question['correct_answer']}")
                    print(f"    Type: {formatted_question['type']}")
                    print(f"    Difficulty: {formatted_question['difficulty']}")
                    print(f"    Context Ref: {formatted_question['context_reference'][:100]}..." if len(formatted_question['context_reference']) > 100 else f"    Context Ref: {formatted_question['context_reference']}")
                    print(f"    ✅ Question {i} formatted successfully")
            
            if not formatted_questions:
                print(f"\n  ⚠️  No valid questions formatted")
                questions = []
            else:
                questions = formatted_questions[:num_questions]
                print(f"\n  ✅ Successfully formatted {len(questions)} questions")
                
        except json.JSONDecodeError as e:
            print(f"\n  ❌ JSON decode error: {e}")
            print(f"  Response text (first 500 chars): {response_text[:500]}")
            questions = []
        
        # Prepare response with detailed information
        response_data = {
            'lesson_id': lesson_id,
            'person_id': person_id,
            'questions': questions,
            'status': 'success',
            'message': f'Generated {len(questions)} questions successfully',
            'context_used': bool(context),
            'context_snippets': context_snippets[:3] if context_snippets else [],  # Limit to 3 for response size
            'parameters_used': {
                'lesson_id': lesson_id,
                'person_id': person_id,
                'num_questions': num_questions,
                'difficulty': difficulty,
                'question_type': question_type,
                'use_rag': use_rag,
                'context_k': context_k,
                'dataset_name': dataset_name
            },
            'statistics': {
                'questions_requested': num_questions,
                'questions_generated': len(questions),
                'context_retrieved': bool(context),
                'context_snippets_count': len(context_snippets) if context_snippets else 0,
                'context_length': len(context) if context else 0
            }
        }
        
        print(f"\n[QUIZ GENERATION] Response Summary:")
        print(f"  Questions requested: {num_questions}")
        print(f"  Questions generated: {len(questions)}")
        print(f"  Context used: {bool(context)}")
        print(f"  Context snippets: {len(context_snippets)}")
        print("="*80 + "\n")
        
        return jsonify(response_data)
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"\n[QUIZ GENERATION] ❌ Error occurred:")
        print(f"  Error: {str(e)}")
        print(f"  Traceback: {error_trace}")
        print("="*80 + "\n")
        return jsonify({
            'status': 'error',
            'message': f'Error generating questions: {str(e)}',
            'parameters_received': {
                'lesson_id': request.json.get('lesson_id', '') if request.method == 'POST' else request.args.get('lesson_id', ''),
                'person_id': request.json.get('person_id', '') if request.method == 'POST' else request.args.get('person_id', ''),
                'num_questions': request.json.get('num_questions', 5) if request.method == 'POST' else request.args.get('num_questions', 5),
                'difficulty': request.json.get('difficulty', 'medium') if request.method == 'POST' else request.args.get('difficulty', 'medium')
            }
        }), 500

@app.route('/quiz-feedback', methods=['POST'])
def quiz_feedback():
    """
    Provide personalized feedback on quiz results
    
    POST request body (JSON):
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
            "0": "Option B",  // question index -> student's answer
            "1": "Option A"
        },
        "score": 7,  // student's score out of total questions
        "total_questions": 10,
        "lesson_id": "temperature" (optional),
        "session_id": "optional-session-id" (optional)
    }
    
    Returns personalized feedback explaining wrong answers and study recommendations
    """
    try:
        data = request.json
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Request body is required'
            }), 400
        
        # Extract quiz data
        quiz = data.get('quiz', {})
        questions = quiz.get('questions', [])
        student_answers = data.get('student_answers', {})
        score = data.get('score', 0)
        total_questions = data.get('total_questions', len(questions))
        lesson_id = data.get('lesson_id', '')
        session_id = data.get('session_id')
        
        # Validate required fields
        if not questions:
            return jsonify({
                'status': 'error',
                'message': 'Quiz questions are required'
            }), 400
        
        if not student_answers:
            return jsonify({
                'status': 'error',
                'message': 'Student answers are required'
            }), 400
        
        if total_questions == 0:
            return jsonify({
                'status': 'error',
                'message': 'Total questions must be greater than 0'
            }), 400
        
        # Check if Groq client is available
        if not eco.client:
            return jsonify({
                'status': 'error',
                'message': 'Groq client not available. Please check your GROQ_API_KEY in .env file.'
            }), 500
        
        # Analyze quiz results
        wrong_answers = []
        correct_count = 0
        
        for idx, question in enumerate(questions):
            question_idx = str(idx)
            student_answer = student_answers.get(question_idx, '').strip()
            correct_answer = question.get('correct_answer', '').strip()
            
            if student_answer.lower() == correct_answer.lower():
                correct_count += 1
            else:
                wrong_answers.append({
                    'question_index': idx,
                    'question': question.get('question', ''),
                    'student_answer': student_answer,
                    'correct_answer': correct_answer,
                    'options': question.get('options', []),
                    'context_reference': question.get('context_reference', '')
                })
        
        # Calculate percentage
        percentage = (score / total_questions * 100) if total_questions > 0 else 0
        
        # Build feedback prompt
        feedback_prompt = f"""You are Eco, a friendly and encouraging AI tutor for climate change education.

A student just completed a quiz with the following results:
- Score: {score} out of {total_questions} ({percentage:.1f}%)
- Correct answers: {correct_count}
- Wrong answers: {len(wrong_answers)}

Please provide personalized, encouraging feedback that:

1. **Overall Performance Assessment** (2-3 sentences):
   - Acknowledge their effort and performance level
   - Be encouraging and supportive, especially if they struggled
   - Celebrate their successes if they did well

2. **Wrong Answer Explanations** (for each wrong answer):
   - Explain why their answer was incorrect
   - Provide the correct answer with a clear explanation
   - Reference the context/material if available
   - Use simple, clear language suitable for students

3. **Study Recommendations** (3-4 specific recommendations):
   - Identify topics/concepts they should focus on based on wrong answers
   - Suggest specific areas to review
   - Provide actionable study advice
   - Be encouraging and supportive

4. **Encouragement** (1-2 sentences):
   - Motivate them to continue learning
   - Remind them that learning is a process

Format your response in a friendly, conversational tone. Be specific about what they got wrong and why.

Wrong answers to explain:
"""
        
        # Add wrong answer details
        for wrong in wrong_answers:
            feedback_prompt += f"""
Question {wrong['question_index'] + 1}: {wrong['question']}
Student's answer: {wrong['student_answer']}
Correct answer: {wrong['correct_answer']}
Available options: {', '.join(wrong['options'])}
"""
            if wrong.get('context_reference'):
                feedback_prompt += f"Context: {wrong['context_reference']}\n"
        
        if lesson_id:
            feedback_prompt += f"\nLesson topic: {lesson_id}\n"
        
        feedback_prompt += "\nNow provide your comprehensive feedback:"
        
        # Generate feedback using Groq
        try:
            messages = [
                {"role": "system", "content": eco.system_prompt},
                {"role": "user", "content": feedback_prompt}
            ]
            
            response = eco.client.chat.completions.create(
                model=eco.model,
                messages=messages,
                max_tokens=1000,  # Longer response for detailed feedback
                temperature=0.7  # Slightly lower for more focused feedback
            )
            
            feedback_text = response.choices[0].message.content.strip()
            
            # Get or create session if provided
            final_session_id = None
            if session_id:
                final_session_id = eco.session_manager.get_or_create_session(session_id)
            
            return jsonify({
                'status': 'success',
                'session_id': final_session_id,
                'feedback': feedback_text,
                'summary': {
                    'score': score,
                    'total_questions': total_questions,
                    'percentage': round(percentage, 1),
                    'correct_count': correct_count,
                    'wrong_count': len(wrong_answers)
                },
                'wrong_answers_count': len(wrong_answers),
                'wrong_answers': wrong_answers
            })
            
        except Exception as api_error:
            import traceback
            traceback.print_exc()
            return jsonify({
                'status': 'error',
                'message': f'Error generating feedback: {str(api_error)}'
            }), 500
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in quiz feedback: {error_trace}")
        return jsonify({
            'status': 'error',
            'message': f'Error processing quiz feedback: {str(e)}'
        }), 500

@app.route('/generate-learning-material', methods=['POST', 'GET'])
def generate_learning_material():
    """
    Generate learning material (lesson content) based on lesson_id and RAG context
    
    POST request body (JSON):
    {
        "lesson_id": "temperature",  # Required (can be empty string to search all)
        "person_id": "student_1",  # Required
        "material_type": "comprehensive",  # Optional: "summary", "detailed", "comprehensive"
        "difficulty": "medium",  # Optional: "easy", "medium", "hard"
        "length": "medium",  # Optional: "short", "medium", "long"
        "use_rag": true,  # Optional, default: true
        "context_k": 5,  # Optional, default: 5
        "dataset_name": null  # Optional: "temperature_by_country", etc.
    }
    
    GET request query parameters:
    - lesson_id (required, can be empty)
    - person_id (required)
    - material_type (optional, default: "comprehensive")
    - difficulty (optional, default: "medium")
    - length (optional, default: "medium")
    - use_rag (optional, default: true)
    - context_k (optional, default: 5)
    - dataset_name (optional)
    """
    try:
        # Get parameters from request
        if request.method == 'POST':
            data = request.json or {}
            lesson_id = data.get('lesson_id', '')
            person_id = data.get('person_id', '')
            dataset_name = data.get('dataset_name')
            material_type = data.get('material_type', 'comprehensive')
            difficulty = data.get('difficulty', 'medium')
            length = data.get('length', 'medium')
            use_rag = data.get('use_rag', True)
            context_k = data.get('context_k', 5)
        else:  # GET
            lesson_id = request.args.get('lesson_id', '')
            person_id = request.args.get('person_id', '')
            dataset_name = request.args.get('dataset_name')
            material_type = request.args.get('material_type', 'comprehensive')
            difficulty = request.args.get('difficulty', 'medium')
            length = request.args.get('length', 'medium')
            use_rag = request.args.get('use_rag', 'true').lower() == 'true'
            context_k = int(request.args.get('context_k', 5))
        
        # Validate required parameters
        if person_id is None or person_id == '':
            return jsonify({
                'status': 'error',
                'message': 'person_id is required (can be any string like "student_1")'
            }), 400
        
        # lesson_id can be empty string - it will search all datasets
        if lesson_id is None:
            lesson_id = ""
        
        # Log received parameters
        print("\n" + "="*80)
        print("[LEARNING MATERIAL GENERATION] Received Request:")
        print("="*80)
        print(f"  Method: {request.method}")
        print(f"  lesson_id: '{lesson_id}'")
        print(f"  person_id: '{person_id}'")
        print(f"  material_type: {material_type}")
        print(f"  difficulty: {difficulty}")
        print(f"  length: {length}")
        print(f"  use_rag: {use_rag}")
        print(f"  context_k: {context_k}")
        print(f"  dataset_name: {dataset_name}")
        print("="*80 + "\n")
        
        # Check if Groq client is available
        if not eco.client:
            return jsonify({
                'status': 'error',
                'message': 'Groq client not available. Please check your GROQ_API_KEY in .env file.'
            }), 500
        
        # Retrieve relevant context using RAG
        context = ""
        context_snippets = []
        context_metadata = []
        if use_rag and eco.rag_system:
            try:
                print(f"[LEARNING MATERIAL GENERATION] Retrieving RAG context...")
                print(f"  Query: lesson_id='{lesson_id}', dataset_name={dataset_name}, k={context_k}")
                
                # Get context for this lesson and person, filtered by dataset_name
                context = eco.rag_system.get_context_for_lesson(
                    lesson_id=lesson_id,
                    person_id=person_id,
                    query=f"Generate learning material about {lesson_id} for {person_id}",
                    k=context_k,
                    dataset_name=dataset_name
                )
                
                # If no context with filters, try without person_id filter
                if not context:
                    print(f"  No context with person_id filter, trying without person_id...")
                    context = eco.rag_system.get_context_for_lesson(
                        lesson_id=lesson_id,
                        person_id=None,
                        query=f"Generate learning material about {lesson_id}",
                        k=context_k,
                        dataset_name=dataset_name
                    )
                
                # If still no context, try without any filters (fallback)
                if not context:
                    print(f"  No context with lesson_id filter, trying general search...")
                    query_text = lesson_id if lesson_id else "climate change temperature"
                    results = eco.rag_system.retrieve(
                        query=query_text,
                        k=context_k,
                        dataset_name=dataset_name
                    )
                    if results:
                        context = "\n\n".join([doc for doc, _, _ in results])
                        context_metadata = [meta for _, meta, _ in results]
                
                if context:
                    print(f"  ✅ Retrieved context: {len(context)} characters")
                    # Get snippets for response - store full context for reference
                    query_text = lesson_id if lesson_id else "climate change"
                    results = eco.rag_system.retrieve(
                        query=query_text,
                        k=min(context_k, 5),  # Get more for better context reference
                        lesson_id=lesson_id if lesson_id else None,
                        person_id=None,
                        dataset_name=dataset_name
                    )
                    if not results:
                        results = eco.rag_system.retrieve(
                            query=query_text,
                            k=min(context_k, 5),
                            dataset_name=dataset_name
                        )
                    # Store full documents for context reference, not just snippets
                    context_snippets = [doc for doc, meta, _ in results] if results else []
                    context_metadata = [meta for _, meta, _ in results] if results else context_metadata
                    print(f"  ✅ Retrieved {len(context_snippets)} context snippets")
                else:
                    print(f"  ⚠️  No context found - will generate learning material without specific context")
            except Exception as e:
                print(f"  ❌ Warning: Error retrieving RAG context: {e}")
                import traceback
                traceback.print_exc()
                context = ""
        
        # Determine material length tokens - adjusted for 3 pages
        length_tokens = {
            'short': 1500,   # ~500 tokens per page x 3 pages
            'medium': 3000,  # ~1000 tokens per page x 3 pages
            'long': 6000     # ~2000 tokens per page x 3 pages
        }
        max_tokens = length_tokens.get(length.lower(), 3000)
        
        # Build the prompt
        print(f"\n[LEARNING MATERIAL GENERATION] Building prompt...")
        print(f"  Context available: {bool(context)}")
        print(f"  Context length: {len(context)} characters" if context else "  No context")
        print(f"  Material type: {material_type}")
        print(f"  Difficulty: {difficulty}")
        print(f"  Length: {length} (~{max_tokens} tokens)")
        
        if context:
            context_parts_list = context.split("\n\n")
            print(f"  Context parts: {len(context_parts_list)}")
            
            # Build material type instructions
            material_instructions = {
                'summary': 'Create a concise summary that covers the key points and main concepts.',
                'detailed': 'Create a detailed explanation with in-depth analysis, examples, and comprehensive coverage of the topic.',
                'comprehensive': 'Create a comprehensive lesson that includes an introduction, main content, key concepts, examples, and a conclusion.'
            }
            type_instruction = material_instructions.get(material_type.lower(), material_instructions['comprehensive'])
            
            # Build difficulty instructions
            difficulty_instructions = {
                'easy': 'Use simple language, avoid complex terminology, explain concepts clearly, and use everyday examples.',
                'medium': 'Use clear language with some technical terms (explained when first used), provide examples, and explain concepts in detail.',
                'hard': 'Use advanced terminology, provide detailed analysis, include complex concepts, and assume the reader has some background knowledge.'
            }
            difficulty_instruction = difficulty_instructions.get(difficulty.lower(), difficulty_instructions['medium'])
            
            prompt = f"""Generate {difficulty} level learning material for lesson ID: {lesson_id} and person ID: {person_id}.

Material Type: {material_type}
{type_instruction}

Difficulty Level: {difficulty}
{difficulty_instruction}

Length: {length} (approximately {max_tokens} tokens total for 3 pages)

RELEVANT CONTEXT FROM DATA:
{context}

INSTRUCTIONS:
1. Create educational learning material based on the context provided above
2. Divide the content into exactly 3 pages
3. Each page should be wrapped in <page> </page> tags
4. Structure the content clearly with appropriate headings and sections
5. Include specific facts, numbers, dates, and data from the context when relevant
6. Make the content engaging and educational
7. Use the difficulty level to adjust the complexity of language and concepts
8. Distribute content evenly across the 3 pages
9. Each page should be approximately {max_tokens // 3} tokens
10. Include key takeaways or important points
11. Reference specific data from the context (temperatures, dates, locations, etc.)

Format the response as a JSON object with the following structure:
{{
  "title": "A clear, descriptive title for the learning material",
  "introduction": "An engaging introduction that sets the context (2-3 sentences)",
  "pages": [
    "<page>Content for page 1. Include headings, paragraphs, facts, and data from context. Make it comprehensive and educational. DO NOT use markdown formatting like #, **, or markdown syntax. Use plain text only.</page>",
    "<page>Content for page 2. Continue the lesson with more details, examples, and specific data from context. Maintain the same educational style. Use plain text only, no markdown.</page>",
    "<page>Content for page 3. Conclude the lesson with final concepts, key takeaways, and a summary. Include important facts and data. Use plain text only, no markdown formatting.</page>"
  ],
  "key_points": ["Key point 1", "Key point 2", "Key point 3"],
  "conclusion": "A brief conclusion that summarizes the main points (2-3 sentences)",
  "sources": ["Reference 1 from context", "Reference 2 from context"]
}}

CRITICAL REQUIREMENTS:
- Generate exactly 3 pages
- Each page MUST be wrapped in <page> </page> tags
- Use actual data from the context (temperatures, dates, locations, trends)
- Make it educational and easy to understand for the {difficulty} level
- Distribute content evenly across all 3 pages
- Each page should be substantial and informative (approximately {max_tokens // 3} tokens each)
- Include specific numbers, dates, and facts from the context in each page
- Structure each page with clear sections and paragraphs
- Make it engaging and informative
- Page 1 should introduce the topic
- Page 2 should provide detailed content and examples
- Page 3 should conclude with key takeaways and summary
- CRITICAL: DO NOT use markdown formatting (#, ##, **, __, etc.) in the page content
- Use plain text only - no markdown headers, bold, italic, or other formatting
- This content will be used for text-to-speech, so avoid special characters that break TTS

Return only valid JSON, no additional text or markdown formatting."""
        else:
            # Fallback to basic prompt if no context
            prompt = f"""Generate {difficulty} level learning material for lesson ID: {lesson_id} and person ID: {person_id}.

Material Type: {material_type}
Difficulty Level: {difficulty}
Length: {length} (approximately {max_tokens} tokens total for 3 pages)

Please generate educational learning material that:
1. Is relevant to the lesson topic: {lesson_id if lesson_id else 'climate change'}
2. Is appropriate for the difficulty level: {difficulty}
3. Is educational and informative
4. Is divided into exactly 3 pages
5. Each page is wrapped in <page> </page> tags
6. Is structured clearly with headings and sections
7. Includes key concepts and explanations
8. Distributes content evenly across 3 pages
9. Each page is approximately {max_tokens // 3} tokens

Format the response as a JSON object with the following structure:
{{
  "title": "A clear, descriptive title",
  "introduction": "An engaging introduction (2-3 sentences)",
  "pages": [
    "<page>Content for page 1. Introduce the topic with clear paragraphs. Make it comprehensive. Use plain text only, no markdown formatting.</page>",
    "<page>Content for page 2. Continue with detailed explanations, examples, and key concepts. Maintain educational style. Use plain text only.</page>",
    "<page>Content for page 3. Conclude with key takeaways, summary, and important points. Wrap up the lesson. Use plain text only, no markdown.</page>"
  ],
  "key_points": ["Key point 1", "Key point 2", "Key point 3"],
  "conclusion": "A brief conclusion (2-3 sentences)",
  "sources": []
}}

CRITICAL REQUIREMENTS:
- Generate exactly 3 pages
- Each page MUST be wrapped in <page> </page> tags
- Distribute content evenly across all 3 pages
- Each page should be substantial (approximately {max_tokens // 3} tokens each)
- Page 1: Introduction and initial concepts
- Page 2: Detailed content and examples
- Page 3: Conclusion and key takeaways
- DO NOT use markdown formatting (#, ##, **, __, etc.) - use plain text only
- This content will be used for text-to-speech, so avoid special characters

Return only valid JSON, no additional text or markdown formatting."""
        
        # Call Groq API
        print(f"\n[LEARNING MATERIAL GENERATION] Calling Groq API...")
        print(f"  Model: {eco.model}")
        print(f"  Temperature: 0.7")
        print(f"  Max tokens: {max_tokens}")
        print(f"  Prompt length: {len(prompt)} characters")
        
        try:
            import time
            start_time = time.time()
            
            completion = eco.client.chat.completions.create(
                model=eco.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert educational content creator. Generate high-quality, engaging learning material for educational purposes. Always return valid JSON format with the requested structure."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.7,
                max_tokens=max_tokens,
                response_format={"type": "json_object"}  # Always use JSON object format
            )
            
            elapsed_time = time.time() - start_time
            response_text = completion.choices[0].message.content
            print(f"  ✅ API response received in {elapsed_time:.2f}s")
            print(f"  Response length: {len(response_text)} characters")
        except Exception as groq_error:
            error_msg = str(groq_error)
            print(f"  ❌ Groq API error: {error_msg}")
            return jsonify({
                'status': 'error',
                'message': f'Groq API error: {error_msg}',
                'lesson_id': lesson_id,
                'person_id': person_id
            }), 503
        
        # Parse the response
        learning_material = None
        try:
            cleaned_response = response_text.strip()
            cleaned_response = re.sub(r'```json\s*', '', cleaned_response)
            cleaned_response = re.sub(r'```\s*', '', cleaned_response)
            cleaned_response = cleaned_response.strip()
            
            data = json.loads(cleaned_response)
            learning_material = data
            
            print(f"\n[LEARNING MATERIAL GENERATION] Processing response...")
            if learning_material:
                print(f"  ✅ Learning material parsed successfully")
                print(f"    Title: {learning_material.get('title', 'N/A')[:50]}...")
                pages = learning_material.get('pages', [])
                
                # Process pages and create content for backward compatibility
                if pages and len(pages) > 0:
                    print(f"    Pages: {len(pages)}")
                    # Extract content from pages (remove <page> tags)
                    page_contents = []
                    for i, page in enumerate(pages, 1):
                        # Remove <page> and </page> tags, handle both string and already processed content
                        page_str = str(page)
                        page_content = re.sub(r'</?page>', '', page_str).strip()
                        if page_content:  # Only add non-empty pages
                            page_contents.append(page_content)
                        print(f"      Page {i} length: {len(page_content)} characters")
                    
                    # Combine all pages into a single content string for backward compatibility
                    # Join pages with double newlines for separation
                    combined_content = "\n\n".join(page_contents) if page_contents else ""
                    # Clean content for TTS - remove markdown and special characters that break TTS
                    combined_content = _clean_text_for_tts(combined_content)
                    learning_material['content'] = combined_content
                    
                    # Clean individual pages for TTS and ensure they have <page> tags
                    cleaned_pages = []
                    for p in page_contents:
                        cleaned_page = _clean_text_for_tts(p)
                        if cleaned_page:  # Only add non-empty pages
                            cleaned_pages.append(f"<page>{cleaned_page}</page>")
                    learning_material['pages'] = cleaned_pages
                else:
                    # Fallback for old format with 'content' field
                    content = learning_material.get('content', '')
                    if not content:
                        # If neither pages nor content exist, try to get from other fields
                        content = learning_material.get('introduction', '') + "\n\n" + learning_material.get('conclusion', '')
                        content = content.strip()
                    
                    if content:
                        print(f"    Content length: {len(content)} characters")
                        # Clean content for TTS
                        content = _clean_text_for_tts(content)
                        # Ensure content field exists
                        learning_material['content'] = content
                        # Convert single content to pages array for consistency
                        learning_material['pages'] = [f"<page>{content}</page>"]
                    else:
                        # Last resort: create empty content to prevent undefined errors
                        learning_material['content'] = ""
                        learning_material['pages'] = []
                        print(f"    ⚠️  Warning: No content or pages found in response")
                
                # Ensure content field always exists (even if empty) to prevent frontend errors
                if 'content' not in learning_material or learning_material.get('content') is None:
                    learning_material['content'] = ""
                
                print(f"    Key points: {len(learning_material.get('key_points', []))}")
            else:
                print(f"  ⚠️  No learning material in response")
                # Create empty structure to prevent frontend errors
                learning_material = {
                    "title": f"Learning Material: {lesson_id}",
                    "introduction": "",
                    "pages": [],
                    "content": "",
                    "key_points": [],
                    "conclusion": "",
                    "sources": []
                }
                
        except json.JSONDecodeError as e:
            print(f"\n  ❌ JSON decode error: {e}")
            print(f"  Response text (first 500 chars): {response_text[:500]}")
            # Try to return as plain text if JSON parsing fails
            learning_material = {
                "title": f"Learning Material: {lesson_id}",
                "introduction": "Generated learning material",
                "pages": [
                    f"<page>{response_text}</page>"
                ],
                "content": response_text,  # Add content for backward compatibility
                "key_points": [],
                "conclusion": "",
                "sources": []
            }
        
        # Final safety check: ensure learning_material has all required fields
        if not learning_material:
            learning_material = {
                "title": f"Learning Material: {lesson_id}",
                "introduction": "",
                "pages": [],
                "content": "",
                "key_points": [],
                "conclusion": "",
                "sources": []
            }
        
        # Ensure content field always exists and is a string (never undefined/null)
        if 'content' not in learning_material or learning_material.get('content') is None:
            learning_material['content'] = ""
        
        # Ensure pages field always exists and is a list
        if 'pages' not in learning_material or learning_material.get('pages') is None:
            learning_material['pages'] = []
        
        # Ensure content is always a string (never array, object, or None)
        if isinstance(learning_material.get('content'), list):
            learning_material['content'] = "\n\n".join([str(item) for item in learning_material['content']])
        elif not isinstance(learning_material.get('content'), str):
            learning_material['content'] = str(learning_material.get('content', ''))
        
        # If we have content but no pages (or empty pages), create pages from content
        if learning_material.get('content') and (not learning_material.get('pages') or len(learning_material.get('pages', [])) == 0):
            content_str = str(learning_material['content'])
            if content_str.strip():
                learning_material['pages'] = [f"<page>{content_str}</page>"]
            else:
                learning_material['pages'] = []
        
        # If we have pages but no content (or empty content), create content from pages
        if learning_material.get('pages') and len(learning_material.get('pages', [])) > 0:
            if not learning_material.get('content') or not str(learning_material.get('content', '')).strip():
                page_contents = []
                for p in learning_material['pages']:
                    page_str = str(p)
                    page_content = re.sub(r'</?page>', '', page_str).strip()
                    if page_content:
                        page_contents.append(page_content)
                if page_contents:
                    combined = "\n\n".join(page_contents)
                    learning_material['content'] = _clean_text_for_tts(combined)
                else:
                    learning_material['content'] = ""
        
        # Prepare response with detailed information
        response_data = {
            'lesson_id': lesson_id,
            'person_id': person_id,
            'learning_material': learning_material,
            'status': 'success',
            'message': f'Generated learning material successfully',
            'context_used': bool(context),
            'context_snippets': context_snippets[:3] if context_snippets else [],  # Limit to 3 for response size
            'parameters_used': {
                'lesson_id': lesson_id,
                'person_id': person_id,
                'material_type': material_type,
                'difficulty': difficulty,
                'length': length,
                'use_rag': use_rag,
                'context_k': context_k,
                'dataset_name': dataset_name
            },
            'statistics': {
                'context_retrieved': bool(context),
                'context_snippets_count': len(context_snippets) if context_snippets else 0,
                'context_length': len(context) if context else 0,
                'pages_count': len(learning_material.get('pages', [])) if learning_material else 0,
                'material_length': sum([len(p.replace('<page>', '').replace('</page>', '')) for p in learning_material.get('pages', [])]) if learning_material and learning_material.get('pages') else (len(learning_material.get('content', '')) if learning_material else 0),
                'key_points_count': len(learning_material.get('key_points', [])) if learning_material else 0
            }
        }
        
        print(f"\n[LEARNING MATERIAL GENERATION] Response Summary:")
        print(f"  Context used: {bool(context)}")
        print(f"  Context snippets: {len(context_snippets)}")
        pages = learning_material.get('pages', []) if learning_material else []
        if pages:
            total_length = sum([len(p.replace('<page>', '').replace('</page>', '')) for p in pages])
            print(f"  Pages generated: {len(pages)}")
            print(f"  Total material length: {total_length} characters")
        else:
            content_length = len(learning_material.get('content', '')) if learning_material else 0
            print(f"  Material length: {content_length} characters")
        print(f"  Key points: {len(learning_material.get('key_points', [])) if learning_material else 0}")
        print("="*80 + "\n")
        
        return jsonify(response_data)
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"\n[LEARNING MATERIAL GENERATION] ❌ Error occurred:")
        print(f"  Error: {str(e)}")
        print(f"  Traceback: {error_trace}")
        print("="*80 + "\n")
        return jsonify({
            'status': 'error',
            'message': f'Error generating learning material: {str(e)}',
            'parameters_received': {
                'lesson_id': request.json.get('lesson_id', '') if request.method == 'POST' else request.args.get('lesson_id', ''),
                'person_id': request.json.get('person_id', '') if request.method == 'POST' else request.args.get('person_id', ''),
                'material_type': request.json.get('material_type', 'comprehensive') if request.method == 'POST' else request.args.get('material_type', 'comprehensive'),
                'difficulty': request.json.get('difficulty', 'medium') if request.method == 'POST' else request.args.get('difficulty', 'medium')
            }
        }), 500

def _clean_text_for_tts(text):
    """
    Clean text to remove characters that break TTS engines
    Removes markdown formatting, special characters, etc.
    """
    if not text or not isinstance(text, str):
        return ""
    
    # Remove markdown headers (# ## ### #### ##### ######)
    text = re.sub(r'^#+\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^#+\s*$', '', text, flags=re.MULTILINE)
    
    # Remove markdown bold/italic (**text**, *text*, __text__, _text_)
    text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # Bold
    text = re.sub(r'\*([^*]+)\*', r'\1', text)  # Italic (but be careful with * in text)
    text = re.sub(r'__([^_]+)__', r'\1', text)  # Bold underscore
    text = re.sub(r'_([^_]+)_', r'\1', text)  # Italic underscore (but be careful with _ in text)
    
    # Remove markdown links [text](url) -> text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    
    # Remove markdown code blocks ```code``` -> code
    text = re.sub(r'```[^`]*```', '', text, flags=re.DOTALL)
    text = re.sub(r'`([^`]+)`', r'\1', text)  # Inline code
    
    # Remove HTML tags (but preserve content)
    text = re.sub(r'<[^>]+>', '', text)
    
    # Remove special markdown characters that might break TTS
    text = text.replace('---', ' - ')
    text = text.replace('--', ' - ')
    text = text.replace('***', '')
    text = text.replace('**', '')
    text = text.replace('##', '')
    text = text.replace('#', '')
    
    # Remove other problematic characters for TTS
    text = text.replace('&nbsp;', ' ')
    text = text.replace('&amp;', 'and')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    
    # Remove markdown list markers (-, *, +, numbers)
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    
    # Remove markdown blockquotes (>)
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    
    # Remove markdown horizontal rules (---, ***, ___)
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    
    # Clean up multiple spaces
    text = re.sub(r' +', ' ', text)
    
    # Clean up multiple newlines (keep max 2)
    text = re.sub(r'\n{3,}', '\n\n', text)
    
    # Remove leading/trailing whitespace from each line
    lines = [line.strip() for line in text.split('\n')]
    text = '\n'.join(lines)
    
    # Final cleanup - remove any remaining problematic characters
    text = text.strip()
    
    return text

def _get_voice_by_gender(client, gender):
    """Get a voice ID based on gender preference"""
    try:
        voices_response = client.voices.get_all()
        voices_list = voices_response.voices
        
        # Common male and female voice name patterns
        male_patterns = ['clyde', 'roger', 'charlie', 'paul', 'adam', 'callum', 'harry', 'daniel', 'george', 'thomas', 'fin', 'brian', 'james', 'josh', 'arnold']
        female_patterns = ['rachel', 'sarah', 'laura', 'emily', 'anna', 'lily', 'dorothy', 'bella', 'elli', 'grace', 'matilda']
        
        gender_lower = gender.lower() if gender else ''
        
        if gender_lower in ['male', 'm', 'man']:
            # Find first male voice
            for voice in voices_list:
                if voice.name.lower() in male_patterns:
                    return voice.voice_id
            # Fallback to default male voice
            return DEFAULT_MALE_VOICE_ID
        elif gender_lower in ['female', 'f', 'woman']:
            # Find first female voice
            for voice in voices_list:
                if voice.name.lower() in female_patterns:
                    return voice.voice_id
            # Fallback to default female voice
            return DEFAULT_FEMALE_VOICE_ID
        else:
            # Default to first available voice or default female
            if voices_list:
                return voices_list[0].voice_id
            return DEFAULT_FEMALE_VOICE_ID
    except Exception:
        # Fallback to defaults
        if gender and gender.lower() in ['male', 'm', 'man']:
            return DEFAULT_MALE_VOICE_ID
        return DEFAULT_FEMALE_VOICE_ID

@app.route('/tts', methods=['POST', 'GET'])
def text_to_speech():
    """
    Convert text to speech using Eleven Labs TTS
    
    POST/GET Parameters:
    - text (required): The text to convert to speech
    - voice_id (optional): The voice ID to use (overrides gender selection)
    - gender (optional): Select voice by gender - "male" or "female" (default: "female")
    - model_id (optional): The model ID to use (default: "eleven_flash_v2_5")
    - stability (optional): Stability setting (0.0-1.0, default: 0.5)
    - similarity_boost (optional): Similarity boost (0.0-1.0, default: 0.75)
    
    Returns:
    - Audio file (MP3) if successful
    - JSON error response if failed
    """
    try:
        # Get parameters
        if request.method == 'POST':
            data = request.json or request.form or {}
            text = data.get('text', '')
            voice_id = data.get('voice_id')
            gender = data.get('gender', 'female')  # Default to female
            model_id = data.get('model_id', 'eleven_flash_v2_5')  # Updated to Flash v2.5
            stability = float(data.get('stability', 0.5))
            similarity_boost = float(data.get('similarity_boost', 0.75))
        else:  # GET
            text = request.args.get('text', '')
            voice_id = request.args.get('voice_id')
            gender = request.args.get('gender', 'female')  # Default to female
            model_id = request.args.get('model_id', 'eleven_flash_v2_5')  # Updated to Flash v2.5
            stability = float(request.args.get('stability', 0.5))
            similarity_boost = float(request.args.get('similarity_boost', 0.75))
        
        # Validate text
        if not text:
            return jsonify({
                'status': 'error',
                'message': 'Text parameter is required'
            }), 400
        
        # Clean text for TTS - remove characters that break TTS engines
        text = _clean_text_for_tts(text)
        
        if not text.strip():
            return jsonify({
                'status': 'error',
                'message': 'Text is empty after cleaning for TTS'
            }), 400
        
        # Check if Eleven Labs is available
        if not ELEVENLABS_AVAILABLE:
            return jsonify({
                'status': 'error',
                'message': 'Eleven Labs TTS is not available. Please install: pip install elevenlabs'
            }), 503
        
        # Get API key
        api_key = os.getenv('ELEVENLABS_API_KEY')
        if not api_key:
            return jsonify({
                'status': 'error',
                'message': 'Eleven Labs API key not found in environment variables'
            }), 500
        
        # Initialize Eleven Labs client
        client = ElevenLabs(api_key=api_key)
        
        # Select voice based on gender if voice_id not provided
        if not voice_id:
            voice_id = _get_voice_by_gender(client, gender)
            print(f"[TTS] Selected voice by gender '{gender}': {voice_id}")
        
        # Validate parameters
        stability = max(0.0, min(1.0, stability))
        similarity_boost = max(0.0, min(1.0, similarity_boost))
        
        # Generate audio
        print(f"\n[TTS] Generating speech...")
        print(f"  Text: {text[:100]}...")
        print(f"  Voice ID: {voice_id}")
        print(f"  Gender: {gender}")
        print(f"  Model: {model_id}")
        print(f"  Stability: {stability}, Similarity Boost: {similarity_boost}")
        try:
            # Use the client's text_to_speech method
            audio_generator = client.text_to_speech.convert(
                voice_id=voice_id,
                text=text,
                model_id=model_id,
                voice_settings={
                    "stability": stability,
                    "similarity_boost": similarity_boost
                }
            )
            
            # Collect audio chunks
            audio_data = b''.join(audio_generator)
            print(f"  ✅ Generated audio: {len(audio_data) / 1024:.2f} KB")
            
        except Exception as gen_error:
            # If conversion fails, try with default settings
            print(f"  ⚠️  First attempt failed: {gen_error}, trying with defaults...")
            try:
                audio_generator = client.text_to_speech.convert(
                    voice_id=voice_id,
                    text=text
                )
                audio_data = b''.join(audio_generator)
                print(f"  ✅ Generated audio with defaults: {len(audio_data) / 1024:.2f} KB")
            except Exception as e2:
                print(f"  ❌ Failed to generate audio: {e2}")
                return jsonify({
                    'status': 'error',
                    'message': f'Failed to generate audio: {str(e2)}'
                }), 500
        
        if not audio_data:
            return jsonify({
                'status': 'error',
                'message': 'Failed to generate audio data'
            }), 500
        
        # Return audio file
        return Response(
            audio_data,
            mimetype='audio/mpeg',
            headers={
                'Content-Disposition': 'attachment; filename=speech.mp3',
                'Content-Type': 'audio/mpeg',
                'Content-Length': str(len(audio_data))
            }
        )
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TTS] Error: {error_trace}")
        return jsonify({
            'status': 'error',
            'message': f'Error generating speech: {str(e)}'
        }), 500

@app.route('/tts/voices', methods=['GET'])
def list_voices():
    """
    List available Eleven Labs voices
    
    Returns:
    - JSON list of available voices
    """
    try:
        if not ELEVENLABS_AVAILABLE:
            return jsonify({
                'status': 'error',
                'message': 'Eleven Labs TTS is not available'
            }), 503
        
        api_key = os.getenv('ELEVENLABS_API_KEY')
        if not api_key:
            return jsonify({
                'status': 'error',
                'message': 'Eleven Labs API key not found'
            }), 500
        
        # Initialize Eleven Labs client
        client = ElevenLabs(api_key=api_key)
        
        # Get voices
        voices_response = client.voices.get_all()
        voices_list = voices_response.voices
        
        # Categorize voices by gender
        male_patterns = ['clyde', 'roger', 'charlie', 'paul', 'adam', 'callum', 'harry', 'daniel', 'george', 'thomas', 'fin', 'brian', 'james', 'josh', 'arnold']
        female_patterns = ['rachel', 'sarah', 'laura', 'emily', 'anna', 'lily', 'dorothy', 'bella', 'elli', 'grace', 'matilda']
        
        # Format voices data with gender categorization
        voices_data = []
        male_voices = []
        female_voices = []
        other_voices = []
        
        for voice in voices_list:
            voice_name_lower = voice.name.lower()
            voice_info = {
                'voice_id': voice.voice_id,
                'name': voice.name,
                'category': getattr(voice, 'category', ''),
                'description': getattr(voice, 'description', ''),
                'preview_url': getattr(voice, 'preview_url', ''),
                'gender': 'unknown'
            }
            
            # Categorize by name pattern
            if voice_name_lower in male_patterns:
                voice_info['gender'] = 'male'
                male_voices.append(voice_info)
            elif voice_name_lower in female_patterns:
                voice_info['gender'] = 'female'
                female_voices.append(voice_info)
            else:
                other_voices.append(voice_info)
            
            voices_data.append(voice_info)
        
        return jsonify({
            'status': 'success',
            'voices': voices_data,
            'voices_by_gender': {
                'male': male_voices,
                'female': female_voices,
                'other': other_voices
            },
            'summary': {
                'total': len(voices_data),
                'male': len(male_voices),
                'female': len(female_voices),
                'other': len(other_voices)
            }
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[TTS] Error listing voices: {error_trace}")
        return jsonify({
            'status': 'error',
            'message': f'Error listing voices: {str(e)}'
        }), 500

# ============================================================================
# TEMPERATURE VISUALIZATION ENDPOINTS
# ============================================================================

# Cache for temperature data to avoid reloading on every request
_temperature_data_cache = None
_temperature_data_loaded = False
_fao_temperature_change_cache = None
_fao_temperature_change_loaded = False

def _load_temperature_data():
    """Load and cache absolute temperature data from CSV file"""
    global _temperature_data_cache, _temperature_data_loaded
    
    if _temperature_data_loaded and _temperature_data_cache is not None:
        return _temperature_data_cache
    
    try:
        dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
        csv_path = os.path.join(dataset_dir, 'GlobalLandTemperaturesByCountry.csv')
        
        if not os.path.exists(csv_path):
            print(f"[ERROR] Temperature dataset not found: {csv_path}")
            return None
        
        print(f"[INFO] Loading absolute temperature data from {csv_path}...")
        df = pd.read_csv(csv_path)
        
        # Convert date column to datetime
        df['dt'] = pd.to_datetime(df['dt'], errors='coerce')
        
        # Remove rows with missing dates or temperatures
        df = df.dropna(subset=['dt', 'AverageTemperature'])
        
        # Extract year from date
        df['Year'] = df['dt'].dt.year
        
        # Sort by country and year
        df = df.sort_values(['Country', 'Year'])
        
        # Add data type indicator
        df['DataType'] = 'absolute'
        
        _temperature_data_cache = df
        _temperature_data_loaded = True
        
        print(f"[INFO] Loaded {len(df):,} absolute temperature records for {df['Country'].nunique()} countries")
        print(f"[INFO] Date range: {df['Year'].min()} to {df['Year'].max()}")
        
        return df
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Failed to load temperature data: {error_trace}")
        return None

def _load_fao_temperature_change_data():
    """Load and cache FAO temperature change data from processed CSV file"""
    global _fao_temperature_change_cache, _fao_temperature_change_loaded
    
    if _fao_temperature_change_loaded and _fao_temperature_change_cache is not None:
        return _fao_temperature_change_cache
    
    try:
        dataset_dir = os.path.join(os.path.dirname(__file__), 'dataset')
        fao_csv_path = os.path.join(dataset_dir, 'FAO_TemperatureChange_Processed.csv')
        
        if not os.path.exists(fao_csv_path):
            print(f"[WARNING] FAO temperature change dataset not found: {fao_csv_path}")
            print(f"[INFO] Run process_fao_temperature_data.py to create processed data")
            return None
        
        print(f"[INFO] Loading FAO temperature change data from {fao_csv_path}...")
        df_fao = pd.read_csv(fao_csv_path)
        
        # Rename TemperatureChange to AverageTemperature for consistency
        df_fao = df_fao.rename(columns={'TemperatureChange': 'AverageTemperature'})
        
        # Add data type indicator
        df_fao['DataType'] = 'change'
        
        # Map country names for consistency
        # "United States of America" -> "United States"
        df_fao['Country'] = df_fao['Country'].replace({
            'United States of America': 'United States'
        })
        
        # Sort by country and year
        df_fao = df_fao.sort_values(['Country', 'Year'])
        
        _fao_temperature_change_cache = df_fao
        _fao_temperature_change_loaded = True
        
        print(f"[INFO] Loaded {len(df_fao):,} temperature change records for {df_fao['Country'].nunique()} countries")
        print(f"[INFO] Date range: {df_fao['Year'].min()} to {df_fao['Year'].max()}")
        
        return df_fao
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Failed to load FAO temperature change data: {error_trace}")
        return None

def _find_country_in_dataset(country_name, country_set):
    """Find country in dataset using fuzzy matching"""
    country_lower = country_name.lower().strip()
    
    # Exact match (case-insensitive)
    for c in country_set:
        if c.lower().strip() == country_lower:
            return c
    
    # Partial match (country name contains or is contained in dataset name)
    for c in country_set:
        c_lower = c.lower().strip()
        if country_lower in c_lower or c_lower in country_lower:
            return c
    
    return None

def _get_country_mapping(country_name, df_absolute=None, df_change=None):
    """Get country mapping for better matching - only for special cases"""
    country_lower = country_name.lower().strip()
    
    # Special case mappings (only when dataset-specific mapping is needed)
    # Most countries will be matched by fuzzy matching, this is only for exceptions
    
    # For original dataset: "South Africa" should map to "Africa"
    if df_absolute is not None and country_lower == 'south africa':
        country_set = set(df_absolute['Country'].unique())
        # Check if "Africa" exists in original dataset
        if 'Africa' in country_set:
            return 'Africa'
    
    # For FAO dataset: "South Africa" maps to "South Africa" (fuzzy matching will handle this)
    # For original dataset: "South Africa" -> "Africa" (handled above)
    
    # US variations (should work with fuzzy matching, but keep for reliability)
    us_mappings = {
        'united states': 'United States',
        'usa': 'United States',
        'us': 'United States',
        'united states of america': 'United States',
    }
    
    if country_lower in us_mappings:
        # Check if United States exists in the dataset
        target_country = us_mappings[country_lower]
        if df_change is not None:
            if target_country in set(df_change['Country'].unique()):
                return target_country
        if df_absolute is not None:
            if target_country in set(df_absolute['Country'].unique()):
                return target_country
    
    return None

def _get_combined_countries():
    """Get combined list of countries from both datasets"""
    countries_absolute = set()
    countries_change = set()
    
    df_absolute = _load_temperature_data()
    if df_absolute is not None:
        countries_absolute = set(df_absolute['Country'].unique())
    
    df_change = _load_fao_temperature_change_data()
    if df_change is not None:
        countries_change = set(df_change['Country'].unique())
    
    # Combine and sort
    all_countries = sorted(list(countries_absolute.union(countries_change)))
    
    return all_countries, countries_absolute, countries_change

@app.route('/visualization/countries', methods=['GET', 'OPTIONS'])
def get_available_countries():
    """Get list of all available countries with temperature data
    
    Query parameters:
    - search (optional): Filter countries by name (case-insensitive partial match)
    - limit (optional): Maximum number of countries to return (default: all)
    - include_sources (optional): Include data source information for each country
    
    Returns:
    - success: Boolean indicating if the request was successful
    - countries: List of country names
    - count: Number of countries returned
    - total_count: Total number of countries available
    - error: Error message if success is False
    """
    # Handle OPTIONS request for CORS preflight
    if request.method == 'OPTIONS':
        response = jsonify({})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        return response
    
    try:
        # Get query parameters
        search_query = request.args.get('search', '').strip().lower()
        limit = request.args.get('limit', type=int)
        include_sources = request.args.get('include_sources', 'false').lower() == 'true'
        
        # Get combined countries from both datasets
        print(f"[VISUALIZATION] Loading countries...")
        all_countries, countries_absolute, countries_change = _get_combined_countries()
        print(f"[VISUALIZATION] Loaded {len(all_countries)} countries")
        
        if len(all_countries) == 0:
            print("[WARNING] No countries found in datasets")
            return jsonify({
                'success': False,
                'error': 'Temperature data not available. Please ensure datasets are loaded.',
                'countries': [],
                'count': 0,
                'total_count': 0
            }), 500
        
        # Filter countries by search query if provided
        filtered_countries = all_countries
        if search_query:
            filtered_countries = [
                country for country in all_countries
                if search_query in country.lower()
            ]
            print(f"[VISUALIZATION] Filtered to {len(filtered_countries)} countries matching '{search_query}'")
        
        # Apply limit if provided
        if limit and limit > 0:
            filtered_countries = filtered_countries[:limit]
        
        # Build response
        response = {
            'success': True,
            'countries': filtered_countries,
            'count': len(filtered_countries),
            'total_count': len(all_countries)
        }
        
        # Add search query info if used
        if search_query:
            response['search_query'] = search_query
            response['search_results_count'] = len(filtered_countries)
        
        # Add data source information if requested
        if include_sources:
            countries_with_sources = []
            for country in filtered_countries:
                has_absolute = country in countries_absolute
                has_change = country in countries_change
                countries_with_sources.append({
                    'name': country,
                    'has_absolute_temperature': has_absolute,
                    'has_temperature_change': has_change,
                    'data_types': []
                })
                if has_absolute:
                    countries_with_sources[-1]['data_types'].append('absolute')
                if has_change:
                    countries_with_sources[-1]['data_types'].append('change')
            
            response['countries_with_sources'] = countries_with_sources
        
        # Log request
        print(f"[VISUALIZATION] Countries request: search='{search_query}', limit={limit}, returned {len(filtered_countries)} countries")
        
        # Add CORS headers explicitly
        json_response = jsonify(response)
        json_response.headers.add('Access-Control-Allow-Origin', '*')
        json_response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        json_response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        return json_response
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error getting countries: {error_trace}")
        
        # Return error response with CORS headers
        error_response = jsonify({
            'success': False,
            'error': f'Error getting countries: {str(e)}',
            'countries': [],
            'count': 0,
            'total_count': 0
        })
        error_response.headers.add('Access-Control-Allow-Origin', '*')
        error_response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        error_response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        
        return error_response, 500

@app.route('/visualization/country-temperature', methods=['GET'])
def get_country_temperature():
    """Get temperature data for a specific country (absolute or change)"""
    try:
        # Get parameters
        country = request.args.get('country', '').strip()
        start_year = request.args.get('start_year', type=int)
        end_year = request.args.get('end_year', type=int)
        data_type = request.args.get('data_type', 'absolute').strip().lower()  # 'absolute' or 'change'
        
        if not country:
            return jsonify({
                'success': False,
                'error': 'Country parameter is required'
            }), 400
        
        # Load appropriate dataset
        if data_type == 'change':
            df = _load_fao_temperature_change_data()
            data_source = 'FAO temperature change'
        else:
            df = _load_temperature_data()
            data_source = 'Berkeley Earth absolute temperature'
        
        if df is None:
            return jsonify({
                'success': False,
                'error': f'{data_source} data not available'
            }), 500
        
        # Try multiple matching strategies (in order of specificity)
        country_data = None
        
        # Strategy 1: Exact match (case-insensitive) - fastest and most accurate
        country_data = df[df['Country'].str.strip().str.lower() == country.lower().strip()].copy()
        
        # Strategy 2: Fuzzy matching (partial match) - handles variations like "Czech Republic" -> "Czechia"
        if len(country_data) == 0:
            country_set = set(df['Country'].unique())
            matched_country = _find_country_in_dataset(country, country_set)
            if matched_country:
                country_data = df[df['Country'] == matched_country].copy()
        
        # Strategy 3: Special case mapping (only for exceptions like "South Africa" -> "Africa" in original dataset)
        if len(country_data) == 0:
            mapped_country = _get_country_mapping(country, df_absolute=df if data_type == 'absolute' else None, 
                                                   df_change=df if data_type == 'change' else None)
            if mapped_country:
                country_data = df[df['Country'].str.strip().str.lower() == mapped_country.lower()].copy()
                if len(country_data) == 0:
                    country_data = df[df['Country'] == mapped_country].copy()
        
        # Strategy 4: Try exact match with original country name (case-sensitive)
        if len(country_data) == 0:
            country_data = df[df['Country'] == country].copy()
        
        if len(country_data) == 0:
            # Get available countries for error message
            all_countries, _, _ = _get_combined_countries()
            # Try to find similar country names
            similar_countries = [c for c in all_countries if country.lower() in c.lower() or c.lower() in country.lower()][:5]
            return jsonify({
                'success': False,
                'error': f'Country "{country}" not found in {data_source} database',
                'available_countries': sorted(all_countries)[:20],  # Show first 20 as hint
                'similar_countries': similar_countries if similar_countries else None
            }), 404
        
        # Filter by year range if provided
        if start_year is not None:
            country_data = country_data[country_data['Year'] >= start_year]
        
        if end_year is not None:
            country_data = country_data[country_data['Year'] <= end_year]
        
        if len(country_data) == 0:
            return jsonify({
                'success': False,
                'error': f'No temperature data found for {country} in the specified year range'
            }), 404
        
        # Get the actual country name (case-sensitive from data)
        actual_country = country_data['Country'].iloc[0]
        
        # Aggregate by year (calculate yearly averages)
        # For FAO data (change), we already have yearly data, so just aggregate if needed
        if data_type == 'change':
            # FAO data is already yearly (one row per year), just ensure we have the right columns
            yearly_data = country_data.groupby('Year').agg({
                'AverageTemperature': 'mean'
            }).reset_index()
            yearly_data['DataPoints'] = 1
            yearly_data['Temperature'] = yearly_data['AverageTemperature']
            yearly_data['MinTemp'] = yearly_data['AverageTemperature']
            yearly_data['MaxTemp'] = yearly_data['AverageTemperature']
        else:
            # Absolute temperature data - aggregate from monthly to yearly
            yearly_data = country_data.groupby('Year').agg({
                'AverageTemperature': ['mean', 'count', 'min', 'max']
            }).reset_index()
            # Flatten column names
            yearly_data.columns = ['Year', 'Temperature', 'DataPoints', 'MinTemp', 'MaxTemp']
        
        # Sort by year
        yearly_data = yearly_data.sort_values('Year')
        
        # Calculate change from start
        if len(yearly_data) > 0:
            first_temp = yearly_data['Temperature'].iloc[0]
            yearly_data['ChangeFromStart'] = yearly_data['Temperature'] - first_temp
        else:
            yearly_data['ChangeFromStart'] = 0.0
        
        # Calculate statistics
        min_year = int(yearly_data['Year'].min())
        max_year = int(yearly_data['Year'].max())
        min_temp = float(yearly_data['Temperature'].min())
        max_temp = float(yearly_data['Temperature'].max())
        avg_temp = float(yearly_data['Temperature'].mean())
        data_points = len(yearly_data)
        
        # Calculate trend (temperature change per 100 years)
        # Use linear regression
        trend_per_century = 0.0
        if len(yearly_data) > 1:
            years = yearly_data['Year'].values
            temps = yearly_data['Temperature'].values
            
            # Center years for better numerical stability
            years_centered = years - years.mean()
            
            # Calculate linear regression
            slope, intercept, r_value, p_value, std_err = stats.linregress(years_centered, temps)
            
            # Convert to per 100 years
            trend_per_century = slope * 100
        
        # Calculate total temperature change over the period
        total_change = 0.0
        if len(yearly_data) > 1:
            first_temp = yearly_data['Temperature'].iloc[0]
            last_temp = yearly_data['Temperature'].iloc[-1]
            total_change = last_temp - first_temp
        
        # Prepare data for response
        data_list = []
        for _, row in yearly_data.iterrows():
            data_list.append({
                'year': int(row['Year']),
                'temperature': round(float(row['Temperature']), 2),
                'change_from_start': round(float(row['ChangeFromStart']), 2),
                'min_temp': round(float(row['MinTemp']), 2),
                'max_temp': round(float(row['MaxTemp']), 2),
                'data_points': int(row['DataPoints'])
            })
        
        # Prepare statistics
        statistics = {
            'min_year': min_year,
            'max_year': max_year,
            'min_temp': round(min_temp, 2),
            'max_temp': round(max_temp, 2),
            'avg_temp': round(avg_temp, 2),
            'trend_per_century': round(trend_per_century, 3),
            'total_change': round(total_change, 2),
            'data_points': data_points
        }
        
        # Log request
        print(f"[VISUALIZATION] Country: {actual_country}, Data type: {data_type}, Years: {min_year}-{max_year}, Data points: {data_points}")
        
        # Build response - ensure backward compatibility
        response = {
            'success': True,
            'country': actual_country,
            'data': data_list,
            'statistics': statistics
        }
        
        # Add new fields only if not using default absolute type (for backward compatibility)
        if data_type != 'absolute' or request.args.get('include_metadata', 'false').lower() == 'true':
            response['data_type'] = data_type
            response['data_source'] = data_source
        
        return jsonify(response)
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error getting country temperature: {error_trace}")
        return jsonify({
            'success': False,
            'error': f'Error getting country temperature: {str(e)}'
        }), 500

@app.route('/visualization/country-temperature-change', methods=['GET'])
def get_country_temperature_change():
    """Get temperature change data for a specific country (FAO data) - Convenience endpoint"""
    try:
        # Get parameters
        country = request.args.get('country', '').strip()
        start_year = request.args.get('start_year', type=int)
        end_year = request.args.get('end_year', type=int)
        
        if not country:
            return jsonify({
                'success': False,
                'error': 'Country parameter is required'
            }), 400
        
        # Load FAO temperature change data
        df = _load_fao_temperature_change_data()
        data_source = 'FAO temperature change'
        
        if df is None:
            return jsonify({
                'success': False,
                'error': f'{data_source} data not available. Run process_fao_temperature_data.py first.'
            }), 500
        
        # Try multiple matching strategies (same as main endpoint)
        country_data = None
        
        # Strategy 1: Exact match (case-insensitive)
        country_data = df[df['Country'].str.strip().str.lower() == country.lower().strip()].copy()
        
        # Strategy 2: Fuzzy matching (partial match)
        if len(country_data) == 0:
            country_set = set(df['Country'].unique())
            matched_country = _find_country_in_dataset(country, country_set)
            if matched_country:
                country_data = df[df['Country'] == matched_country].copy()
        
        # Strategy 3: Special case mapping
        if len(country_data) == 0:
            mapped_country = _get_country_mapping(country, df_change=df)
            if mapped_country:
                country_data = df[df['Country'].str.strip().str.lower() == mapped_country.lower()].copy()
                if len(country_data) == 0:
                    country_data = df[df['Country'] == mapped_country].copy()
        
        # Strategy 4: Try exact match with original country name
        if len(country_data) == 0:
            country_data = df[df['Country'] == country].copy()
        
        if len(country_data) == 0:
            all_countries, _, _ = _get_combined_countries()
            similar_countries = [c for c in all_countries if country.lower() in c.lower() or c.lower() in country.lower()][:5]
            return jsonify({
                'success': False,
                'error': f'Country "{country}" not found in {data_source} database',
                'available_countries': sorted(all_countries)[:20],
                'similar_countries': similar_countries if similar_countries else None
            }), 404
        
        # Filter by year range if provided
        if start_year is not None:
            country_data = country_data[country_data['Year'] >= start_year]
        
        if end_year is not None:
            country_data = country_data[country_data['Year'] <= end_year]
        
        if len(country_data) == 0:
            return jsonify({
                'success': False,
                'error': f'No temperature change data found for {country} in the specified year range'
            }), 404
        
        # Get the actual country name
        actual_country = country_data['Country'].iloc[0]
        
        # FAO data is already yearly, just sort
        yearly_data = country_data.groupby('Year')['AverageTemperature'].mean().reset_index()
        yearly_data = yearly_data.sort_values('Year')
        yearly_data['DataPoints'] = 1
        yearly_data['Temperature'] = yearly_data['AverageTemperature']
        yearly_data['MinTemp'] = yearly_data['AverageTemperature']
        yearly_data['MaxTemp'] = yearly_data['AverageTemperature']
        
        # Calculate change from start (for temperature change, this is the change itself)
        if len(yearly_data) > 0:
            first_temp = yearly_data['Temperature'].iloc[0]
            yearly_data['ChangeFromStart'] = yearly_data['Temperature'] - first_temp
        else:
            yearly_data['ChangeFromStart'] = 0.0
        
        # Calculate statistics
        min_year = int(yearly_data['Year'].min())
        max_year = int(yearly_data['Year'].max())
        min_temp = float(yearly_data['Temperature'].min())
        max_temp = float(yearly_data['Temperature'].max())
        avg_temp = float(yearly_data['Temperature'].mean())
        data_points = len(yearly_data)
        
        # Calculate trend
        trend_per_century = 0.0
        if len(yearly_data) > 1:
            years = yearly_data['Year'].values
            temps = yearly_data['Temperature'].values
            years_centered = years - years.mean()
            slope, intercept, r_value, p_value, std_err = stats.linregress(years_centered, temps)
            trend_per_century = slope * 100
        
        # Calculate total change
        total_change = 0.0
        if len(yearly_data) > 1:
            first_temp = yearly_data['Temperature'].iloc[0]
            last_temp = yearly_data['Temperature'].iloc[-1]
            total_change = last_temp - first_temp
        
        # Prepare data for response
        data_list = []
        for _, row in yearly_data.iterrows():
            data_list.append({
                'year': int(row['Year']),
                'temperature_change': round(float(row['Temperature']), 2),
                'change_from_start': round(float(row['ChangeFromStart']), 2),
                'data_points': 1
            })
        
        # Prepare statistics
        statistics = {
            'min_year': min_year,
            'max_year': max_year,
            'min_change': round(min_temp, 2),
            'max_change': round(max_temp, 2),
            'avg_change': round(avg_temp, 2),
            'trend_per_century': round(trend_per_century, 3),
            'total_change': round(total_change, 2),
            'data_points': data_points
        }
        
        print(f"[VISUALIZATION] Country: {actual_country}, Data type: change, Years: {min_year}-{max_year}, Data points: {data_points}")
        
        return jsonify({
            'success': True,
            'country': actual_country,
            'data_type': 'change',
            'data_source': data_source,
            'data': data_list,
            'statistics': statistics
        })
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error getting country temperature change: {error_trace}")
        return jsonify({
            'success': False,
            'error': f'Error getting country temperature change: {str(e)}'
        }), 500

@app.route('/visualization/combined-country-temperature', methods=['GET'])
def get_combined_country_temperature():
    """Get combined temperature data (absolute + change) for a country"""
    try:
        country = request.args.get('country', '').strip()
        start_year = request.args.get('start_year', type=int)
        end_year = request.args.get('end_year', type=int)
        
        if not country:
            return jsonify({
                'success': False,
                'error': 'Country parameter is required'
            }), 400
        
        # Load both datasets
        df_absolute = _load_temperature_data()
        df_change = _load_fao_temperature_change_data()
        
        result = {
            'success': True,
            'country': country,
            'absolute_temperature': None,
            'temperature_change': None
        }
        
        # Country name mapping
        country_mappings = {
            'united states': 'United States',
            'usa': 'United States',
            'us': 'United States',
            'united states of america': 'United States'
        }
        search_country = country_mappings.get(country.lower(), country)
        
        # Get absolute temperature data
        if df_absolute is not None:
            # Try multiple matching strategies
            country_absolute = df_absolute[df_absolute['Country'].str.strip().str.lower() == search_country.lower()].copy()
            
            if len(country_absolute) == 0:
                # Try mapping
                mapped_country = _get_country_mapping(search_country, df_absolute=df_absolute)
                if mapped_country:
                    country_absolute = df_absolute[df_absolute['Country'].str.strip().str.lower() == mapped_country.lower()].copy()
            
            if len(country_absolute) == 0:
                # Try fuzzy matching
                country_set = set(df_absolute['Country'].unique())
                matched_country = _find_country_in_dataset(search_country, country_set)
                if matched_country:
                    country_absolute = df_absolute[df_absolute['Country'] == matched_country].copy()
            
            if len(country_absolute) == 0:
                country_absolute = df_absolute[df_absolute['Country'] == search_country].copy()
            
            if len(country_absolute) > 0:
                # Filter by year range
                if start_year is not None:
                    country_absolute = country_absolute[country_absolute['Year'] >= start_year]
                if end_year is not None:
                    country_absolute = country_absolute[country_absolute['Year'] <= end_year]
                
                if len(country_absolute) > 0:
                    # Aggregate by year
                    yearly_absolute = country_absolute.groupby('Year')['AverageTemperature'].mean().reset_index()
                    yearly_absolute = yearly_absolute.sort_values('Year')
                    
                    result['absolute_temperature'] = {
                        'years': [int(y) for y in yearly_absolute['Year'].tolist()],
                        'temperatures': [round(float(t), 2) for t in yearly_absolute['AverageTemperature'].tolist()],
                        'year_range': [int(yearly_absolute['Year'].min()), int(yearly_absolute['Year'].max())]
                    }
                    result['country'] = country_absolute['Country'].iloc[0]  # Use actual country name from data
        
        # Get temperature change data
        if df_change is not None:
            # Try multiple matching strategies
            country_change = df_change[df_change['Country'].str.strip().str.lower() == search_country.lower()].copy()
            
            if len(country_change) == 0:
                # Try mapping
                mapped_country = _get_country_mapping(search_country, df_change=df_change)
                if mapped_country:
                    country_change = df_change[df_change['Country'].str.strip().str.lower() == mapped_country.lower()].copy()
            
            if len(country_change) == 0:
                # Try fuzzy matching
                country_set = set(df_change['Country'].unique())
                matched_country = _find_country_in_dataset(search_country, country_set)
                if matched_country:
                    country_change = df_change[df_change['Country'] == matched_country].copy()
            
            if len(country_change) == 0:
                country_change = df_change[df_change['Country'] == search_country].copy()
            
            if len(country_change) > 0:
                # Filter by year range
                if start_year is not None:
                    country_change = country_change[country_change['Year'] >= start_year]
                if end_year is not None:
                    country_change = country_change[country_change['Year'] <= end_year]
                
                if len(country_change) > 0:
                    country_change = country_change.sort_values('Year')
                    
                    result['temperature_change'] = {
                        'years': [int(y) for y in country_change['Year'].tolist()],
                        'temperature_changes': [round(float(t), 2) for t in country_change['AverageTemperature'].tolist()],
                        'year_range': [int(country_change['Year'].min()), int(country_change['Year'].max())]
                    }
                    if 'country' not in result or result['country'] is None:
                        result['country'] = country_change['Country'].iloc[0]  # Use actual country name from data
        
        if result['absolute_temperature'] is None and result['temperature_change'] is None:
            return jsonify({
                'success': False,
                'error': f'No temperature data found for country "{country}"'
            }), 404
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Error getting combined country temperature: {error_trace}")
        return jsonify({
            'success': False,
            'error': f'Error getting combined country temperature: {str(e)}'
        }), 500

if __name__ == '__main__':
    # Use port 5001 if 5000 is in use (macOS AirPlay Receiver)
    import socket
    port = 5000
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(('127.0.0.1', 5000))
    sock.close()
    if result == 0:
        # Port 5000 is in use
        port = 5001
        print(f"[INFO] Port 5000 is in use, using port {port} instead")
    else:
        # Port 5000 is available
        port = 5000
    app.run(debug=True, port=port, host='0.0.0.0')


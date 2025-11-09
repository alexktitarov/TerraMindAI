# TerraMindAI

## Inspiration

We all realize, that climate education is super important, but it's often taught in pretty dry ways. So we thought - what if we could use AI to make learning about climate change actually fun and personal? That's how ***TerraMindAI*** was born.

## What it does

TerraMindAI is like having a smart climate tutor that students can chat with anytime. Our chatbot, Terra, uses RAG technology to pull from open-source climate datasets, so students get answers backed by actual data, not generic responses.

Students can take interactive courses tailored to their grade level, take quizzes with instant feedback, earn badges as they progress, and chat with Terra in real-time. One of our biggest features is text-to-speech - students can have entire lessons read aloud, making learning accessible for auditory learners and allowing students to learn while doing other activities. Plus, interactive visualizations make complex climate data understandable.

For teachers, we built a dashboard that makes life easier. They can create courses quickly using AI-generated content, organize students into groups, and track progress with analytics that show quiz performance and engagement - all without the headache. 

## How we built it

To create the Webpage we used Lovable. Using it we were able to generate tailored webpage that perfectly suits our needs.

Terra uses Groq's API with a custom RAG system we built on top. We took climate datasets, turned them into vectors using sentence transformers, and stored them in a FAISS index. When students ask questions, we search the indexed data first, grab the most relevant info, and feed that context to the AI - so Terra's answers are grounded in real data that were collected during many years, not made up.

A huge part of our work was integrating text-to-speech using Eleven Labs API - we built a system that can audiate entire lessons and course content, integrated with real-time streaming using Server-Sent Events.

## Challenges we ran into

- Building the RAG system took some time : vectorizing massive climate datasets, building the FAISS index, and making retrieval fast enough for real-time conversations. Keeping conversation context coherent across multiple exchanges was challenging.

- Integrating text-to-speech was relatively easy - we used Eleven Labs API and  it worked smoothly across devices and across a whole project in itself.

- The course generation feature required way more prompt engineering than expected - getting AI to generate age-appropriate content that doesn't sound robotic. Finding that sweet spot between comprehensive analytics for teachers and a simple, fun interface for students wasn't easy.

## Accomplishments that we're proud of

We're pretty stoked about building a full educational platform that actually works. Terra, our RAG chatbot, gives accurate answers by pulling from real climate data - no hallucinations. The badge system motivates students to finish courses, and teachers love the automated quiz generation that creates assessments in minutes.

But honestly, one of our biggest accomplishments is the managing of several different datasets and successfuly putting them inside the RAG. With approach that we did, we technically, can scale it to a multiple abosolutely different datasets on different topics and still be able to integrate them inside RAG and LLM without huge work-arounds. The quality and seamless integration is something we're really proud of.

The real-time streaming chat makes conversations feel natural, and we built a solid authentication system that handles multiple users and maintains conversation context across sessions.

## What we learned

- AI on its own can be unreliable, but grounding it in real data using RAG makes it way more accurate - the AI isn't magic, it needs good data. Prompt engineering is way more important than we thought, especially for generating age-appropriate content.

- Working with vector databases and embeddings was an interesting experience for us and now we understand how semantic search works.

- Prompt-engineering to suit different auditories, starting from kids and ending with students, is really something that was new and challenging for us. It tought us how to work around the LLM and how to "explain" our needs, our vision and our expectations of responses.

- Designing for students (simple and fun) versus teachers (comprehensive) is like designing two different products. And data preprocessing is everything - how you structure your data directly impacts how well the system works.

## What's next for TerraMindAI

We've got big plans! 

We want to integrate real-time data feeds, starting with some open-source datasets that are available on huggingface or kaggle, and ending with creating a custom pipeline, that will allow different companies or schools to seemlessly integrate with our platform and load their own custom-made datasets. We also want to develop our visualizations, and make the visualization engine automatically generate charts based on student questions, on questions where most of students failed or successed.

Mobile apps are on the roadmap, plus creating of API ready solutions for different instances. Multi-language support is huge for us - climate education shouldn't be limited by language. 

Down the road, we're thinking about social features, certification programs, a parent portal, and voice input/output with offline mode for areas with limited internet connectivity.
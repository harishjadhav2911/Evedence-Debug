# EvidenceDebug AI — Grounded Code Intelligence & RAG Debugger

EvidenceDebug AI is a developer-tool web application and Retrieval-Augmented Generation (RAG) debugging assistant that explains programming bugs and grounds AI diagnostic claims directly on retrieved language specifications and official documentation.

---

## Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │    Frontend Single Page Application   │
                      │   (Vanilla JS, Bootstrap 5, CSS3)    │
                      └──────────────────┬───────────────────┘
                                         │ JSON & Multipart HTTP
                                         ▼
                      ┌──────────────────────────────────────┐
                      │       Django Backend (Python)        │
                      ├──────────────────┬───────────────────┤
                      │  Document Ingest │   AST Code Parser │
                      │  (pypdf / text)  │ (Function / Calls)│
                      └────────┬─────────┴─────────┬─────────┘
                               │                   │
                     Sliding Window Chunks   Signals & Queries
                               │                   │
                               ▼                   ▼
                      ┌──────────────────────────────────────┐
                      │        FAISS CPU Vector Store        │
                      │  (Dense Sentence-Transformers Embed) │
                      └──────────────────┬───────────────────┘
                                         │ Top-K Passages
                                         ▼
                      ┌──────────────────────────────────────┐
                      │     Google Gen AI (Gemini Flash)     │
                      │      Grounded Claim Verification     │
                      └──────────────────┬───────────────────┘
                                         │ Grounded Output
                                         ▼
                      ┌──────────────────────────────────────┐
                      │      3-Panel Workspace UI            │
                      │ [Code Input] [Trace] [Grounded Fix]  │
                      └──────────────────────────────────────┘
```

---

## Technology Stack

* **Frontend**: HTML5, Vanilla CSS3 (Warm Ivory & Champagne Gold design system), Bootstrap 5, Bootstrap Icons, Vanilla JavaScript.
* **Backend**: Python 3.9+, Django 4.2.
* **Vector Search**: FAISS CPU (`faiss-cpu`) with Inner Product / Cosine Similarity.
* **Embeddings**: `sentence-transformers` (`all-MiniLM-L6-v2`) with dense LSA fallback.
* **PDF Extraction**: `pypdf`.
* **AI Intelligence**: Official Google Gen AI Python SDK (`google-genai`).

---

## Quick Start (Windows PowerShell)

### 1. Clone & Navigate to Project Directory
```powershell
cd "d:\code explainer"
```

### 2. Set Up Virtual Environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install Dependencies
```powershell
.\.venv\Scripts\pip.exe install -r requirements.txt
```

### 4. Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
*(Optional)* Add your Google Gemini API key to `.env` (configured for `gemini-2.5-flash`):
```ini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```
> **Note**: If `GEMINI_API_KEY` is not configured, the backend automatically uses its local grounded heuristic engine with deterministic claim verification so all features work completely offline.

### 5. Run Database Migrations
```powershell
.\.venv\Scripts\python.exe manage.py migrate
```

### 6. Run Test Suite
```powershell
.\.venv\Scripts\python.exe manage.py test analyzer
```

### 7. Start the Development Server
```powershell
.\.venv\Scripts\python.exe manage.py runserver 8000
```
Open your browser and navigate to:
**[http://localhost:8000](http://localhost:8000)**

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/health/` | System status, RAG index readiness, and document statistics. |
| `POST` | `/api/v1/documents/upload/` | Multipart file upload (`.pdf`, `.txt`, `.md`) with chunking & FAISS indexing. |
| `GET` | `/api/v1/documents/` | Retrieves list of all currently indexed documents. |
| `DELETE` | `/api/v1/documents/<doc_id>/` | Removes a document and dynamically rebuilds the FAISS vector index. |
| `POST` | `/api/v1/analyze/` | Performs AST signal extraction, RAG passage retrieval, and grounded explanation synthesis. |

---

## Claim Grounding Classifications

Every claim presented in the analysis panel is categorized:
* **`[DOC-BACKED]`**: Directly grounded in and cited against retrieved documentation passages (`[S1]`, `[S2]`).
* **`[GENERAL KNOWLEDGE]`**: Standard programming syntax and algorithmic rules.
* **`[UNSUPPORTED]`**: Speculative inference or advice when no matching passages are found in the corpus.

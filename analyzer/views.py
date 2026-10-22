"""
API Views for EvidenceDebug AI
Endpoints for health check, document upload/listing/deletion, and grounded code analysis.
"""
import json
import logging
from django.http import JsonResponse, HttpResponseBadRequest, HttpResponseNotAllowed
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.conf import settings

from .document_processor import DocumentProcessor
from .rag_service import RAGService
from .code_analyzer import CodeAnalyzer
from .gemini_service import GeminiService

logger = logging.getLogger(__name__)

@method_decorator(csrf_exempt, name='dispatch')
class HealthView(View):
    """GET /api/v1/health/ — System status and RAG index health check."""
    def get(self, request):
        rag = RAGService.get_instance()
        stats = rag.get_stats()
        return JsonResponse({
            "status": "ok",
            "service": "EvidenceDebug AI Backend",
            "version": "1.0.0",
            "rag_ready": True,
            "gemini_configured": GeminiService.is_configured(),
            "gemini_model": GeminiService.get_model_name(),
            "stats": stats
        })


@method_decorator(csrf_exempt, name='dispatch')
class DocumentUploadView(View):
    """POST /api/v1/documents/upload/ — Multipart upload for PDF, TXT, MD."""
    def post(self, request):
        if 'file' not in request.FILES:
            return JsonResponse({"status": "error", "error": "No file uploaded. Please provide a 'file' parameter."}, status=400)

        uploaded_file = request.FILES['file']
        try:
            # 1. Validate file extension and size
            DocumentProcessor.validate_file(uploaded_file)

            # 2. Extract text and split into overlapping chunks
            metadata, chunks = DocumentProcessor.extract_and_chunk(uploaded_file, uploaded_file.name)

            # 3. Save physical copy to uploads directory
            safe_filename = f"{metadata['id']}_{uploaded_file.name}"
            upload_path = settings.UPLOADS_DIR / safe_filename
            with open(upload_path, 'wb+') as destination:
                uploaded_file.seek(0)
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            metadata['saved_path'] = str(upload_path)

            # 4. Index chunks into FAISS vector index
            rag = RAGService.get_instance()
            rag.add_document(metadata, chunks)

            return JsonResponse({
                "status": "success",
                "message": f"Successfully indexed '{uploaded_file.name}' into {len(chunks)} chunks.",
                "document": metadata,
                "stats": rag.get_stats()
            }, status=201)

        except ValueError as e:
            return JsonResponse({"status": "error", "error": str(e)}, status=400)
        except Exception as e:
            logger.error("Document upload failure: %s", str(e), exc_info=True)
            return JsonResponse({"status": "error", "error": f"Failed to process document: {str(e)}"}, status=500)


@method_decorator(csrf_exempt, name='dispatch')
class DocumentListView(View):
    """GET /api/v1/documents/ — Returns list of all active indexed documents."""
    def get(self, request):
        rag = RAGService.get_instance()
        return JsonResponse({
            "status": "success",
            "documents": rag.get_documents(),
            "stats": rag.get_stats()
        })


@method_decorator(csrf_exempt, name='dispatch')
class DocumentDeleteView(View):
    """DELETE /api/v1/documents/<doc_id>/ — Removes a document and rebuilds FAISS index."""
    def delete(self, request, doc_id):
        rag = RAGService.get_instance()
        success = rag.delete_document(doc_id)
        if not success:
            return JsonResponse({"status": "error", "error": f"Document '{doc_id}' not found."}, status=404)

        return JsonResponse({
            "status": "success",
            "message": f"Document '{doc_id}' removed and vector index rebuilt.",
            "stats": rag.get_stats()
        })


@method_decorator(csrf_exempt, name='dispatch')
class AnalyzeView(View):
    """
    POST /api/v1/analyze/
    Accepts code, language, problem_description.
    Enforces 'Retrieval first, generation second' protocol:
    1. Extracts code signals
    2. Generates queries
    3. Retrieves grounded passages from knowledge base
    4. Synthesizes grounded explanation, issues, and fix
    """
    def post(self, request):
        try:
            if request.content_type == 'application/json':
                body = json.loads(request.body.decode('utf-8'))
            else:
                body = request.POST

            code = body.get('code', '').strip()
            language = body.get('language', 'python').strip()
            problem_description = body.get('problem_description', '').strip()

            if not code:
                return JsonResponse({"status": "error", "error": "Code cannot be empty. Please paste your source code."}, status=400)

            if len(code) > 50000:
                return JsonResponse({"status": "error", "error": "Code exceeds maximum supported length (50,000 characters)."}, status=400)

            # 1. Signal Extraction
            signals = CodeAnalyzer.extract_signals(code, language)

            # 2. Query Generation
            queries = CodeAnalyzer.generate_queries(code, language, problem_description, signals)

            # 3. Real RAG Retrieval over uploaded documents
            rag = RAGService.get_instance()
            knowledge_base_empty = (len(rag.chunks) == 0)

            retrieved_passages = []
            if not knowledge_base_empty:
                # Query index with both dense and sparse query strings
                seen_hashes = set()
                for q in queries:
                    q_text = q['text'].strip('"')
                    matches = rag.search(q_text, top_k=4)
                    for m in matches:
                        if m['hash'] not in seen_hashes:
                            seen_hashes.add(m['hash'])
                            retrieved_passages.append(m)

                # Sort by score descending and re-assign IDs [S1], [S2]...
                retrieved_passages.sort(key=lambda x: x.get('rawScore', 0), reverse=True)
                retrieved_passages = retrieved_passages[:5]
                for idx, p in enumerate(retrieved_passages):
                    p['id'] = f"S{idx + 1}"

            # 4. Grounded Synthesis via Gemini (or local grounded fallback)
            analysis_output = GeminiService.synthesize_grounded_analysis(
                code=code,
                language=language,
                problem_description=problem_description,
                signals=signals,
                passages=retrieved_passages,
                knowledge_base_empty=knowledge_base_empty
            )

            return JsonResponse({
                "status": "success",
                "is_demo": False,
                "ai_provider": analysis_output.get("ai_provider", "local-grounded-fallback"),
                "model_name": analysis_output.get("model_name", "local-heuristic-engine"),
                "fallback_reason": analysis_output.get("fallback_reason"),
                "knowledge_base_empty": knowledge_base_empty,
                "language": language,
                "summary": analysis_output.get("summary", ""),
                "signals": signals,
                "queries": queries,
                "passages": retrieved_passages,
                "explanation": analysis_output.get("explanation", {}),
                "issues": analysis_output.get("issues", []),
                "fixed_code": analysis_output.get("fixed_code", ""),
                "limitations": analysis_output.get("limitations", "Static retrieval-augmented analysis. Code was not dynamically executed in a runtime sandbox.")
            })

        except json.JSONDecodeError:
            return JsonResponse({"status": "error", "error": "Malformed JSON in request body."}, status=400)
        except Exception as e:
            logger.error("Analyze error: %s", str(e), exc_info=True)
            return JsonResponse({"status": "error", "error": f"Analysis failed: {str(e)}"}, status=500)

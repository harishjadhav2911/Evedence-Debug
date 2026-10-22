"""
Unit and Integration Tests for EvidenceDebug AI
Tests DocumentProcessor, RAGService, GeminiService, API endpoints,
claim verification, language analyzers, and error handling.
"""
import io
import json
from unittest.mock import patch, MagicMock
from django.test import TestCase, Client
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from pypdf import PdfWriter

from .document_processor import DocumentProcessor
from .rag_service import RAGService
from .gemini_service import GeminiService
from .code_analyzer import CodeAnalyzer


class DocumentProcessingTests(TestCase):

    def test_extract_and_chunk_txt(self):
        text_content = (
            "Python function definitions evaluate default arguments once at definition time. "
            "If a default argument is mutable like a list, consecutive calls share state. "
            "To prevent state leaks, use None as the sentinel default."
        )
        file_obj = io.BytesIO(text_content.encode('utf-8'))
        metadata, chunks = DocumentProcessor.extract_and_chunk(file_obj, "sample_guide.txt")

        self.assertEqual(metadata["filename"], "sample_guide.txt")
        self.assertEqual(metadata["chunks_count"], len(chunks))
        self.assertGreater(len(chunks), 0)
        self.assertIn("Python function definitions", chunks[0]["text"])

    def test_reject_unsupported_file_extension(self):
        file_obj = SimpleUploadedFile("malicious.exe", b"binary content", content_type="application/octet-stream")
        with self.assertRaises(ValueError) as ctx:
            DocumentProcessor.validate_file(file_obj)
        self.assertIn("Unsupported file format", str(ctx.exception))

    def test_reject_empty_document(self):
        file_obj = io.BytesIO(b"   \n\t   ")
        with self.assertRaises(ValueError) as ctx:
            DocumentProcessor.extract_and_chunk(file_obj, "empty.txt")
        self.assertIn("contains no extractable text", str(ctx.exception))

    def test_extract_pdf_with_page_numbers(self):
        writer = PdfWriter()
        writer.add_blank_page(width=72, height=72)
        pdf_bytes = io.BytesIO()
        writer.write(pdf_bytes)
        pdf_bytes.seek(0)

        with self.assertRaises(ValueError) as ctx:
            DocumentProcessor.extract_and_chunk(pdf_bytes, "blank.pdf")
        self.assertIn("contains no extractable text", str(ctx.exception))


class RAGServiceTests(TestCase):

    def setUp(self):
        self.rag = RAGService.get_instance()
        self.rag.clear_all()

    def tearDown(self):
        self.rag.clear_all()

    def test_empty_knowledge_base_search(self):
        results = self.rag.search("python mutable defaults")
        self.assertEqual(results, [])

    def test_add_document_and_retrieve(self):
        meta = {
            "id": "doc-test-1",
            "filename": "python_specs.txt",
            "file_size": 1024,
            "chunks_count": 1,
            "page_count": None
        }
        chunks = [
            {
                "chunk_id": "doc-test-1_c0",
                "document_id": "doc-test-1",
                "document_name": "python_specs.txt",
                "page_number": None,
                "chunk_index": 0,
                "text": "Default parameter values are evaluated when the function definition is executed. A mutable list is shared."
            }
        ]
        self.rag.add_document(meta, chunks)

        docs = self.rag.get_documents()
        self.assertEqual(len(docs), 1)

        matches = self.rag.search("mutable default list shared", top_k=2)
        self.assertGreater(len(matches), 0)
        self.assertEqual(matches[0]["fileName"], "python_specs.txt")
        self.assertIn("Default parameter values", matches[0]["quote"])

        deleted = self.rag.delete_document("doc-test-1")
        self.assertTrue(deleted)
        self.assertEqual(len(self.rag.get_documents()), 0)
        self.assertEqual(len(self.rag.search("mutable default")), 0)


class CodeAnalyzerTests(TestCase):

    def test_python_ast_analysis_and_signal_labeling(self):
        code = "def append_item(item, catalog=[]):\n    catalog.append(item)\n    return catalog"
        signals = CodeAnalyzer.extract_signals(code, "python")
        labels = [s["label"] for s in signals]
        self.assertTrue(any("Python 3 AST" in l for l in labels))
        self.assertTrue(any("catalog=[]" in l for l in labels))

    def test_c_signal_extraction_no_execution(self):
        c_code = "#include <stdio.h>\nvoid test() { char buf[16]; gets(buf); }"
        signals = CodeAnalyzer.extract_signals(c_code, "c")
        labels = [s["label"] for s in signals]
        self.assertTrue(any("C Static Pattern Inspection" in l for l in labels))
        self.assertTrue(any("gets()" in l for l in labels))

    def test_cpp_signal_extraction_no_execution(self):
        cpp_code = "#include <vector>\nvoid f(std::vector<int>& v) { v.erase(v.begin()); }"
        signals = CodeAnalyzer.extract_signals(cpp_code, "cpp")
        labels = [s["label"] for s in signals]
        self.assertTrue(any("C++ Static Pattern Inspection" in l for l in labels))
        self.assertTrue(any(".erase()" in l for l in labels))

    def test_java_signal_extraction_no_execution(self):
        java_code = "public class T { Double d = null; double res = d - 1.0; }"
        signals = CodeAnalyzer.extract_signals(java_code, "java")
        labels = [s["label"] for s in signals]
        self.assertTrue(any("Java Static Pattern Inspection" in l for l in labels))
        self.assertTrue(any("Unboxing" in l for l in labels))


class ClaimGroundingVerificationTests(TestCase):

    def test_downgrade_hallucinated_source_id(self):
        # Only passage S1 exists in retrieval
        passages = [{"id": "S1", "docTitle": "Spec.txt", "fileName": "Spec.txt", "quote": "Real quote"}]
        mock_raw = {
            "summary": "Test summary",
            "explanation": {
                "confidence": "Live",
                "paragraphs": [
                    'Supported: <a href="#passage-s1" class="citation-link" data-citation="s1">[S1]</a>',
                    'Hallucinated: <a href="#passage-s99" class="citation-link" data-citation="s99">[S99]</a>'
                ],
                "timeline": [],
                "tableRows": [
                    {"ref": "#C1", "claim": "Claim 1", "badge": "DOC-BACKED", "sourceId": "s1", "source": "[S1]"},
                    {"ref": "#C2", "claim": "Claim 2", "badge": "DOC-BACKED", "sourceId": "s99", "source": "[S99]"}
                ]
            },
            "issues": [
                {"severity": "HIGH", "grounding": "DOC-BACKED [S1]", "sourceId": "s1"},
                {"severity": "HIGH", "grounding": "DOC-BACKED [S99]", "sourceId": "s99"}
            ],
            "fixed_code": "code"
        }

        verified = GeminiService._verify_and_sanitize_grounding(mock_raw, passages, False, "python", "code")

        # C1 should remain DOC-BACKED
        c1 = verified["explanation"]["tableRows"][0]
        self.assertEqual(c1["badge"], "DOC-BACKED")
        self.assertEqual(c1["sourceId"], "s1")

        # C2 MUST BE DOWNGRADED to UNSUPPORTED because S99 does not exist!
        c2 = verified["explanation"]["tableRows"][1]
        self.assertEqual(c2["badge"], "UNSUPPORTED")
        self.assertEqual(c2["sourceId"], "")

        # Issue 2 grounding must be downgraded
        iss2 = verified["issues"][1]
        self.assertEqual(iss2["grounding"], "GENERAL KNOWLEDGE")
        self.assertEqual(iss2["sourceId"], "")

    def test_empty_knowledge_base_cannot_have_doc_backed_claims(self):
        mock_raw = {
            "summary": "Summary",
            "explanation": {
                "paragraphs": ['Claim <span class="claim-badge badge-doc-backed">DOC-BACKED</span> <a href="#passage-s1" class="citation-link">[S1]</a>'],
                "timeline": [],
                "tableRows": [
                    {"ref": "#C1", "claim": "Claim", "badge": "DOC-BACKED", "sourceId": "s1"}
                ]
            },
            "issues": [
                {"severity": "HIGH", "grounding": "DOC-BACKED [S1]", "sourceId": "s1"}
            ]
        }
        verified = GeminiService._verify_and_sanitize_grounding(mock_raw, [], True, "python", "code")

        c1 = verified["explanation"]["tableRows"][0]
        self.assertEqual(c1["badge"], "UNSUPPORTED")
        self.assertEqual(c1["sourceId"], "")
        # Citation link must be stripped from paragraph
        self.assertNotIn('href="#passage-s1"', verified["explanation"]["paragraphs"][0])


class GeminiIntegrationTests(TestCase):

    @patch('analyzer.gemini_service.GeminiService.is_configured', return_value=False)
    def test_missing_api_key_uses_local_fallback(self, mock_is_conf):
        res = GeminiService.synthesize_grounded_analysis(
            code="def foo(x=[]): pass",
            language="python",
            problem_description="test",
            signals=[],
            passages=[],
            knowledge_base_empty=True
        )
        self.assertEqual(res["ai_provider"], "local-grounded-fallback")
        self.assertEqual(res["model_name"], "local-heuristic-engine")
        self.assertIn("GEMINI_API_KEY", res["fallback_reason"])
        self.assertIn("summary", res)
        self.assertIn("limitations", res)

    @patch('analyzer.gemini_service.GeminiService.is_configured', return_value=True)
    @patch('analyzer.gemini_service.GeminiService._call_gemini_api')
    def test_gemini_success_mocked(self, mock_call, mock_is_conf):
        mock_call.return_value = {
            "summary": "Default mutable list parameter persists across calls.",
            "explanation": {
                "confidence": "Grounded in Python Spec [S1]",
                "paragraphs": ["Evaluated once."],
                "timeline": [{"title": "Step 1", "desc": "Def time"}],
                "tableRows": [{"ref": "#C1", "claim": "Evaluated once", "badge": "DOC-BACKED", "sourceId": "s1"}]
            },
            "issues": [{
                "severity": "HIGH",
                "severityClass": "severity-high",
                "location": "Line 1",
                "grounding": "DOC-BACKED [S1]",
                "title": "Mutable Default",
                "description": "Shared list",
                "diffMinus": "catalog=[]",
                "diffPlus": "catalog=None",
                "rule": "MutableDefault",
                "sourceId": "s1"
            }],
            "fixed_code": "def f(c=None): pass"
        }

        res = GeminiService.synthesize_grounded_analysis(
            code="def f(catalog=[]): pass",
            language="python",
            problem_description="shared state",
            signals=[],
            passages=[{"id": "S1", "docTitle": "PySpec", "fileName": "pyspec.txt", "quote": "Evaluated once"}],
            knowledge_base_empty=False
        )

        self.assertEqual(res["ai_provider"], "google-gemini")
        self.assertEqual(res["model_name"], GeminiService.get_model_name())
        self.assertIsNone(res["fallback_reason"])
        self.assertIn("Default mutable list", res["summary"])

    @patch('analyzer.gemini_service.GeminiService.is_configured', return_value=True)
    @patch('analyzer.gemini_service.GeminiService._call_gemini_api', side_effect=RuntimeError("Quota limit reached (429)"))
    def test_gemini_failure_falls_back_safely(self, mock_call, mock_is_conf):
        res = GeminiService.synthesize_grounded_analysis(
            code="def f(catalog=[]): pass",
            language="python",
            problem_description="shared state",
            signals=[],
            passages=[],
            knowledge_base_empty=True
        )

        self.assertEqual(res["ai_provider"], "local-grounded-fallback")
        self.assertEqual(res["model_name"], "local-heuristic-engine")
        self.assertIn("Quota limit reached", res["fallback_reason"])
        self.assertIn("summary", res)


class APITests(TestCase):

    def setUp(self):
        self.client = Client()
        self.rag = RAGService.get_instance()
        self.rag.clear_all()

    def tearDown(self):
        self.rag.clear_all()

    def test_health_endpoint(self):
        response = self.client.get('/api/v1/health/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["rag_ready"])
        self.assertIn("gemini_model", data)

    def test_upload_txt_document(self):
        doc_content = b"Python language reference: mutable default arguments retain state across invocations."
        uploaded_file = SimpleUploadedFile("python_ref.txt", doc_content, content_type="text/plain")
        response = self.client.post('/api/v1/documents/upload/', {'file': uploaded_file})

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["document"]["filename"], "python_ref.txt")
        self.assertGreater(data["document"]["chunks_count"], 0)

        list_resp = self.client.get('/api/v1/documents/')
        self.assertEqual(list_resp.status_code, 200)
        list_data = list_resp.json()
        self.assertEqual(len(list_data["documents"]), 1)

    def test_upload_invalid_file_type(self):
        uploaded_file = SimpleUploadedFile("bad_file.bin", b"\x00\x01\x02", content_type="application/octet-stream")
        response = self.client.post('/api/v1/documents/upload/', {'file': uploaded_file})
        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported file format", response.json()["error"])

    def test_delete_document_endpoint(self):
        uploaded_file = SimpleUploadedFile("temp_doc.txt", b"Temporary test document content.", content_type="text/plain")
        upload_resp = self.client.post('/api/v1/documents/upload/', {'file': uploaded_file})
        doc_id = upload_resp.json()["document"]["id"]

        del_resp = self.client.delete(f'/api/v1/documents/{doc_id}/')
        self.assertEqual(del_resp.status_code, 200)
        self.assertEqual(del_resp.json()["status"], "success")

        del_resp2 = self.client.delete(f'/api/v1/documents/{doc_id}/')
        self.assertEqual(del_resp2.status_code, 404)

    def test_analyze_empty_code_rejected(self):
        response = self.client.post(
            '/api/v1/analyze/',
            data=json.dumps({"code": "", "language": "python"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("Code cannot be empty", response.json()["error"])

    def test_analyze_oversized_code_rejected(self):
        huge_code = "x = 1\n" * 15000  # > 50,000 characters
        response = self.client.post(
            '/api/v1/analyze/',
            data=json.dumps({"code": huge_code, "language": "python"}),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("exceeds maximum supported length", response.json()["error"])

    def test_analyze_empty_knowledge_base(self):
        payload = {
            "code": "def add(x, catalog=[]): catalog.append(x); return catalog",
            "language": "python",
            "problem_description": "Items accumulate between function calls."
        }
        response = self.client.post(
            '/api/v1/analyze/',
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertTrue(data["knowledge_base_empty"])
        self.assertEqual(len(data["passages"]), 0)  # No fake passages!
        self.assertGreater(len(data["signals"]), 0) # AST signals extracted!
        self.assertIn("summary", data)
        self.assertIn("limitations", data)

    @patch('analyzer.gemini_service.GeminiService._call_gemini_api')
    def test_analyze_all_supported_languages(self, mock_gemini):
        mock_gemini.return_value = {
            "summary": "Language analysis completed.",
            "explanation": {"confidence": "Test", "paragraphs": ["Valid."], "timeline": [], "tableRows": []},
            "issues": [],
            "fixed_code": "// Fixed code"
        }
        test_cases = [
            ("python", "def f(x=[]): pass"),
            ("c", "void f() { char b[8]; gets(b); }"),
            ("cpp", "#include <vector>\nvoid f(std::vector<int>& v) { v.erase(v.begin()); }"),
            ("java", "public class T { Double d = null; double r = d - 1.0; }")
        ]
        for lang, snippet in test_cases:
            resp = self.client.post(
                '/api/v1/analyze/',
                data=json.dumps({"code": snippet, "language": lang, "problem_description": "test"}),
                content_type="application/json"
            )
            self.assertEqual(resp.status_code, 200, f"Failed for language: {lang}")
            data = resp.json()
            self.assertEqual(data["language"], lang)
            self.assertGreater(len(data["signals"]), 0)

    @patch('analyzer.gemini_service.GeminiService._call_gemini_api')
    def test_analyze_with_uploaded_document_retrieval(self, mock_gemini):
        mock_gemini.return_value = {
            "summary": "Document backed analysis.",
            "explanation": {"confidence": "Live", "paragraphs": ["Cited."], "timeline": [], "tableRows": []},
            "issues": [],
            "fixed_code": "// Fixed code"
        }
        doc_text = (
            "Official Specification: Default parameter values are evaluated from left to right "
            "when the function definition is executed. This means the expression is evaluated once, "
            "when the function is defined, and that the same pre-computed value is used for each call. "
            "This is critical for mutable objects such as lists or dictionaries."
        )
        uploaded_file = SimpleUploadedFile("python_spec.txt", doc_text.encode('utf-8'), content_type="text/plain")
        self.client.post('/api/v1/documents/upload/', {'file': uploaded_file})

        payload = {
            "code": "def append_item(item, catalog=[]):\n    catalog.append(item)\n    return catalog",
            "language": "python",
            "problem_description": "Catalog keeps growing across multiple calls."
        }
        response = self.client.post(
            '/api/v1/analyze/',
            data=json.dumps(payload),
            content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertFalse(data["knowledge_base_empty"])
        self.assertGreater(len(data["passages"]), 0)
        self.assertEqual(data["passages"][0]["fileName"], "python_spec.txt")
        self.assertIn("Default parameter values", data["passages"][0]["quote"])
